-- Version 1.2.1 du paquet : les migrations de la version, réunies dans ce fichier, chacune précédée d'une bannière
-- qui nomme son objet ; un seul bloc ROLLBACK en fin de fichier, les parties dans l'ordre inverse.

-- ====================================================================================================
-- Partie 1 : retours des assistants (`find` dit les blocs qu'il ne montre pas).
-- ====================================================================================================

-- `search_content` ne rend que trois blocs par nœud ; `find` les montrait sans dire qu'il en restait, et un assistant
-- qui cherchait un mot dans une page en manquait une occurrence. La fonction rend une colonne de plus, `block_total` :
-- le nombre de blocs publiés du nœud que la recherche trouve, avant la coupe à trois, sur chaque ligne de bloc ;
-- `null` sur une ligne de titre ou de résumé. Le reste est la fonction de 20260930100000, à l'identique.
--
-- Aucune table, colonne, policy ni index nouveau. Aucun droit n'entre en base : le service garde sa décision
-- (`security-patterns.md § Droits dans le service`).

-- La clause `set "pg_trgm.similarity_threshold"` de la fonction n'est admise d'un rôle non superutilisateur que si la
-- bibliothèque de `pg_trgm` est chargée dans la session : un appel à l'une de ses fonctions la charge. Sans lui,
-- `supabase db push` s'arrête sur « permission denied to set parameter » (42501) sur un projet Supabase.
DO $$ begin perform extensions.similarity('a', 'a'); end $$;

-- Le type rendu change : la fonction est retirée puis recréée aussitôt.
DROP FUNCTION IF EXISTS platform.search_content(uuid, text, text[], integer);
CREATE FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20) RETURNS TABLE(node_id uuid, path text, title text, summary text, kind text, match text, block_id uuid, block_type text, block_key text, column_name text, snippet text, rank real, block_total integer)
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
                  / v_levels)::real as rank,
             null::integer as block_total
        from cand c
       where c.in_title or c.sim >= 0.6
      union all
      select c.id, c.path, c.title, c.summary, c.kind, c.meta, 'summary', null, null, null, null,
             null, null, (1 + (c.covered + ts_rank_cd(c.search_tsv, v_pass, 32)) / v_levels)::real, null
        from cand c
       where c.search_tsv @@ v_pass and not c.in_title and c.sim < 0.6
      union all
      select k.node_id, k.path, k.title, k.summary, k.kind, k.meta, 'block', k.id, k.type, k.key,
             k.text, k.data, k.position, ((k.covered + k.r) / v_levels)::real, k.total
        from (select h.id, h.node_id, h.type, h.key, h.text, h.data, h.position, h.r,
                     c.path, c.title, c.summary, c.kind, c.meta, c.covered,
                     row_number() over (partition by h.node_id
                                        order by h.r desc, h.position, h.key, h.id) as nth,
                     -- tous les blocs trouvés du nœud, avant la coupe à trois : le service dit ce qu'il ne montre pas
                     (count(*) over (partition by h.node_id))::integer as total
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
           t.rank, t.block_total
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

-- Privilèges de la fonction recréée, à l'identique de la ligne de base V1.
REVOKE ALL ON FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[], p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[], p_limit integer) TO authenticated;

-- ROLLBACK: (jamais exécuté depuis le paquet) — les parties dans l'ordre inverse de ce fichier.
-- Retours des assistants :
--   drop function platform.search_content(uuid, text, text[], integer), puis sa recréation, ses privilèges compris,
--   telle que l'écrit 20260930100000 (partie 1, point 3).
