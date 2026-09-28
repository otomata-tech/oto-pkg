-- Migration : platform_base_v1
-- Description : ligne de base de la V1 du schéma `platform` (story E01-S12, partie d ; fiche D102 : le
-- schéma sort propre en 1.0.0). Elle replie la ligne de base d'E01-S09 (20260925230100_platform_base.sql)
-- et les six migrations écrites après elle, de 20260926084500_platform_identites.sql à
-- 20260927200000_platform_retraits_v1.sql : même schéma, mêmes privilèges, comparés sur deux Postgres nus
-- (story E01-S12, AC-d2). Toute installation neuve part d'ici, sur Supabase comme sur un Postgres nu ; un
-- hôte qui porte déjà la chaîne marque ce fichier appliqué sans le rejouer (`README.md`, « Hôtes déjà
-- installés »).
-- Ni l'extension de datation que refuse le Postgres managé de Scaleway, ni la table des comptes de
-- Supabase : `updated_at` avance par `platform.set_updated_at()` ; une personne est un identifiant `uuid`,
-- que l'outillage oublie par `platform.forget_user()`. Aucun privilège à `service_role` : l'outillage
-- passe par la connexion d'administration, le serveur par `platform_app`.
-- Produite par `pg_dump --schema-only --schema=platform --no-owner` (PostgreSQL 16) d'une base où la
-- chaîne est appliquée, puis normalisée : commentaires, lignes psql et réglages de session de pg_dump
-- retirés ; extensions en tête ; une ligne de section par genre d'objet ; le privilège de
-- `supabase_auth_admin` accordé en fin de fichier, seulement si le rôle existe (Supabase) ; la contrainte
-- `blocks_key_check` gardée avec son `between`, que pg_dump écrit en deux comparaisons et que Postgres
-- relirait aplaties. Le corps de chaque fonction, ses commentaires compris, est celui de la chaîne.
-- Prérequis de l'hôte : le schéma `extensions`, le schéma `auth` avec `uid()` et `jwt()`, les rôles
-- `anon` et `authenticated`. Supabase les porte ; ailleurs, `oto-platform db prepare` les pose.

-- pg_dump range les fonctions avant les tables que lisent leurs corps : ceux-ci ne sont pas contrôlés à
-- la création. Réglage rendu en fin de fichier, et annulé avec la transaction si elle échoue.
set check_function_bodies = false;

-- Les trois extensions du paquet (le Postgres managé de Scaleway les admet).
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists ltree with schema extensions;

CREATE SCHEMA platform;

-- Fonctions, par nom.

