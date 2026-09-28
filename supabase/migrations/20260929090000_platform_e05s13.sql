-- E05-S13, lot M (fiches D127, D128) : plusieurs responsables par équipe, l'équipe par défaut retirée du
-- modèle (premier temps, ADR-006 § 2), les résumés générés des Contextes au modèle par portée.
--
-- 1. Responsables (D128, point 13, option A) : `team_members.role` devient la seule source du responsable
--    d'une équipe, et une équipe en a zéro, un ou plusieurs. `node_level_of` lit le rôle ;
--    `team_members_guard` ne le recalcule plus et ne refuse plus de retirer un responsable ;
--    `teams_lead_sync` traduit une écriture héritée de `teams.lead_user_id` (import d'un ancien export,
--    outillage) : la personne devient responsable, les autres le restent, et la colonne revient à `null`.
--    Colonne et index gardés (`check:migrations` refuse `drop-column`) ; le retrait vient en 1.1.
-- 2. Équipe par défaut (D128, point 14) : plus rien ne l'écrit ni ne la lit. `accept_invitations` ne la
--    pose plus, `authenticated` perd l'écriture de la colonne, qui est vidée. Colonne, clé et index gardés
--    jusqu'à leur retrait en 1.1 ; `member_directory` la rend toujours (signature inchangée), nulle.
-- 3. Résumés (retour 10, D128) : `create_org` et `members_tree_sync` posent le résumé du Contexte au
--    modèle par portée ; celui d'une équipe l'était déjà (`teams_tree_sync`). Un résumé resté mot pour mot
--    l'ancien texte généré est remplacé ; un résumé écrit par quelqu'un est gardé.
--
-- Aucune table, colonne, policy ni index nouveau. Fonctions re-versionnées à signature identique ; leurs
-- privilèges, gardés par `create or replace`, sont redits à l'identique de la ligne de base V1. Aucun
-- contrôle de droit n'entre en base : nommer ou retirer un responsable est décidé par le service
-- (`security-patterns.md § Droits dans le service`).

-- 1. Les fonctions qui lisent ou écrivent le responsable.
CREATE OR REPLACE FUNCTION platform.node_level_of(p_user uuid, p_org uuid, p_lpath extensions.ltree, p_owner_kind text, p_owner_team uuid, p_owner_user uuid) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := p_user;
  v_kind text := p_owner_kind;
  v_team uuid := p_owner_team;
  v_user uuid := p_owner_user;
  -- nœud qui porte le propriétaire effectif : le nœud lui-même quand il en porte un
  v_owner_lpath extensions.ltree := p_lpath;
  -- profondeur minimale d'une règle comptée : toute la branche, sauf dans un espace personnel
  v_floor int := 0;
  -- une règle d'organisation compte, sauf dans un espace personnel (ADR-014)
  v_org_counts boolean;
  v_depth int;
  v_level int;
  v_team_level int;
  v_org_level int;
