-- E11-S02 (lot d) : abandonner le brouillon d'un nœud publié (`node.discard_draft`, AC-d2, AC-d4 ; ADR-011
-- § 3 amendé : troisième fonction atomique du brouillon, après `open_draft` et `publish_node`). Réunie par
-- le pilote dans la migration unique de 1.0.1 (fiches D131, D124).
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

-- ROLLBACK:
-- DROP FUNCTION platform.discard_draft(p_node uuid, p_draft_stamp timestamp with time zone);