CREATE FUNCTION platform.accept_invitations() RETURNS jsonb
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
    insert into platform.members as m (org_id, user_id, role, default_team_id, profile, email, name,
                                       last_sign_in_at)
    values (v_inv.org_id, v_uid, v_inv.role, v_inv.team_id,
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

CREATE FUNCTION platform.applied_migrations() RETURNS TABLE(version text, name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not platform.is_staff() then
    raise exception 'applied_migrations is reserved to the platform team' using errcode = '42501';
  end if;
  if pg_catalog.to_regclass('supabase_migrations.schema_migrations') is null then
    return;
  end if;
  -- `name` est absent des vieilles versions de la CLI : lu par le JSON de la ligne.
  return query
    select m.version::text, pg_catalog.to_jsonb(m) ->> 'name'
      from supabase_migrations.schema_migrations m
     order by m.version;
end;
$$;

CREATE FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $_$
  select concat_ws(' ', p_key, p_text,
    case p_type
      when 'row' then (select string_agg(v #>> '{}', ' ')
                         from jsonb_path_query(p_data, 'lax $.* ? (@.type() == "string" || @.type() == "number")') v)
      when 'list' then (select string_agg(v #>> '{}', ' ')
                          from jsonb_path_query(p_data, 'lax $.items[*] ? (@.type() == "string")') v)
      when 'checklist' then (select string_agg(v #>> '{}', ' ')
                               from jsonb_path_query(p_data, 'lax $.items[*].text ? (@.type() == "string")') v)
      when 'call' then concat_ws(' ', p_data ->> 'function',
                         (select string_agg(v #>> '{}', ' ')
                            from jsonb_path_query(p_data -> 'args', 'strict $.** ? (@.type() == "string")') v))
      when 'reference' then p_data ->> 'path'
      when 'image' then p_data ->> 'alt'
    end)
$_$;

CREATE FUNCTION platform.blocks_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_org uuid;
  v_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.state <> old.state or new.node_id <> old.node_id
       or new.org_id <> old.org_id then
      raise exception 'id, state, node_id and org_id of a block are immutable' using errcode = '23514';
    end if;
    if (new.type = 'row') <> (old.type = 'row') then
      raise exception 'a row stays a row, and a block never becomes one' using errcode = '23514';
    end if;
    if old.type = 'row' and new.key <> old.key then
      raise exception 'the key of a row does not change' using errcode = '23514';
    end if;
    return new;
  end if;
  select n.org_id, n.kind into v_org, v_kind from platform.nodes n where n.id = new.node_id;
  if v_org is null then
    raise exception 'node not found' using errcode = '23503';
  end if;
  if new.org_id is null then
    new.org_id := v_org;
  elsif new.org_id <> v_org then
    raise exception 'org_id must be the organization of the node' using errcode = '23514';
  end if;
  if (new.type = 'row') <> (v_kind = 'table') then
    raise exception 'rows belong to tables; other blocks to pages, procedures and Contextes'
      using errcode = '23514';
  end if;
  if new.type = 'row' and new.state <> 'published' then
    raise exception 'a table has no draft: rows are written published' using errcode = '23514';
  end if;
  return new;
end;
$$;

CREATE FUNCTION platform.blocks_lock_draft() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_row platform.blocks%rowtype;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  if v_row.state = 'draft' and (select auth.uid()) is not null
     and exists (select 1 from platform.nodes n where n.id = v_row.node_id) then
    -- En deux conditions imbriquées : la seconde ne doit être tentée que si la première échoue.
    if not pg_catalog.pg_try_advisory_xact_lock_shared(7401, pg_catalog.hashtext(v_row.node_id::text)) then
      if not pg_catalog.pg_try_advisory_xact_lock(7401, pg_catalog.hashtext(v_row.node_id::text)) then
        raise exception 'the draft of this node is being published' using errcode = 'PT409';
      end if;
    end if;
    if tg_op = 'INSERT' then
      perform 1 from platform.nodes n where n.id = v_row.node_id for key share;
    end if;
    perform 1 from platform.node_drafts d where d.node_id = v_row.node_id for no key update;
    if not found then
      raise exception 'no open draft on this node: it was published meanwhile, or never opened'
        using errcode = 'PT409';
    end if;
    update platform.node_drafts d set updated_at = now()
     where d.node_id = v_row.node_id and d.updated_at is distinct from now();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

CREATE FUNCTION platform.bump_rules_version() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update platform.orgs o set rules_version = o.rules_version + 1
    from platform.nodes n
   where n.id = new.node_id and n.kind = 'context' and o.id = n.org_id;
  return null;
end;
$$;

CREATE FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[] DEFAULT '{}'::text[]) RETURNS uuid
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
  values (v_org, v_root, 'perso', 'page', 'Espaces personnels',
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

CREATE FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) RETURNS TABLE(source_id uuid, copy_id uuid, copy_path text)
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

  for r in select n.* from platform.nodes n where n.id = any (v_ids)
            order by extensions.nlevel(n.lpath), n.path loop
    v_new := gen_random_uuid();
    source_id := r.id;
    copy_id := v_new;
    copy_path := v_path || substr(r.path, char_length(v_source.path) + 1);
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

  -- Blocs publiés et liens de ces blocs : un identifiant neuf par bloc, lu deux fois dans la même
  -- instruction (le `with` est calculé une fois ; l'insertion qu'il porte part même sans être lue).
  with src as (
    select b.id, b.org_id, b.node_id, b.position, b.type, b.text, b.data, b.key, b.provenance, b.revision,
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

CREATE FUNCTION platform.feedback_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform pg_catalog.pg_advisory_xact_lock(7201, pg_catalog.hashtext(new.org_id::text));
  select coalesce(max(f.number), 0) + 1 into new.number
    from platform.feedback f where f.org_id = new.org_id;
  return new;
end;
$$;

CREATE FUNCTION platform.forbid_prefix_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.prefix <> old.prefix then
    raise exception 'prefix is immutable';
  end if;
  return new;
end;
$$;

CREATE FUNCTION platform.forget_user(p_user uuid) RETURNS void
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
end;
$$;

CREATE FUNCTION platform.hook_before_user_created(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_email text := lower(nullif(trim(event -> 'user' ->> 'email'), ''));
begin
  if v_email is not null and exists (
    select 1 from platform.invitations i
     where i.email = v_email and i.accepted_at is null and i.declined_at is null
       and i.revoked_at is null and i.expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'L''inscription se fait sur invitation. Demandez à un administrateur de votre organisation de vous inviter.'));
end;
$$;

CREATE FUNCTION platform.identity_for_caller() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  v_issuer text := nullif(v_claims ->> 'iss', '');
  v_subject text := nullif(v_claims ->> 'ext_sub', '');
  v_kind text := v_claims ->> 'issuer_kind';
  v_email text := lower(nullif(v_claims ->> 'email', ''));
  v_user uuid;
begin
  if v_issuer is null or v_subject is null then
    return null;
  end if;
  select i.user_id into v_user
    from platform.identities i
   where i.issuer = v_issuer and i.subject = v_subject;
  if found then
    return v_user;
  end if;
  if v_kind = 'supabase' then
    if v_subject !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return null;
    end if;
    v_user := v_subject::uuid;
  elsif v_kind = 'oidc' and v_email is not null then
    select s.user_id into v_user
      from platform.platform_staff s
     where s.email = v_email
     order by s.added_at, s.user_id
     limit 1;
    if v_user is null and exists (
      select 1 from platform.invitations i
       where i.email = v_email and i.accepted_at is null and i.declined_at is null
         and i.revoked_at is null and i.expires_at > now()
    ) then
      v_user := gen_random_uuid();
    end if;
  end if;
  if v_user is null then
    return null;
  end if;
  insert into platform.identities (issuer, subject, user_id)
  values (v_issuer, v_subject, v_user)
  on conflict do nothing;
  select i.user_id into v_user
    from platform.identities i
   where i.issuer = v_issuer and i.subject = v_subject;
  return v_user;
end;
$_$;

CREATE FUNCTION platform.invitations_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  -- Sous une session, l'organisation de l'invitation est une organisation de l'appelant : ce déclencheur lit
  -- l'annuaire des membres et ne dit rien d'une adresse à qui n'en est pas membre (la RLS ne juge la ligne
  -- qu'après lui).
  if (select auth.uid()) is not null and new.org_id not in (select platform.member_orgs()) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  -- Relâché à la fin de la transaction. Classe 7101 : invitations.
  perform pg_catalog.pg_advisory_xact_lock(7101, pg_catalog.hashtext(new.org_id::text || ':' || new.email));
  if exists (
    select 1 from platform.members m
     where m.org_id = new.org_id and m.email = new.email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  if exists (
    select 1 from platform.invitations i
     where i.org_id = new.org_id and i.email = new.email
       and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
       and i.expires_at > now()
  ) then
    raise exception 'already_invited' using errcode = '23505';
  end if;
  return new;
end;
$$;

CREATE FUNCTION platform.is_context_path(p_org uuid, p_path text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
  select p_path = 'contexte'
      or p_path ~ '^perso/[a-z0-9_]+/contexte$'
      or exists (select 1 from platform.teams t
                  where t.org_id = p_org and p_path = t.slug || '/contexte')
$_$;

CREATE FUNCTION platform.is_org_admin(org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from platform.members m
                  where m.org_id = org and m.user_id = (select auth.uid()) and m.role = 'admin')
      or exists (select 1 from platform.platform_grants g
                   join platform.platform_staff s on s.user_id = g.user_id
                  where g.org_id = org and g.user_id = (select auth.uid()) and g.revoked_at is null)
$$;

CREATE FUNCTION platform.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from platform.platform_staff s where s.user_id = (select auth.uid()))
$$;

CREATE FUNCTION platform.keep_updated_at_on_order() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if (pg_catalog.to_jsonb(new) - array['position', 'updated_at', 'lpath', 'search_tsv'])
     = (pg_catalog.to_jsonb(old) - array['position', 'updated_at', 'lpath', 'search_tsv']) then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

CREATE FUNCTION platform.level_rank(p_level text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case p_level when 'read' then 1 when 'write' then 2 when 'manage' then 3 else 0 end
$$;

CREATE FUNCTION platform.lexicon_rebuild(p_org uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from platform.lexicon l where l.org_id = p_org;
  insert into platform.lexicon (org_id, word)
  select p_org, m.word
    from (select w.word
            from platform.nodes n cross join lateral platform.lexicon_words(n.title || ' ' || n.summary) as w(word)
           where n.org_id = p_org and n.status = 'published'
          union
          select w.word
            from platform.blocks b
                 cross join lateral platform.lexicon_words(platform.block_search_text(b.type, b.text, b.data, b.key)) as w(word)
           where b.org_id = p_org and b.state = 'published') m
   order by m.word
  on conflict do nothing;
$$;

CREATE FUNCTION platform.lexicon_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_text text;
begin
  if tg_table_name = 'nodes' then
    v_text := new.title || ' ' || new.summary;
  else
    v_text := platform.block_search_text(new.type, new.text, new.data, new.key);
  end if;
  insert into platform.lexicon (org_id, word)
  select new.org_id, w.word from platform.lexicon_words(v_text) as w(word)
   order by w.word
  on conflict do nothing;
  return null;
end;
$$;

CREATE FUNCTION platform.lexicon_words(p_text text) RETURNS SETOF text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $_$
  select distinct w
    from unnest(string_to_array(platform.norm_words(left(p_text, 100000)), ' ')) w
   where w ~ '^[a-z]{4,40}$'
$_$;

CREATE FUNCTION platform.member_directory(p_org uuid) RETURNS TABLE(user_id uuid, email text, name text, role text, default_team_id uuid, last_sign_in_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select m.user_id, m.email,
         coalesce(nullif(m.profile ->> 'name', ''), nullif(m.name, ''), split_part(m.email, '@', 1)),
         m.role, m.default_team_id, m.last_sign_in_at
    from platform.members m
   where m.org_id = p_org and p_org in (select platform.member_orgs())
   order by 3, 1
$$;

CREATE FUNCTION platform.member_orgs() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select m.org_id from platform.members m where m.user_id = (select auth.uid())
  union
  select g.org_id from platform.platform_grants g
    join platform.platform_staff s on s.user_id = g.user_id
   where g.user_id = (select auth.uid()) and g.revoked_at is null
$$;

CREATE FUNCTION platform.members_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update platform.teams set lead_user_id = null
   where org_id = old.org_id and lead_user_id = old.user_id;
  delete from platform.team_members tm using platform.teams t
   where t.id = tm.team_id and t.org_id = old.org_id and tm.user_id = old.user_id;
  delete from platform.access_rules r
   where r.org_id = old.org_id and r.subject_user_id = old.user_id;
  return old;
end;
$$;

CREATE FUNCTION platform.members_identity_copy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_claims jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is not distinct from old.user_id or (select auth.uid()) is null then
      return new;
    end if;
    new.email := null;
    new.name := null;
    new.last_sign_in_at := null;
  end if;
  if new.email is null and new.user_id = (select auth.uid()) then
    v_claims := coalesce((select auth.jwt()), '{}'::jsonb);
    new.email := lower(nullif(v_claims ->> 'email', ''));
    new.name := coalesce(new.name, nullif(coalesce(v_claims -> 'user_metadata' ->> 'full_name',
                                                   v_claims -> 'user_metadata' ->> 'name',
                                                   v_claims ->> 'name'), ''));
  end if;
  return new;
end;
$$;

CREATE FUNCTION platform.members_tree_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_handle text := new.profile ->> 'handle';
  v_n int := 1;
  v_perso uuid;
  v_space uuid;
begin
  select n.id into v_perso from platform.nodes n
   where n.org_id = new.org_id and n.path = 'perso';
  if v_handle is null or v_perso is null then
    return null;
  end if;
  if exists (select 1 from platform.node_aliases a
              where a.org_id = new.org_id and a.old_path = 'perso/' || v_handle) then
    loop
      v_n := v_n + 1;
      exit when not exists (select 1 from platform.members m
                             where m.org_id = new.org_id
                               and m.profile ->> 'handle' = v_handle || '_' || v_n)
            and not exists (select 1 from platform.node_aliases a
                             where a.org_id = new.org_id
                               and a.old_path = 'perso/' || v_handle || '_' || v_n)
            and not exists (select 1 from platform.nodes n
                             where n.org_id = new.org_id
                               and n.path = 'perso/' || v_handle || '_' || v_n
                               and n.owner_user_id is distinct from new.user_id);
    end loop;
    v_handle := v_handle || '_' || v_n;
    update platform.members m
       set profile = jsonb_set(m.profile, '{handle}', to_jsonb(v_handle))
     where m.org_id = new.org_id and m.user_id = new.user_id;
  end if;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, owner_kind,
                              owner_user_id, created_by, updated_by)
  values (new.org_id, v_perso, 'perso/' || v_handle, 'page', 'Privé',
          'Votre espace privé, visible de vous seul.', 'user', new.user_id,
          new.user_id, new.user_id)
  on conflict (org_id, path) do nothing;
  select n.id into v_space from platform.nodes n
   where n.org_id = new.org_id and n.path = 'perso/' || v_handle;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, created_by, updated_by)
  values (new.org_id, v_space, 'perso/' || v_handle || '/contexte', 'context', 'Contexte',
          'Ce que vos assistants lisent à chaque conversation : ton, signature, préférences.',
          new.user_id, new.user_id)
  on conflict (org_id, path) do nothing;
  return null;
end;
$$;

CREATE FUNCTION platform.node_level_for(p_org uuid, p_lpath extensions.ltree, p_owner_kind text, p_owner_team uuid, p_owner_user uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select platform.node_level_of((select auth.uid()), p_org, p_lpath, p_owner_kind, p_owner_team, p_owner_user)
$$;

CREATE FUNCTION platform.node_level_of(p_user uuid, p_org uuid, p_lpath extensions.ltree, p_owner_kind text, p_owner_team uuid, p_owner_user uuid) RETURNS integer
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
  -- (1 bis) responsable de l'équipe propriétaire : gestion, sauf règle qui le vise nommément (N7)
  if v_kind = 'team'
     and exists (select 1 from platform.teams t where t.id = v_team and t.lead_user_id = v_uid)
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
    when v_kind = 'team' and exists (select 1 from platform.teams t where t.id = v_team and t.lead_user_id = v_uid) then 3
    when v_kind = 'team' and exists (select 1 from platform.team_members tm where tm.team_id = v_team and tm.user_id = v_uid) then 2
    when v_kind = 'user' and v_user = v_uid then 3
    else 0
  end;
  return greatest(v_level, coalesce(v_org_level, 0));
end;
$$;

CREATE FUNCTION platform.node_owner(p_node uuid) RETURNS TABLE(owner_kind text, owner_team_id uuid, owner_user_id uuid, owner_node_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select a.owner_kind, a.owner_team_id, a.owner_user_id, a.id
    from platform.nodes n
    join platform.nodes a on a.org_id = n.org_id and a.lpath operator(extensions.@>) n.lpath
   where n.id = p_node and n.org_id in (select platform.member_orgs()) and a.owner_kind is not null
   order by extensions.nlevel(a.lpath) desc
   limit 1
$$;

CREATE FUNCTION platform.nodes_aliases_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (select 1 from platform.node_aliases a
              where a.org_id = new.org_id and a.old_path = new.path and a.node_id <> new.id) then
    raise exception 'path % is the former path of another node', new.path using errcode = '23505';
  end if;
  delete from platform.node_aliases a where a.org_id = new.org_id and a.old_path = new.path;
  if tg_op = 'UPDATE' then
    insert into platform.node_aliases (org_id, old_path, node_id, created_by)
    values (old.org_id, old.path, old.id, (select auth.uid()))
    on conflict (org_id, old_path) do update
      set node_id = excluded.node_id, created_by = excluded.created_by, created_at = now();
  end if;
  return null;
end;
$$;

CREATE FUNCTION platform.nodes_guard() RETURNS trigger
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
    if old.path = 'perso' and (new.parent_id is distinct from old.parent_id or new.path <> old.path) then
      raise exception 'the perso folder does not move' using errcode = '23514';
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
    if v_parent_path = 'perso' and not coalesce(
         new.owner_kind = 'user'
         and v_segment = (select m.profile ->> 'handle' from platform.members m
                           where m.org_id = new.org_id and m.user_id = new.owner_user_id), false) then
      raise exception 'perso/<handle> is the personal space of the member with that handle'
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
  -- dont le parent est `perso` ; un nœud plus bas n'est pas visé (H71).
  if tg_op = 'UPDATE' and (new.owner_kind, new.owner_team_id, new.owner_user_id)
                          is distinct from (old.owner_kind, old.owner_team_id, old.owner_user_id)
     and exists (select 1 from platform.nodes p where p.id = new.parent_id and p.path = 'perso')
     and not coalesce(
       new.owner_kind = 'user'
       and regexp_replace(new.path, '^.*/', '') = (select m.profile ->> 'handle' from platform.members m
                                                   where m.org_id = new.org_id and m.user_id = new.owner_user_id), false) then
    raise exception 'perso/<handle> is the personal space of the member with that handle'
      using errcode = '23514';
  end if;
  return new;
end;
$_$;

CREATE FUNCTION platform.nodes_path_cascade() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update platform.nodes d
     set path = new.path || substr(d.path, char_length(old.path) + 1)
   where d.org_id = new.org_id and d.id <> new.id
     and d.lpath operator(extensions.<@) old.lpath;
  return null;
end;
$$;

CREATE FUNCTION platform.norm(t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')))
$$;

CREATE FUNCTION platform.norm_words(t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select btrim(regexp_replace(platform.norm(t), '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE FUNCTION platform.oauth_clients_activity() RETURNS TABLE(client_id uuid, client_name text, client_type text, registration_type text, created_at timestamp with time zone, sessions bigint, last_activity timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  return query
    select c.id,
           coalesce(pg_catalog.to_jsonb(c) ->> 'client_name', pg_catalog.to_jsonb(c) ->> 'name'),
           c.client_type::text, c.registration_type::text, c.created_at,
           pg_catalog.count(s.id),
           pg_catalog.max(greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz))
    from auth.oauth_clients c
    left join auth.sessions s on s.oauth_client_id = c.id
    where c.deleted_at is null
    group by c.id;
end;
$$;

CREATE FUNCTION platform.oauth_pending_resource(p_authorization_id text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  return (select a.resource
            from auth.oauth_authorizations a
           where a.authorization_id = p_authorization_id
             and a.user_id = (select auth.uid())
             and a.status = 'pending'
             and a.expires_at > now());
end;
$$;

CREATE FUNCTION platform.open_draft(p_node uuid) RETURNS TABLE(base_revision integer, created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_kind text;
  v_revision int;
  v_created boolean;
begin
  -- Sous une session, un nœud d'une organisation de l'appelant ; un nœud inconnu est refusé de même.
  -- Le droit d'écrire est décidé par le service avant l'appel (ADR-012 § 3).
  if v_uid is not null and not exists (select 1 from platform.nodes n
                                        where n.id = p_node and n.org_id in (select platform.member_orgs())) then
    raise exception 'node outside the organizations of the caller' using errcode = '42501';
  end if;
  select n.kind, n.revision into v_kind, v_revision
    from platform.nodes n where n.id = p_node for update;
  if v_kind is null then
    raise exception 'node not found' using errcode = 'P0002';
  end if;
  insert into platform.node_drafts (node_id, base_revision, created_by, updated_by)
  values (p_node, v_revision, v_uid, v_uid)
  on conflict (node_id) do nothing;
  v_created := found;
  -- Un bloc de brouillon écrit pendant la publication précédente lui survit, sans marque : il part
  -- avant la copie.
  if v_created then
    delete from platform.blocks b where b.node_id = p_node and b.state = 'draft';
  end if;
  if v_created and v_kind <> 'table' then
    insert into platform.blocks (id, state, org_id, node_id, position, type, text, data, key,
                                 provenance, revision, created_by, updated_by, created_at, updated_at)
    select b.id, 'draft', b.org_id, b.node_id, b.position, b.type, b.text, b.data, b.key,
           b.provenance, b.revision, b.created_by, b.updated_by, b.created_at, b.updated_at
      from platform.blocks b
     where b.node_id = p_node and b.state = 'published';
  end if;
  return query select d.base_revision, v_created from platform.node_drafts d where d.node_id = p_node;
end;
$$;

CREATE FUNCTION platform.org_by_host(p_host text) RETURNS TABLE(id uuid, slug text, name text, prefix text, brand jsonb, domains text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select o.id, o.slug, o.name, o.prefix, o.brand, o.settings ->> 'domains'
    from platform.org_domains d
    join platform.orgs o on o.id = d.org_id
   where d.host = lower(split_part(trim(coalesce(p_host, '')), ':', 1))
$$;

CREATE FUNCTION platform.org_contact(p_org uuid) RETURNS TABLE(name text, email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(nullif(m.profile ->> 'name', ''), split_part(m.email, '@', 1)), m.email
    from platform.members m
   where m.org_id = p_org and m.role = 'admin'
   order by m.created_at, m.user_id
   limit 1
$$;

CREATE FUNCTION platform.platform_access_directory(p_org uuid) RETURNS TABLE(user_id uuid, email text, name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with people as (
    select g.user_id from platform.platform_grants g where g.org_id = p_org
    union
    select x.user_id
      from platform.platform_grants g
      cross join lateral (values (g.granted_by), (g.revoked_by)) as x (user_id)
     where g.org_id = p_org and x.user_id is not null
       and not exists (select 1 from platform.members m
                        where m.org_id = p_org and m.user_id = x.user_id)
  )
  select p.user_id, coalesce(s.email, m.email, c.user_email),
         coalesce(nullif(coalesce(s.name, m.name, c.user_name), ''),
                  split_part(coalesce(s.email, m.email, c.user_email), '@', 1))
    from people p
    left join platform.platform_staff s on s.user_id = p.user_id
    left join platform.members m on m.org_id = p_org and m.user_id = p.user_id
    left join lateral (
      select g.user_email, g.user_name
        from platform.platform_grants g
       where g.org_id = p_org and g.user_id = p.user_id
         and (g.user_email is not null or g.user_name is not null)
       order by g.granted_at desc, g.id
       limit 1
    ) c on true
   where platform.is_staff() or platform.is_org_admin(p_org)
   order by 3, 1
$$;

CREATE FUNCTION platform.platform_grants_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if current_user = 'authenticated' and new.revoked_at is not null then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;

CREATE FUNCTION platform.platform_grants_identity_copy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.user_email is null and new.user_name is null then
    select s.email, s.name into new.user_email, new.user_name
      from platform.platform_staff s
     where s.user_id = new.user_id;
  end if;
  return new;
end;
$$;

CREATE FUNCTION platform.public_node_by_token(p_org uuid, p_token text, p_path text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_share platform.node_shares%rowtype;
  v_root platform.nodes%rowtype;
  v_node platform.nodes%rowtype;
  -- les colonnes déclarées d'un tableau, nom et type seuls, dans l'ordre de l'en-tête
  v_columns jsonb;
  v_result jsonb;
begin
  if p_org is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;
  if p_path is not null and (char_length(p_path) > 1000 or p_path !~ '^[a-z0-9_]+(/[a-z0-9_]+)*$') then
    return null;
  end if;
  select * into v_share from platform.node_shares s
   where s.token = p_token and s.org_id = p_org and s.revoked_at is null;
  if v_share.id is null or v_share.created_by is null then
    return null;
  end if;
  <<served>>
  begin
    select * into v_root from platform.nodes n
     where n.id = v_share.node_id and n.org_id = p_org and n.deleted_at is null and n.status = 'published'
       and platform.node_level_of(v_share.created_by, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id) >= 1;
    if v_root.id is null then
      exit served;
    end if;
    if p_path is null then
      v_node := v_root;
    else
      -- Le nœud au chemin, sinon celui dont c'est un ancien chemin ; puis la même portée pour les deux.
      select * into v_node from platform.nodes n
       where n.org_id = p_org and n.deleted_at is null and n.status = 'published'
         and n.id = coalesce((select x.id from platform.nodes x where x.org_id = p_org and x.path = p_path),
                             (select a.node_id from platform.node_aliases a where a.org_id = p_org and a.old_path = p_path))
         and (n.id = v_root.id
              or (v_share.include_children
                  and n.lpath operator(extensions.<@) v_root.lpath
                  and platform.node_level_of(v_share.created_by, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id) >= 1));
      if v_node.id is null then
        exit served;
      end if;
      -- Un nœud entre la racine partagée et lui, à la corbeille, le cache aussi.
      if exists (select 1 from platform.nodes a
                  where a.org_id = p_org and a.deleted_at is not null
                    and a.lpath operator(extensions.@>) v_node.lpath
                    and a.lpath operator(extensions.<@) v_root.lpath) then
        exit served;
      end if;
    end if;
    if v_node.kind = 'table' then
      select coalesce(jsonb_agg(jsonb_build_object('name', c.value ->> 'name', 'type', c.value ->> 'type') order by c.ordinality),
                      '[]'::jsonb)
        into v_columns
        from jsonb_array_elements(case when jsonb_typeof(v_node.meta -> 'columns') = 'array' then v_node.meta -> 'columns'
                                       else '[]'::jsonb end) with ordinality as c(value, ordinality)
       where jsonb_typeof(c.value) = 'object' and c.value ->> 'name' is not null;
    end if;
    v_result := jsonb_build_object(
      'root', jsonb_build_object('path', v_root.path, 'title', v_root.title),
      'include_children', v_share.include_children,
      'node', jsonb_build_object('path', v_node.path, 'title', v_node.title, 'summary', v_node.summary,
                                 'kind', v_node.kind, 'revision', v_node.revision, 'meta', v_node.meta,
                                 'updated_at', v_node.updated_at),
      'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'type', b.type, 'position', b.position,
                                                              'key', b.key, 'text', b.text, 'data', b.data)
                                           order by b.position nulls last, b.key, b.id)
                            from (select p.id, p.type, p.position, p.key, p.text, p.data from platform.blocks p
                                   where p.node_id = v_node.id and p.state = 'published' and p.type <> 'row'
                                   order by p.position nulls last, p.key, p.id
                                   limit 1000) b), '[]'::jsonb),
      -- Un tableau : ses colonnes et ses lignes publiées, triées par clé, 500 au plus ; d'une ligne, sa clé
      -- et les valeurs de ses colonnes déclarées, rien d'autre.
      'table', case when v_node.kind = 'table' then jsonb_build_object(
                 'columns', v_columns,
                 'rows', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'cells', r.cells) order by r.key collate "C")
                                     from (select p.key,
                                                  coalesce((select jsonb_object_agg(c.value ->> 'name', p.data -> (c.value ->> 'name'))
                                                              from jsonb_array_elements(v_columns) as c(value)
                                                             where jsonb_typeof(p.data) = 'object' and p.data ? (c.value ->> 'name')),
                                                           '{}'::jsonb) as cells
                                             from platform.blocks p
                                            where p.node_id = v_node.id and p.state = 'published' and p.type = 'row'
                                            order by p.key collate "C"
                                            limit 500) r), '[]'::jsonb),
                 'truncated', (select count(*) > 500 from (select 1 from platform.blocks p
                                                             where p.node_id = v_node.id and p.state = 'published' and p.type = 'row'
                                                             limit 501) x))
               end,
      'children', case when v_share.include_children then
                    coalesce((select jsonb_agg(jsonb_build_object('path', c.path, 'title', c.title, 'kind', c.kind)
                                               order by c.position nulls last, c.path collate "C")
                                from platform.nodes c
                               where c.org_id = p_org and c.parent_id = v_node.id and c.deleted_at is null
                                 and c.status = 'published'
                                 and platform.node_level_of(v_share.created_by, c.org_id, c.lpath, c.owner_kind, c.owner_team_id, c.owner_user_id) >= 1),
                             '[]'::jsonb)
                  else '[]'::jsonb end,
      -- La cible d'un lien : son nœud ; sinon le nœud à son chemin (un lien écrit avant sa cible est sans
      -- nœud), ou celui dont c'est un ancien chemin. `to` : son adresse actuelle, où mène la page.
      'links', coalesce((select jsonb_agg(jsonb_build_object('path', x.path, 'to', x.target) order by x.path collate "C")
                           from (select distinct l.target_path as path, t.path as target
                                   from platform.links l
                                   join platform.nodes t
                                     on t.org_id = p_org
                                    and t.id = coalesce(l.target_node_id,
                                                        (select y.id from platform.nodes y
                                                          where y.org_id = p_org and y.path = l.target_path),
                                                        (select a.node_id from platform.node_aliases a
                                                          where a.org_id = p_org and a.old_path = l.target_path))
                                  where l.source_node_id = v_node.id
                                    and t.deleted_at is null and t.status = 'published'
                                    and (t.id = v_root.id
                                         or (v_share.include_children and t.lpath operator(extensions.<@) v_root.lpath))
                                    and platform.node_level_of(v_share.created_by, t.org_id, t.lpath, t.owner_kind, t.owner_team_id, t.owner_user_id) >= 1) x),
                        '[]'::jsonb)
    );
  end;
  return v_result;
end;
$_$;

CREATE FUNCTION platform.publish_node(p_node uuid, p_base_revision integer, p_links jsonb DEFAULT NULL::jsonb) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select platform.publish_node(p_node, p_base_revision, null::timestamptz, p_links)
$$;

CREATE FUNCTION platform.publish_node(p_node uuid, p_base_revision integer, p_draft_stamp timestamp with time zone, p_links jsonb DEFAULT NULL::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_uid uuid := (select auth.uid());
  v_node platform.nodes%rowtype;
  v_draft platform.node_drafts%rowtype;
begin
  -- Sous une session, un nœud d'une organisation de l'appelant ; un nœud inconnu est refusé de même.
  -- Le droit de publier est décidé par le service avant l'appel (ADR-012 § 3).
  if v_uid is not null and not exists (select 1 from platform.nodes n
                                        where n.id = p_node and n.org_id in (select platform.member_orgs())) then
    raise exception 'node outside the organizations of the caller' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7401, pg_catalog.hashtext(p_node::text));
  select * into v_node from platform.nodes n where n.id = p_node for update;
  if v_node.id is null then
    raise exception 'node not found' using errcode = 'P0002';
  end if;
  if p_base_revision is distinct from v_node.revision then
    raise exception 'stale revision: the node is at revision %', v_node.revision
      using errcode = 'PT409';
  end if;
  select * into v_draft from platform.node_drafts d where d.node_id = p_node for update;
  if v_draft.node_id is null then
    raise exception 'nothing to publish: no open draft' using errcode = '55000';
  end if;
  if v_draft.base_revision <> v_node.revision then
    raise exception 'stale draft: opened on revision %, the node is at revision %',
      v_draft.base_revision, v_node.revision using errcode = 'PT409';
  end if;
  if p_draft_stamp is not null and v_draft.updated_at is distinct from p_draft_stamp then
    raise exception 'stale draft: saved again after the stamp read' using errcode = 'PT409';
  end if;
  if v_draft.meta is not null and v_node.kind <> 'table' then
    raise exception 'meta holds the schema of a table only' using errcode = '22023';
  end if;
  if p_links is not null and (jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 1000) then
    raise exception 'p_links must be an array of 1000 links at most' using errcode = '22023';
  end if;

  if v_node.kind <> 'table' then
    delete from platform.blocks b where b.node_id = p_node and b.state = 'published';
    insert into platform.blocks (id, state, org_id, node_id, position, type, text, data, key,
                                 provenance, revision, created_by, updated_by, created_at, updated_at)
    select b.id, 'published', b.org_id, b.node_id, b.position, b.type, b.text, b.data, b.key,
           b.provenance, b.revision, b.created_by, b.updated_by, b.created_at, b.updated_at
      from platform.blocks b
     where b.node_id = p_node and b.state = 'draft';
    delete from platform.blocks b where b.node_id = p_node and b.state = 'draft';
  end if;

  update platform.nodes n
     set title = coalesce(v_draft.title, n.title),
         summary = coalesce(v_draft.summary, n.summary),
         kind = coalesce(v_draft.kind, n.kind),
         meta = coalesce(v_draft.meta, n.meta),
         status = 'published',
         revision = n.revision + 1,
         updated_by = coalesce(v_uid, n.updated_by)
   where n.id = p_node;

  insert into platform.node_versions (node_id, revision, title, summary, kind, meta, blocks, author)
  select n.id, n.revision, n.title, n.summary, n.kind, n.meta,
         coalesce((select jsonb_agg(jsonb_build_object(
                             'id', b.id, 'type', b.type, 'position', b.position, 'key', b.key,
                             'text', b.text, 'data', b.data, 'provenance', b.provenance,
                             'revision', b.revision) order by b.position, b.id)
                     from platform.blocks b
                    where b.node_id = n.id and b.state = 'published' and b.type <> 'row'), '[]'),
         v_uid
    from platform.nodes n where n.id = p_node;

  if p_links is not null then
    if exists (
      select 1 from jsonb_array_elements(p_links) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(e ->> 'path', '') !~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'
          or char_length(e ->> 'path') > 1000
          or (e -> 'key' is not null and jsonb_typeof(e -> 'key') not in ('string', 'null'))
          or char_length(coalesce(e ->> 'key', '')) > 500
          or case when coalesce(e ->> 'block_id', '') ~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
                  then not exists (select 1 from platform.blocks b
                                    where b.id = (e ->> 'block_id')::uuid and b.node_id = p_node
                                      and b.state = 'published')
                  else true end) then
      raise exception 'each link is {block_id, path, key?} with block_id a block of the published node'
        using errcode = '22023';
    end if;
    delete from platform.links l where l.source_node_id = p_node;
    insert into platform.links (org_id, source_node_id, source_block_id, target_path, target_key,
                                target_node_id)
    select distinct v_node.org_id, p_node, (e ->> 'block_id')::uuid, e ->> 'path',
           nullif(e ->> 'key', ''),
           (select t.id from platform.nodes t
             where t.org_id = v_node.org_id and t.path = e ->> 'path')
      from jsonb_array_elements(p_links) e;
  end if;

  delete from platform.node_drafts d where d.node_id = p_node;
  return v_node.revision + 1;
end;
$_$;

CREATE FUNCTION platform.route_candidates(p_org uuid, p_query text, p_kind text DEFAULT NULL::text, p_limit integer DEFAULT 50) RETURNS TABLE(node_id uuid, path text, title text, summary text, kind text, owner_team_id uuid, s_summary real, s_title real, lexical real, query_lexemes integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    SET "pg_trgm.similarity_threshold" TO '0.43'
    SET "pg_trgm.word_similarity_threshold" TO '0.43'
    AS $$
  with qx as materialized (
    -- requête sans accents, en minuscules, mots séparés d'une espace, bordée d'espaces ; aucune ligne
    -- pour qui n'est pas membre de l'organisation : rien n'est alors présélectionné
    select w.padded as q, x.lex,
           case when cardinality(x.lex) > 0
                then array_to_string(array(select pg_catalog.quote_literal(l) from unnest(x.lex) l), ' | ')::tsquery
           end as lexq
      from (select ' ' || platform.norm_words(left(coalesce(p_query, ''), 500)) || ' ' as padded) w,
           lateral (select array(select distinct unnest(tsvector_to_array(
                      to_tsvector('platform.fr'::regconfig, w.padded)))) as lex) x
     where (select auth.uid()) is not null and p_org in (select platform.member_orgs())
  ),
  pre as (
    -- un lexème de la demande (`lexical` positif)
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
    -- le titre est contenu dans la demande : aucun index de trigrammes ne le sert, calculé sur les
    -- seuls titres des nœuds candidats de l'organisation
    select n.id from platform.nodes n
     where n.org_id = p_org and n.status = 'published' and n.parent_id is not null
       and (p_kind is null or n.kind = p_kind)
       and platform.norm(n.title) operator(extensions.<%) (select qx.q from qx)
  ),
  found as materialized (
    -- nœuds présélectionnés, publiés, hors racine, du genre demandé
    select n.id, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id, n.path, n.title,
           n.summary, n.kind, n.search_tsv
      from platform.nodes n
     where n.org_id = p_org and n.id in (select pre.id from pre)
       and n.status = 'published' and n.parent_id is not null
       and (p_kind is null or n.kind = p_kind)
  ),
  cand as (
    -- lisibles par l'appelant, avant le tri et la coupe : même calcul que `search_content` (N24)
    select f.id, f.path, f.title, f.summary, f.kind, tsvector_to_array(f.search_tsv) as lex
      from found f
     where platform.node_level_for(f.org_id, f.lpath, f.owner_kind, f.owner_team_id, f.owner_user_id) >= 1
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

CREATE FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20) RETURNS TABLE(node_id uuid, path text, title text, summary text, kind text, match text, block_id uuid, block_type text, block_key text, column_name text, snippet text, rank real)
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
    -- Correction (HN-E01S13-1) : un terme de lettres seules, de 5 à 40, que le lexique ne connaît pas ;
    -- le dernier ne l'est pas quand il commence un mot connu (« prosp »). Le lexique porte tous les mots
    -- publiés de l'organisation : un mot pris dans un nœud illisible ne trouve que ce nœud, que le
    -- niveau de lecture retire ensuite (AC-b6).
    v_fix := null;
    if v_terms[i] ~ '^[a-z]{5,40}$'
       and not exists (select 1 from platform.lexicon l where l.org_id = p_org and l.word = v_terms[i])
       and not (i = cardinality(v_terms)
                and exists (select 1 from platform.lexicon l
                             where l.org_id = p_org and l.word like v_terms[i] || '%')) then
      select l.word into v_fix
        from platform.lexicon l
       where l.org_id = p_org and l.word operator(extensions.%) v_terms[i]
       order by extensions.similarity(l.word, v_terms[i]) desc,
                abs(char_length(l.word) - char_length(v_terms[i])), l.word
       limit 1;
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

CREATE FUNCTION platform.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;

CREATE FUNCTION platform.staff_directory() RETURNS TABLE(user_id uuid, email text, name text, added_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select s.user_id, s.email,
         coalesce(nullif(s.name, ''), split_part(s.email, '@', 1)),
         s.added_at
    from platform.platform_staff s
   where platform.is_staff()
   order by 3, 1
$$;

CREATE FUNCTION platform.team_members_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    if current_user = 'authenticated' and exists (
         select 1 from platform.teams t where t.id = old.team_id and t.lead_user_id = old.user_id) then
      raise exception 'is_lead' using errcode = '23514';
    end if;
    return old;
  end if;
  new.role := case when exists (select 1 from platform.teams t
                                 where t.id = new.team_id and t.lead_user_id = new.user_id)
                   then 'lead' else 'member' end;
  return new;
end;
$$;

CREATE FUNCTION platform.teams_lead_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and old.lead_user_id is not null
     and old.lead_user_id is distinct from new.lead_user_id then
    update platform.team_members set role = 'member'
     where team_id = new.id and user_id = old.lead_user_id;
  end if;
  if new.lead_user_id is not null then
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
  end if;
  return null;
end;
$$;

CREATE FUNCTION platform.teams_tree_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_folder uuid;
  v_lpath extensions.ltree;
begin
  if not exists (select 1 from platform.orgs o where o.id = old.org_id) then
    return old;
  end if;
  select n.id, n.lpath into v_folder, v_lpath from platform.nodes n
   where n.org_id = old.org_id and n.path = old.slug and n.owner_team_id = old.id;
  if v_folder is null then
    return old;
  end if;
  if (select count(*) from platform.nodes d
       where d.org_id = old.org_id and d.lpath operator(extensions.<@) v_lpath) = 2
     and exists (select 1 from platform.nodes c
                  where c.parent_id = v_folder and c.path = old.slug || '/contexte') then
    -- le Contexte seul, puis le dossier
    delete from platform.nodes where parent_id = v_folder;
    delete from platform.nodes where id = v_folder;
  end if;
  return old;
end;
$$;

CREATE FUNCTION platform.teams_tree_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_root uuid;
  v_folder uuid;
begin
  select n.id into v_root from platform.nodes n
   where n.org_id = new.org_id and n.parent_id is null;
  if v_root is null then
    return null;
  end if;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, owner_kind,
                              owner_team_id, created_by, updated_by)
  values (new.org_id, v_root, new.slug, 'page', new.name,
          'Les pages de l''équipe ' || new.name || '.', 'team', new.id,
          (select auth.uid()), (select auth.uid()))
  returning id into v_folder;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, created_by, updated_by)
  values (new.org_id, v_folder, new.slug || '/contexte', 'context', 'Contexte',
          'Ce que les assistants des membres de l''équipe ' || new.name || ' lisent à chaque conversation.',
          (select auth.uid()), (select auth.uid()));
  return null;
end;
$$;

CREATE FUNCTION platform.unique_handle(p_org uuid, p_email text) RETURNS text
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
     where n.org_id = p_org and n.path = 'perso/' || v_candidate
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

CREATE FUNCTION platform.update_my_profile(p_org uuid, p_patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_limits constant jsonb := '{"name": 80, "language": 2}';
  v_profile jsonb;
  v_key text;
  v_value jsonb;
  v_text text;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select m.profile into v_profile from platform.members m
   where m.org_id = p_org and m.user_id = v_uid for update;
  if v_profile is null then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'the patch must be an object' using errcode = '22023';
  end if;
  for v_key, v_value in select e.key, e.value from jsonb_each(p_patch) e loop
    if not (v_limits ? v_key) then
      raise exception 'unknown profile field %; fields: name, language', v_key
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_value) <> 'string' then
      raise exception '% must be a string', v_key using errcode = '22023';
    end if;
    v_text := btrim(v_value #>> '{}');
    if v_text = '' then
      v_profile := v_profile - v_key;
    elsif char_length(v_text) > (v_limits ->> v_key)::int then
      raise exception '% holds % characters at most', v_key, v_limits ->> v_key using errcode = '22023';
    elsif v_key = 'language' and v_text not in ('fr', 'en') then
      raise exception 'language must be fr or en' using errcode = '22023';
    else
      v_profile := jsonb_set(v_profile, array[v_key], to_jsonb(v_text));
    end if;
  end loop;
  update platform.members set profile = v_profile where org_id = p_org and user_id = v_uid;
  return v_profile;
end;
$$;

-- Configuration de recherche plein texte (`platform.fr` : français, sans accents).

CREATE TEXT SEARCH CONFIGURATION platform.fr (
    PARSER = pg_catalog."default" );

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR asciiword WITH french_stem;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR word WITH extensions.unaccent, french_stem;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR numword WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR email WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR url WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR host WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR sfloat WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR version WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR hword_numpart WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR hword_part WITH extensions.unaccent, french_stem;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR hword_asciipart WITH french_stem;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR numhword WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR asciihword WITH french_stem;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR hword WITH extensions.unaccent, french_stem;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR url_path WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR file WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR "float" WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR "int" WITH simple;

ALTER TEXT SEARCH CONFIGURATION platform.fr
    ADD MAPPING FOR uint WITH simple;

-- Tables et séquences.

CREATE TABLE platform.access_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    node_id uuid,
    account_id uuid,
    subject_team_id uuid,
    subject_user_id uuid,
    level text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subject_org boolean DEFAULT false NOT NULL,
    CONSTRAINT access_rules_level_check CHECK ((level = ANY (ARRAY['none'::text, 'read'::text, 'write'::text, 'manage'::text]))),
    CONSTRAINT access_rules_one_subject CHECK ((((num_nonnulls(subject_team_id, subject_user_id) + (subject_org)::integer) = 1) AND ((NOT subject_org) OR (node_id IS NOT NULL)))),
    CONSTRAINT access_rules_one_target CHECK ((num_nonnulls(node_id, account_id) = 1))
);

CREATE TABLE platform.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    connector text NOT NULL,
    owner_kind text NOT NULL,
    owner_team_id uuid,
    owner_user_id uuid,
    label text NOT NULL,
    secret_ciphertext text,
    status text DEFAULT 'active'::text NOT NULL,
    health jsonb DEFAULT '{}'::jsonb NOT NULL,
    mode text DEFAULT 'reel'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_mode_check CHECK ((mode = ANY (ARRAY['reel'::text, 'sandbox'::text, 'simule'::text]))),
    CONSTRAINT accounts_owner_check CHECK ((((owner_kind = 'org'::text) AND (owner_team_id IS NULL) AND (owner_user_id IS NULL)) OR ((owner_kind = 'team'::text) AND (owner_team_id IS NOT NULL)) OR ((owner_kind = 'user'::text) AND (owner_user_id IS NOT NULL)))),
    CONSTRAINT accounts_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['org'::text, 'team'::text, 'user'::text]))),
    CONSTRAINT accounts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'error'::text])))
);

CREATE TABLE platform.admin_journal (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid,
    user_id uuid,
    ctx text,
    method text NOT NULL,
    tool text,
    op text,
    target text,
    args jsonb,
    args_chars integer,
    result_chars integer,
    is_error boolean DEFAULT false NOT NULL,
    error text,
    duration_ms integer,
    host text,
    user_agent text
);

ALTER TABLE platform.admin_journal ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME platform.admin_journal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE platform.blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state text NOT NULL,
    org_id uuid NOT NULL,
    node_id uuid NOT NULL,
    "position" double precision,
    type text NOT NULL,
    text text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    key text,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    claimed_by text,
    claimed_by_user uuid,
    lease_until timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('platform.fr'::regconfig, platform.norm_words("left"(platform.block_search_text(type, text, data, key), 100000)))) STORED,
    CONSTRAINT blocks_claim_check CHECK (((claimed_by IS NULL) = (lease_until IS NULL))),
    CONSTRAINT blocks_claimed_by_check CHECK (((claimed_by IS NULL) OR ((char_length(claimed_by) >= 1) AND (char_length(claimed_by) <= 100)))),
    CONSTRAINT blocks_data_check CHECK ((jsonb_typeof(data) = 'object'::text)),
    CONSTRAINT blocks_key_check CHECK (((key IS NULL) OR ((char_length(key) BETWEEN 1 AND 500) AND (key = btrim(key)) AND (key !~ '[[:cntrl:]]'::text)))),
    CONSTRAINT blocks_position_check CHECK (((type = 'row'::text) OR ("position" IS NOT NULL))),
    CONSTRAINT blocks_provenance_check CHECK ((jsonb_typeof(provenance) = 'object'::text)),
    CONSTRAINT blocks_revision_check CHECK ((revision >= 1)),
    CONSTRAINT blocks_shape_check CHECK (COALESCE(
CASE type
    WHEN 'heading'::text THEN ((text IS NOT NULL) AND ((char_length(btrim(text)) >= 1) AND (char_length(btrim(text)) <= 200)) AND (text !~ '[\r\n]'::text) AND jsonb_path_exists(data, '$."level"?((@ == 1 || @ == 2) || @ == 3)'::jsonpath))
    WHEN 'paragraph'::text THEN (text IS NOT NULL)
    WHEN 'list'::text THEN ((text IS NULL) AND (jsonb_typeof((data -> 'items'::text)) = 'array'::text) AND ((jsonb_array_length((data -> 'items'::text)) >= 1) AND (jsonb_array_length((data -> 'items'::text)) <= 500)) AND (NOT jsonb_path_exists(data, '$."items"[*]?(@.type() != "string")'::jsonpath)) AND (((data -> 'ordered'::text) IS NULL) OR (jsonb_typeof((data -> 'ordered'::text)) = 'boolean'::text)) AND (((data -> 'start'::text) IS NULL) OR jsonb_path_exists(data, '$."start"?(@.type() == "number" && @ >= 1)'::jsonpath)))
    WHEN 'checklist'::text THEN ((text IS NULL) AND (jsonb_typeof((data -> 'items'::text)) = 'array'::text) AND ((jsonb_array_length((data -> 'items'::text)) >= 1) AND (jsonb_array_length((data -> 'items'::text)) <= 500)) AND (NOT jsonb_path_exists(data, '$."items"[*]?(!(exists (@."text"?(@.type() == "string"))) || !(exists (@."checked"?(@.type() == "boolean"))))'::jsonpath)))
    WHEN 'code'::text THEN ((text IS NOT NULL) AND (((data -> 'language'::text) IS NULL) OR (jsonb_typeof((data -> 'language'::text)) = 'string'::text)))
    WHEN 'call'::text THEN ((text IS NULL) AND (jsonb_typeof((data -> 'function'::text)) = 'string'::text) AND ((char_length((data ->> 'function'::text)) >= 1) AND (char_length((data ->> 'function'::text)) <= 100)) AND (jsonb_typeof((data -> 'args'::text)) = 'object'::text))
    WHEN 'mermaid'::text THEN ((text IS NOT NULL) AND (char_length(btrim(text)) >= 1))
    WHEN 'image'::text THEN ((jsonb_typeof((data -> 'src'::text)) = 'string'::text) AND ((char_length((data ->> 'src'::text)) >= 1) AND (char_length((data ->> 'src'::text)) <= 2000)) AND (((data -> 'alt'::text) IS NULL) OR (jsonb_typeof((data -> 'alt'::text)) = 'string'::text)))
    WHEN 'callout'::text THEN ((text IS NOT NULL) AND (((data -> 'tone'::text) IS NULL) OR (jsonb_typeof((data -> 'tone'::text)) = 'string'::text)))
    WHEN 'reference'::text THEN ((text IS NULL) AND (jsonb_typeof((data -> 'path'::text)) = 'string'::text) AND ((data ->> 'path'::text) ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'::text) AND (char_length((data ->> 'path'::text)) <= 1000) AND (((data -> 'view'::text) IS NULL) OR (jsonb_typeof((data -> 'view'::text)) = 'object'::text)))
    WHEN 'row'::text THEN ((text IS NULL) AND (key IS NOT NULL))
    ELSE NULL::boolean
END, false)),
    CONSTRAINT blocks_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT blocks_text_check CHECK (((text IS NULL) OR (char_length(text) <= 100000))),
    CONSTRAINT blocks_type_check CHECK ((type = ANY (ARRAY['heading'::text, 'paragraph'::text, 'list'::text, 'checklist'::text, 'code'::text, 'call'::text, 'mermaid'::text, 'image'::text, 'callout'::text, 'reference'::text, 'row'::text])))
);

CREATE TABLE platform.connector_activations (
    org_id uuid NOT NULL,
    connector text NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    activated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connector_activations_connector_check CHECK ((connector ~ '^[a-z][a-z0-9_]{0,39}$'::text)),
    CONSTRAINT connector_activations_state_check CHECK ((state = ANY (ARRAY['active'::text, 'inactive'::text])))
);

CREATE TABLE platform.ctx (
    code text NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rules_version integer NOT NULL,
    host text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ctx_code_check CHECK ((code ~ '^[0-9A-Z]{4}-[0-9A-Z]{4}$'::text))
);

CREATE TABLE platform.feedback (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    number integer NOT NULL,
    user_id uuid,
    ctx text,
    type text NOT NULL,
    target text,
    text text NOT NULL,
    state text DEFAULT 'open'::text NOT NULL,
    resolution text,
    handled_by uuid,
    handled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_declined_resolution CHECK (((state <> 'declined'::text) OR (char_length(btrim(COALESCE(resolution, ''::text))) > 0))),
    CONSTRAINT feedback_number_check CHECK ((number >= 1)),
    CONSTRAINT feedback_resolution_check CHECK (((resolution IS NULL) OR (char_length(resolution) <= 2000))),
    CONSTRAINT feedback_state_check CHECK ((state = ANY (ARRAY['open'::text, 'acknowledged'::text, 'declined'::text, 'resolved'::text]))),
    CONSTRAINT feedback_target_check CHECK (((target IS NULL) OR (char_length(target) <= 500))),
    CONSTRAINT feedback_text_check CHECK (((char_length(btrim(text)) >= 1) AND (char_length(btrim(text)) <= 4000))),
    CONSTRAINT feedback_type_check CHECK ((type = ANY (ARRAY['friction'::text, 'gap'::text, 'error'::text])))
);

ALTER TABLE platform.feedback ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME platform.feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE platform.identities (
    issuer text NOT NULL,
    subject text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT identities_issuer_check CHECK (((char_length(issuer) >= 1) AND (char_length(issuer) <= 2000))),
    CONSTRAINT identities_subject_check CHECK (((char_length(subject) >= 1) AND (char_length(subject) <= 255)))
);

CREATE TABLE platform.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    team_id uuid,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    declined_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT invitations_email_check CHECK (((email = lower(email)) AND (char_length(email) <= 254) AND (email ~ '^[^@\s]+@[^@\s]+$'::text))),
    CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text]))),
    CONSTRAINT invitations_single_outcome CHECK ((num_nonnulls(accepted_at, declined_at, revoked_at) <= 1))
);

