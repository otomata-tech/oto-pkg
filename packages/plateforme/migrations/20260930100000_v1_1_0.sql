-- Version 1.1.0 du paquet (fiches D124, D131, D145) : les six migrations des epics E10 et E11, réunies
-- au contenu identique, dans l'ordre de leurs horodatages, chacune précédée d'une bannière qui nomme sa
-- story et son fichier d'origine ; un seul bloc ROLLBACK en fin de fichier, les parties dans l'ordre inverse.
-- Aucune version publiée ne portait les six fichiers d'origine : un hôte qui en avait appliqué un avant la
-- réunion (base de développement) suit `migrations/README.md` § « Hôtes qui avaient appliqué une migration
-- de la 1.1.0 ».

-- ====================================================================================================
-- Partie 1 sur 6 : E11-S04, lot a (routage des procédures), écrite en 20260929140000_route_candidates_formulations.sql.
-- ====================================================================================================

-- E11-S04 (lot a) : routage des procédures, formulations du résumé, mots rares, titre à part, fautes de
-- frappe corrigées par le lexique, corbeille exclue avant la coupe (M58). Réunie par le pilote dans la
-- migration unique de 1.1.0 (fiches D131, D145, D124).
--
-- 1. `lexicon_fix` : la correction d'un mot par le lexique de l'organisation, écrite une fois (HN-E11S04-4) :
--    un mot de 5 à 40 lettres que le lexique ne porte pas reçoit le mot du lexique le plus proche
--    (trigrammes ≥ 0,3, puis écart de longueur, puis ordre alphabétique), sinon `null`. Seuil posé par la
--    clause `set`, sans paramètre (HN-E11S04-13). Aucun rôle client ne l'exécute : seules `route_candidates`
--    et `search_content`, qui s'exécutent sous leur propriétaire, l'appellent.
-- 2. `route_candidates` remplacée (même porte, deux colonnes de plus, `s_phrase` et `lexical_title`) :
--    formulations du résumé cherchées une à une, lexèmes pesés par leur rareté parmi les candidates lisibles
--    de l'appel, titre compté à part, demande corrigée par `lexicon_fix` en plus de la demande telle quelle,
--    nœud à la corbeille jamais présélectionné, tri de la coupe sur les quatre composantes. Seuils de
--    `pg_trgm` recalculés sur les poids du service (`server/routing.ts`, E01-S13 AC-a4).
-- 3. `search_content` recréée à l'identique, sauf deux points (AC-a8) : sa correction passe par
--    `lexicon_fix` (l'exception du dernier mot, cherché par préfixe, reste la sienne), et un nœud à la
--    corbeille ne prend plus de place dans ses lignes (M58).
--
-- Aucune table, colonne, policy ni index nouveau. Aucun droit n'entre en base : le service garde sa décision
-- (`security-patterns.md § Droits dans le service`).

-- 1. La correction d'un mot par le lexique.
CREATE FUNCTION platform.lexicon_fix(p_org uuid, p_word text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    SET "pg_trgm.similarity_threshold" TO '0.3'
    AS $_$
  select l.word
    from platform.lexicon l
   where p_word ~ '^[a-z]{5,40}$'
     and not exists (select 1 from platform.lexicon k where k.org_id = p_org and k.word = p_word)
     and l.org_id = p_org and l.word operator(extensions.%) p_word
   order by extensions.similarity(l.word, p_word) desc, abs(char_length(l.word) - char_length(p_word)), l.word
   limit 1
$_$;

REVOKE ALL ON FUNCTION platform.lexicon_fix(p_org uuid, p_word text) FROM PUBLIC;

-- 2. Les candidates du routage. Le type rendu change : la fonction est retirée puis recréée aussitôt.
DROP FUNCTION IF EXISTS platform.route_candidates(uuid, text, text, integer);
CREATE FUNCTION platform.route_candidates(p_org uuid, p_query text, p_kind text DEFAULT NULL::text, p_limit integer DEFAULT 50) RETURNS TABLE(node_id uuid, path text, title text, summary text, kind text, owner_team_id uuid, s_summary real, s_title real, lexical real, query_lexemes integer, s_phrase real, lexical_title real)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    SET "pg_trgm.similarity_threshold" TO '0.43'
    SET "pg_trgm.word_similarity_threshold" TO '0.43'
    AS $$
  with words as materialized (
    -- la demande sans accents, en minuscules, mots séparés d'une espace ; aucune ligne pour qui n'est pas
    -- membre de l'organisation : rien n'est alors présélectionné
    select platform.norm_words(left(coalesce(p_query, ''), 500)) as norm
     where (select auth.uid()) is not null and p_org in (select platform.member_orgs())
  ),
  fixes as materialized (
    -- chaque mot distinct de la demande, sa correction par le lexique (AC-a5), et leurs lexèmes
    select d.word, platform.lexicon_fix(p_org, d.word) as fix,
           tsvector_to_array(to_tsvector('platform.fr'::regconfig, d.word)) as lex
      from (select distinct u.word from words w, unnest(string_to_array(nullif(w.norm, ''), ' ')) u(word)) d
  ),
  qx as materialized (
    -- la demande et la demande corrigée (chaque mot remplacé par sa correction), bordées d'espaces ; les
    -- lexèmes de la demande ; la requête plein texte de ceux-ci et de ceux des corrections
    select ' ' || w.norm || ' ' as q,
           ' ' || coalesce((select string_agg(coalesce(f.fix, u.word), ' ' order by u.ord)
                              from unnest(string_to_array(nullif(w.norm, ''), ' ')) with ordinality u(word, ord)
                              join fixes f on f.word = u.word), '') || ' ' as qf,
           x.lex,
           case when cardinality(x.lex) + (select count(*) from fixes f where f.fix is not null) > 0
                then array_to_string(array(select distinct pg_catalog.quote_literal(l)
                                             from (select unnest(x.lex) as l
                                                   union
                                                   select unnest(tsvector_to_array(to_tsvector('platform.fr'::regconfig, f.fix)))
                                                     from fixes f where f.fix is not null) a), ' | ')::tsquery
           end as lexq
      from words w,
           lateral (select array(select distinct unnest(tsvector_to_array(
                      to_tsvector('platform.fr'::regconfig, ' ' || w.norm || ' ')))) as lex) x
  ),
  pre as (
    -- un lexème de la demande ou d'une correction (`lexical` positif)
    select n.id from platform.nodes n
     where n.org_id = p_org and n.search_tsv @@ (select qx.lexq from qx)
    union
    -- le titre ressemble à la demande
    select n.id from platform.nodes n
     where n.org_id = p_org and platform.norm(n.title) operator(extensions.%) (select qx.q from qx)
    union
    -- le résumé ressemble à la demande, ou la porte
    select n.id from platform.nodes n
     where n.org_id = p_org
       and (platform.norm(n.summary) operator(extensions.%) (select qx.q from qx)
            or platform.norm(n.summary) operator(extensions.%>) (select qx.q from qx))
    union
    -- les mêmes ressemblances à la demande corrigée, quand un mot a une correction
    select n.id from platform.nodes n
     where n.org_id = p_org and (select qx.qf <> qx.q from qx)
       and platform.norm(n.title) operator(extensions.%) (select qx.qf from qx)
    union
    select n.id from platform.nodes n
     where n.org_id = p_org and (select qx.qf <> qx.q from qx)
       and (platform.norm(n.summary) operator(extensions.%) (select qx.qf from qx)
            or platform.norm(n.summary) operator(extensions.%>) (select qx.qf from qx))
    union
    -- le titre est contenu dans la demande, ou dans la demande corrigée : aucun index de trigrammes ne le
    -- sert, calculé sur les seuls titres des nœuds candidats de l'organisation
    select n.id from platform.nodes n
     where n.org_id = p_org and n.status = 'published' and n.parent_id is not null
       and n.deleted_at is null and (p_kind is null or n.kind = p_kind)
       and (platform.norm(n.title) operator(extensions.<%) (select qx.q from qx)
            or platform.norm(n.title) operator(extensions.<%) (select qx.qf from qx))
  ),
  found as materialized (
    -- nœuds présélectionnés, publiés, hors racine et hors corbeille (M58), du genre demandé
    select n.id, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id, n.path, n.title,
           n.summary, n.kind, n.search_tsv
      from platform.nodes n
     where n.org_id = p_org and n.id in (select pre.id from pre)
       and n.status = 'published' and n.parent_id is not null and n.deleted_at is null
       and (p_kind is null or n.kind = p_kind)
  ),
  cand as materialized (
    -- lisibles par l'appelant, avant le tri et la coupe : même calcul que `search_content` (N24) ; leurs
    -- lexèmes (titre et résumé) et ceux du titre seul (AC-a4)
    select f.id, f.path, f.title, f.summary, f.kind, tsvector_to_array(f.search_tsv) as lex,
           tsvector_to_array(to_tsvector('platform.fr'::regconfig, platform.norm_words(f.title))) as title_lex
      from found f
     where platform.node_level_for(f.org_id, f.lpath, f.owner_kind, f.owner_team_id, f.owner_user_id) >= 1
  ),
  ql as materialized (
    -- chaque lexème de la demande, ceux qui comptent pour lui (le sien et ceux des corrections des mots qui
    -- le donnent, AC-a5) et son poids (AC-a3) : 1 + ln(n / df), n le nombre de candidates lisibles, df celui
    -- des candidates qui le portent ; 1 si aucune ne le porte. Un nœud illisible ne compte pas (AC-a7).
    select l.lexeme, l.alts,
           case when d.df = 0 then 1 else 1 + ln(t.n::double precision / d.df) end as w
      from (select x.lexeme,
                   array[x.lexeme] || coalesce((select array_agg(distinct a.lexeme)
                                                  from fixes f,
                                                       unnest(tsvector_to_array(to_tsvector('platform.fr'::regconfig, f.fix))) a(lexeme)
                                                 where f.fix is not null and x.lexeme = any (f.lex)), '{}') as alts
              from qx, unnest(qx.lex) x(lexeme)) l
      cross join (select count(*) as n from cand) t
      cross join lateral (select count(*) as df from cand c where c.lex && l.alts) d
  ),
  scored as (
    select c.id, c.path, c.title, c.summary, c.kind,
           -- la demande (ou la demande corrigée) cherchée dans le résumé : une formulation qu'il porte mot pour
           -- mot vaut 1
           greatest(extensions.similarity(platform.norm(c.summary), qx.q),
                    extensions.word_similarity(qx.q, platform.norm(c.summary)),
                    extensions.similarity(platform.norm(c.summary), qx.qf),
                    extensions.word_similarity(qx.qf, platform.norm(c.summary)))::real as s_summary,
           greatest(extensions.similarity(platform.norm(c.title), qx.q),
                    extensions.word_similarity(platform.norm(c.title), qx.q),
                    extensions.similarity(platform.norm(c.title), qx.qf),
                    extensions.word_similarity(platform.norm(c.title), qx.qf))::real as s_title,
           -- les formulations du résumé, une à une (AC-a2) : 1 quand la demande en est une, ou en contient une
           coalesce((select max(greatest(extensions.similarity(p.piece, qx.q), extensions.word_similarity(p.piece, qx.q),
                                         extensions.similarity(p.piece, qx.qf), extensions.word_similarity(p.piece, qx.qf)))
                       from (select platform.norm_words(r.raw) as piece
                               from unnest(regexp_split_to_array(c.summary, '[«»"“”.;:!?]')) r(raw)) p
                      where p.piece <> ''), 0)::real as s_phrase,
           coalesce((select sum(ql.w) filter (where c.lex && ql.alts) / sum(ql.w) from ql), 0)::real as lexical,
           coalesce((select sum(ql.w) filter (where c.title_lex && ql.alts) / sum(ql.w) from ql), 0)::real as lexical_title,
           cardinality(qx.lex) as query_lexemes
      from cand c cross join qx
  )
  select s.id, s.path, s.title, s.summary, s.kind,
         (select o.owner_team_id from platform.node_owner(s.id) o),
         s.s_summary, s.s_title, s.lexical, s.query_lexemes, s.s_phrase, s.lexical_title
    from scored s
   order by greatest(s.s_summary, s.s_title, s.s_phrase, s.lexical) desc, s.path
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

REVOKE ALL ON FUNCTION platform.route_candidates(p_org uuid, p_query text, p_kind text, p_limit integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.route_candidates(p_org uuid, p_query text, p_kind text, p_limit integer) TO authenticated;

-- 3. La recherche de `find` : la correction par `lexicon_fix`, la corbeille exclue avant la coupe (AC-a8).
CREATE OR REPLACE FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20) RETURNS TABLE(node_id uuid, path text, title text, summary text, kind text, match text, block_id uuid, block_type text, block_key text, column_name text, snippet text, rank real)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    SET "pg_trgm.similarity_threshold" TO '0.3'
    AS $_$
declare
  -- Mots vides que la liste `french` de Postgres garde (« les » y devient le lexème « le »).
  v_stop constant text[] := array['les', 'a', 'cet', 'cette', 'ca', 'cela', 'ceci', 'celui',
    'celle', 'celles', 'ceux', 'ils', 'elles', 'leurs', 'donc', 'or', 'ni', 'car', 'quoi', 'dont',
    'si', 'tres', 'comme', 'aussi', 'alors', 'quel', 'quelle', 'quels', 'quelles'];
  -- extrait : tout le texte court (résumé, cellule), un fragment d'un bloc long ; termes en gras
  v_short constant text := 'HighlightAll=true, StartSel=**, StopSel=**';
  v_long constant text := 'MaxFragments=1, MaxWords=24, MinWords=8, ShortWord=2, StartSel=**, StopSel=**';
  v_norm text := platform.norm_words(left(coalesce(p_query, ''), 500));
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_fuzzy boolean := char_length(v_norm) >= 4;
  v_terms text[] := '{}';
  -- la requête de chaque terme, telle que les passes la cherchent (préfixe compris pour le dernier)
  v_queries tsquery[] := '{}';
  -- la même, en OU avec la correction du terme quand il en a une (HN-E01S13-1)
  v_fixed tsquery[] := '{}';
  v_fixes boolean := false;
  -- parts de termes possibles dans une tranche : de 0 à tous, soit le nombre de termes + 1
  v_levels double precision;
  v_word text;
  v_fix text;
  v_term tsquery;
  v_and tsquery;
  v_or tsquery;
  -- les mêmes, termes corrigés
  v_fixed_and tsquery;
  v_fixed_or tsquery;
  -- la passe : sa requête, celle de chacun de ses termes, et leur OU, qui surligne l'extrait
  v_pass tsquery;
  v_pass_terms tsquery[];
  v_pass_or tsquery;
begin
  if (select auth.uid()) is null or p_org is null or p_org not in (select platform.member_orgs()) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  -- Termes : les mots qui ont une racine (ni mot vide de Postgres, ni de la liste ci-dessus), 32 au
  -- plus ; le dernier vaut aussi comme début de mot (« prosp » trouve « prospects »).
  foreach v_word in array coalesce(string_to_array(nullif(v_norm, ''), ' '), '{}') loop
    if v_word <> all (v_stop) and numnode(to_tsquery('platform.fr'::regconfig, v_word)) > 0 then
      v_terms := v_terms || v_word;
    end if;
  end loop;
  v_terms := v_terms[1:32];
  if cardinality(v_terms) = 0 then
    return;
  end if;
  for i in 1 .. cardinality(v_terms) loop
    v_term := to_tsquery('platform.fr'::regconfig, v_terms[i]);
    if i = cardinality(v_terms) then
      v_term := v_term || to_tsquery('simple'::regconfig, v_terms[i] || ':*');
    end if;
    v_queries := array_append(v_queries, v_term);
    v_and := case when v_and is null then v_term else v_and && v_term end;
    v_or := case when v_or is null then v_term else v_or || v_term end;
    -- Correction (HN-E01S13-1) par `lexicon_fix` (E11-S04, HN-E11S04-4) : un terme de lettres seules, de 5
    -- à 40, que le lexique ne connaît pas ; le dernier ne l'est pas quand il commence un mot connu
    -- (« prosp »), exception propre à la recherche. Le lexique porte tous les mots publiés de
    -- l'organisation : un mot pris dans un nœud illisible ne trouve que ce nœud, que le niveau de lecture
    -- retire ensuite (AC-b6).
    v_fix := null;
    if not (i = cardinality(v_terms)
            and exists (select 1 from platform.lexicon l
                         where l.org_id = p_org and l.word like v_terms[i] || '%')) then
      v_fix := platform.lexicon_fix(p_org, v_terms[i]);
      if v_fix is not null then
        v_term := v_term || to_tsquery('platform.fr'::regconfig, v_fix);
        v_fixes := true;
      end if;
    end if;
    v_fixed := array_append(v_fixed, v_term);
    v_fixed_and := case when v_fixed_and is null then v_term else v_fixed_and && v_term end;
    v_fixed_or := case when v_fixed_or is null then v_term else v_fixed_or || v_term end;
  end loop;
  v_levels := cardinality(v_terms) + 1;

  -- Trois passes, la correction en dernier recours (HN-E01S13-1) : (1) tous les termes tels quels
  -- (ET), comme la ligne de base ; (2) si rien n'est trouvé et qu'un terme a une correction, chaque
  -- terme ou sa correction (ET) ; (3) si rien encore, l'un des termes ou l'une des corrections (OU),
  -- sauf pour un seul terme, que la passe d'avant a déjà cherché.
  for v_step in 1 .. 3 loop
    if v_step = 1 then
      v_pass := v_and;
      v_pass_terms := v_queries;
      v_pass_or := v_or;
    elsif v_step = 2 then
      continue when not v_fixes;
      v_pass := v_fixed_and;
      v_pass_terms := v_fixed;
      v_pass_or := v_fixed_or;
    else
      exit when cardinality(v_terms) = 1;
      v_pass := v_fixed_or;
      v_pass_terms := v_fixed;
      v_pass_or := v_fixed_or;
    end if;
    return query
    with node_hits as (
      select n.id from platform.nodes n
       where n.org_id = p_org and n.search_tsv @@ v_pass
      union
      select n.id from platform.nodes n
       where v_fuzzy and n.org_id = p_org
         and platform.norm(n.title) operator(extensions.%>) v_norm
    ),
    block_hits as (
      select b.id, b.node_id, b.type, b.key, b.text, b.data, b.position, b.search_tsv,
             ts_rank_cd(b.search_tsv, v_pass, 32) as r
        from platform.blocks b
       where b.org_id = p_org and b.state = 'published' and b.search_tsv @@ v_pass
    ),
    block_terms as (
      -- rangs des termes que portent les blocs trouvés d'un nœud
      select h.node_id, array_agg(distinct t.i) as terms
        from block_hits h
        join unnest(v_pass_terms) with ordinality as t(q, i) on h.search_tsv @@ t.q
       group by h.node_id
    ),
    found_nodes as materialized (
      -- nœuds trouvés, publiés, hors racine et hors corbeille (M58), du genre demandé
      select n.id, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id, n.path,
             n.title, n.summary, n.kind, n.meta, n.search_tsv
        from platform.nodes n
       where n.id in (select h.id from node_hits h union select h.node_id from block_hits h)
         and n.status = 'published' and n.parent_id is not null and n.deleted_at is null
         and (p_kinds is null or n.kind = any (p_kinds))
    ),
    cand as (
      -- visibles de l'appelant, calculés sur les seuls nœuds trouvés : même calcul que la policy
      -- de lecture de nodes (node_level_for, N24)
      select f.id, f.path, f.title, f.summary, f.kind, f.meta, f.search_tsv,
             to_tsvector('platform.fr'::regconfig, platform.norm_words(f.title)) @@ v_pass as in_title,
             case when v_fuzzy then extensions.word_similarity(v_norm, platform.norm(f.title)) else 0 end as sim,
             -- termes que couvre le nœud entier : son titre et son résumé, ou l'un de ses blocs
             -- publiés, lignes comprises (la ressemblance de trigrammes du titre n'en couvre aucun).
             -- Au passage OU, les blocs trouvés sont tous les blocs publiés qui portent un terme ;
             -- au passage ET, un nœud trouvé par son titre et son résumé ou par un bloc porte tous
             -- les termes, et seul un nœud trouvé par les trigrammes de son titre lit ses autres
             -- blocs, terme par terme.
             (select count(*)
                from unnest(v_pass_terms) with ordinality as t(q, i)
               where f.search_tsv @@ t.q
                  or coalesce(t.i = any (bt.terms), false)
                  or (v_pass <> v_pass_or
                      and exists (select 1 from platform.blocks b
                                   where b.node_id = f.id and b.state = 'published'
                                     and b.search_tsv @@ t.q)))::double precision as covered
        from found_nodes f
        left join block_terms bt on bt.node_id = f.id
       where platform.node_level_for(f.org_id, f.lpath, f.owner_kind, f.owner_team_id,
                                     f.owner_user_id) >= 1
    ),
    hits as (
      -- rang = début de la tranche + (termes couverts + rang d'avant dans la tranche) / v_levels :
      -- un terme couvert de plus passe devant tout le rang d'avant, qui départage à part égale.
      -- Rang d'avant dans la tranche : titre 0,5 si le plein texte le trouve + 0,5 × ressemblance
      -- (0,3 au moins : sinon le titre n'est pas trouvé), résumé et bloc ts_rank_cd normalisé,
      -- dans [0, 1) ; chaque rang reste dans sa tranche.
      select c.id as node_id, c.path, c.title, c.summary, c.kind, c.meta, 'title'::text as match,
             null::uuid as block_id, null::text as block_type, null::text as block_key,
             null::text as block_text, null::jsonb as block_data, null::double precision as pos,
             (2 + (c.covered + case when c.in_title then 0.5 else 0 end + 0.5 * c.sim)
                  / v_levels)::real as rank
        from cand c
       where c.in_title or c.sim >= 0.6
      union all
      select c.id, c.path, c.title, c.summary, c.kind, c.meta, 'summary', null, null, null, null,
             null, null, (1 + (c.covered + ts_rank_cd(c.search_tsv, v_pass, 32)) / v_levels)::real
        from cand c
       where c.search_tsv @@ v_pass and not c.in_title and c.sim < 0.6
      union all
      select k.node_id, k.path, k.title, k.summary, k.kind, k.meta, 'block', k.id, k.type, k.key,
             k.text, k.data, k.position, ((k.covered + k.r) / v_levels)::real
        from (select h.id, h.node_id, h.type, h.key, h.text, h.data, h.position, h.r,
                     c.path, c.title, c.summary, c.kind, c.meta, c.covered,
                     row_number() over (partition by h.node_id
                                        order by h.r desc, h.position, h.key, h.id) as nth
                from block_hits h join cand c on c.id = h.node_id) k
       where k.nth <= 3
    ),
    top as (
      select * from hits h
       order by h.rank desc, h.path, h.pos nulls first, h.block_key nulls first, h.block_id
       limit v_limit
    )
    select t.node_id, t.path, t.title, t.summary, t.kind, t.match, t.block_id, t.block_type,
           t.block_key, col.name,
           left(case
                  when t.match = 'title' then ts_headline('platform.fr'::regconfig, t.title, v_pass_or, v_short)
                  when t.match = 'summary' then ts_headline('platform.fr'::regconfig, t.summary, v_pass_or, v_short)
                  when t.block_type = 'row' then
                    coalesce(col.name || ': ' || ts_headline('platform.fr'::regconfig, col.value, v_pass_or, v_short),
                             t.block_key)
                  else ext.snippet
                end, 300),
           t.rank
      from top t
      left join lateral (
        -- ligne : la première colonne déclarée (nodes.meta) dont la valeur contient un terme
        select c.value ->> 'name' as name, t.block_data ->> (c.value ->> 'name') as value
          from jsonb_array_elements(case when jsonb_typeof(t.meta -> 'columns') = 'array'
                                         then t.meta -> 'columns' else '[]'::jsonb end)
               with ordinality c
         where t.block_type = 'row'
           and to_tsvector('platform.fr'::regconfig,
                           platform.norm_words(t.block_data ->> (c.value ->> 'name'))) @@ v_pass_or
         order by c.ordinality
         limit 1) col on true
      left join lateral (
        -- autre bloc : un fragment, que PostgreSQL ne finit jamais sur un nombre ni sur un mot court ;
        -- prolongé jusqu'à la fin du bloc quand il n'en reste que huit mots au plus (fiche D43 B,
        -- HN-E01S13-7), si le fragment, marques retirées, se retrouve dans le texte du bloc. Les mots
        -- (suites de caractères sans espace) ne se comptent que jusqu'au neuvième : l'expression, ancrée
        -- au début du reste, cesse de lire au premier caractère d'un neuvième mot.
        select f.fragment
               || case when f.at > 0 and f.rest ~ '^\s*(?:\S+\s+){0,7}\S+\s*$'
                       then ts_headline('platform.fr'::regconfig, f.rest, v_pass_or, v_short) else '' end as snippet
          from (select h.fragment, strpos(h.src, h.plain) as at,
                       substr(h.src, strpos(h.src, h.plain) + char_length(h.plain)) as rest
                  from (select s.src, s.fragment, replace(s.fragment, '**', '') as plain
                          from (select b.src, ts_headline('platform.fr'::regconfig, b.src, v_pass_or, v_long) as fragment
                                  from (select platform.block_search_text(t.block_type, t.block_text, t.block_data,
                                                                          null) as src) b) s) h) f
         where t.match = 'block' and t.block_type <> 'row') ext on true
     order by t.rank desc, t.path, t.pos nulls first, t.block_key nulls first, t.block_id;
    exit when found;
  end loop;
end;
$_$;

-- Privilèges gardés par `create or replace`, redits à l'identique de la ligne de base V1.
REVOKE ALL ON FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[], p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[], p_limit integer) TO authenticated;

-- ====================================================================================================
-- Partie 2 sur 6 : E11-S10, lot a (espace « Privé » dès la première connexion), écrite en 20260929160000_private_spaces.sql.
-- ====================================================================================================

-- E11-S10, lot a : l'espace « Privé » de chaque membre, dès sa première connexion.
--
-- 1. `platform.ensure_private_space(org, user)` : le handle d'un membre qui n'en a pas est posé
--    (`unique_handle`, depuis `members.email`), puis son espace `private/<handle>` et le Contexte de
--    l'espace sont créés s'ils manquent (corps repris de `members_tree_sync`, e05s13). Sans dossier
--    `private` ou sans ligne `members`, elle rend sans rien écrire ; un espace déjà tenu par une autre
--    personne n'est pas touché. Un second appel n'écrit rien.
-- 2. `members_tree_sync` l'appelle : un membre inséré sans handle reçoit le sien et son espace.
-- 3. Réparation : chaque membre, un à la fois (`unique_handle` voit les handles posés aux tours
--    précédents), passe par `ensure_private_space`.
--
-- Aucune table, colonne, policy ni index. `members_tree_sync` re-versionnée à signature identique, ses
-- privilèges redits ; `ensure_private_space` n'est accordée à personne (déclencheur et migration).

CREATE OR REPLACE FUNCTION platform.ensure_private_space(p_org uuid, p_user uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_private uuid;
  v_email text;
  v_handle text;
  v_n int := 1;
  v_space uuid;
  v_owner uuid;
begin
  select n.id into v_private from platform.nodes n
   where n.org_id = p_org and n.path = 'private';
  if v_private is null then
    return;
  end if;
  select m.email, m.profile ->> 'handle' into v_email, v_handle from platform.members m
   where m.org_id = p_org and m.user_id = p_user;
  if not found then
    return;
  end if;
  if v_handle is null then
    v_handle := platform.unique_handle(p_org, v_email);
    update platform.members m
       set profile = jsonb_set(coalesce(m.profile, '{}'::jsonb), '{handle}', to_jsonb(v_handle))
     where m.org_id = p_org and m.user_id = p_user;
  end if;
  -- L'ancien chemin d'un autre nœud : le premier `<handle>_<n>` libre, sauf si l'espace de la personne y est déjà.
  if exists (select 1 from platform.node_aliases a
              where a.org_id = p_org and a.old_path = 'private/' || v_handle)
     and not exists (select 1 from platform.nodes n
                      where n.org_id = p_org and n.path = 'private/' || v_handle
                        and n.owner_user_id = p_user) then
    loop
      v_n := v_n + 1;
      exit when not exists (select 1 from platform.members m
                             where m.org_id = p_org
                               and m.profile ->> 'handle' = v_handle || '_' || v_n)
            and not exists (select 1 from platform.node_aliases a
                             where a.org_id = p_org
                               and a.old_path = 'private/' || v_handle || '_' || v_n)
            and not exists (select 1 from platform.nodes n
                             where n.org_id = p_org
                               and n.path = 'private/' || v_handle || '_' || v_n
                               and n.owner_user_id is distinct from p_user);
    end loop;
    v_handle := v_handle || '_' || v_n;
    update platform.members m
       set profile = jsonb_set(m.profile, '{handle}', to_jsonb(v_handle))
     where m.org_id = p_org and m.user_id = p_user;
  end if;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, owner_kind,
                              owner_user_id, created_by, updated_by)
  values (p_org, v_private, 'private/' || v_handle, 'page', 'Privé',
          'Votre espace privé, visible de vous seul.', 'user', p_user,
          p_user, p_user)
  on conflict (org_id, path) do nothing;
  select n.id, n.owner_user_id into v_space, v_owner from platform.nodes n
   where n.org_id = p_org and n.path = 'private/' || v_handle;
  -- L'espace d'une autre personne sous ce chemin : rien n'est écrit dessous.
  if v_owner is distinct from p_user then
    return;
  end if;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, created_by, updated_by)
  values (p_org, v_space, 'private/' || v_handle || '/contexte', 'context', 'Contexte',
          'Ce que votre assistant lit à chaque conversation ; vous seul le recevez.',
          p_user, p_user)
  on conflict (org_id, path) do nothing;
end;
$$;

REVOKE ALL ON FUNCTION platform.ensure_private_space(p_org uuid, p_user uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION platform.members_tree_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform platform.ensure_private_space(new.org_id, new.user_id);
  return null;
end;
$$;

REVOKE ALL ON FUNCTION platform.members_tree_sync() FROM PUBLIC;

-- 3. Les membres déjà inscrits : handle manquant posé, espace et Contexte créés s'ils manquent.
DO $$
declare
  v_member record;
begin
  for v_member in
    select m.org_id, m.user_id from platform.members m order by m.org_id, m.created_at, m.user_id
  loop
    perform platform.ensure_private_space(v_member.org_id, v_member.user_id);
  end loop;
end;
$$;

-- ====================================================================================================
-- Partie 3 sur 6 : E10-S04 (markdown des pages), écrite en 20260929170000_platform_page_markdown.sql.
-- ====================================================================================================

-- E10-S04 (fiches D111 b, D114, D115 ; ADR-011 § 2) : le markdown qu'écrit un assistant se lit en blocs.
--
-- 1. Trois types de bloc : `simple_table` (tableau GFM : `columns`, `rows`, `align` facultatif), `divider`
--    (séparateur) et `toggle` (repli `<details>` : `data.summary`, le corps dans `text`).
-- 2. Listes imbriquées : un élément de `list` est une chaîne ou `{text, children: {items, ordered?, start?}}`,
--    trois niveaux au plus, 500 éléments en tout, sous-éléments compris.
-- 3. Titres sur cinq niveaux (`level` de 1 à 5).
--
-- Contraintes élargies, jamais resserrées : toute ligne existante reste valide ; `add constraint` la
-- revalide sous verrou. Les chemins JSON `strict` là où le mode `lax` déballerait un tableau et laisserait
-- passer un élément qui n'a pas la forme ; `lax` là où il ne sert qu'à tester une clé. Chaque garde de type
-- qui précède un chemin `strict` est un booléen (`coalesce`) : un `null` ne court-circuite pas le `and`, et
-- le chemin lèverait une erreur sur une clé absente. `blocks_data_check`
-- est inchangée. `block_search_text` re-versionnée à signature identique : elle lit les sous-éléments d'une
-- liste (`strict … .**`, que `lax` doublerait), les cellules d'un tableau simple et le résumé d'un repli ;
-- pour les formes existantes, son résultat est le même (`search_tsv`, colonne STORED, n'est pas recalculée).
-- Ses privilèges, gardés par `create or replace`, sont redits à l'identique de la ligne de base V1.

-- 1 à 3. Les types et les formes.
alter table platform.blocks
  drop constraint blocks_type_check,
  add constraint blocks_type_check check (type = any (array['heading', 'paragraph', 'list', 'checklist', 'code', 'call', 'mermaid', 'image', 'callout', 'reference', 'row', 'simple_table', 'divider', 'toggle'])),
  drop constraint blocks_shape_check,
  add constraint blocks_shape_check check (coalesce(
    case type
      when 'heading' then text is not null and char_length(btrim(text)) between 1 and 200 and text !~ '[\r\n]'
        and jsonb_path_exists(data, '$."level" ? (@ == 1 || @ == 2 || @ == 3 || @ == 4 || @ == 5)')
      when 'paragraph' then text is not null
      when 'list' then text is null
        and coalesce(jsonb_typeof(data -> 'items'), '') = 'array'
        and jsonb_array_length(data -> 'items') between 1 and 500
        -- premier niveau : des chaînes ou des objets
        and not jsonb_path_exists(data, 'strict $.items[*] ? (@.type() != "string" && @.type() != "object")')
        -- un élément objet : `text` et `children` seuls ; `children` : `items` non vide, `ordered` et `start` facultatifs
        and not jsonb_path_exists(data, 'lax $.items[*] ? (@.type() == "object" && !(@.text.type() == "string" && @.children.type() == "object" && !exists(@.keyvalue() ? (@.key != "text" && @.key != "children")) && @.children.items.type() == "array" && @.children.items.size() > 0 && !exists(@.children.keyvalue() ? (@.key != "items" && @.key != "ordered" && @.key != "start")) && (!exists(@.children.ordered) || @.children.ordered.type() == "boolean") && (!exists(@.children.start) || (@.children.start.type() == "number" && @.children.start >= 1))))')
        -- deuxième niveau : même forme ; une erreur de parcours (`null`) vaut un refus
        and not coalesce(jsonb_path_exists(data, 'strict $.items[*] ? (@.type() == "object").children.items[*] ? (@.type() != "string" && @.type() != "object")', '{}', true), true)
        and not jsonb_path_exists(data, 'lax $.items[*].children.items[*] ? (@.type() == "object" && !(@.text.type() == "string" && @.children.type() == "object" && !exists(@.keyvalue() ? (@.key != "text" && @.key != "children")) && @.children.items.type() == "array" && @.children.items.size() > 0 && !exists(@.children.keyvalue() ? (@.key != "items" && @.key != "ordered" && @.key != "start")) && (!exists(@.children.ordered) || @.children.ordered.type() == "boolean") && (!exists(@.children.start) || (@.children.start.type() == "number" && @.children.start >= 1))))')
        -- troisième niveau : des chaînes seules, aucun quatrième niveau
        and not coalesce(jsonb_path_exists(data, 'strict $.items[*] ? (@.type() == "object").children.items[*] ? (@.type() == "object").children.items[*] ? (@.type() != "string")', '{}', true), true)
        -- 500 éléments en tout : un élément porte une seule chaîne, son texte
        and jsonb_array_length(jsonb_path_query_array(data, 'strict $.items.** ? (@.type() == "string")')) <= 500
        and ((data -> 'ordered') is null or jsonb_typeof(data -> 'ordered') = 'boolean')
        and ((data -> 'start') is null or jsonb_path_exists(data, '$."start" ? (@.type() == "number" && @ >= 1)'))
      when 'checklist' then text is null
        and jsonb_typeof(data -> 'items') = 'array'
        and jsonb_array_length(data -> 'items') between 1 and 500
        and not jsonb_path_exists(data, '$."items"[*] ? (!(exists (@."text" ? (@.type() == "string"))) || !(exists (@."checked" ? (@.type() == "boolean"))))')
      when 'code' then text is not null and ((data -> 'language') is null or jsonb_typeof(data -> 'language') = 'string')
      when 'call' then text is null
        and jsonb_typeof(data -> 'function') = 'string'
        and char_length(data ->> 'function') between 1 and 100
        and jsonb_typeof(data -> 'args') = 'object'
      when 'mermaid' then text is not null and char_length(btrim(text)) >= 1
      when 'image' then jsonb_typeof(data -> 'src') = 'string'
        and char_length(data ->> 'src') between 1 and 2000
        and ((data -> 'alt') is null or jsonb_typeof(data -> 'alt') = 'string')
      when 'callout' then text is not null and ((data -> 'tone') is null or jsonb_typeof(data -> 'tone') = 'string')
      when 'reference' then text is null
        and jsonb_typeof(data -> 'path') = 'string'
        and (data ->> 'path') ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'
        and char_length(data ->> 'path') <= 1000
        and ((data -> 'view') is null or jsonb_typeof(data -> 'view') = 'object')
      when 'row' then text is null and key is not null
      -- une cellule : une ligne, sans blanc de bord, chaque `|` précédé d'un nombre impair de `\`
      when 'simple_table' then text is null
        and coalesce(jsonb_typeof(data -> 'columns'), '') = 'array'
        and jsonb_array_length(data -> 'columns') between 1 and 20
        and coalesce(jsonb_typeof(data -> 'rows'), '') = 'array'
        and jsonb_array_length(data -> 'rows') <= 200
        and not jsonb_path_exists(data, 'strict $.rows[*] ? (@.type() != "array" || @.size() != $n)', jsonb_build_object('n', jsonb_array_length(data -> 'columns')))
        and not jsonb_path_exists(data, 'strict $.columns[*] ? (@.type() != "string" || @ like_regex "[\r\n]" || @ like_regex "^[ \t]" || @ like_regex "[ \t]$" || @ like_regex "(^|[^\\\\])(\\\\\\\\)*[|]")')
        and not jsonb_path_exists(data, 'strict $.rows[*][*] ? (@.type() != "string" || @ like_regex "[\r\n]" || @ like_regex "^[ \t]" || @ like_regex "[ \t]$" || @ like_regex "(^|[^\\\\])(\\\\\\\\)*[|]")')
        and ((data -> 'align') is null or (jsonb_typeof(data -> 'align') = 'array'
          and jsonb_array_length(data -> 'align') = jsonb_array_length(data -> 'columns')
          and not jsonb_path_exists(data, 'strict $.align[*] ? (!(@.type() == "null" || (@.type() == "string" && (@ == "left" || @ == "center" || @ == "right"))))')))
      when 'divider' then text is null
      -- le corps : sans ligne blanche de bord, sans ligne `<details…` ni `</details>`
      when 'toggle' then text is not null
        and (text = '' or (text !~ '^[ \t]*(\n|$)' and text !~ '(^|\n)[ \t]*$'))
        and text !~ '(^|\n)[ \t]*<details'
        and text !~ '(^|\n)[ \t]*</details>[ \t]*(\n|$)'
        and coalesce(jsonb_typeof(data -> 'summary'), '') = 'string'
        and char_length(btrim(data ->> 'summary')) between 1 and 200
        and (data ->> 'summary') !~ '[\r\n]'
      else null
    end, false));

-- 4. Le texte cherchable d'un bloc.
CREATE OR REPLACE FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $_$
  select concat_ws(' ', p_key, p_text,
    case p_type
      when 'row' then (select string_agg(v #>> '{}', ' ')
                         from jsonb_path_query(p_data, 'lax $.* ? (@.type() == "string" || @.type() == "number")') v)
      when 'list' then (select string_agg(v #>> '{}', ' ')
                          from jsonb_path_query(p_data, 'strict $.items.** ? (@.type() == "string")', '{}', true) v)
      when 'checklist' then (select string_agg(v #>> '{}', ' ')
                               from jsonb_path_query(p_data, 'lax $.items[*].text ? (@.type() == "string")') v)
      when 'call' then concat_ws(' ', p_data ->> 'function',
                         (select string_agg(v #>> '{}', ' ')
                            from jsonb_path_query(p_data -> 'args', 'strict $.** ? (@.type() == "string")') v))
      when 'reference' then p_data ->> 'path'
      when 'image' then p_data ->> 'alt'
      when 'simple_table' then concat_ws(' ',
                                 (select string_agg(v #>> '{}', ' ')
                                    from jsonb_path_query(p_data, 'strict $.columns[*] ? (@.type() == "string")', '{}', true) v),
                                 (select string_agg(v #>> '{}', ' ')
                                    from jsonb_path_query(p_data, 'strict $.rows[*][*] ? (@.type() == "string")', '{}', true) v))
      when 'toggle' then p_data ->> 'summary'
    end)
$_$;

REVOKE ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) TO authenticated;

-- ====================================================================================================
-- Partie 4 sur 6 : E11-S03, lot a (ctx invalidé par les Contextes servis), écrite en 20260929180000_ctx_contexts.sql.
-- ====================================================================================================

-- E11-S03 (lot a) : un code `ctx` ne périme plus par `orgs.rules_version`, mais par les Contextes qu'il a
-- servis (ADR-002 § 2 amendé, fiche D132). Réunie par le pilote dans la migration unique de 1.1.0 (fiches
-- D131, D124).
--
-- `contexts` garde, pour chaque Contexte que `context` attendait pour la personne (Tout le monde, son Privé,
-- chacune de ses équipes), la révision publiée lue à l'émission (0 : aucune), `{<chemin>: <révision>}` ; la
-- garde (`server/ctx.ts`) refuse le code quand l'un d'eux a changé de contenu servi depuis. Nul : code émis
-- avant cette colonne, périmé, sans reprise (HN-E11S03-4). Aucune `update` sur `ctx` : la garde ne réécrit
-- pas la ligne. Déclencheur `bump_rules_version`, `rules_version` et policies inchangés (HN-E11S03-3).
ALTER TABLE platform.ctx
    ADD COLUMN contexts jsonb,
    ADD CONSTRAINT ctx_contexts_check CHECK (((contexts IS NULL) OR (jsonb_typeof(contexts) = 'object'::text)));

COMMENT ON COLUMN platform.ctx.contexts IS 'Révision publiée de chaque Contexte attendu à l''émission, {chemin: révision} (0 : aucun) ; nul : émis avant la 1.1.0, périmé (E11-S03).';

-- ====================================================================================================
-- Partie 5 sur 6 : E11-S02, lot d (abandon du brouillon), écrite en 20260929190000_discard_draft.sql.
-- ====================================================================================================

-- E11-S02 (lot d) : abandonner le brouillon d'un nœud publié (`node.discard_draft`, AC-d2, AC-d4 ; ADR-011
-- § 3 amendé : troisième fonction atomique du brouillon, après `open_draft` et `publish_node`). Réunie par
-- le pilote dans la migration unique de 1.1.0 (fiches D131, D145, D124).
--
-- Sans elle, un brouillon ne part qu'à une publication réussie : un en-tête de tableau refusé à la
-- publication restait dans `node_drafts.meta`, et chaque écriture d'en-tête suivante repartait de lui
-- (FB-0007). `node_drafts` n'a ni policy ni privilège `DELETE` : la suppression passe par cette fonction
-- (HN-E11S02-5). Le droit d'abandonner (niveau écriture, jamais publié refusé) est décidé par le service
-- avant l'appel (ADR-012 § 3) ; la fonction ne garde que l'organisation de l'appelant.
--
-- Calquée sur `publish_node` : même verrou consultatif exclusif 7401, qu'une écriture de brouillon
-- concurrente prend partagé (`blocks_lock_draft`) : elle passe avant, ou échoue en `PT409`, jamais entre
-- les deux suppressions. `55000` sans brouillon ; `PT409` quand le brouillon a été enregistré après le
-- tampon lu par le service (tampon nul : aucune garde). `nodes` (révision, statut, méta) et les blocs
-- publiés ne bougent pas ; rend la révision du nœud.
CREATE FUNCTION platform.discard_draft(p_node uuid, p_draft_stamp timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_node platform.nodes%rowtype;
  v_draft platform.node_drafts%rowtype;
begin
  -- Un nœud d'une organisation de l'appelant ; un nœud inconnu est refusé de même.
  if not exists (select 1 from platform.nodes n
                  where n.id = p_node and n.org_id in (select platform.member_orgs())) then
    raise exception 'node outside the organizations of the caller' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7401, pg_catalog.hashtext(p_node::text));
  select * into v_node from platform.nodes n where n.id = p_node for update;
  select * into v_draft from platform.node_drafts d where d.node_id = p_node for update;
  if v_draft.node_id is null then
    raise exception 'nothing to discard: no open draft' using errcode = '55000';
  end if;
  if p_draft_stamp is not null and v_draft.updated_at is distinct from p_draft_stamp then
    raise exception 'stale draft: saved again after the stamp read' using errcode = 'PT409';
  end if;

  delete from platform.blocks b where b.node_id = p_node and b.state = 'draft';
  delete from platform.node_drafts d where d.node_id = p_node;
  return v_node.revision;
end;
$$;

REVOKE ALL ON FUNCTION platform.discard_draft(p_node uuid, p_draft_stamp timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.discard_draft(p_node uuid, p_draft_stamp timestamp with time zone) TO authenticated;

-- ====================================================================================================
-- Partie 6 sur 6 : E10-S02 (fichiers joints), écrite en 20260929200000_platform_files.sql.
-- ====================================================================================================

-- E10-S02 (ADR-016 ; fiches D111, D113, D118, D137) : les fichiers joints à un nœud. Migration unique de la
-- story, complétée lot par lot jusqu'à la fusion de la story ; jamais appliquée au projet avant (bases locales
-- seules, HN-E10S02-51) ; le pilote la réunit dans celle de la version (fiche D124).
--
-- Lot a.
-- 1. `files` : les métadonnées d'un fichier joint à un nœud, jamais ses octets (ADR-016 § 3) ; la clé d'objet
--    vaut `<org_id>/<id>` et ne reprend jamais le nom d'origine. `pending` à la demande d'envoi, `ready` à la
--    confirmation (ADR-016 § 4) ; pas d'empreinte (HN-E10S02-7). `node_id` en cascade : filet de sécurité, la
--    purge de la corbeille lit les clés avant (lot e). Index `(org_id, status)` pour le quota et la purge des
--    envois abandonnés, `(node_id)` pour la corbeille et la duplication.
-- 2. RLS d'isolation par organisation (ADR-012 § 3) : les droits sur le nœud sont décidés par le service
--    (`server/files/service.ts`), avant sa requête. L'insertion est attribuée à l'appelant, vise un nœud de
--    l'organisation, comme `node_shares`, et pose une ligne `pending` : seule la confirmation la rend `ready`.
--    Privilèges d'`authenticated` seul, sur le modèle de la ligne de base V1 (aucun privilège à `service_role`) ;
--    la mise à jour ne touche que `status`.
-- 3. `blocks_type_check` et `blocks_shape_check` élargies en une instruction, reprises de 20260929170000 :
--    le bloc `file` (`{file_id, name, size, mime}`, `text` nul), et l'image interne (`image.data` porte `src`
--    en `https` ou `file_id`, jamais les deux ; `width` facultatif : `small`, `medium`, `full`). Toute ligne
--    existante reste valide.
-- 4. `block_search_text` re-versionnée à signature identique : le nom d'un fichier est cherchable ; même texte
--    qu'avant pour toute forme existante (`search_tsv` n'est pas recalculée). Privilèges redits.
-- 5. `forget_user` re-versionnée à signature identique : `files.created_by` mis à nul, comme les autres
--    auteurs (`database-patterns.md § Règles`) ; lot f : les tickets de dépôt de la personne supprimés (§ 8).
--    Privilèges redits (aucun `grant`).
--
-- Lot c.
-- 6. `public_file_by_token` : la lecture publique d'un fichier par le jeton d'un lien (ADR-016 § 7, ADR-017 § 5),
--    `security definer` exécutée sous `anon` seul, sur le modèle de `public_node_by_token` (ligne de base) : lien
--    actif, nœud du fichier publié, hors corbeille, dans le périmètre du lien et lisible par l'auteur du lien ;
--    fichier `ready` cité par un bloc **publié** (`file` ou `image`) de ce nœud. Rend l'identifiant, le nom, le
--    type, la taille et le chemin du nœud, ou rien, la même réponse pour tout refus. La clé d'objet se compose
--    dans le paquet (`objectKey`), sa seule source. Ouverte à `anon` par ADR-016 § 7 : aucun `auth.uid()` à
--    contrôler, le jeton et l'organisation de l'adresse bornent la lecture.
--
-- Lot e.
-- 7. `duplicate_subtree` remplacée (AC-e3, ADR-016 § 6, fiche D118), reprise de la ligne de base 20260928100000,
--    mêmes contrôles et mêmes droits. Le type rendu gagne une colonne, `copied_files` : la fonction est retirée
--    puis recréée aussitôt. Chaque fichier d'un nœud copié qu'un bloc publié de ce nœud cite (`file`, ou image
--    jointe) reçoit une ligne neuve `pending` sous la copie ; le `file_id` des blocs copiés est réécrit, donc
--    celui de l'instantané de la révision 1, pris sur eux. Par nœud, la fonction rend les paires (ancien, nouveau)
--    de ses fichiers ; le service copie les objets après le commit et passe chaque ligne copiée à `ready`
--    (`server/nodes/duplicate.ts`). Aucun fichier n'est ainsi cité par deux nœuds.
--
-- Lot f.
-- 8. `upload_tickets` : le ticket d'un dépôt par lien à usage unique (ADR-018 § 2 ; AC-f3) : les empreintes SHA-256
--    (hex) de ses deux jetons, jamais un jeton : celui de `curl` (`token_hash`, porte sans session) et celui du
--    formulaire (`form_token_hash`, route à session, ADR-018 § 8) ; la personne, l'organisation, le `ctx` de l'appel,
--    la destination, le type, le mode et leurs paramètres ; 15 minutes (posées par le service) et un envoi (`used_at`,
--    commun aux deux jetons). Aucune clé vers `members` : une personne retirée garde son ticket, que l'envoi refuse par
--    `not_member` (AC-f6). RLS d'isolation par organisation ; la lecture ne rend à un membre que ses tickets, et les
--    tickets expirés de l'organisation (le ménage d'`upload.link`, AC-f3) : jamais la destination prévue par un autre ;
--    l'insertion est attribuée à l'appelant ; la suppression ne vise qu'un ticket expiré ; aucune mise à jour sous la
--    session : seule `consume_upload_ticket` pose `used_at`. Index `(org_id, expires_at)` pour le ménage ; l'unicité
--    de chaque empreinte sert la consommation. `forget_user` (§ 5) supprime les tickets de la personne.
-- 9. `consume_upload_ticket` : la consommation atomique d'un ticket (ADR-018 § 3, AC-f5), `security definer`
--    exécutée sous `anon` seul, ouverte par ADR-018 (aucun `auth.uid()` : l'envoi n'a pas de session) : un seul
--    `update` conditionnel, borné à l'empreinte du jeton de la porte qui l'appelle (`p_form`) et à l'organisation de
--    l'adresse, validé dans la transaction de l'appel, avant toute écriture du service. Rend la personne, son e-mail
--    dans `members` (nul pour qui n'en est plus membre), le `ctx` et la destination, ou rien, la même réponse pour un
--    ticket inconnu, expiré, servi (par l'une ou l'autre porte), d'une autre organisation, ou le jeton de l'autre porte.

-- 1. La table.
CREATE TABLE platform.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    node_id uuid NOT NULL,
    name text NOT NULL,
    mime text NOT NULL,
    size bigint NOT NULL,
    status text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT files_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 255))),
    CONSTRAINT files_mime_check CHECK (((char_length(mime) >= 1) AND (char_length(mime) <= 255))),
    CONSTRAINT files_size_check CHECK (((size >= 1) AND (size <= 52428800))),
    CONSTRAINT files_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text])))
);