begin
  -- les organisations de la personne : `member_orgs()` pour elle
  if v_uid is null or p_org is null or p_lpath is null
     or not (exists (select 1 from platform.members m where m.org_id = p_org and m.user_id = v_uid)
             or exists (select 1 from platform.platform_grants g
                          join platform.platform_staff s on s.user_id = g.user_id
                         where g.org_id = p_org and g.user_id = v_uid and g.revoked_at is null)) then
    return 0;
  end if;
  -- propriétaire effectif (H52) : le sien, sinon celui de l'ancêtre le plus proche qui en porte un
  if v_kind is null then
    select a.owner_kind, a.owner_team_id, a.owner_user_id, a.lpath
      into v_kind, v_team, v_user, v_owner_lpath
      from platform.nodes a
     where a.org_id = p_org and a.lpath operator(extensions.@>) p_lpath
       and a.owner_kind is not null
     order by extensions.nlevel(a.lpath) desc
     limit 1;
  end if;
  -- D5, H61 : dans un espace personnel, seules comptent les règles posées sur le nœud qui porte la
  -- personne comme propriétaire, ou en dessous (les partages de son propriétaire). Une règle posée
  -- plus haut (`perso`, la racine) n'y ouvre rien et n'en ferme pas le propriétaire.
  if v_kind is not distinct from 'user' then
    v_floor := extensions.nlevel(v_owner_lpath);
  end if;
  v_org_counts := v_kind is distinct from 'user';
  -- (1) administrateur, ou staff avec un accès en cours : gestion, sauf dans un espace personnel
  if v_kind <> 'user'
     and (exists (select 1 from platform.members m where m.org_id = p_org and m.user_id = v_uid and m.role = 'admin')
          or exists (select 1 from platform.platform_grants g
                       join platform.platform_staff s on s.user_id = g.user_id
                      where g.org_id = p_org and g.user_id = v_uid and g.revoked_at is null)) then
    return 3;
  end if;
  -- (1 bis) un responsable de l'équipe propriétaire (`team_members.role`, E05-S13) : gestion, sauf règle
  -- qui le vise nommément (N7)
  if v_kind = 'team'
     and exists (select 1 from platform.team_members tm
                  where tm.team_id = v_team and tm.user_id = v_uid and tm.role = 'lead')
     and not exists (select 1 from platform.nodes a join platform.access_rules r on r.node_id = a.id
                      where a.org_id = p_org and a.lpath operator(extensions.@>) p_lpath
                        and r.subject_user_id = v_uid) then
    return 3;
  end if;
  -- (2) le nœud le plus proche (lui compris, sous le plancher) qui porte une règle visant la
  -- personne, ses équipes ou toute l'organisation
  select max(extensions.nlevel(a.lpath)) into v_depth
    from platform.nodes a join platform.access_rules r on r.node_id = a.id
   where a.org_id = p_org and a.lpath operator(extensions.@>) p_lpath
     and extensions.nlevel(a.lpath) >= v_floor
     and (r.subject_user_id = v_uid
          or r.subject_team_id in (select tm.team_id from platform.team_members tm where tm.user_id = v_uid)
          or (r.subject_org and v_org_counts));
  if v_depth is not null then
    -- la règle de la personne l'emporte ; à défaut, le plus haut niveau de ses équipes ; à défaut,
    -- celui de l'organisation, gardé pour l'étape (3)
    select max(platform.level_rank(r.level)) filter (where r.subject_user_id = v_uid),
           max(platform.level_rank(r.level)) filter (where r.subject_team_id in
             (select tm.team_id from platform.team_members tm where tm.user_id = v_uid)),
           max(platform.level_rank(r.level)) filter (where r.subject_org and v_org_counts)
      into v_level, v_team_level, v_org_level
      from platform.nodes a join platform.access_rules r on r.node_id = a.id
     where a.org_id = p_org and a.lpath operator(extensions.@>) p_lpath
       and extensions.nlevel(a.lpath) = v_depth;
    if v_level is not null then
      return v_level;
    end if;
    if v_team_level is not null then
      return v_team_level;
    end if;
  end if;
  -- (3) sans règle de la personne ni de ses équipes : le propriétaire effectif décide, et une règle
  -- d'organisation au plus proche ouvre au-delà
  v_level := case
    when v_kind = 'org' then 1
    when v_kind = 'team' and exists (select 1 from platform.team_members tm
                                      where tm.team_id = v_team and tm.user_id = v_uid and tm.role = 'lead') then 3
    when v_kind = 'team' and exists (select 1 from platform.team_members tm where tm.team_id = v_team and tm.user_id = v_uid) then 2
    when v_kind = 'user' and v_user = v_uid then 3
    else 0
  end;
  return greatest(v_level, coalesce(v_org_level, 0));
end;
$$;

REVOKE ALL ON FUNCTION platform.node_level_of(p_user uuid, p_org uuid, p_lpath extensions.ltree, p_owner_kind text, p_owner_team uuid, p_owner_user uuid) FROM PUBLIC;

-- Le rôle écrit est gardé tel quel, responsable compris, et retirer un responsable n'est plus refusé : qui
-- nomme, retire ou compose est décidé par le service avant sa requête. Le déclencheur reste (le retirer
-- serait un `drop`, que refuse `check:migrations`), sans effet.
CREATE OR REPLACE FUNCTION platform.team_members_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION platform.team_members_guard() FROM PUBLIC;

-- Une écriture héritée de `teams.lead_user_id` nomme la personne responsable, sans retirer les autres,
-- puis remet la colonne à `null` : sa seconde écriture repasse ici avec `null` et s'arrête.
CREATE OR REPLACE FUNCTION platform.teams_lead_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.lead_user_id is null then
    return null;
  end if;
  if (select auth.uid()) is not null then
    perform 1 from platform.members m
     where m.org_id = new.org_id and m.user_id = new.lead_user_id
       for share;
    if not found then
      raise exception 'the lead must be a member of the organization' using errcode = '23503';
    end if;
  end if;
  insert into platform.team_members (team_id, user_id, role)
  values (new.id, new.lead_user_id, 'lead')
  on conflict (team_id, user_id) do update set role = 'lead';
  update platform.teams set lead_user_id = null where id = new.id;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION platform.teams_lead_sync() FROM PUBLIC;