CREATE TABLE platform.journal (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid,
    user_id uuid,
    team_id uuid,
    ctx text,
    method text NOT NULL,
    tool text,
    target text,
    args jsonb,
    args_chars integer,
    result_chars integer,
    is_error boolean DEFAULT false NOT NULL,
    error text,
    duration_ms integer,
    host text,
    user_agent text,
    account_id uuid
);

ALTER TABLE platform.journal ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME platform.journal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE platform.lexicon (
    org_id uuid NOT NULL,
    word text NOT NULL COLLATE pg_catalog."C",
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lexicon_word_check CHECK ((word ~ '^[a-z]{4,40}$'::text))
);

CREATE TABLE platform.links (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    source_node_id uuid NOT NULL,
    source_block_id uuid NOT NULL,
    target_path text NOT NULL,
    target_key text,
    target_node_id uuid,
    CONSTRAINT links_target_key_check CHECK (((target_key IS NULL) OR ((char_length(target_key) >= 1) AND (char_length(target_key) <= 500)))),
    CONSTRAINT links_target_path_check CHECK (((target_path ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'::text) AND (char_length(target_path) <= 1000)))
);

ALTER TABLE platform.links ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME platform.links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE platform.members (
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    default_team_id uuid,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    name text,
    last_sign_in_at timestamp with time zone,
    CONSTRAINT members_email_check CHECK (((email IS NULL) OR (email = lower(email)))),
    CONSTRAINT members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])))
);

