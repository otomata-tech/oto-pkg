-- Version 1.4.0 du paquet : les migrations de la version, réunies dans ce fichier, chacune précédée d'une bannière
-- qui nomme son sujet ; un seul bloc ROLLBACK en fin de fichier, les parties dans l'ordre inverse.

-- ====================================================================================================
-- Partie 1 : entrée sans invitation des comptes de l'hôte (identité et connexion, offres de l'hôte).
-- ====================================================================================================

-- Dans un ERP construit sur le paquet, l'annuaire est celui de l'ERP : ses comptes n'ont pas à être réinvités par
-- email. Un administrateur ouvre l'organisation aux comptes vérifiés de domaines d'email qu'il nomme (réglage
-- `open_entry` de `orgs.settings` : `{ enabled, email_domains }`, écrit par le service, au moins un domaine exigé) ;
-- une personne admise entre comme membre, sans équipe, à son premier appel. La décision est celle du service
-- (`server/open-entry.ts`, ADR-012 § 3) : il lit le plafond de membres chez l'hôte et le passe ; ces fonctions en sont
-- la seconde barrière et tiennent l'entrée en une transaction.

-- 1. Les personnes retirées d'une organisation par un administrateur : sans cette table, un membre retiré rentrerait à
--    l'appel suivant d'une organisation ouverte. Le retrait y inscrit toujours la personne, que le réglage soit actif
--    ou non (l'activer plus tard ne fait pas revenir d'anciens membres) ; seule une invitation acceptée l'en retire.
CREATE TABLE platform.member_exclusions (
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    excluded_at timestamp with time zone DEFAULT now() NOT NULL,
    excluded_by uuid
);

COMMENT ON TABLE platform.member_exclusions IS 'Personnes retirées d''une organisation par un administrateur : l''entrée sans invitation (open_entry) les refuse ; une invitation acceptée lève l''exclusion.';

ALTER TABLE ONLY platform.member_exclusions
    ADD CONSTRAINT member_exclusions_pkey PRIMARY KEY (org_id, user_id);

ALTER TABLE ONLY platform.member_exclusions
    ADD CONSTRAINT member_exclusions_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

CREATE INDEX idx_member_exclusions_user_id ON platform.member_exclusions USING btree (user_id);

ALTER TABLE platform.member_exclusions ENABLE ROW LEVEL SECURITY;

-- La RLS isole les organisations ; administrer est décidé par le service (`removeMember`).
DROP POLICY IF EXISTS member_exclusions_select_member ON platform.member_exclusions;
CREATE POLICY member_exclusions_select_member ON platform.member_exclusions FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

DROP POLICY IF EXISTS member_exclusions_insert_member ON platform.member_exclusions;
CREATE POLICY member_exclusions_insert_member ON platform.member_exclusions FOR INSERT TO authenticated WITH CHECK (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (excluded_by = ( SELECT auth.uid() AS uid))));

GRANT SELECT ON TABLE platform.member_exclusions TO authenticated;

GRANT INSERT(org_id),INSERT(user_id),INSERT(excluded_by) ON TABLE platform.member_exclusions TO authenticated;

