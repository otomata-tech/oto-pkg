-- Plans de la présélection de `route_candidates` (E01-S13, AC-a3), hors de `pnpm test`, sur le modèle
-- de `tests/sql/search-content-plan.sql` : en une transaction annulée, aucune ligne ne reste. Sur le
-- projet (le projet lié accepte un fichier de plusieurs instructions) :
--   npx supabase db query --linked --project-ref "$SUPABASE_PROJECT_ID" -f tests/sql/route-candidates-plan.sql
-- Sur un Postgres nu : psql -v ON_ERROR_STOP=1 -f tests/sql/route-candidates-plan.sql
-- Le plan est celui du corps de la fonction, lu dans `pg_proc` : ses paramètres nommés deviennent des
-- paramètres de position, ses réglages de `pg_trgm` sont posés, puis `explain` d'une instruction
-- préparée en plan générique, comme la fonction l'exécute. Attendu, sous `enable_seqscan = off` :
-- `idx_nodes_search_tsv`, `idx_nodes_title_trgm` et `idx_nodes_summary_trgm` dans chaque plan, et la
-- requête qui les compte rend trois fois `true`. E11-S04 (AC-a6) : la correction d'un mot par le lexique
-- (`lexicon_fix`, appelée par la fonction) passe par `idx_lexicon_word_trgm`, et la dernière requête rend
-- `true`. Seul `analyze` laisse une trace (`pg_class.reltuples`) jusqu'au prochain passage de l'autovacuum.

begin;

create temp table plan_org on commit drop as
  with s as (select 'tplan' || left(md5(random()::text), 6) as slug),
       o as (insert into platform.orgs (name, slug, prefix) select 'Plan AC-a3', s.slug, s.slug from s returning id)
  select id from o;

insert into platform.nodes (org_id, parent_id, path, title, summary, owner_kind)
select o.id, null, 'guide', 'Guide', 'Racine du plan.', 'org' from plan_org o;

-- 300 procédures publiées : titres et résumés de mots courants, numérotés.
insert into platform.nodes (org_id, parent_id, path, kind, title, summary, status, revision)
select o.id, r.id, 'procedure_' || g, 'procedure', 'Traiter le dossier ' || g,
       'Prépare le dossier ' || g || ' du client, puis le range dans son classeur.', 'published', 1
  from plan_org o join platform.nodes r on r.org_id = o.id and r.parent_id is null,
       generate_series(1, 300) g;

-- Dix autres organisations de 300 procédures : sans elles, sur une base de test, `org_id` ne
-- départage rien et le plan lit les nœuds de toutes les organisations.
create temp table plan_others on commit drop as
  with o as (insert into platform.orgs (name, slug, prefix)
             select 'Plan AC-a3 bis', s.slug, s.slug
               from (select 'tplan' || left(md5(random()::text || k), 7) as slug from generate_series(1, 10) k) s
             returning id)
  select id from o;

insert into platform.nodes (org_id, parent_id, path, title, summary, owner_kind)
select o.id, null, 'guide', 'Guide', 'Racine du plan.', 'org' from plan_others o;

insert into platform.nodes (org_id, parent_id, path, kind, title, summary, status, revision)
select o.id, r.id, 'procedure_' || g, 'procedure', 'Traiter le dossier ' || g,
       'Prépare le dossier ' || g || ' du client, puis le range dans son classeur.', 'published', 1
  from plan_others o join platform.nodes r on r.org_id = o.id and r.parent_id is null,
       generate_series(1, 300) g;

analyze platform.nodes;
analyze platform.lexicon;

create function pg_temp.plans() returns table (query text, plan text) language plpgsql as $$
declare
  v_function constant regprocedure := 'platform.route_candidates(uuid, text, text, integer)'::regprocedure;
  v_org uuid := (select p.id from plan_org p);
  v_body text;
  v_setting text;
  v_query text;
  v_line text;
begin
  select p.prosrc into v_body from pg_catalog.pg_proc p where p.oid = v_function;
  v_body := regexp_replace(v_body, '\mp_org\M', '$1', 'g');
  v_body := regexp_replace(v_body, '\mp_query\M', '$2', 'g');
  v_body := regexp_replace(v_body, '\mp_kind\M', '$3', 'g');
  v_body := regexp_replace(v_body, '\mp_limit\M', '$4', 'g');
  -- Les seuils de `pg_trgm` que la fonction pose le temps de l'appel.
  for v_setting in
    select c from pg_catalog.pg_proc p, unnest(p.proconfig) c where p.oid = v_function and c like 'pg_trgm.%'
  loop
    perform pg_catalog.set_config(split_part(v_setting, '=', 1), split_part(v_setting, '=', 2), true);
  end loop;
  -- Les nœuds d'une base de test sont peu nombreux : sans cela, le parcours séquentiel l'emporte.
  set local enable_seqscan = off;
  set local plan_cache_mode = force_generic_plan;
  execute 'prepare route_plan(uuid, text, text, integer) as ' || v_body;
  foreach v_query in array array['relance le dossier du client', 'traitre le dosier'] loop
    for v_line in execute format('explain execute route_plan(%L, %L, %L, 50)', v_org, v_query, 'procedure') loop
      query := v_query;
      plan := v_line;
      return next;
    end loop;
  end loop;
  deallocate route_plan;
end $$;

create temp table plan_lines on commit drop as select * from pg_temp.plans();

select * from plan_lines;

select bool_or(plan like '%idx_nodes_search_tsv%') as search_tsv,
       bool_or(plan like '%idx_nodes_title_trgm%') as title_trgm,
       bool_or(plan like '%idx_nodes_summary_trgm%') as summary_trgm
  from plan_lines;

-- La correction : le corps de `lexicon_fix` (le lexique des onze organisations, écrit par leurs
-- procédures publiées), pour un mot mal tapé que le lexique ne porte pas.
create function pg_temp.fix_plan() returns table (plan text) language plpgsql as $$
declare
  v_function constant regprocedure := 'platform.lexicon_fix(uuid, text)'::regprocedure;
  v_org uuid := (select p.id from plan_org p);
  v_body text;
  v_setting text;
begin
  select p.prosrc into v_body from pg_catalog.pg_proc p where p.oid = v_function;
  v_body := regexp_replace(v_body, '\mp_org\M', '$1', 'g');
  v_body := regexp_replace(v_body, '\mp_word\M', '$2', 'g');
  for v_setting in
    select c from pg_catalog.pg_proc p, unnest(p.proconfig) c where p.oid = v_function and c like 'pg_trgm.%'
  loop
    perform pg_catalog.set_config(split_part(v_setting, '=', 1), split_part(v_setting, '=', 2), true);
  end loop;
  set local enable_seqscan = off;
  set local plan_cache_mode = force_generic_plan;
  execute 'prepare fix_plan(uuid, text) as ' || v_body;
  return query execute format('explain execute fix_plan(%L, %L)', v_org, 'classeru');
  deallocate fix_plan;
end $$;

create temp table fix_lines on commit drop as select * from pg_temp.fix_plan();

select * from fix_lines;

select bool_or(plan like '%idx_lexicon_word_trgm%') as lexicon_trgm from fix_lines;

rollback;