CREATE TABLE platform.node_aliases (
    org_id uuid NOT NULL,
    old_path text NOT NULL,
    node_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT node_aliases_old_path_check CHECK ((old_path ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'::text))
);

CREATE TABLE platform.node_drafts (
    node_id uuid NOT NULL,
    base_revision integer NOT NULL,
    title text,
    summary text,
    kind text,
    meta jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT node_drafts_base_revision_check CHECK ((base_revision >= 0)),
    CONSTRAINT node_drafts_kind_check CHECK (((kind IS NULL) OR (kind = ANY (ARRAY['page'::text, 'procedure'::text])))),
    CONSTRAINT node_drafts_meta_check CHECK (((meta IS NULL) OR (jsonb_typeof(meta) = 'object'::text))),
    CONSTRAINT node_drafts_summary_check CHECK (((summary IS NULL) OR ((char_length(btrim(summary)) >= 1) AND (char_length(btrim(summary)) <= 200)))),
    CONSTRAINT node_drafts_title_check CHECK (((title IS NULL) OR ((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200))))
);

CREATE TABLE platform.node_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    node_id uuid NOT NULL,
    token text DEFAULT rtrim(translate(encode(decode((replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)), 'hex'::text), 'base64'::text), '+/'::text, '-_'::text), '='::text) NOT NULL,
    include_children boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT node_shares_token_check CHECK ((token ~ '^[A-Za-z0-9_-]{43}$'::text))
);

