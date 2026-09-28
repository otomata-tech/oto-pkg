-- `platform.search_content` d'avant E01-S13, telle que la posait la ligne de base d'E01-S09
-- (`20260925230100_platform_base.sql`, repliée dans la ligne de base V1 par E01-S12 partie d) : la fonction
-- que `recherche-fautes.test.ts` recrée dans `pg_temp` pour la comparer à celle du paquet. Jamais appliquée à un hôte.
CREATE FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20) RETURNS TABLE(node_id uuid, path text, title text, summary text, kind text, match text, block_id uuid, block_type text, block_key text, column_name text, snippet text, rank real)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  -- parts de termes possibles dans une tranche : de 0 à tous, soit le nombre de termes + 1
  v_levels double precision;
  v_word text;
  v_term tsquery;
  v_and tsquery;
  v_or tsquery;
  v_pass tsquery;
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
  end loop;
  v_levels := cardinality(v_terms) + 1;

  -- Deux passes : tous les termes (ET), puis, si rien n'est trouvé, l'un d'eux (OU).
  foreach v_pass in array array[v_and, v_or] loop
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
        join unnest(v_queries) with ordinality as t(q, i) on h.search_tsv @@ t.q
       group by h.node_id
    ),
    found_nodes as materialized (
      -- nœuds trouvés, publiés, hors racine, du genre demandé
      select n.id, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id, n.path,
             n.title, n.summary, n.kind, n.meta, n.search_tsv
        from platform.nodes n
       where n.id in (select h.id from node_hits h union select h.node_id from block_hits h)
         and n.status = 'published' and n.parent_id is not null
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
                from unnest(v_queries) with ordinality as t(q, i)
               where f.search_tsv @@ t.q
                  or coalesce(t.i = any (bt.terms), false)
                  or (v_pass <> v_or
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
                  when t.match = 'title' then ts_headline('platform.fr'::regconfig, t.title, v_or, v_short)
                  when t.match = 'summary' then ts_headline('platform.fr'::regconfig, t.summary, v_or, v_short)
                  when t.block_type = 'row' then
                    coalesce(col.name || ': ' || ts_headline('platform.fr'::regconfig, col.value, v_or, v_short),
                             t.block_key)
                  else ts_headline('platform.fr'::regconfig,
                                   platform.block_search_text(t.block_type, t.block_text, t.block_data, null),
                                   v_or, v_long)
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
                           platform.norm_words(t.block_data ->> (c.value ->> 'name'))) @@ v_or
         order by c.ordinality
         limit 1) col on true
     order by t.rank desc, t.path, t.pos nulls first, t.block_key nulls first, t.block_id;
    exit when found or v_and = v_or;
  end loop;
end;
$$;