-- 2. L'invitation n'écrit plus l'équipe par défaut ; l'équipe de l'invitation reste celle où la personne
--    entre.
CREATE OR REPLACE FUNCTION platform.accept_invitations() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  v_email text := lower(nullif(v_claims ->> 'email', ''));
  v_name text := nullif(coalesce(v_claims -> 'user_metadata' ->> 'full_name',
                                 v_claims -> 'user_metadata' ->> 'name',
                                 v_claims ->> 'name'), '');
  v_last_sign_in timestamptz := now();
  v_inv record;
  v_joined jsonb := '[]'::jsonb;
begin
  if v_uid is null or v_email is null then
    return v_joined;
  end if;
  for v_inv in
    select i.id, i.org_id, i.role, i.team_id
      from platform.invitations i
     where i.email = v_email and i.accepted_at is null and i.declined_at is null
       and i.revoked_at is null and i.expires_at > now()
     order by i.created_at
       for update
  loop
    insert into platform.members as m (org_id, user_id, role, profile, email, name, last_sign_in_at)
    values (v_inv.org_id, v_uid, v_inv.role,
            jsonb_strip_nulls(jsonb_build_object(
              'handle', platform.unique_handle(v_inv.org_id, v_email), 'name', v_name)),
            v_email, v_name, v_last_sign_in)
    on conflict (org_id, user_id) do update
      set role = case when m.role = 'member' and excluded.role = 'admin' then 'admin' else m.role end;
    if v_inv.team_id is not null then
      insert into platform.team_members (team_id, user_id, role)
      values (v_inv.team_id, v_uid, 'member')
      on conflict (team_id, user_id) do nothing;
    end if;
    update platform.invitations
       set accepted_at = now(), accepted_by = v_uid
     where id = v_inv.id;
    v_joined := v_joined || (
      select jsonb_build_array(jsonb_build_object(
               'org_id', o.id, 'slug', o.slug, 'name', o.name, 'role', mm.role))
        from platform.orgs o
        join platform.members mm on mm.org_id = o.id and mm.user_id = v_uid
       where o.id = v_inv.org_id
    );
  end loop;
  update platform.members m
     set email = v_email, name = v_name, last_sign_in_at = v_last_sign_in
   where m.user_id = v_uid
     and (m.email, m.name, m.last_sign_in_at) is distinct from (v_email, v_name, v_last_sign_in);
  return v_joined;
end;
$$;

REVOKE ALL ON FUNCTION platform.accept_invitations() FROM PUBLIC;
GRANT ALL ON FUNCTION platform.accept_invitations() TO authenticated;

-- 3. Les résumés générés des Contextes de Tout le monde et de Privé.
CREATE OR REPLACE FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_org uuid;
  v_root uuid;
  v_host text;
begin
  if v_uid is null or not platform.is_staff() then
    raise exception 'create_org is reserved to the platform team' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'name must hold 1 to 80 characters' using errcode = '22023';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$' then
    raise exception 'slug must be 2 to 40 lowercase letters, digits or hyphens' using errcode = '22023';
  end if;
  insert into platform.orgs (name, slug, prefix) values (v_name, p_slug, p_prefix)
  returning id into v_org;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, owner_kind,
                              created_by, updated_by)
  values (v_org, null, 'guide', 'page', 'Guide de ' || v_name,
          'Racine de l''arbre de l''organisation ; son contexte est la page contexte.',
          'org', v_uid, v_uid)
  returning id into v_root;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, created_by, updated_by)
  values (v_org, v_root, 'private', 'page', 'Espaces personnels',
          'Un espace par personne, visible de son seul propriétaire.', v_uid, v_uid),
         (v_org, v_root, 'contexte', 'context', 'Contexte',
          'Ce que les assistants de tous les membres de l''organisation lisent à chaque conversation.',
          v_uid, v_uid);
  insert into platform.platform_grants (org_id, user_id, granted_by, reason)
  values (v_org, v_uid, v_uid, 'creation');
  foreach v_host in array coalesce(p_hosts, '{}') loop
    insert into platform.org_domains (host, org_id) values (lower(btrim(v_host)), v_org);
  end loop;
  return v_org;
end;
$_$;

REVOKE ALL ON FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) TO authenticated;

CREATE OR REPLACE FUNCTION platform.members_tree_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_handle text := new.profile ->> 'handle';
  v_n int := 1;
  v_private uuid;
  v_space uuid;