CREATE TABLE platform.node_versions (
    node_id uuid NOT NULL,
    revision integer NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    kind text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    author uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT node_versions_blocks_check CHECK ((jsonb_typeof(blocks) = 'array'::text)),
    CONSTRAINT node_versions_kind_check CHECK ((kind = ANY (ARRAY['page'::text, 'procedure'::text, 'context'::text, 'table'::text]))),
    CONSTRAINT node_versions_meta_check CHECK ((jsonb_typeof(meta) = 'object'::text)),
    CONSTRAINT node_versions_revision_check CHECK ((revision >= 1)),
    CONSTRAINT node_versions_summary_check CHECK (((char_length(btrim(summary)) >= 1) AND (char_length(btrim(summary)) <= 200))),
    CONSTRAINT node_versions_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200)))
);

CREATE TABLE platform.nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    parent_id uuid,
    path text NOT NULL,
    lpath extensions.ltree GENERATED ALWAYS AS (
CASE
    WHEN (parent_id IS NULL) THEN extensions.text2ltree(''::text)
    ELSE extensions.text2ltree(replace(path, '/'::text, '.'::text))
END) STORED,
    kind text DEFAULT 'page'::text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    owner_kind text,
    owner_team_id uuid,
    owner_user_id uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    search_tsv tsvector GENERATED ALWAYS AS ((setweight(to_tsvector('platform.fr'::regconfig, platform.norm_words(title)), 'A'::"char") || setweight(to_tsvector('platform.fr'::regconfig, platform.norm_words(summary)), 'B'::"char"))) STORED,
    "position" double precision,
    deleted_at timestamp with time zone,
    CONSTRAINT nodes_kind_check CHECK ((kind = ANY (ARRAY['page'::text, 'procedure'::text, 'context'::text, 'table'::text]))),
    CONSTRAINT nodes_meta_check CHECK ((jsonb_typeof(meta) = 'object'::text)),
    CONSTRAINT nodes_owner_check CHECK ((((owner_kind IS NULL) AND (owner_team_id IS NULL) AND (owner_user_id IS NULL)) OR ((owner_kind = 'org'::text) AND (owner_team_id IS NULL) AND (owner_user_id IS NULL)) OR ((owner_kind = 'team'::text) AND (owner_team_id IS NOT NULL) AND (owner_user_id IS NULL)) OR ((owner_kind = 'user'::text) AND (owner_user_id IS NOT NULL) AND (owner_team_id IS NULL)))),
    CONSTRAINT nodes_owner_inherited_check CHECK (((owner_kind IS NOT NULL) OR ((owner_team_id IS NULL) AND (owner_user_id IS NULL)))),
    CONSTRAINT nodes_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['org'::text, 'team'::text, 'user'::text]))),
    CONSTRAINT nodes_path_check CHECK (((char_length(path) <= 1000) AND (path ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'::text))),
    CONSTRAINT nodes_published_check CHECK (((status = 'draft'::text) OR (revision >= 1))),
    CONSTRAINT nodes_revision_check CHECK ((revision >= 0)),
    CONSTRAINT nodes_root_check CHECK ((((parent_id IS NULL) AND (path = 'guide'::text) AND (owner_kind = 'org'::text)) OR ((parent_id IS NOT NULL) AND (path <> 'guide'::text)))),
    CONSTRAINT nodes_root_owner_check CHECK (((parent_id IS NOT NULL) OR (NOT (owner_kind IS DISTINCT FROM 'org'::text)))),
    CONSTRAINT nodes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT nodes_summary_check CHECK (((char_length(btrim(summary)) >= 1) AND (char_length(btrim(summary)) <= 200))),
    CONSTRAINT nodes_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200)))
);

CREATE TABLE platform.org_domains (
    host text NOT NULL,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_domains_host_check CHECK (((host = lower(host)) AND (char_length(host) <= 253) AND (host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$'::text)))
);

CREATE TABLE platform.orgs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    brand jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    rules_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orgs_prefix_check CHECK ((prefix ~ '^[a-z][a-z0-9]{1,11}$'::text)),
    CONSTRAINT orgs_rules_version_check CHECK ((rules_version >= 1))
);

CREATE TABLE platform.platform_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    reason text,
    user_email text,
    user_name text,
    CONSTRAINT platform_grants_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 500))),
    CONSTRAINT platform_grants_user_email_check CHECK (((user_email IS NULL) OR (user_email = lower(user_email))))
);

CREATE TABLE platform.platform_staff (
    user_id uuid NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    name text,
    CONSTRAINT platform_staff_email_check CHECK (((email IS NULL) OR (email = lower(email))))
);

CREATE TABLE platform.sim_outbox (
    id text DEFAULT ('sim_'::text || "left"(replace((gen_random_uuid())::text, '-'::text, ''::text), 8)) NOT NULL,
    org_id uuid NOT NULL,
    account_id uuid NOT NULL,
    connector text NOT NULL,
    function text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_by uuid,
    sent_at timestamp with time zone,
    CONSTRAINT sim_outbox_id_check CHECK ((id ~ '^sim_[0-9a-f]{8}$'::text)),
    CONSTRAINT sim_outbox_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT sim_outbox_sent_check CHECK (((status = 'sent'::text) = (sent_at IS NOT NULL))),
    CONSTRAINT sim_outbox_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text])))
);

CREATE TABLE platform.team_members (
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_members_role_check CHECK ((role = ANY (ARRAY['lead'::text, 'member'::text])))
);

CREATE TABLE platform.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    lead_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teams_slug_reserved CHECK ((slug <> ALL (ARRAY['guide'::text, 'perso'::text, 'contexte'::text, 'journal'::text])))
);

-- Clés primaires et contraintes d'unicité.

ALTER TABLE ONLY platform.access_rules
    ADD CONSTRAINT access_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.access_rules
    ADD CONSTRAINT access_rules_target_subject_key UNIQUE NULLS NOT DISTINCT (node_id, account_id, subject_team_id, subject_user_id);

ALTER TABLE ONLY platform.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.admin_journal
    ADD CONSTRAINT admin_journal_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id, state);

ALTER TABLE ONLY platform.connector_activations
    ADD CONSTRAINT connector_activations_pkey PRIMARY KEY (org_id, connector);

ALTER TABLE ONLY platform.ctx
    ADD CONSTRAINT ctx_pkey PRIMARY KEY (code);

ALTER TABLE ONLY platform.feedback
    ADD CONSTRAINT feedback_org_number_key UNIQUE (org_id, number);

ALTER TABLE ONLY platform.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.identities
    ADD CONSTRAINT identities_issuer_user_id_key UNIQUE (issuer, user_id);

ALTER TABLE ONLY platform.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (issuer, subject);

ALTER TABLE ONLY platform.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.journal
    ADD CONSTRAINT journal_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.lexicon
    ADD CONSTRAINT lexicon_pkey PRIMARY KEY (org_id, word);

ALTER TABLE ONLY platform.links
    ADD CONSTRAINT links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.links
    ADD CONSTRAINT links_source_target_key UNIQUE NULLS NOT DISTINCT (source_block_id, target_path, target_key);

ALTER TABLE ONLY platform.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (org_id, user_id);

ALTER TABLE ONLY platform.node_aliases
    ADD CONSTRAINT node_aliases_pkey PRIMARY KEY (org_id, old_path);

ALTER TABLE ONLY platform.node_drafts
    ADD CONSTRAINT node_drafts_pkey PRIMARY KEY (node_id);

ALTER TABLE ONLY platform.node_shares
    ADD CONSTRAINT node_shares_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.node_shares
    ADD CONSTRAINT node_shares_token_key UNIQUE (token);

ALTER TABLE ONLY platform.node_versions
    ADD CONSTRAINT node_versions_pkey PRIMARY KEY (node_id, revision);