COMMENT ON TABLE platform.files IS 'Fichiers joints à un nœud (E10-S02, ADR-016) : métadonnées seulement ; objet sous la clé <org_id>/<id> du stockage S3 de l''hôte.';

ALTER TABLE ONLY platform.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.files
    ADD CONSTRAINT files_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.files
    ADD CONSTRAINT files_node_id_fkey FOREIGN KEY (node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

CREATE INDEX idx_files_org_id_status ON platform.files USING btree (org_id, status);

CREATE INDEX idx_files_node_id ON platform.files USING btree (node_id);

-- 2. RLS et privilèges.
ALTER TABLE platform.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS files_select_member ON platform.files;
CREATE POLICY files_select_member ON platform.files FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

DROP POLICY IF EXISTS files_insert_member ON platform.files;
CREATE POLICY files_insert_member ON platform.files FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE ((n.id = files.node_id) AND (n.org_id = files.org_id))))));

DROP POLICY IF EXISTS files_update_member ON platform.files;
CREATE POLICY files_update_member ON platform.files FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

DROP POLICY IF EXISTS files_delete_member ON platform.files;
CREATE POLICY files_delete_member ON platform.files FOR DELETE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

GRANT SELECT,DELETE ON TABLE platform.files TO authenticated;

GRANT INSERT(org_id) ON TABLE platform.files TO authenticated;