begin
  select n.id into v_private from platform.nodes n
   where n.org_id = new.org_id and n.path = 'private';
  if v_handle is null or v_private is null then
    return null;
  end if;
  if exists (select 1 from platform.node_aliases a
              where a.org_id = new.org_id and a.old_path = 'private/' || v_handle) then
    loop
      v_n := v_n + 1;
      exit when not exists (select 1 from platform.members m
                             where m.org_id = new.org_id
                               and m.profile ->> 'handle' = v_handle || '_' || v_n)
            and not exists (select 1 from platform.node_aliases a
                             where a.org_id = new.org_id
                               and a.old_path = 'private/' || v_handle || '_' || v_n)
            and not exists (select 1 from platform.nodes n
                             where n.org_id = new.org_id
                               and n.path = 'private/' || v_handle || '_' || v_n
                               and n.owner_user_id is distinct from new.user_id);
    end loop;
    v_handle := v_handle || '_' || v_n;
    update platform.members m
       set profile = jsonb_set(m.profile, '{handle}', to_jsonb(v_handle))
     where m.org_id = new.org_id and m.user_id = new.user_id;
  end if;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, owner_kind,
                              owner_user_id, created_by, updated_by)
  values (new.org_id, v_private, 'private/' || v_handle, 'page', 'Privé',
          'Votre espace privé, visible de vous seul.', 'user', new.user_id,
          new.user_id, new.user_id)
  on conflict (org_id, path) do nothing;
  select n.id into v_space from platform.nodes n
   where n.org_id = new.org_id and n.path = 'private/' || v_handle;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, created_by, updated_by)
  values (new.org_id, v_space, 'private/' || v_handle || '/contexte', 'context', 'Contexte',
          'Ce que votre assistant lit à chaque conversation ; vous seul le recevez.',
          new.user_id, new.user_id)
  on conflict (org_id, path) do nothing;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION platform.members_tree_sync() FROM PUBLIC;

-- 4. Les données. Chaque responsable nommé par `teams.lead_user_id` a sa ligne `team_members` au rôle
--    `lead` (déjà le cas : l'ancien `team_members_guard` recalculait le rôle ; posé ici pour une ligne
--    écrite hors de lui), tant qu'il est membre de l'organisation ; puis la colonne est vidée (le
--    déclencheur repasse avec `null` et s'arrête).
insert into platform.team_members (team_id, user_id, role)
select t.id, t.lead_user_id, 'lead'
  from platform.teams t
  join platform.members m on m.org_id = t.org_id and m.user_id = t.lead_user_id
 where t.lead_user_id is not null
on conflict (team_id, user_id) do update set role = 'lead';

update platform.teams set lead_user_id = null where lead_user_id is not null;

-- L'équipe par défaut : plus aucune écriture par l'API, puis la colonne vidée.
REVOKE INSERT (default_team_id), UPDATE (default_team_id) ON TABLE platform.members FROM authenticated;

update platform.members set default_team_id = null where default_team_id is not null;

-- Les résumés restés mot pour mot l'ancien texte généré ; `updated_at` ne bouge pas : aucun contenu
-- n'est écrit par quelqu'un, et les documents récents servis par `context` ne doivent pas remonter.
ALTER TABLE platform.nodes DISABLE TRIGGER set_updated_at;
update platform.nodes
   set summary = 'Ce que les assistants de tous les membres de l''organisation lisent à chaque conversation.'
 where kind = 'context' and path = 'contexte'
   and summary = 'Mission, règles et ton de l''organisation, lus par les assistants de tous les membres à chaque conversation.';
update platform.nodes
   set summary = 'Ce que votre assistant lit à chaque conversation ; vous seul le recevez.'
 where kind = 'context' and path like 'private/%/contexte'
   and summary = 'Ce que vos assistants lisent à chaque conversation : ton, signature, préférences.';
ALTER TABLE platform.nodes ENABLE TRIGGER set_updated_at;

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   1. node_level_of, team_members_guard, teams_lead_sync, accept_invitations, create_org et
--      members_tree_sync recréées telles que les écrivent 20260928100000 et 20260928120000 ;
--   2. grant insert (default_team_id), update (default_team_id) on platform.members to authenticated;
--   3. un seul responsable par équipe : update platform.teams t set lead_user_id = (le premier
--      `team_members.user_id` au rôle `lead`, par nom) ; les autres responsables redeviennent membres ;
--   4. les équipes par défaut et les anciens résumés ne reviennent pas (données non gardées).