-- 2. L'appelant est-il admis par le réglage de l'organisation ? Interne (exécutable par aucun rôle) : partagée par les
--    deux fonctions ci-dessous. Admis : réglage actif ; email vérifié dans les claims (la porte n'y met qu'un email
--    vérifié), d'un domaine nommé ; pas déjà membre ; pas exclu ; pas servi par un accès plateforme en cours (l'équipe
--    plateforme ne devient pas membre d'un client en ouvrant son organisation).
CREATE FUNCTION platform.open_entry_gate(p_org uuid, p_user uuid, p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  select p_email is not null
     and position('@' in p_email) > 1
     and exists (
       select 1 from platform.orgs o
        where o.id = p_org
          and (o.settings -> 'open_entry' ->> 'enabled') = 'true'
          and jsonb_typeof(o.settings -> 'open_entry' -> 'email_domains') = 'array'
          and (o.settings -> 'open_entry' -> 'email_domains') ? split_part(p_email, '@', 2))
     and (p_user is null or (
           not exists (select 1 from platform.members m where m.org_id = p_org and m.user_id = p_user)
       and not exists (select 1 from platform.member_exclusions x where x.org_id = p_org and x.user_id = p_user)
       and not exists (select 1 from platform.platform_grants g
                         join platform.platform_staff s on s.user_id = g.user_id
                        where g.org_id = p_org and g.user_id = p_user and g.revoked_at is null)))
$_$;

REVOKE ALL ON FUNCTION platform.open_entry_gate(p_org uuid, p_user uuid, p_email text) FROM PUBLIC;

-- 3. La question du service, sans écriture : il ne lit le plafond de membres chez l'hôte que pour une personne admise.
CREATE FUNCTION platform.open_entry_admits(p_org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  select platform.open_entry_gate(
           p_org,
           (select auth.uid()),
           lower(nullif(btrim(coalesce((select auth.jwt()), '{}'::jsonb) ->> 'email'), '')))
     and ((select auth.uid()) is not null
          or (coalesce((select auth.jwt()), '{}'::jsonb) ->> 'issuer_kind' = 'oidc'
              and nullif(coalesce((select auth.jwt()), '{}'::jsonb) ->> 'iss', '') is not null
              and nullif(coalesce((select auth.jwt()), '{}'::jsonb) ->> 'ext_sub', '') is not null))
$_$;

REVOKE ALL ON FUNCTION platform.open_entry_admits(p_org uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.open_entry_admits(p_org uuid) TO authenticated;

-- 4. L'entrée. `p_members_max` : le plafond lu chez l'hôte par le service (`null` : aucun), compté comme partout,
--    invitations en attente comprises, sous le verrou des limites de l'organisation (7601). Rend `joined`, `refused`
--    (non admis) ou `limit` (plafond atteint) ; rien n'est écrit hors de `joined`. Rôle `member`, aucune équipe. Un
--    sujet OIDC jamais vu reçoit son identité ici, comme à l'inscription (`signup_org`). Une ligne du journal de
--    l'organisation dit l'entrée.
CREATE FUNCTION platform.join_org(p_org uuid, p_members_max integer DEFAULT NULL) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  v_issuer text := nullif(v_claims ->> 'iss', '');
  v_subject text := nullif(v_claims ->> 'ext_sub', '');
  v_email text := lower(nullif(btrim(v_claims ->> 'email'), ''));
  v_name text := nullif(btrim(coalesce(v_claims -> 'user_metadata' ->> 'full_name',
                                       v_claims -> 'user_metadata' ->> 'name',
                                       v_claims ->> 'name')), '');
  v_user uuid := (select auth.uid());
  v_taken integer;
begin
  if not platform.open_entry_gate(p_org, v_user, v_email) then
    return 'refused';
  end if;
  if v_user is null then
    if v_claims ->> 'issuer_kind' is distinct from 'oidc' or v_issuer is null or v_subject is null then
      return 'refused';
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7601, pg_catalog.hashtext(p_org::text));
  if p_members_max is not null then
    select (select count(*)::int from platform.members m where m.org_id = p_org)
         + (select count(*)::int from platform.invitations i
             where i.org_id = p_org and i.accepted_at is null and i.declined_at is null
               and i.revoked_at is null and i.expires_at > now())
      into v_taken;
    if v_taken >= p_members_max then
      return 'limit';
    end if;
  end if;
  if v_user is null then
    insert into platform.identities (issuer, subject, user_id)
    values (v_issuer, v_subject, gen_random_uuid())
    on conflict do nothing;
    select i.user_id into v_user from platform.identities i where i.issuer = v_issuer and i.subject = v_subject;
    -- L'identité vient d'être connue : exclusion, appartenance et accès plateforme se relisent sur elle.
    if not platform.open_entry_gate(p_org, v_user, v_email) then
      return 'refused';
    end if;
  end if;
  insert into platform.members (org_id, user_id, role, profile, email, name, last_sign_in_at)
  values (p_org, v_user, 'member',
          jsonb_strip_nulls(jsonb_build_object('handle', platform.unique_handle(p_org, v_email), 'name', v_name)),
          v_email, v_name, now())
  on conflict (org_id, user_id) do nothing;
  if not found then
    return 'refused';
  end if;
  insert into platform.journal (org_id, user_id, method, tool, target, args)
  values (p_org, v_user, 'api', 'member joined', v_email, jsonb_build_object('origin', 'open_entry'));
  return 'joined';
end;
$_$;

REVOKE ALL ON FUNCTION platform.join_org(p_org uuid, p_members_max integer) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.join_org(p_org uuid, p_members_max integer) TO authenticated;

-- 5. Une invitation acceptée lève l'exclusion (le reste du corps est celui de 20260929090000_platform_e05s13.sql).
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
    -- Une invitation acceptée lève l'exclusion de la personne dans cette organisation : la seule façon de la lever.
    delete from platform.member_exclusions x where x.org_id = v_inv.org_id and x.user_id = v_uid;
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

-- 6. L'oubli d'une personne emporte ses exclusions (le reste du corps est celui de 20260930100000_v1_1_0.sql).
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
  -- ses exclusions (entrée sans invitation) : aucune ligne nominative ne reste ; l'auteur d'une exclusion s'efface
  delete from platform.member_exclusions where user_id = p_user;
  update platform.member_exclusions set excluded_by = null where excluded_by = p_user;
end;
$$;

REVOKE ALL ON FUNCTION platform.forget_user(p_user uuid) FROM PUBLIC;

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   forget_user : reprendre le corps de 20260930100000_v1_1_0.sql (point 5) ;
--   accept_invitations : reprendre le corps de 20260929090000_platform_e05s13.sql (point 2) ;
--   drop function platform.join_org(uuid, integer) ;
--   drop function platform.open_entry_admits(uuid) ;
--   drop function platform.open_entry_gate(uuid, uuid, text) ;
--   drop table platform.member_exclusions ;
--   update platform.orgs set settings = settings - 'open_entry'.