ALTER TABLE ONLY platform.nodes
    ADD CONSTRAINT nodes_org_id_path_key UNIQUE (org_id, path);

ALTER TABLE ONLY platform.nodes
    ADD CONSTRAINT nodes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.org_domains
    ADD CONSTRAINT org_domains_pkey PRIMARY KEY (host);

ALTER TABLE ONLY platform.orgs
    ADD CONSTRAINT orgs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.orgs
    ADD CONSTRAINT orgs_prefix_key UNIQUE (prefix);

ALTER TABLE ONLY platform.orgs
    ADD CONSTRAINT orgs_slug_key UNIQUE (slug);

ALTER TABLE ONLY platform.platform_grants
    ADD CONSTRAINT platform_grants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.platform_staff
    ADD CONSTRAINT platform_staff_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY platform.sim_outbox
    ADD CONSTRAINT sim_outbox_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id);

ALTER TABLE ONLY platform.teams
    ADD CONSTRAINT teams_org_id_slug_key UNIQUE (org_id, slug);

ALTER TABLE ONLY platform.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

-- Index.

CREATE INDEX idx_access_rules_account_id ON platform.access_rules USING btree (account_id);

CREATE INDEX idx_access_rules_org_id ON platform.access_rules USING btree (org_id);

CREATE INDEX idx_access_rules_subject_team_id ON platform.access_rules USING btree (subject_team_id);

CREATE INDEX idx_access_rules_subject_user_id ON platform.access_rules USING btree (subject_user_id);

CREATE INDEX idx_accounts_org_id_connector ON platform.accounts USING btree (org_id, connector);

CREATE INDEX idx_accounts_owner_team_id ON platform.accounts USING btree (owner_team_id);

CREATE INDEX idx_accounts_owner_user_id ON platform.accounts USING btree (owner_user_id);

CREATE INDEX idx_admin_journal_ctx_ts ON platform.admin_journal USING btree (ctx, ts);

CREATE INDEX idx_admin_journal_org_id_ts ON platform.admin_journal USING btree (org_id, ts DESC);

CREATE INDEX idx_admin_journal_ts ON platform.admin_journal USING btree (ts DESC);

CREATE INDEX idx_admin_journal_user_id_ts ON platform.admin_journal USING btree (user_id, ts DESC);

CREATE INDEX idx_blocks_claimed_by_user ON platform.blocks USING btree (claimed_by_user) WHERE (claimed_by_user IS NOT NULL);

CREATE INDEX idx_blocks_node_id_lease_until ON platform.blocks USING btree (node_id, lease_until) WHERE (type = 'row'::text);

CREATE INDEX idx_blocks_node_id_state_position ON platform.blocks USING btree (node_id, state, "position");

CREATE INDEX idx_blocks_node_id_updated_at_key ON platform.blocks USING btree (node_id, updated_at, key) WHERE ((state = 'published'::text) AND (type = 'row'::text));

CREATE INDEX idx_blocks_org_id ON platform.blocks USING btree (org_id);

CREATE INDEX idx_blocks_search_tsv ON platform.blocks USING gin (search_tsv) WITH (fastupdate=off) WHERE (state = 'published'::text);

CREATE INDEX idx_ctx_org_id ON platform.ctx USING btree (org_id);

CREATE INDEX idx_ctx_user_id_created_at ON platform.ctx USING btree (user_id, created_at DESC);

CREATE INDEX idx_feedback_org_id_created_at ON platform.feedback USING btree (org_id, created_at DESC);

CREATE INDEX idx_feedback_user_id_created_at ON platform.feedback USING btree (user_id, created_at DESC);

CREATE INDEX idx_identities_user_id ON platform.identities USING btree (user_id);

CREATE INDEX idx_invitations_email_open ON platform.invitations USING btree (email) WHERE ((accepted_at IS NULL) AND (declined_at IS NULL) AND (revoked_at IS NULL));

CREATE INDEX idx_invitations_org_id_created_at ON platform.invitations USING btree (org_id, created_at DESC);

CREATE INDEX idx_invitations_team_id ON platform.invitations USING btree (team_id);

CREATE INDEX idx_journal_account_id ON platform.journal USING btree (account_id);

CREATE INDEX idx_journal_ctx_ts ON platform.journal USING btree (ctx, ts);

CREATE INDEX idx_journal_org_id_id ON platform.journal USING btree (org_id, id DESC);

CREATE INDEX idx_journal_org_id_target ON platform.journal USING btree (org_id, target);

CREATE INDEX idx_journal_team_id ON platform.journal USING btree (team_id);

CREATE INDEX idx_journal_ts ON platform.journal USING btree (ts DESC);

CREATE INDEX idx_journal_user_id ON platform.journal USING btree (user_id);

CREATE INDEX idx_lexicon_word_trgm ON platform.lexicon USING gin (word extensions.gin_trgm_ops) WITH (fastupdate=off);

CREATE INDEX idx_links_org_id_target_path ON platform.links USING btree (org_id, target_path);

CREATE INDEX idx_links_source_node_id ON platform.links USING btree (source_node_id);

CREATE INDEX idx_links_target_node_id ON platform.links USING btree (target_node_id);

CREATE INDEX idx_members_default_team_id ON platform.members USING btree (default_team_id);

CREATE INDEX idx_members_user_id ON platform.members USING btree (user_id);

CREATE INDEX idx_node_aliases_node_id ON platform.node_aliases USING btree (node_id);

CREATE INDEX idx_node_shares_node_id ON platform.node_shares USING btree (node_id);

CREATE INDEX idx_node_shares_org_id ON platform.node_shares USING btree (org_id);

CREATE INDEX idx_nodes_lpath ON platform.nodes USING gist (lpath);

