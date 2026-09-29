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

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   1. members_tree_sync recréée (`create or replace`) telle que l'écrit 20260929090000 (e05s13),
--      son `revoke all … from public` redit ;
--   2. drop function platform.ensure_private_space(uuid, uuid).
--   La réparation (étape 3) n'est pas défaite : les handles posés, les espaces `private/<handle>` et
--   leurs Contextes créés restent en place.
