-- E05-S11, lot h (fiche D107 b) : le dossier des espaces personnels s'appelle `private`, et non plus
-- `perso`, partout où un chemin le nomme : nœuds, fonctions et déclencheurs, policy de suppression,
-- slugs d'équipe réservés. Les anciens chemins restent des alias : le changement de chemin passe par
-- `nodes_aliases_on_move` et `nodes_path_cascade`, comme un déplacement, et chaque ancien chemin
-- (`perso`, `perso/<handle>`, `perso/<handle>/…`) mène au nœud qui l'a quitté (lectures, liens,
-- adresses). Le journal garde ses lignes telles qu'écrites : le service coupe les deux formes.
--
-- Ordre : contrôle des collisions, fonctions re-versionnées (même signature ; privilèges gardés par
-- `create or replace`, et redits à l'identique de la ligne de base V1), policy, contrainte, puis les
-- chemins. Les fonctions nouvelles ne reconnaissent que `private` : un nœud Contexte
-- `perso/<handle>/contexte` se déplace donc sans que la garde (« a Contexte node does not move ») ne
-- l'arrête, et redevient Contexte à son nouveau chemin.

-- 1. Aucune équipe ni aucun nœud ne tient déjà `private` : sinon le dossier ne peut pas y aller, et
--    rien ne change (la migration s'arrête en nommant l'organisation).
do $$
declare
  v_org text;
begin
  select o.slug into v_org
    from platform.teams t join platform.orgs o on o.id = t.org_id
   where t.slug = 'private'
   limit 1;
  if v_org is not null then
    raise exception 'organisation %: a team has the slug private, which the personal spaces now take; give the team another name first', v_org
      using errcode = '23505';
  end if;
  select o.slug into v_org
    from platform.nodes n join platform.orgs o on o.id = n.org_id
   where n.path = 'private' or n.path like 'private/%'
   limit 1;
  if v_org is not null then
    raise exception 'organisation %: a node is at the path private, or under it, which the personal spaces now take; move it first', v_org
      using errcode = '23505';
  end if;
end
$$;

-- 2. Les fonctions qui nomment le dossier.
CREATE OR REPLACE FUNCTION platform.is_context_path(p_org uuid, p_path text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
  select p_path = 'contexte'
      or p_path ~ '^private/[a-z0-9_]+/contexte$'
      or exists (select 1 from platform.teams t
                  where t.org_id = p_org and p_path = t.slug || '/contexte')
$_$;

REVOKE ALL ON FUNCTION platform.is_context_path(p_org uuid, p_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.is_context_path(p_org uuid, p_path text) TO authenticated;

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
          'Mission, règles et ton de l''organisation, lus par les assistants de tous les membres à chaque conversation.',
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

CREATE OR REPLACE FUNCTION platform.unique_handle(p_org uuid, p_email text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_base text;
  v_candidate text;
  v_n int := 1;
begin
  v_base := split_part(coalesce(p_email, ''), '@', 1);
  v_base := translate(
    v_base,
    'ÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝàâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
    'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy'
  );
  v_base := lower(v_base);
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '_', 'g');
  v_base := trim(both '_' from left(trim(both '_' from v_base), 40));
  if v_base = '' then
    v_base := 'membre';
  end if;
  v_candidate := v_base;
  while exists (
    select 1 from platform.members m
     where m.org_id = p_org and m.profile ->> 'handle' = v_candidate
  ) or exists (
    select 1 from platform.nodes n
     where n.org_id = p_org and n.path = 'private/' || v_candidate
       and n.owner_user_id is distinct from (select auth.uid())
       and not exists (select 1 from platform.members o
                        where o.user_id = n.owner_user_id
                          and o.email = lower(coalesce(p_email, '')))
  ) loop
    v_n := v_n + 1;
    v_candidate := v_base || '_' || v_n;
  end loop;
  return v_candidate;
end;
$$;

REVOKE ALL ON FUNCTION platform.unique_handle(p_org uuid, p_email text) FROM PUBLIC;

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
          'Ce que vos assistants lisent à chaque conversation : ton, signature, préférences.',
          new.user_id, new.user_id)
  on conflict (org_id, path) do nothing;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION platform.members_tree_sync() FROM PUBLIC;

CREATE OR REPLACE FUNCTION platform.nodes_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
declare
  v_api boolean := current_user = 'authenticated';
  v_parent_id uuid;
  v_parent_org uuid;
  v_parent_path text;
  v_parent_parent uuid;
  v_segment text;
  v_expected text;
begin
  if not coalesce(new.path ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$', false) then
    raise exception 'path segments must match [a-z0-9_]' using errcode = '23514';
  end if;
  if char_length(new.path) > 1000 then
    raise exception 'path must hold at most 1000 characters' using errcode = '23514';
  end if;

  if v_api and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id
                or new.path <> old.path) then
    perform pg_catalog.pg_advisory_xact_lock(7301, pg_catalog.hashtext(new.org_id::text));
  end if;

  if tg_op = 'UPDATE' then
    if new.org_id <> old.org_id then
      raise exception 'org_id is immutable' using errcode = '23514';
    end if;
    if new.kind <> old.kind and (old.kind = 'table' or new.kind = 'table') then
      raise exception 'a table does not change kind' using errcode = '23514';
    end if;
    if old.path = 'private' and (new.parent_id is distinct from old.parent_id or new.path <> old.path) then
      raise exception 'the private folder does not move' using errcode = '23514';
    end if;
    if new.path <> old.path and platform.is_context_path(old.org_id, old.path) then
      raise exception 'a Contexte node does not move' using errcode = '23514';
    end if;
    if v_api and new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable' using errcode = '42501';
    end if;
  end if;

  -- ADR-011 § 1 : `context` est le genre des nœuds Contexte, et d'eux seuls. Une page créée au
  -- chemin d'un Contexte le devient.
  if tg_op = 'INSERT' and new.kind = 'page' and platform.is_context_path(new.org_id, new.path) then
    new.kind := 'context';
  end if;
  if (tg_op = 'INSERT' or new.kind <> old.kind or new.path <> old.path)
     and (new.kind = 'context') <> platform.is_context_path(new.org_id, new.path) then
    raise exception 'kind context is the kind of Contexte nodes, and of them only' using errcode = '23514';
  end if;

  if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id
                                    or (v_api and new.path <> old.path)) then
    select p.id, p.org_id, p.path, p.parent_id
      into v_parent_id, v_parent_org, v_parent_path, v_parent_parent
      from platform.nodes p where p.id = new.parent_id;
    if v_parent_id is null or v_parent_org <> new.org_id then
      raise exception 'parent not found in this organization' using errcode = '23503';
    end if;
    v_segment := regexp_replace(new.path, '^.*/', '');
    v_expected := case when v_parent_parent is null then v_segment
                       else v_parent_path || '/' || v_segment end;
    if new.path <> v_expected then
      raise exception 'path must be % under its parent', v_expected using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from platform.nodes d
                                     where d.id = new.parent_id
                                       and d.lpath operator(extensions.<@) old.lpath) then
      raise exception 'a node cannot move under itself' using errcode = '23514';
    end if;
    if v_parent_path = 'private' and not coalesce(
         new.owner_kind = 'user'
         and v_segment = (select m.profile ->> 'handle' from platform.members m
                           where m.org_id = new.org_id and m.user_id = new.owner_user_id), false) then
      raise exception 'private/<handle> is the personal space of the member with that handle'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' or (new.owner_kind, new.owner_team_id, new.owner_user_id)
                         is distinct from (old.owner_kind, old.owner_team_id, old.owner_user_id) then
    if new.owner_kind = 'team' and not exists (
         select 1 from platform.teams t where t.id = new.owner_team_id and t.org_id = new.org_id) then
      raise exception 'owner team must belong to the organization' using errcode = '23503';
    end if;
    if new.owner_kind = 'user' and not exists (
         select 1 from platform.members m where m.user_id = new.owner_user_id and m.org_id = new.org_id) then
      raise exception 'owner must be a member of the organization' using errcode = '23503';
    end if;
  end if;

  -- Tâche M18b (HN-E08S06-17) : le propriétaire d'un espace personnel ne change que pour la personne
  -- du handle, même message qu'à l'insertion et au déplacement, pour tout rôle. L'espace est le nœud
  -- dont le parent est `private` ; un nœud plus bas n'est pas visé (H71).
  if tg_op = 'UPDATE' and (new.owner_kind, new.owner_team_id, new.owner_user_id)
                          is distinct from (old.owner_kind, old.owner_team_id, old.owner_user_id)
     and exists (select 1 from platform.nodes p where p.id = new.parent_id and p.path = 'private')
     and not coalesce(
       new.owner_kind = 'user'
       and regexp_replace(new.path, '^.*/', '') = (select m.profile ->> 'handle' from platform.members m
                                                   where m.org_id = new.org_id and m.user_id = new.owner_user_id), false) then
    raise exception 'private/<handle> is the personal space of the member with that handle'
      using errcode = '23514';
  end if;
  return new;