CREATE INDEX idx_nodes_org_id_deleted_at ON platform.nodes USING btree (org_id, deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_nodes_org_id_kind_status ON platform.nodes USING btree (org_id, kind, status);

CREATE INDEX idx_nodes_owner_team_id ON platform.nodes USING btree (owner_team_id);

CREATE INDEX idx_nodes_owner_user_id ON platform.nodes USING btree (owner_user_id);

CREATE INDEX idx_nodes_parent_id ON platform.nodes USING btree (parent_id);

CREATE INDEX idx_nodes_search_tsv ON platform.nodes USING gin (search_tsv) WITH (fastupdate=off);

CREATE INDEX idx_nodes_summary_trgm ON platform.nodes USING gin (platform.norm(summary) extensions.gin_trgm_ops) WITH (fastupdate=off);

CREATE INDEX idx_nodes_title_trgm ON platform.nodes USING gin (platform.norm(title) extensions.gin_trgm_ops) WITH (fastupdate=off);

CREATE INDEX idx_org_domains_org_id ON platform.org_domains USING btree (org_id);

CREATE INDEX idx_platform_grants_org_id ON platform.platform_grants USING btree (org_id);

CREATE INDEX idx_platform_grants_user_id ON platform.platform_grants USING btree (user_id);

CREATE INDEX idx_sim_outbox_account_id ON platform.sim_outbox USING btree (account_id);

CREATE INDEX idx_sim_outbox_org_id_created_at ON platform.sim_outbox USING btree (org_id, created_at DESC);

CREATE INDEX idx_team_members_user_id ON platform.team_members USING btree (user_id);

CREATE INDEX idx_teams_lead_user_id ON platform.teams USING btree (lead_user_id);

CREATE UNIQUE INDEX uq_accounts_org_id_label ON platform.accounts USING btree (org_id, lower(label));

CREATE UNIQUE INDEX uq_blocks_node_id_state_key ON platform.blocks USING btree (node_id, state, key) WHERE (key IS NOT NULL);

CREATE UNIQUE INDEX uq_members_org_id_handle ON platform.members USING btree (org_id, ((profile ->> 'handle'::text))) WHERE (profile ? 'handle'::text);

CREATE UNIQUE INDEX uq_node_shares_node_id_active ON platform.node_shares USING btree (node_id) WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX uq_nodes_one_root ON platform.nodes USING btree (org_id) WHERE (parent_id IS NULL);

CREATE UNIQUE INDEX uq_platform_grants_open ON platform.platform_grants USING btree (org_id, user_id) WHERE (revoked_at IS NULL);

-- Déclencheurs.

CREATE TRIGGER blocks_guard BEFORE INSERT OR UPDATE ON platform.blocks FOR EACH ROW EXECUTE FUNCTION platform.blocks_guard();

CREATE TRIGGER blocks_lexicon_sync AFTER INSERT OR UPDATE OF type, text, data, key ON platform.blocks FOR EACH ROW WHEN ((new.state = 'published'::text)) EXECUTE FUNCTION platform.lexicon_sync();

CREATE TRIGGER blocks_lock_draft BEFORE INSERT OR DELETE OR UPDATE ON platform.blocks FOR EACH ROW EXECUTE FUNCTION platform.blocks_lock_draft();

CREATE TRIGGER bump_rules_version AFTER INSERT ON platform.node_versions FOR EACH ROW EXECUTE FUNCTION platform.bump_rules_version();

CREATE TRIGGER feedback_number BEFORE INSERT ON platform.feedback FOR EACH ROW EXECUTE FUNCTION platform.feedback_number();

CREATE TRIGGER forbid_prefix_change BEFORE UPDATE OF prefix ON platform.orgs FOR EACH ROW EXECUTE FUNCTION platform.forbid_prefix_change();

CREATE TRIGGER invitations_guard BEFORE INSERT ON platform.invitations FOR EACH ROW EXECUTE FUNCTION platform.invitations_guard();

CREATE TRIGGER members_cleanup AFTER DELETE ON platform.members FOR EACH ROW EXECUTE FUNCTION platform.members_cleanup();

CREATE TRIGGER members_identity_copy BEFORE INSERT OR UPDATE OF user_id ON platform.members FOR EACH ROW EXECUTE FUNCTION platform.members_identity_copy();

CREATE TRIGGER members_tree_sync AFTER INSERT ON platform.members FOR EACH ROW EXECUTE FUNCTION platform.members_tree_sync();

CREATE TRIGGER nodes_aliases_on_insert AFTER INSERT ON platform.nodes FOR EACH ROW EXECUTE FUNCTION platform.nodes_aliases_sync();

CREATE TRIGGER nodes_aliases_on_move AFTER UPDATE OF path ON platform.nodes FOR EACH ROW WHEN ((new.path IS DISTINCT FROM old.path)) EXECUTE FUNCTION platform.nodes_aliases_sync();

CREATE TRIGGER nodes_guard BEFORE INSERT OR UPDATE ON platform.nodes FOR EACH ROW EXECUTE FUNCTION platform.nodes_guard();

CREATE TRIGGER nodes_lexicon_sync AFTER INSERT OR UPDATE OF title, summary, status ON platform.nodes FOR EACH ROW WHEN ((new.status = 'published'::text)) EXECUTE FUNCTION platform.lexicon_sync();

CREATE TRIGGER nodes_path_cascade AFTER UPDATE OF path ON platform.nodes FOR EACH ROW WHEN ((new.path IS DISTINCT FROM old.path)) EXECUTE FUNCTION platform.nodes_path_cascade();

CREATE TRIGGER platform_grants_guard BEFORE UPDATE ON platform.platform_grants FOR EACH ROW EXECUTE FUNCTION platform.platform_grants_guard();

CREATE TRIGGER platform_grants_identity_copy BEFORE INSERT ON platform.platform_grants FOR EACH ROW EXECUTE FUNCTION platform.platform_grants_identity_copy();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform.accounts FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform.blocks FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform.connector_activations FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform.node_drafts FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform.nodes FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform.orgs FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

CREATE TRIGGER set_updated_at_position BEFORE UPDATE OF "position" ON platform.nodes FOR EACH ROW WHEN ((new."position" IS DISTINCT FROM old."position")) EXECUTE FUNCTION platform.keep_updated_at_on_order();

CREATE TRIGGER team_members_guard BEFORE INSERT OR DELETE OR UPDATE ON platform.team_members FOR EACH ROW EXECUTE FUNCTION platform.team_members_guard();

CREATE TRIGGER teams_lead_sync AFTER INSERT OR UPDATE OF lead_user_id ON platform.teams FOR EACH ROW EXECUTE FUNCTION platform.teams_lead_sync();

CREATE TRIGGER teams_tree_cleanup BEFORE DELETE ON platform.teams FOR EACH ROW EXECUTE FUNCTION platform.teams_tree_cleanup();

CREATE TRIGGER teams_tree_sync AFTER INSERT ON platform.teams FOR EACH ROW EXECUTE FUNCTION platform.teams_tree_sync();

-- Clés étrangères.

ALTER TABLE ONLY platform.access_rules
    ADD CONSTRAINT access_rules_account_id_fkey FOREIGN KEY (account_id) REFERENCES platform.accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.access_rules
    ADD CONSTRAINT access_rules_node_id_fkey FOREIGN KEY (node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.access_rules
    ADD CONSTRAINT access_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.access_rules
    ADD CONSTRAINT access_rules_subject_team_id_fkey FOREIGN KEY (subject_team_id) REFERENCES platform.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.accounts
    ADD CONSTRAINT accounts_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.accounts
    ADD CONSTRAINT accounts_owner_team_id_fkey FOREIGN KEY (owner_team_id) REFERENCES platform.teams(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY platform.admin_journal
    ADD CONSTRAINT admin_journal_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE SET NULL;

ALTER TABLE ONLY platform.blocks
    ADD CONSTRAINT blocks_node_id_fkey FOREIGN KEY (node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.blocks
    ADD CONSTRAINT blocks_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.connector_activations
    ADD CONSTRAINT connector_activations_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.ctx
    ADD CONSTRAINT ctx_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.feedback
    ADD CONSTRAINT feedback_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.invitations
    ADD CONSTRAINT invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.invitations
    ADD CONSTRAINT invitations_team_id_fkey FOREIGN KEY (team_id) REFERENCES platform.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY platform.journal
    ADD CONSTRAINT journal_account_id_fkey FOREIGN KEY (account_id) REFERENCES platform.accounts(id) ON DELETE SET NULL;

ALTER TABLE ONLY platform.journal
    ADD CONSTRAINT journal_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.journal
    ADD CONSTRAINT journal_team_id_fkey FOREIGN KEY (team_id) REFERENCES platform.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY platform.lexicon
    ADD CONSTRAINT lexicon_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.links
    ADD CONSTRAINT links_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.links
    ADD CONSTRAINT links_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.links
    ADD CONSTRAINT links_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES platform.nodes(id) ON DELETE SET NULL;

ALTER TABLE ONLY platform.members
    ADD CONSTRAINT members_default_team_id_fkey FOREIGN KEY (default_team_id) REFERENCES platform.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY platform.members
    ADD CONSTRAINT members_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.node_aliases
    ADD CONSTRAINT node_aliases_node_id_fkey FOREIGN KEY (node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.node_aliases
    ADD CONSTRAINT node_aliases_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.node_drafts
    ADD CONSTRAINT node_drafts_node_id_fkey FOREIGN KEY (node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.node_shares
    ADD CONSTRAINT node_shares_node_id_fkey FOREIGN KEY (node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.node_shares
    ADD CONSTRAINT node_shares_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.node_versions
    ADD CONSTRAINT node_versions_node_id_fkey FOREIGN KEY (node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.nodes
    ADD CONSTRAINT nodes_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.nodes
    ADD CONSTRAINT nodes_owner_team_id_fkey FOREIGN KEY (owner_team_id) REFERENCES platform.teams(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY platform.nodes
    ADD CONSTRAINT nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES platform.nodes(id);

ALTER TABLE ONLY platform.org_domains
    ADD CONSTRAINT org_domains_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.platform_grants
    ADD CONSTRAINT platform_grants_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.sim_outbox
    ADD CONSTRAINT sim_outbox_account_id_fkey FOREIGN KEY (account_id) REFERENCES platform.accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.sim_outbox
    ADD CONSTRAINT sim_outbox_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES platform.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.teams
    ADD CONSTRAINT teams_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

-- Sécurité des lignes et policies, table par table.

ALTER TABLE platform.access_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY access_rules_delete_manager ON platform.access_rules FOR DELETE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY access_rules_insert_manager ON platform.access_rules FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (((node_id IS NOT NULL) AND (org_id = ( SELECT n.org_id
   FROM platform.nodes n
  WHERE (n.id = access_rules.node_id)))) OR ((account_id IS NOT NULL) AND (org_id = ( SELECT a.org_id
   FROM platform.accounts a
  WHERE (a.id = access_rules.account_id))))) AND (((subject_team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM platform.teams t
  WHERE ((t.id = access_rules.subject_team_id) AND (t.org_id = access_rules.org_id))))) OR ((subject_user_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM platform.members m
  WHERE ((m.user_id = access_rules.subject_user_id) AND (m.org_id = access_rules.org_id))))) OR subject_org)));

CREATE POLICY access_rules_select_level ON platform.access_rules FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY access_rules_update_manager ON platform.access_rules FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_delete_admin ON platform.accounts FOR DELETE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY accounts_insert_admin ON platform.accounts FOR INSERT TO authenticated WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY accounts_insert_own ON platform.accounts FOR INSERT TO authenticated WITH CHECK (((owner_kind = 'user'::text) AND (owner_user_id = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

CREATE POLICY accounts_select_member ON platform.accounts FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY accounts_update_admin ON platform.accounts FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.admin_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_journal_insert_staff ON platform.admin_journal FOR INSERT TO authenticated WITH CHECK ((platform.is_staff() AND (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY admin_journal_select_staff_admin ON platform.admin_journal FOR SELECT TO authenticated USING ((platform.is_staff() OR (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

ALTER TABLE platform.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocks_delete_writer ON platform.blocks FOR DELETE TO authenticated USING (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (((state = 'draft'::text) AND (type <> 'row'::text)) OR ((state = 'published'::text) AND (type = 'row'::text)))));

CREATE POLICY blocks_insert_writer ON platform.blocks FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (((state = 'draft'::text) AND (type <> 'row'::text) AND (EXISTS ( SELECT 1
   FROM platform.node_drafts d
  WHERE (d.node_id = blocks.node_id)))) OR ((state = 'published'::text) AND (type = 'row'::text)))));

CREATE POLICY blocks_select_level ON platform.blocks FOR SELECT TO authenticated USING ((((state = 'published'::text) AND (EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE (n.id = blocks.node_id)))) OR ((state = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM platform.node_drafts d
  WHERE (d.node_id = blocks.node_id))))));

CREATE POLICY blocks_update_writer ON platform.blocks FOR UPDATE TO authenticated USING (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (((state = 'draft'::text) AND (type <> 'row'::text)) OR ((state = 'published'::text) AND (type = 'row'::text))))) WITH CHECK (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (((state = 'draft'::text) AND (type <> 'row'::text) AND (EXISTS ( SELECT 1
   FROM platform.node_drafts d
  WHERE (d.node_id = blocks.node_id)))) OR ((state = 'published'::text) AND (type = 'row'::text)))));

ALTER TABLE platform.connector_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY connector_activations_delete_admin ON platform.connector_activations FOR DELETE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY connector_activations_insert_admin ON platform.connector_activations FOR INSERT TO authenticated WITH CHECK (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (activated_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY connector_activations_select_member ON platform.connector_activations FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY connector_activations_update_admin ON platform.connector_activations FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.ctx ENABLE ROW LEVEL SECURITY;

CREATE POLICY ctx_insert_own ON platform.ctx FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

CREATE POLICY ctx_select_member ON platform.ctx FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_insert_own ON platform.feedback FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (state = 'open'::text) AND (resolution IS NULL) AND (handled_by IS NULL) AND (handled_at IS NULL)));

CREATE POLICY feedback_select_own_admin ON platform.feedback FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY feedback_update_admin ON platform.feedback FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY identities_select_own ON platform.identities FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE platform.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_insert_admin ON platform.invitations FOR INSERT TO authenticated WITH CHECK (((invited_by = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND ((team_id IS NULL) OR (EXISTS ( SELECT 1
   FROM platform.teams t
  WHERE ((t.id = invitations.team_id) AND (t.org_id = invitations.org_id)))))));

CREATE POLICY invitations_select_admin ON platform.invitations FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY invitations_select_own ON platform.invitations FOR SELECT TO authenticated USING ((email = lower((( SELECT auth.jwt() AS jwt) ->> 'email'::text))));

CREATE POLICY invitations_update_revoke ON platform.invitations FOR UPDATE TO authenticated USING (((accepted_at IS NULL) AND (declined_at IS NULL) AND (revoked_at IS NULL) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)))) WITH CHECK (((revoked_at IS NOT NULL) AND (accepted_at IS NULL) AND (declined_at IS NULL) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

ALTER TABLE platform.journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_insert_own ON platform.journal FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

CREATE POLICY journal_select_member ON platform.journal FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.lexicon ENABLE ROW LEVEL SECURITY;

CREATE POLICY lexicon_select_none ON platform.lexicon FOR SELECT TO authenticated USING (false);

ALTER TABLE platform.links ENABLE ROW LEVEL SECURITY;

CREATE POLICY links_select_level ON platform.links FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE (n.id = links.source_node_id))));

ALTER TABLE platform.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY members_delete_admin ON platform.members FOR DELETE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY members_insert_admin ON platform.members FOR INSERT TO authenticated WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY members_select_member ON platform.members FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY members_update_admin ON platform.members FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.node_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY node_aliases_select_level ON platform.node_aliases FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE (n.id = node_aliases.node_id))));

ALTER TABLE platform.node_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY node_drafts_select_writer ON platform.node_drafts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE ((n.id = node_drafts.node_id) AND (n.org_id IN ( SELECT platform.member_orgs() AS member_orgs))))));

CREATE POLICY node_drafts_update_writer ON platform.node_drafts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE ((n.id = node_drafts.node_id) AND (n.org_id IN ( SELECT platform.member_orgs() AS member_orgs)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE ((n.id = node_drafts.node_id) AND (n.org_id IN ( SELECT platform.member_orgs() AS member_orgs))))));

ALTER TABLE platform.node_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY node_shares_insert_member ON platform.node_shares FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (revoked_at IS NULL) AND (EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE ((n.id = node_shares.node_id) AND (n.org_id = node_shares.org_id))))));

CREATE POLICY node_shares_select_member ON platform.node_shares FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY node_shares_update_member ON platform.node_shares FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND ((revoked_at IS NOT NULL) OR (created_by = ( SELECT auth.uid() AS uid)))));

ALTER TABLE platform.node_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY node_versions_select_level ON platform.node_versions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE (n.id = node_versions.node_id))));

ALTER TABLE platform.nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nodes_delete_manager ON platform.nodes FOR DELETE TO authenticated USING (((parent_id IS NOT NULL) AND (path <> 'perso'::text) AND (NOT platform.is_context_path(org_id, path)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

CREATE POLICY nodes_insert_writer ON platform.nodes FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (parent_id IS NOT NULL) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

CREATE POLICY nodes_select_level ON platform.nodes FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY nodes_update_writer ON platform.nodes FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.org_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_domains_delete_admin ON platform.org_domains FOR DELETE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY org_domains_insert_admin ON platform.org_domains FOR INSERT TO authenticated WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY org_domains_select_member ON platform.org_domains FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY orgs_delete_admin ON platform.orgs FOR DELETE TO authenticated USING ((id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY orgs_select_member ON platform.orgs FOR SELECT TO authenticated USING ((id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY orgs_update_admin ON platform.orgs FOR UPDATE TO authenticated USING ((id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((id IN ( SELECT platform.member_orgs() AS member_orgs)));

ALTER TABLE platform.platform_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_grants_insert_staff ON platform.platform_grants FOR INSERT TO authenticated WITH CHECK (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (granted_by = ( SELECT auth.uid() AS uid)) AND (revoked_at IS NULL) AND (revoked_by IS NULL) AND (EXISTS ( SELECT 1
   FROM platform.platform_staff s
  WHERE (s.user_id = platform_grants.user_id)))));

CREATE POLICY platform_grants_select_staff_admin ON platform.platform_grants FOR SELECT TO authenticated USING ((platform.is_staff() OR (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

CREATE POLICY platform_grants_update_revoke ON platform.platform_grants FOR UPDATE TO authenticated USING (((revoked_at IS NULL) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)))) WITH CHECK (((revoked_at IS NOT NULL) AND (revoked_by = ( SELECT auth.uid() AS uid))));

ALTER TABLE platform.platform_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_staff_select_staff ON platform.platform_staff FOR SELECT TO authenticated USING (platform.is_staff());

ALTER TABLE platform.sim_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY sim_outbox_insert_writer ON platform.sim_outbox FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (org_id = ( SELECT a.org_id
   FROM platform.accounts a
  WHERE (a.id = sim_outbox.account_id))) AND (status = 'draft'::text) AND (sent_at IS NULL) AND (sent_by IS NULL)));

CREATE POLICY sim_outbox_select_level ON platform.sim_outbox FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY sim_outbox_update_writer ON platform.sim_outbox FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND ((sent_by IS NULL) OR (sent_by = ( SELECT auth.uid() AS uid)))));

ALTER TABLE platform.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_members_delete_admin ON platform.team_members FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM platform.teams t
  WHERE ((t.id = team_members.team_id) AND (t.org_id IN ( SELECT platform.member_orgs() AS member_orgs))))));

CREATE POLICY team_members_insert_admin ON platform.team_members FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (platform.teams t
     JOIN platform.members m ON (((m.org_id = t.org_id) AND (m.user_id = team_members.user_id))))
  WHERE ((t.id = team_members.team_id) AND (t.org_id IN ( SELECT platform.member_orgs() AS member_orgs))))));

CREATE POLICY team_members_select_member ON platform.team_members FOR SELECT TO authenticated USING ((team_id IN ( SELECT teams.id
   FROM platform.teams
  WHERE (teams.org_id IN ( SELECT platform.member_orgs() AS member_orgs)))));

CREATE POLICY team_members_update_admin ON platform.team_members FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM platform.teams t
  WHERE ((t.id = team_members.team_id) AND (t.org_id IN ( SELECT platform.member_orgs() AS member_orgs)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (platform.teams t
     JOIN platform.members m ON (((m.org_id = t.org_id) AND (m.user_id = team_members.user_id))))
  WHERE ((t.id = team_members.team_id) AND (t.org_id IN ( SELECT platform.member_orgs() AS member_orgs))))));

ALTER TABLE platform.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_delete_admin ON platform.teams FOR DELETE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY teams_insert_admin ON platform.teams FOR INSERT TO authenticated WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY teams_select_member ON platform.teams FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

CREATE POLICY teams_update_admin ON platform.teams FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

-- Privilèges : `EXECUTE` révoqué à `public` puis accordé fonction par fonction ; tables, séquences et
-- colonnes accordées à `anon` et `authenticated`.

GRANT USAGE ON SCHEMA platform TO authenticated;
GRANT USAGE ON SCHEMA platform TO anon;

REVOKE ALL ON FUNCTION platform.accept_invitations() FROM PUBLIC;
GRANT ALL ON FUNCTION platform.accept_invitations() TO authenticated;