GRANT INSERT(node_id) ON TABLE platform.files TO authenticated;

GRANT INSERT(name) ON TABLE platform.files TO authenticated;

GRANT INSERT(mime) ON TABLE platform.files TO authenticated;

GRANT INSERT(size) ON TABLE platform.files TO authenticated;

GRANT INSERT(status),UPDATE(status) ON TABLE platform.files TO authenticated;

GRANT INSERT(created_by) ON TABLE platform.files TO authenticated;

-- 3. Les types et les formes.
alter table platform.blocks
  drop constraint blocks_type_check,
  add constraint blocks_type_check check (type = any (array['heading', 'paragraph', 'list', 'checklist', 'code', 'call', 'mermaid', 'image', 'callout', 'reference', 'row', 'simple_table', 'divider', 'toggle', 'file'])),
  drop constraint blocks_shape_check,
  add constraint blocks_shape_check check (coalesce(
    case type
      when 'heading' then text is not null and char_length(btrim(text)) between 1 and 200 and text !~ '[\r\n]'
        and jsonb_path_exists(data, '$."level" ? (@ == 1 || @ == 2 || @ == 3 || @ == 4 || @ == 5)')
      when 'paragraph' then text is not null
      when 'list' then text is null
        and coalesce(jsonb_typeof(data -> 'items'), '') = 'array'
        and jsonb_array_length(data -> 'items') between 1 and 500
        -- premier niveau : des chaînes ou des objets
        and not jsonb_path_exists(data, 'strict $.items[*] ? (@.type() != "string" && @.type() != "object")')
        -- un élément objet : `text` et `children` seuls ; `children` : `items` non vide, `ordered` et `start` facultatifs
        and not jsonb_path_exists(data, 'lax $.items[*] ? (@.type() == "object" && !(@.text.type() == "string" && @.children.type() == "object" && !exists(@.keyvalue() ? (@.key != "text" && @.key != "children")) && @.children.items.type() == "array" && @.children.items.size() > 0 && !exists(@.children.keyvalue() ? (@.key != "items" && @.key != "ordered" && @.key != "start")) && (!exists(@.children.ordered) || @.children.ordered.type() == "boolean") && (!exists(@.children.start) || (@.children.start.type() == "number" && @.children.start >= 1))))')
        -- deuxième niveau : même forme ; une erreur de parcours (`null`) vaut un refus
        and not coalesce(jsonb_path_exists(data, 'strict $.items[*] ? (@.type() == "object").children.items[*] ? (@.type() != "string" && @.type() != "object")', '{}', true), true)
        and not jsonb_path_exists(data, 'lax $.items[*].children.items[*] ? (@.type() == "object" && !(@.text.type() == "string" && @.children.type() == "object" && !exists(@.keyvalue() ? (@.key != "text" && @.key != "children")) && @.children.items.type() == "array" && @.children.items.size() > 0 && !exists(@.children.keyvalue() ? (@.key != "items" && @.key != "ordered" && @.key != "start")) && (!exists(@.children.ordered) || @.children.ordered.type() == "boolean") && (!exists(@.children.start) || (@.children.start.type() == "number" && @.children.start >= 1))))')
        -- troisième niveau : des chaînes seules, aucun quatrième niveau
        and not coalesce(jsonb_path_exists(data, 'strict $.items[*] ? (@.type() == "object").children.items[*] ? (@.type() == "object").children.items[*] ? (@.type() != "string")', '{}', true), true)
        -- 500 éléments en tout : un élément porte une seule chaîne, son texte
        and jsonb_array_length(jsonb_path_query_array(data, 'strict $.items.** ? (@.type() == "string")')) <= 500
        and ((data -> 'ordered') is null or jsonb_typeof(data -> 'ordered') = 'boolean')
        and ((data -> 'start') is null or jsonb_path_exists(data, '$."start" ? (@.type() == "number" && @ >= 1)'))
      when 'checklist' then text is null
        and jsonb_typeof(data -> 'items') = 'array'
        and jsonb_array_length(data -> 'items') between 1 and 500
        and not jsonb_path_exists(data, '$."items"[*] ? (!(exists (@."text" ? (@.type() == "string"))) || !(exists (@."checked" ? (@.type() == "boolean"))))')
      when 'code' then text is not null and ((data -> 'language') is null or jsonb_typeof(data -> 'language') = 'string')
      when 'call' then text is null
        and jsonb_typeof(data -> 'function') = 'string'
        and char_length(data ->> 'function') between 1 and 100
        and jsonb_typeof(data -> 'args') = 'object'
      when 'mermaid' then text is not null and char_length(btrim(text)) >= 1
      -- une adresse `https` externe, ou un fichier joint (E10-S02), jamais les deux
      when 'image' then ((jsonb_typeof(data -> 'src') = 'string'
          and char_length(data ->> 'src') between 1 and 2000
          and (data -> 'file_id') is null)
        or (jsonb_typeof(data -> 'file_id') = 'string'
          and (data ->> 'file_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (data -> 'src') is null))
        and ((data -> 'alt') is null or jsonb_typeof(data -> 'alt') = 'string')
        and ((data -> 'width') is null or (jsonb_typeof(data -> 'width') = 'string' and (data ->> 'width') in ('small', 'medium', 'full')))
      when 'callout' then text is not null and ((data -> 'tone') is null or jsonb_typeof(data -> 'tone') = 'string')
      when 'reference' then text is null
        and jsonb_typeof(data -> 'path') = 'string'
        and (data ->> 'path') ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'
        and char_length(data ->> 'path') <= 1000
        and ((data -> 'view') is null or jsonb_typeof(data -> 'view') = 'object')
      when 'row' then text is null and key is not null
      -- une cellule : une ligne, sans blanc de bord, chaque `|` précédé d'un nombre impair de `\`
      when 'simple_table' then text is null
        and coalesce(jsonb_typeof(data -> 'columns'), '') = 'array'
        and jsonb_array_length(data -> 'columns') between 1 and 20
        and coalesce(jsonb_typeof(data -> 'rows'), '') = 'array'
        and jsonb_array_length(data -> 'rows') <= 200
        and not jsonb_path_exists(data, 'strict $.rows[*] ? (@.type() != "array" || @.size() != $n)', jsonb_build_object('n', jsonb_array_length(data -> 'columns')))
        and not jsonb_path_exists(data, 'strict $.columns[*] ? (@.type() != "string" || @ like_regex "[\r\n]" || @ like_regex "^[ \t]" || @ like_regex "[ \t]$" || @ like_regex "(^|[^\\\\])(\\\\\\\\)*[|]")')
        and not jsonb_path_exists(data, 'strict $.rows[*][*] ? (@.type() != "string" || @ like_regex "[\r\n]" || @ like_regex "^[ \t]" || @ like_regex "[ \t]$" || @ like_regex "(^|[^\\\\])(\\\\\\\\)*[|]")')
        and ((data -> 'align') is null or (jsonb_typeof(data -> 'align') = 'array'
          and jsonb_array_length(data -> 'align') = jsonb_array_length(data -> 'columns')
          and not jsonb_path_exists(data, 'strict $.align[*] ? (!(@.type() == "null" || (@.type() == "string" && (@ == "left" || @ == "center" || @ == "right"))))')))
      when 'divider' then text is null
      -- le corps : sans ligne blanche de bord, sans ligne `<details…` ni `</details>`
      when 'toggle' then text is not null
        and (text = '' or (text !~ '^[ \t]*(\n|$)' and text !~ '(^|\n)[ \t]*$'))
        and text !~ '(^|\n)[ \t]*<details'
        and text !~ '(^|\n)[ \t]*</details>[ \t]*(\n|$)'
        and coalesce(jsonb_typeof(data -> 'summary'), '') = 'string'
        and char_length(btrim(data ->> 'summary')) between 1 and 200
        and (data ->> 'summary') !~ '[\r\n]'
      -- un fichier joint (E10-S02) : son identifiant, son nom, sa taille (1 octet à 50 Mo) et son type
      when 'file' then text is null
        and coalesce(jsonb_typeof(data -> 'file_id'), '') = 'string'
        and (data ->> 'file_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and coalesce(jsonb_typeof(data -> 'name'), '') = 'string'
        and char_length(data ->> 'name') between 1 and 255
        and coalesce(jsonb_path_exists(data, 'strict $.size ? (@.type() == "number" && @ >= 1 && @ <= 52428800 && @ == @.floor())', '{}', true), false)
        and coalesce(jsonb_typeof(data -> 'mime'), '') = 'string'
        and char_length(data ->> 'mime') between 1 and 255
      else null
    end, false));

-- 4. Le texte cherchable d'un bloc.
CREATE OR REPLACE FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $_$
  select concat_ws(' ', p_key, p_text,
    case p_type
      when 'row' then (select string_agg(v #>> '{}', ' ')
                         from jsonb_path_query(p_data, 'lax $.* ? (@.type() == "string" || @.type() == "number")') v)
      when 'list' then (select string_agg(v #>> '{}', ' ')
                          from jsonb_path_query(p_data, 'strict $.items.** ? (@.type() == "string")', '{}', true) v)
      when 'checklist' then (select string_agg(v #>> '{}', ' ')
                               from jsonb_path_query(p_data, 'lax $.items[*].text ? (@.type() == "string")') v)
      when 'call' then concat_ws(' ', p_data ->> 'function',
                         (select string_agg(v #>> '{}', ' ')
                            from jsonb_path_query(p_data -> 'args', 'strict $.** ? (@.type() == "string")') v))
      when 'reference' then p_data ->> 'path'
      when 'image' then p_data ->> 'alt'
      when 'file' then p_data ->> 'name'
      when 'simple_table' then concat_ws(' ',
                                 (select string_agg(v #>> '{}', ' ')
                                    from jsonb_path_query(p_data, 'strict $.columns[*] ? (@.type() == "string")', '{}', true) v),
                                 (select string_agg(v #>> '{}', ' ')
                                    from jsonb_path_query(p_data, 'strict $.rows[*][*] ? (@.type() == "string")', '{}', true) v))
      when 'toggle' then p_data ->> 'summary'
    end)
$_$;

REVOKE ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) TO authenticated;

-- 5. L'oubli d'une personne.
CREATE OR REPLACE FUNCTION platform.forget_user(p_user uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_others text;
  -- les organisations où partent des nœuds de la personne : leur lexique se reconstruit (E01-S13)
  v_orgs uuid[];
begin
  if p_user is null then
    raise exception 'forget_user needs the id of a person' using errcode = '22023';
  end if;
  -- Le verrou d'abord : les nœuds que la personne possède ne changent ni de propriétaire ni de place
  -- avant la fin de la transaction. Un nœud rangé dessous entre-temps reste possible : la suppression
  -- l'épargne, et la clé refuse.
  perform 1 from platform.nodes s where s.owner_user_id = p_user order by s.id for no key update;
  -- Fiche D19, option A : le privé part avec la personne, pas ce que d'autres possèdent dessous. Un
  -- nœud d'équipe déplacé dans un espace personnel garde son propriétaire (H71) : il le reste ici.
  -- Cette lecture ne sert qu'à nommer les chemins : le refus tient à la clé.
  select string_agg(distinct o.slug || ':' || n.path, ', ' order by o.slug || ':' || n.path)
    into v_others
    from platform.nodes s
    join platform.nodes n on n.org_id = s.org_id and n.lpath operator(extensions.<@) s.lpath
    join platform.orgs o on o.id = n.org_id
   where s.owner_user_id = p_user
     and n.owner_kind is not null
     and n.owner_user_id is distinct from p_user;
  if v_others is not null then
    raise exception 'forget_user: nodes of other owners lie under the nodes of this person, move them first: %', v_others
      using errcode = '23503';
  end if;
  -- Ne partent que les nœuds dont la personne est la propriétaire effective : ni un nœud d'un autre
  -- propriétaire explicite, ni ce qui est dessous. Un tel nœud présent à la fin de l'instruction, même
  -- rangé après la lecture, garde son parent : `nodes_parent_id_fkey` refuse (23503). La condition sur
  -- `n` lui-même se relit sur sa dernière version quand une autre transaction l'a changé entre-temps.
  -- Les organisations des nœuds supprimés, rendues par la suppression même (E01-S13).
  with gone as (
    delete from platform.nodes n
     using platform.nodes s
     where s.owner_user_id = p_user
       and n.org_id = s.org_id
       and n.lpath operator(extensions.<@) s.lpath
       and (n.owner_kind is null or n.owner_user_id is not distinct from p_user)
       and not exists (select 1 from platform.nodes x
                        where x.org_id = s.org_id
                          and x.lpath operator(extensions.<@) s.lpath
                          and n.lpath operator(extensions.<@) x.lpath
                          and x.owner_kind is not null
                          and x.owner_user_id is distinct from p_user)
    returning n.org_id
  )
  select array_agg(distinct gone.org_id) into v_orgs from gone;
  -- ses mots aussi : le lexique de ces organisations, reconstruit depuis ce qui reste (E01-S13)
  perform platform.lexicon_rebuild(o.id) from unnest(v_orgs) as o(id);
  -- autrefois en cascade
  delete from platform.members where user_id = p_user;
  delete from platform.team_members where user_id = p_user;
  delete from platform.access_rules where subject_user_id = p_user;
  delete from platform.accounts where owner_user_id = p_user;
  delete from platform.ctx where user_id = p_user;
  delete from platform.platform_grants where user_id = p_user;
  delete from platform.platform_staff where user_id = p_user;
  -- ses correspondances chez les émetteurs (E01-S11)
  delete from platform.identities where user_id = p_user;
  -- autrefois `set null`
  update platform.teams set lead_user_id = null where lead_user_id = p_user;
  update platform.journal set user_id = null where user_id = p_user;
  update platform.invitations set invited_by = null where invited_by = p_user;
  update platform.invitations set accepted_by = null where accepted_by = p_user;
  update platform.nodes set created_by = null where created_by = p_user;
  update platform.nodes set updated_by = null where updated_by = p_user;
  update platform.access_rules set created_by = null where created_by = p_user;
  update platform.platform_staff set added_by = null where added_by = p_user;
  update platform.platform_grants set granted_by = null where granted_by = p_user;
  update platform.platform_grants set revoked_by = null where revoked_by = p_user;
  update platform.admin_journal set user_id = null where user_id = p_user;
  update platform.node_drafts set created_by = null where created_by = p_user;
  update platform.node_drafts set updated_by = null where updated_by = p_user;
  update platform.blocks set claimed_by_user = null where claimed_by_user = p_user;
  update platform.blocks set created_by = null where created_by = p_user;
  update platform.blocks set updated_by = null where updated_by = p_user;
  update platform.node_versions set author = null where author = p_user;
  update platform.node_aliases set created_by = null where created_by = p_user;
  update platform.feedback set user_id = null where user_id = p_user;
  update platform.feedback set handled_by = null where handled_by = p_user;
  update platform.connector_activations set activated_by = null where activated_by = p_user;
  update platform.sim_outbox set created_by = null where created_by = p_user;
  update platform.sim_outbox set sent_by = null where sent_by = p_user;
  -- l'auteur d'un lien public (E05-S10, ADR-013)
  update platform.node_shares set created_by = null where created_by = p_user;
  -- l'auteur d'un fichier joint (E10-S02)
  update platform.files set created_by = null where created_by = p_user;
  -- ses tickets de dépôt par lien (E10-S02 lot f, ADR-018)
  delete from platform.upload_tickets where user_id = p_user;
end;
$$;

REVOKE ALL ON FUNCTION platform.forget_user(p_user uuid) FROM PUBLIC;

-- 6. La lecture publique d'un fichier (lot c).
CREATE FUNCTION platform.public_file_by_token(p_org uuid, p_token text, p_file uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_share platform.node_shares%rowtype;
  v_root platform.nodes%rowtype;
  v_result jsonb;
begin
  if p_org is null or p_token is null or p_file is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;
  select * into v_share from platform.node_shares s
   where s.token = p_token and s.org_id = p_org and s.revoked_at is null;
  if v_share.id is null or v_share.created_by is null then
    return null;
  end if;
  select * into v_root from platform.nodes n
   where n.id = v_share.node_id and n.org_id = p_org and n.deleted_at is null and n.status = 'published'
     and platform.node_level_of(v_share.created_by, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id) >= 1;
  if v_root.id is null then
    return null;
  end if;
  -- Le nœud du fichier : la racine partagée, ou un nœud dessous que le lien couvre et que l'auteur lit, sans nœud
  -- à la corbeille entre la racine et lui ; le fichier, cité par un bloc publié de ce nœud.
  select jsonb_build_object('id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size, 'node_path', n.path)
    into v_result
    from platform.files f
    join platform.nodes n on n.id = f.node_id and n.org_id = p_org
   where f.org_id = p_org and f.id = p_file and f.status = 'ready'
     and n.deleted_at is null and n.status = 'published'
     and (n.id = v_root.id
          or (v_share.include_children
              and n.lpath operator(extensions.<@) v_root.lpath
              and platform.node_level_of(v_share.created_by, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id) >= 1
              and not exists (select 1 from platform.nodes a
                               where a.org_id = p_org and a.deleted_at is not null
                                 and a.lpath operator(extensions.@>) n.lpath
                                 and a.lpath operator(extensions.<@) v_root.lpath)))
     and exists (select 1 from platform.blocks b
                  where b.node_id = n.id and b.state = 'published' and b.type in ('file', 'image')
                    and b.data ->> 'file_id' = f.id::text);
  return v_result;
end;
$_$;

REVOKE ALL ON FUNCTION platform.public_file_by_token(p_org uuid, p_token text, p_file uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.public_file_by_token(p_org uuid, p_token text, p_file uuid) TO anon;

-- 7. La duplication d'un sous-arbre (lot e). Le type rendu change : la fonction est retirée puis recréée aussitôt.
DROP FUNCTION IF EXISTS platform.duplicate_subtree(uuid, uuid[], text, text, double precision);
CREATE FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) RETURNS TABLE(source_id uuid, copy_id uuid, copy_path text, copied_files jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_uid uuid := (select auth.uid());
  v_source platform.nodes%rowtype;
  v_parent platform.nodes%rowtype;
  v_ids uuid[];
  v_path text;
  v_map jsonb := '{}'::jsonb;
  -- E10-S02 (AC-e3) : ancien identifiant de fichier → nouveau
  v_files jsonb;
  v_new uuid;
  r record;
begin
  if v_uid is null then
    raise exception 'duplicate_subtree needs a caller' using errcode = '42501';
  end if;
  select * into v_source from platform.nodes n where n.id = p_source and n.deleted_at is null;
  if v_source.id is null or v_source.parent_id is null
     or v_source.org_id not in (select platform.member_orgs()) then
    raise exception 'node not found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7301, pg_catalog.hashtext(v_source.org_id::text));
  select * into v_parent from platform.nodes n where n.id = v_source.parent_id;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'the title of the copy holds 1 to 200 characters' using errcode = '22023';
  end if;
  if p_segment is null or p_segment !~ '^[a-z0-9_]+$' then
    raise exception 'the segment of the copy is made of [a-z0-9_]' using errcode = '22023';
  end if;
  v_path := case when v_parent.parent_id is null then p_segment else v_parent.path || '/' || p_segment end;
  if exists (select 1 from platform.nodes n where n.org_id = v_source.org_id and n.path = v_path)
     or exists (select 1 from platform.node_aliases a where a.org_id = v_source.org_id and a.old_path = v_path) then
    raise exception 'path % is not available', v_path using errcode = '23505';
  end if;
  v_ids := array[p_source] || coalesce(p_nodes, '{}'::uuid[]);
  if exists (select 1 from unnest(coalesce(p_nodes, '{}'::uuid[])) as w(id)
               left join platform.nodes n on n.id = w.id
              where n.id is null or n.id = p_source or n.org_id <> v_source.org_id or n.deleted_at is not null
                 or not (n.lpath operator(extensions.<@) v_source.lpath)
                 or not (n.parent_id = any (v_ids))) then
    raise exception 'each node to copy is a live descendant of the node, under a copied parent'
      using errcode = '22023';
  end if;

  -- E10-S02 (AC-e3) : un identifiant neuf pour chaque fichier d'un nœud copié qu'un bloc publié de ce nœud cite ;
  -- un fichier que seul un brouillon ou une version ancienne cite ne se lit pas dans la copie, il ne se copie pas.
  select coalesce(jsonb_object_agg(f.id::text, gen_random_uuid()), '{}'::jsonb) into v_files
    from platform.files f
   where f.org_id = v_source.org_id and f.node_id = any (v_ids)
     and exists (select 1 from platform.blocks b
                  where b.node_id = f.node_id and b.state = 'published' and b.type in ('file', 'image')
                    and b.data ->> 'file_id' = f.id::text);

  for r in select n.* from platform.nodes n where n.id = any (v_ids)
            order by extensions.nlevel(n.lpath), n.path loop
    v_new := gen_random_uuid();
    source_id := r.id;
    copy_id := v_new;
    copy_path := v_path || substr(r.path, char_length(v_source.path) + 1);
    -- E10-S02 (AC-e3) : les paires (ancien, nouveau) des fichiers de ce nœud
    copied_files := coalesce((select jsonb_object_agg(f.id::text, v_files -> f.id::text)
                                from platform.files f where f.node_id = r.id and v_files ? f.id::text), '{}'::jsonb);
    insert into platform.nodes (id, org_id, parent_id, path, kind, title, summary, status, revision, meta,
                                position, created_by, updated_by)
    values (v_new, r.org_id,
            case when r.id = p_source then r.parent_id else (v_map ->> r.parent_id::text)::uuid end,
            copy_path, r.kind, case when r.id = p_source then btrim(p_title) else r.title end, r.summary,
            case when r.revision > 0 then 'published' else 'draft' end,
            case when r.revision > 0 then 1 else 0 end,
            r.meta, case when r.id = p_source then p_position else r.position end, v_uid, v_uid);
    v_map := v_map || jsonb_build_object(r.id::text, v_new);
    return next;
  end loop;

  -- E10-S02 (AC-e3) : les fichiers copiés, `pending` sous la copie, jusqu'à la copie de leur objet par le service.
  insert into platform.files (id, org_id, node_id, name, mime, size, status, created_by)
  select (v_files ->> f.id::text)::uuid, f.org_id, (v_map ->> f.node_id::text)::uuid, f.name, f.mime, f.size, 'pending', v_uid
    from platform.files f
   where f.org_id = v_source.org_id and v_files ? f.id::text;

  -- Blocs publiés et liens de ces blocs : un identifiant neuf par bloc, lu deux fois dans la même
  -- instruction (le `with` est calculé une fois ; l'insertion qu'il porte part même sans être lue).
  -- E10-S02 (AC-e3) : le `file_id` d'un bloc `file` ou d'une image jointe devient celui de la copie du fichier.
  with src as (
    select b.id, b.org_id, b.node_id, b.position, b.type, b.text,
           case when b.type in ('file', 'image') and v_files ? (b.data ->> 'file_id')
                then pg_catalog.jsonb_set(b.data, '{file_id}', v_files -> (b.data ->> 'file_id'))
                else b.data end as data,
           b.key, b.provenance, b.revision,
           gen_random_uuid() as new_id
      from platform.blocks b
     where b.node_id = any (v_ids) and b.state = 'published'
  ), copied as (
    insert into platform.blocks (id, state, org_id, node_id, position, type, text, data, key, provenance, revision,
                                 created_by, updated_by)
    select src.new_id, 'published', src.org_id, (v_map ->> src.node_id::text)::uuid, src.position, src.type, src.text,
           src.data, src.key, src.provenance, src.revision, v_uid, v_uid
      from src
  )
  insert into platform.links (org_id, source_node_id, source_block_id, target_path, target_key, target_node_id)
  select l.org_id, (v_map ->> l.source_node_id::text)::uuid, src.new_id, l.target_path, l.target_key, l.target_node_id
    from platform.links l
    join src on src.id = l.source_block_id
   where l.source_node_id = any (v_ids);

  -- L'instantané de la révision 1 d'une copie publiée, comme `publish_node` le prend.
  insert into platform.node_versions (node_id, revision, title, summary, kind, meta, blocks, author)
  select n.id, n.revision, n.title, n.summary, n.kind, n.meta,
         coalesce((select jsonb_agg(jsonb_build_object(
                             'id', b.id, 'type', b.type, 'position', b.position, 'key', b.key,
                             'text', b.text, 'data', b.data, 'provenance', b.provenance,
                             'revision', b.revision) order by b.position, b.id)
                     from platform.blocks b
                    where b.node_id = n.id and b.state = 'published' and b.type <> 'row'), '[]'::jsonb),
         v_uid
    from platform.nodes n
   where n.id in (select (e.value #>> '{}')::uuid from jsonb_each(v_map) e) and n.revision = 1;
end;
$_$;

REVOKE ALL ON FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) TO authenticated;

-- 8. Les tickets de dépôt par lien (lot f).
CREATE TABLE platform.upload_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    ctx text,
    token_hash text NOT NULL,
    form_token_hash text NOT NULL,
    kind text NOT NULL,
    mode text NOT NULL,
    target_path text NOT NULL,
    name text,
    title text,
    summary text,
    key text,
    base_revision integer,
    publish boolean,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT upload_tickets_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT upload_tickets_form_token_hash_check CHECK ((form_token_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT upload_tickets_kind_check CHECK ((kind = ANY (ARRAY['file'::text, 'md'::text, 'csv'::text]))),
    CONSTRAINT upload_tickets_mode_check CHECK ((((kind = 'file'::text) AND (mode = ANY (ARRAY['create'::text, 'attach'::text]))) OR ((kind = 'md'::text) AND (mode = ANY (ARRAY['create'::text, 'replace'::text]))) OR ((kind = 'csv'::text) AND (mode = ANY (ARRAY['create'::text, 'merge'::text])))))
);

COMMENT ON TABLE platform.upload_tickets IS 'Tickets de dépôt par lien à usage unique (E10-S02 lot f, ADR-018) : empreintes SHA-256 du jeton de curl et de celui du formulaire, jamais un jeton ; 15 minutes, un envoi par l''un ou l''autre.';

ALTER TABLE ONLY platform.upload_tickets
    ADD CONSTRAINT upload_tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.upload_tickets
    ADD CONSTRAINT upload_tickets_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY platform.upload_tickets
    ADD CONSTRAINT upload_tickets_form_token_hash_key UNIQUE (form_token_hash);

ALTER TABLE ONLY platform.upload_tickets
    ADD CONSTRAINT upload_tickets_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

CREATE INDEX idx_upload_tickets_org_id_expires_at ON platform.upload_tickets USING btree (org_id, expires_at);

ALTER TABLE platform.upload_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upload_tickets_select_member ON platform.upload_tickets;
CREATE POLICY upload_tickets_select_member ON platform.upload_tickets FOR SELECT TO authenticated USING (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND ((user_id = ( SELECT auth.uid() AS uid)) OR (expires_at < now()))));

DROP POLICY IF EXISTS upload_tickets_insert_own ON platform.upload_tickets;
CREATE POLICY upload_tickets_insert_own ON platform.upload_tickets FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

DROP POLICY IF EXISTS upload_tickets_delete_expired ON platform.upload_tickets;
CREATE POLICY upload_tickets_delete_expired ON platform.upload_tickets FOR DELETE TO authenticated USING (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (expires_at < now())));

GRANT SELECT,DELETE ON TABLE platform.upload_tickets TO authenticated;

GRANT INSERT(org_id),INSERT(user_id),INSERT(ctx),INSERT(token_hash),INSERT(form_token_hash),INSERT(kind),INSERT(mode),INSERT(target_path),INSERT(name),INSERT(title),INSERT(summary),INSERT(key),INSERT(base_revision),INSERT(publish),INSERT(expires_at) ON TABLE platform.upload_tickets TO authenticated;

-- 9. La consommation d'un ticket (lot f), sous `anon` seul.
CREATE FUNCTION platform.consume_upload_ticket(p_org uuid, p_hash text, p_form boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_ticket platform.upload_tickets%rowtype;
  v_email text;
begin
  if p_org is null or p_hash is null or p_form is null or p_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  -- Un seul `update` conditionnel, sur l'empreinte du jeton de la porte appelante : deux envois simultanés, par le même
  -- jeton ou par les deux, un seul voit encore le ticket libre (`used_at` est commun aux deux jetons).
  if p_form then
    update platform.upload_tickets t set used_at = now()
     where t.form_token_hash = p_hash and t.org_id = p_org and t.used_at is null and t.expires_at > now()
    returning t.* into v_ticket;
  else
    update platform.upload_tickets t set used_at = now()
     where t.token_hash = p_hash and t.org_id = p_org and t.used_at is null and t.expires_at > now()
    returning t.* into v_ticket;
  end if;
  if v_ticket.id is null then
    return null;
  end if;
  select m.email into v_email from platform.members m where m.org_id = p_org and m.user_id = v_ticket.user_id;
  return jsonb_build_object(
    'user_id', v_ticket.user_id, 'email', v_email, 'ctx', v_ticket.ctx, 'kind', v_ticket.kind, 'mode', v_ticket.mode,
    'target_path', v_ticket.target_path, 'name', v_ticket.name, 'title', v_ticket.title, 'summary', v_ticket.summary,
    'key', v_ticket.key, 'base_revision', v_ticket.base_revision, 'publish', v_ticket.publish);
end;
$$;

REVOKE ALL ON FUNCTION platform.consume_upload_ticket(p_org uuid, p_hash text, p_form boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.consume_upload_ticket(p_org uuid, p_hash text, p_form boolean) TO anon;

-- ROLLBACK: (jamais exécuté depuis le paquet) — les parties dans l'ordre inverse de ce fichier.
-- E10-S02 (fichiers joints) :
--   1. drop function platform.consume_upload_ticket(uuid, text, boolean) ; drop table platform.upload_tickets ;
--   2. drop function platform.public_file_by_token(uuid, text, uuid) ;
--   3. drop function platform.duplicate_subtree(uuid, uuid[], text, text, double precision), puis sa recréation, ses
--      privilèges compris, telle que l'écrit 20260928100000 (type rendu sans `copied_files`) ;
--   4. forget_user recréée (`create or replace`) telle que l'écrit 20260928100000, privilèges redits ;
--   5. block_search_text recréée (`create or replace`) telle que l'écrit la partie 3 (E10-S04), privilèges redits ;
--   6. après la suppression des blocs `file` et des images jointes (`data.file_id`), qu'elles refuseraient :
--      `blocks_type_check` et `blocks_shape_check` retirées puis reposées telles que les écrit la partie 3 (E10-S04) ;
--   7. drop table platform.files (ses policies et index partent avec elle). Les objets du bucket ne sont pas
--      touchés : ils restent, orphelins, sous `<org_id>/<id>`.
-- E11-S02, lot d (abandon du brouillon) :
--   DROP FUNCTION platform.discard_draft(p_node uuid, p_draft_stamp timestamp with time zone);
-- E11-S03, lot a (ctx invalidé par les Contextes servis) :
--   alter table platform.ctx drop constraint ctx_contexts_check, drop column contexts.
-- E10-S04 (markdown des pages) :
--   1. block_search_text recréée (`create or replace`) telle que l'écrit 20260928100000, privilèges redits ;
--   2. après la suppression des blocs qu'elles refuseraient (`simple_table`, `divider`, `toggle`, listes
--      imbriquées, titres de niveau 4 et 5) : `blocks_type_check` et `blocks_shape_check` retirées puis
--      reposées telles que les écrit 20260928100000.
-- E11-S10, lot a (espace « Privé » dès la première connexion) :
--   1. members_tree_sync recréée (`create or replace`) telle que l'écrit 20260929090000 (e05s13),
--      son `revoke all … from public` redit ;
--   2. drop function platform.ensure_private_space(uuid, uuid).
--   La réparation (étape 3) n'est pas défaite : les handles posés, les espaces `private/<handle>` et
--   leurs Contextes créés restent en place.
-- E11-S04, lot a (routage des procédures) :
--   1. drop function platform.route_candidates(uuid, text, text, integer), puis sa recréation, ses
--      privilèges compris, telle que l'écrit 20260928100000 ;
--   2. search_content recréée (`create or replace`) telle que l'écrit 20260928100000 ;
--   3. drop function platform.lexicon_fix(uuid, text).