end;
$_$;

REVOKE ALL ON FUNCTION platform.nodes_guard() FROM PUBLIC;

-- 3. Le dossier ne se supprime pas, sous son nouveau chemin.
DROP POLICY IF EXISTS nodes_delete_manager ON platform.nodes;
CREATE POLICY nodes_delete_manager ON platform.nodes FOR DELETE TO authenticated USING (((parent_id IS NOT NULL) AND (path <> 'private'::text) AND (NOT platform.is_context_path(org_id, path)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

-- 4. `private` rejoint les slugs réservés ; `perso` y reste : ses chemins sont des alias.
ALTER TABLE platform.teams DROP CONSTRAINT teams_slug_reserved, ADD CONSTRAINT teams_slug_reserved CHECK ((slug <> ALL (ARRAY['guide'::text, 'perso'::text, 'private'::text, 'contexte'::text, 'journal'::text])));

-- 5. Les chemins. Un alias qu'un nœud a laissé au chemin où arrive un nœud de l'espace personnel
--    s'efface (`nodes_aliases_sync` refuserait le changement) : ce chemin désigne désormais ce nœud.
delete from platform.node_aliases a
 using platform.nodes n
 where n.org_id = a.org_id
   and (n.path = 'perso' or n.path like 'perso/%')
   and a.old_path = 'private' || substr(n.path, 6)
   and a.node_id <> n.id;

-- Le dossier change de chemin ; la base réécrit celui de chaque nœud dessous (`nodes_path_cascade`) et
-- inscrit chaque ancien chemin (`nodes_aliases_on_move`). `updated_at` ne bouge pas : aucun contenu ne
-- change, et les documents récents servis par `context` ne doivent pas tous remonter.
ALTER TABLE platform.nodes DISABLE TRIGGER set_updated_at;
update platform.nodes set path = 'private' where path = 'perso';
ALTER TABLE platform.nodes ENABLE TRIGGER set_updated_at;

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   1. is_context_path, create_org, unique_handle, members_tree_sync, nodes_guard, la policy
--      nodes_delete_manager et la contrainte teams_slug_reserved, recréées telles que la ligne de base
--      20260928100000 les écrit (elles nomment `perso`) ;
--   2. alter table platform.nodes disable trigger set_updated_at;
--      update platform.nodes set path = 'perso' where path = 'private';
--      alter table platform.nodes enable trigger set_updated_at;
--      (les alias `perso…` s'effacent quand leurs nœuds y reviennent ; les alias `private…` naissent)
--   3. delete from platform.node_aliases where old_path = 'private' or old_path like 'private/%';
