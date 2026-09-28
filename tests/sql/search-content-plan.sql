-- Plans de la recherche dans le contenu (E01-S06, AC26), hors de `pnpm test` : Vitest ne reçoit ni
-- l'URL de la base ni le jeton d'accès (N22). À jouer sur le projet, en une transaction annulée :
-- aucune ligne ne reste. `supabase db query --db-url` refuse un fichier de plusieurs instructions
-- (instruction préparée) ; le projet lié l'accepte :
--   npx supabase db query --linked --project-ref "$SUPABASE_PROJECT_ID" -f tests/sql/search-content-plan.sql
-- Attendu : `Bitmap Index Scan on idx_blocks_search_tsv` pour « zanzibar » parmi 3 001 blocs, puis,
-- sous `enable_seqscan = off`, `idx_nodes_search_tsv` et `idx_nodes_title_trgm`. Seul `analyze` laisse
-- une trace (pg_class.reltuples, mis à jour sur place) jusqu'au prochain passage de l'autovacuum.

begin;

create temp table plan_org on commit drop as
  with s as (select 'tplan' || left(md5(random()::text), 6) as slug),
       o as (insert into platform.orgs (name, slug, prefix) select 'Plan AC26', s.slug, s.slug from s returning id)
  select id from o;

insert into platform.nodes (org_id, parent_id, path, title, summary, owner_kind)
select o.id, null, 'guide', 'Guide', 'Racine du plan.', 'org' from plan_org o;

insert into platform.nodes (org_id, parent_id, path, title, summary, status, revision)
select o.id, r.id, 'grille_tarifaire', 'Grille tarifaire', 'Tarifs des études, en euros HT.', 'published', 1
  from plan_org o join platform.nodes r on r.org_id = o.id and r.parent_id is null;

-- 3 000 blocs publiés de mots courants, puis un bloc qui porte un mot rare.
insert into platform.blocks (node_id, state, position, type, text)
select n.id, 'published', 1024 * g, 'paragraph',
       'Le devis du client est relancé chaque semaine en attendant sa réponse, étape ' || g || '.'
  from plan_org o join platform.nodes n on n.org_id = o.id and n.path = 'grille_tarifaire',
       generate_series(1, 3000) g;

insert into platform.blocks (node_id, state, position, type, text)
select n.id, 'published', 1024 * 3001, 'paragraph', 'Le mot zanzibar est rare.'
  from plan_org o join platform.nodes n on n.org_id = o.id and n.path = 'grille_tarifaire';

analyze platform.blocks, platform.nodes;

create function pg_temp.plans() returns table (query text, plan text) language plpgsql as $$
declare
  v_org uuid := (select p.id from plan_org p);
  v_line text;
begin
  -- La requête des blocs de search_content (org_id, état publié, plein texte).
  for v_line in execute format(
    'explain select b.id from platform.blocks b where b.org_id = %L and b.state = ''published'''
    ' and b.search_tsv @@ to_tsquery(''platform.fr'', ''zanzibar'')', v_org) loop
    query := 'blocks @@ zanzibar';
    plan := v_line;
    return next;
  end loop;
  -- Les nœuds d'une base de test sont peu nombreux : sans cela, le parcours séquentiel l'emporte.
  set local enable_seqscan = off;
  for v_line in execute
    'explain select n.id from platform.nodes n where n.search_tsv @@ to_tsquery(''platform.fr'', ''tarif'')' loop
    query := 'nodes @@ tarif';
    plan := v_line;
    return next;
  end loop;
  for v_line in execute
    'explain select n.id from platform.nodes n where platform.norm(n.title) operator(extensions.%>) ''tarifaier''' loop
    query := 'nodes %> tarifaier';
    plan := v_line;
    return next;
  end loop;
end $$;

select * from pg_temp.plans();

rollback;