REVOKE ALL ON FUNCTION platform.applied_migrations() FROM PUBLIC;
GRANT ALL ON FUNCTION platform.applied_migrations() TO authenticated;

REVOKE ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) TO authenticated;

REVOKE ALL ON FUNCTION platform.blocks_guard() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.blocks_lock_draft() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.bump_rules_version() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) TO authenticated;

REVOKE ALL ON FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) TO authenticated;

REVOKE ALL ON FUNCTION platform.feedback_number() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.forget_user(p_user uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.hook_before_user_created(event jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.identity_for_caller() FROM PUBLIC;
GRANT ALL ON FUNCTION platform.identity_for_caller() TO authenticated;

REVOKE ALL ON FUNCTION platform.invitations_guard() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.is_context_path(p_org uuid, p_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.is_context_path(p_org uuid, p_path text) TO authenticated;

REVOKE ALL ON FUNCTION platform.is_org_admin(org uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.is_org_admin(org uuid) TO authenticated;

REVOKE ALL ON FUNCTION platform.is_staff() FROM PUBLIC;
GRANT ALL ON FUNCTION platform.is_staff() TO authenticated;

REVOKE ALL ON FUNCTION platform.keep_updated_at_on_order() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.level_rank(p_level text) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.lexicon_rebuild(p_org uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.lexicon_sync() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.lexicon_words(p_text text) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.member_directory(p_org uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.member_directory(p_org uuid) TO authenticated;

REVOKE ALL ON FUNCTION platform.member_orgs() FROM PUBLIC;
GRANT ALL ON FUNCTION platform.member_orgs() TO authenticated;

REVOKE ALL ON FUNCTION platform.members_cleanup() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.members_identity_copy() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.members_tree_sync() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.node_level_for(p_org uuid, p_lpath extensions.ltree, p_owner_kind text, p_owner_team uuid, p_owner_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.node_level_for(p_org uuid, p_lpath extensions.ltree, p_owner_kind text, p_owner_team uuid, p_owner_user uuid) TO authenticated;

REVOKE ALL ON FUNCTION platform.node_level_of(p_user uuid, p_org uuid, p_lpath extensions.ltree, p_owner_kind text, p_owner_team uuid, p_owner_user uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.node_owner(p_node uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.node_owner(p_node uuid) TO authenticated;

REVOKE ALL ON FUNCTION platform.nodes_aliases_sync() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.nodes_guard() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.nodes_path_cascade() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.norm(t text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.norm(t text) TO authenticated;

REVOKE ALL ON FUNCTION platform.norm_words(t text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.norm_words(t text) TO authenticated;

REVOKE ALL ON FUNCTION platform.oauth_clients_activity() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.oauth_pending_resource(p_authorization_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.oauth_pending_resource(p_authorization_id text) TO authenticated;

REVOKE ALL ON FUNCTION platform.open_draft(p_node uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.open_draft(p_node uuid) TO authenticated;

REVOKE ALL ON FUNCTION platform.org_by_host(p_host text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.org_by_host(p_host text) TO anon;
GRANT ALL ON FUNCTION platform.org_by_host(p_host text) TO authenticated;

REVOKE ALL ON FUNCTION platform.org_contact(p_org uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.org_contact(p_org uuid) TO authenticated;

REVOKE ALL ON FUNCTION platform.platform_access_directory(p_org uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.platform_access_directory(p_org uuid) TO authenticated;

REVOKE ALL ON FUNCTION platform.platform_grants_guard() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.platform_grants_identity_copy() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.public_node_by_token(p_org uuid, p_token text, p_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.public_node_by_token(p_org uuid, p_token text, p_path text) TO anon;

REVOKE ALL ON FUNCTION platform.publish_node(p_node uuid, p_base_revision integer, p_links jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.publish_node(p_node uuid, p_base_revision integer, p_links jsonb) TO authenticated;

REVOKE ALL ON FUNCTION platform.publish_node(p_node uuid, p_base_revision integer, p_draft_stamp timestamp with time zone, p_links jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.publish_node(p_node uuid, p_base_revision integer, p_draft_stamp timestamp with time zone, p_links jsonb) TO authenticated;

REVOKE ALL ON FUNCTION platform.route_candidates(p_org uuid, p_query text, p_kind text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.route_candidates(p_org uuid, p_query text, p_kind text, p_limit integer) TO authenticated;

REVOKE ALL ON FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[], p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.search_content(p_org uuid, p_query text, p_kinds text[], p_limit integer) TO authenticated;

REVOKE ALL ON FUNCTION platform.set_updated_at() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.staff_directory() FROM PUBLIC;
GRANT ALL ON FUNCTION platform.staff_directory() TO authenticated;

REVOKE ALL ON FUNCTION platform.team_members_guard() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.teams_lead_sync() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.teams_tree_cleanup() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.teams_tree_sync() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.unique_handle(p_org uuid, p_email text) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.update_my_profile(p_org uuid, p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.update_my_profile(p_org uuid, p_patch jsonb) TO authenticated;

GRANT SELECT,INSERT,DELETE ON TABLE platform.access_rules TO authenticated;

GRANT UPDATE(level) ON TABLE platform.access_rules TO authenticated;

GRANT INSERT,DELETE ON TABLE platform.accounts TO authenticated;

GRANT SELECT(id) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(org_id) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(connector),UPDATE(connector) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(owner_kind),UPDATE(owner_kind) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(owner_team_id),UPDATE(owner_team_id) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(owner_user_id),UPDATE(owner_user_id) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(label),UPDATE(label) ON TABLE platform.accounts TO authenticated;

GRANT UPDATE(secret_ciphertext) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(status),UPDATE(status) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(health),UPDATE(health) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(mode),UPDATE(mode) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(created_at) ON TABLE platform.accounts TO authenticated;

GRANT SELECT(updated_at) ON TABLE platform.accounts TO authenticated;

GRANT SELECT ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(org_id) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(user_id) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(ctx) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(method) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(tool) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(op) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(target) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(args) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(args_chars) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(result_chars) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(is_error) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(error) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(duration_ms) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(host) ON TABLE platform.admin_journal TO authenticated;

GRANT INSERT(user_agent) ON TABLE platform.admin_journal TO authenticated;

GRANT SELECT,USAGE ON SEQUENCE platform.admin_journal_id_seq TO authenticated;

GRANT SELECT,DELETE ON TABLE platform.blocks TO authenticated;

GRANT INSERT(state) ON TABLE platform.blocks TO authenticated;

GRANT INSERT(org_id) ON TABLE platform.blocks TO authenticated;

GRANT INSERT(node_id) ON TABLE platform.blocks TO authenticated;

GRANT INSERT("position"),UPDATE("position") ON TABLE platform.blocks TO authenticated;

GRANT INSERT(type),UPDATE(type) ON TABLE platform.blocks TO authenticated;

GRANT INSERT(text),UPDATE(text) ON TABLE platform.blocks TO authenticated;

GRANT INSERT(data),UPDATE(data) ON TABLE platform.blocks TO authenticated;

GRANT INSERT(key),UPDATE(key) ON TABLE platform.blocks TO authenticated;

GRANT INSERT(provenance),UPDATE(provenance) ON TABLE platform.blocks TO authenticated;

GRANT UPDATE(revision) ON TABLE platform.blocks TO authenticated;

GRANT UPDATE(claimed_by) ON TABLE platform.blocks TO authenticated;

GRANT UPDATE(claimed_by_user) ON TABLE platform.blocks TO authenticated;

GRANT UPDATE(lease_until) ON TABLE platform.blocks TO authenticated;

GRANT INSERT(created_by) ON TABLE platform.blocks TO authenticated;

GRANT INSERT(updated_by),UPDATE(updated_by) ON TABLE platform.blocks TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE platform.connector_activations TO authenticated;

GRANT SELECT,INSERT ON TABLE platform.ctx TO authenticated;

GRANT SELECT,INSERT ON TABLE platform.feedback TO authenticated;

GRANT UPDATE(state) ON TABLE platform.feedback TO authenticated;

GRANT UPDATE(resolution) ON TABLE platform.feedback TO authenticated;

GRANT UPDATE(handled_by) ON TABLE platform.feedback TO authenticated;

GRANT UPDATE(handled_at) ON TABLE platform.feedback TO authenticated;

GRANT SELECT,USAGE ON SEQUENCE platform.feedback_id_seq TO authenticated;

GRANT SELECT ON TABLE platform.identities TO authenticated;

GRANT SELECT ON TABLE platform.invitations TO authenticated;

GRANT INSERT(org_id) ON TABLE platform.invitations TO authenticated;

GRANT INSERT(email) ON TABLE platform.invitations TO authenticated;

GRANT INSERT(role) ON TABLE platform.invitations TO authenticated;

GRANT INSERT(team_id) ON TABLE platform.invitations TO authenticated;

GRANT INSERT(invited_by) ON TABLE platform.invitations TO authenticated;

GRANT UPDATE(revoked_at) ON TABLE platform.invitations TO authenticated;

GRANT SELECT,INSERT ON TABLE platform.journal TO authenticated;

GRANT SELECT,USAGE ON SEQUENCE platform.journal_id_seq TO authenticated;

GRANT SELECT ON TABLE platform.lexicon TO authenticated;

GRANT SELECT ON TABLE platform.links TO authenticated;

GRANT SELECT,USAGE ON SEQUENCE platform.links_id_seq TO authenticated;

GRANT SELECT,DELETE ON TABLE platform.members TO authenticated;

GRANT INSERT(org_id),UPDATE(org_id) ON TABLE platform.members TO authenticated;

GRANT INSERT(user_id),UPDATE(user_id) ON TABLE platform.members TO authenticated;

GRANT INSERT(role),UPDATE(role) ON TABLE platform.members TO authenticated;

GRANT INSERT(default_team_id),UPDATE(default_team_id) ON TABLE platform.members TO authenticated;

GRANT INSERT(profile),UPDATE(profile) ON TABLE platform.members TO authenticated;

GRANT INSERT(created_at),UPDATE(created_at) ON TABLE platform.members TO authenticated;

GRANT SELECT ON TABLE platform.node_aliases TO authenticated;

GRANT SELECT ON TABLE platform.node_drafts TO authenticated;

GRANT UPDATE(title) ON TABLE platform.node_drafts TO authenticated;

GRANT UPDATE(summary) ON TABLE platform.node_drafts TO authenticated;

GRANT UPDATE(kind) ON TABLE platform.node_drafts TO authenticated;

GRANT UPDATE(meta) ON TABLE platform.node_drafts TO authenticated;

GRANT UPDATE(updated_by) ON TABLE platform.node_drafts TO authenticated;

GRANT SELECT ON TABLE platform.node_shares TO authenticated;

GRANT INSERT(org_id) ON TABLE platform.node_shares TO authenticated;

GRANT INSERT(node_id) ON TABLE platform.node_shares TO authenticated;

GRANT INSERT(token) ON TABLE platform.node_shares TO authenticated;

GRANT INSERT(include_children),UPDATE(include_children) ON TABLE platform.node_shares TO authenticated;

GRANT INSERT(created_by),UPDATE(created_by) ON TABLE platform.node_shares TO authenticated;

GRANT UPDATE(revoked_at) ON TABLE platform.node_shares TO authenticated;

GRANT SELECT ON TABLE platform.node_versions TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE platform.nodes TO authenticated;

GRANT SELECT,INSERT,DELETE ON TABLE platform.org_domains TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE platform.orgs TO authenticated;

GRANT SELECT(id) ON TABLE platform.platform_grants TO authenticated;

GRANT SELECT(org_id),INSERT(org_id) ON TABLE platform.platform_grants TO authenticated;

GRANT SELECT(user_id),INSERT(user_id) ON TABLE platform.platform_grants TO authenticated;

GRANT SELECT(granted_by),INSERT(granted_by) ON TABLE platform.platform_grants TO authenticated;

GRANT SELECT(granted_at) ON TABLE platform.platform_grants TO authenticated;

GRANT SELECT(revoked_at),UPDATE(revoked_at) ON TABLE platform.platform_grants TO authenticated;

GRANT SELECT(revoked_by),UPDATE(revoked_by) ON TABLE platform.platform_grants TO authenticated;

GRANT SELECT(reason),INSERT(reason) ON TABLE platform.platform_grants TO authenticated;

GRANT SELECT ON TABLE platform.platform_staff TO authenticated;

GRANT SELECT,INSERT ON TABLE platform.sim_outbox TO authenticated;

GRANT UPDATE(status) ON TABLE platform.sim_outbox TO authenticated;

GRANT UPDATE(sent_by) ON TABLE platform.sim_outbox TO authenticated;

GRANT UPDATE(sent_at) ON TABLE platform.sim_outbox TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE platform.team_members TO authenticated;

GRANT SELECT,INSERT,DELETE ON TABLE platform.teams TO authenticated;

GRANT UPDATE(name) ON TABLE platform.teams TO authenticated;

GRANT UPDATE(lead_user_id) ON TABLE platform.teams TO authenticated;

-- Rôle propre à Supabase : `supabase_auth_admin` (hook d'inscription). Sur un Postgres sans Supabase, il
-- n'existe pas et rien n'est accordé.
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_auth_admin') then
    GRANT USAGE ON SCHEMA platform TO supabase_auth_admin;
    GRANT ALL ON FUNCTION platform.hook_before_user_created(event jsonb) TO supabase_auth_admin;
  end if;
end
$$;

reset check_function_bodies;

-- ROLLBACK:
-- Sur un hôte neuf seulement, avant toute donnée : drop schema if exists platform cascade;
-- (les extensions restent : elles peuvent servir à d'autres schémas.)
