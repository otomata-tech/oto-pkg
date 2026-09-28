-- `platform.route_candidates` d'avant E01-S13, telle que la posait la ligne de base d'E01-S09
-- (`20260925230100_platform_base.sql`, repliée dans la ligne de base V1 par E01-S12 partie d) : la fonction
-- que `route-candidates-index.test.ts` recrée dans `pg_temp` pour la comparer à celle du paquet. Jamais appliquée à un hôte.
CREATE FUNCTION platform.route_candidates(p_org uuid, p_query text, p_kind text DEFAULT NULL::text, p_limit integer DEFAULT 50) RETURNS TABLE(node_id uuid, path text, title text, summary text, kind text, owner_team_id uuid, s_summary real, s_title real, lexical real, query_lexemes integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with qx as (
    -- requête sans accents, en minuscules, mots séparés d'une espace, bordée d'espaces
    select w.padded as q,
           array(select distinct unnest(tsvector_to_array(
                   to_tsvector('platform.fr'::regconfig, w.padded)))) as lex
      from (select ' ' || platform.norm_words(left(coalesce(p_query, ''), 500)) || ' ' as padded) w
  ),
  cand as (
    -- lexèmes du nœud = ceux du titre et du résumé (colonne générée search_tsv)
    select n.id, n.path, n.title, n.summary, n.kind, tsvector_to_array(n.search_tsv) as lex
      from platform.nodes n
     where n.org_id = p_org and n.status = 'published' and n.parent_id is not null
       and (p_kind is null or n.kind = p_kind)
  ),
  scored as (
    select c.id, c.path, c.title, c.summary, c.kind,
           -- la requête cherchée dans le résumé : une formulation qu'il porte mot pour mot vaut 1
           greatest(extensions.similarity(platform.norm(c.summary), qx.q),
                    extensions.word_similarity(qx.q, platform.norm(c.summary)))::real as s_summary,
           greatest(extensions.similarity(platform.norm(c.title), qx.q),
                    extensions.word_similarity(platform.norm(c.title), qx.q))::real as s_title,
           (case when cardinality(qx.lex) = 0 then 0
                 else least(1, (select count(*) from unnest(qx.lex) l where l = any (c.lex))::real
                               / cardinality(qx.lex)) end)::real as lexical,
           cardinality(qx.lex) as query_lexemes
      from cand c cross join qx
  )
  select s.id, s.path, s.title, s.summary, s.kind,
         (select o.owner_team_id from platform.node_owner(s.id) o),
         s.s_summary, s.s_title, s.lexical, s.query_lexemes
    from scored s
   order by greatest(s.s_summary, s.s_title, s.lexical) desc, s.path
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
