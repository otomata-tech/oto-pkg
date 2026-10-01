-- Version 1.2.0 du paquet : les migrations de la version, réunies dans ce fichier, chacune précédée d'une bannière
-- qui nomme sa story ; un seul bloc ROLLBACK en fin de fichier, les parties dans l'ordre inverse.

-- ====================================================================================================
-- Partie 1 : E12-S01 (inscription libre, ADR-023).
-- ====================================================================================================

-- E12-S01 (ADR-023) : l'inscription libre. Une personne vérifiée crée son organisation, si l'hôte l'active
-- (`signup` de `handlePlateforme`) ; la décision est celle du service (`server/admin/signup.ts`, ADR-012 § 3), cette
-- fonction en est la seconde barrière et tient la création en une transaction. Aucune table ni colonne.

-- 1. L'arbre de départ d'une organisation (racine `guide`, `private`, `contexte`, adresses), écrit une fois et partagé
--    par `create_org` (équipe plateforme) et `signup_org` (inscription). Interne : exécutable par aucun rôle, appelée
--    par ces deux fonctions seules (`database-patterns.md § Règles SECURITY DEFINER`).
CREATE FUNCTION platform.org_skeleton(p_name text, p_slug text, p_prefix text, p_hosts text[], p_author uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_org uuid;
  v_root uuid;
  v_host text;
begin
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
          'org', p_author, p_author)
  returning id into v_root;
  insert into platform.nodes (org_id, parent_id, path, kind, title, summary, created_by, updated_by)
  values (v_org, v_root, 'private', 'page', 'Espaces personnels',
          'Un espace par personne, visible de son seul propriétaire.', p_author, p_author),
         (v_org, v_root, 'contexte', 'context', 'Contexte',
          'Ce que les assistants de tous les membres de l''organisation lisent à chaque conversation.',
          p_author, p_author);
  foreach v_host in array coalesce(p_hosts, '{}') loop
    insert into platform.org_domains (host, org_id) values (lower(btrim(v_host)), v_org);
  end loop;
  return v_org;
end;
$_$;

REVOKE ALL ON FUNCTION platform.org_skeleton(p_name text, p_slug text, p_prefix text, p_hosts text[], p_author uuid) FROM PUBLIC;

-- 2. `create_org` sur l'arbre partagé : même signature, même contrôle, même résultat (l'accès `creation` du créateur
--    posé après l'arbre au lieu d'avant les adresses, dans la même transaction).
CREATE OR REPLACE FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null or not platform.is_staff() then
    raise exception 'create_org is reserved to the platform team' using errcode = '42501';
  end if;
  v_org := platform.org_skeleton(p_name, p_slug, p_prefix, p_hosts, v_uid);
  insert into platform.platform_grants (org_id, user_id, granted_by, reason)
  values (v_org, v_uid, v_uid, 'creation');
  return v_org;
end;
$_$;

REVOKE ALL ON FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.create_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) TO authenticated;

-- 3. L'inscription : l'identité de l'appelant s'il n'en a pas (mode OIDC : un sujet ni invité ni de l'équipe
--    plateforme, que `identity_for_caller()` laisse sans identifiant), l'organisation, son arbre, ses adresses et son
--    premier membre `admin`, en une transaction. Refus `42501` sans email dans les claims (le port d'identité ne pose
--    qu'un email vérifié, ADR-012 § 1), sans émetteur ni identifiant, ou pour une personne déjà membre d'une
--    organisation (une organisation par compte, HN-E12S01-2). Le verrou 7801 sur la personne sérialise ses
--    inscriptions simultanées : la seconde voit le membre de la première. Aucune équipe (l'équipe par défaut est retirée
--    depuis E05-S13), aucun accès plateforme. La base ne sait pas si l'hôte a activé l'inscription : c'est la décision
--    du service, `platform_app` n'étant utilisé que par le code du paquet (ADR-023 § 3).
CREATE FUNCTION platform.signup_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  v_issuer text := nullif(v_claims ->> 'iss', '');
  v_subject text := nullif(v_claims ->> 'ext_sub', '');
  v_email text := lower(nullif(btrim(v_claims ->> 'email'), ''));
  v_name text := nullif(btrim(v_claims ->> 'name'), '');
  v_user uuid := (select auth.uid());
  v_org uuid;
begin
  if v_email is null or (v_user is null and (v_issuer is null or v_subject is null)) then
    raise exception 'signup_org needs a verified caller with an email' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7801, pg_catalog.hashtext(coalesce(v_issuer || '|' || v_subject, v_user::text)));
  if v_user is null then
    if v_claims ->> 'issuer_kind' is distinct from 'oidc' then
      raise exception 'signup_org needs a verified caller with an email' using errcode = '42501';
    end if;
    insert into platform.identities (issuer, subject, user_id)
    values (v_issuer, v_subject, gen_random_uuid())
    on conflict do nothing;
    select i.user_id into v_user from platform.identities i where i.issuer = v_issuer and i.subject = v_subject;
  end if;
  if exists (select 1 from platform.members m where m.user_id = v_user) then
    raise exception 'already_member' using errcode = '42501';
  end if;
  v_org := platform.org_skeleton(p_name, p_slug, p_prefix, p_hosts, v_user);
  insert into platform.members (org_id, user_id, role, profile, email, name, last_sign_in_at)
  values (v_org, v_user, 'admin',
          jsonb_strip_nulls(jsonb_build_object('handle', platform.unique_handle(v_org, v_email), 'name', v_name)),
          v_email, v_name, now());
  return v_org;
end;
$_$;

REVOKE ALL ON FUNCTION platform.signup_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.signup_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) TO authenticated;

-- ====================================================================================================
-- Partie 2 : E12-S02 (compteurs d'une organisation lus sans session, ADR-022 § 10).
-- ====================================================================================================

-- L'hôte qui vend le paquet prévient d'un seuil de membres hors de toute requête d'une personne (tâche planifiée,
-- webhook de paiement) : il lit, sans session, deux nombres d'une organisation qu'il désigne par son identifiant, et
-- rien d'autre. Accordée à `anon`, comme `org_by_host` et `org_contact`, par l'ADR qui l'ouvre ; `platform` reste hors
-- du Data API de Supabase (`data-api:close`), la fonction ne se joint que par le serveur de l'hôte. Une organisation
-- inconnue ne rend aucune ligne.
CREATE FUNCTION platform.org_usage(p_org uuid) RETURNS TABLE(members integer, pending_invitations integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  select (select count(*)::int from platform.members m where m.org_id = o.id),
         (select count(*)::int from platform.invitations i
           where i.org_id = o.id and i.accepted_at is null and i.declined_at is null
             and i.revoked_at is null and i.expires_at > now())
    from platform.orgs o
   where o.id = p_org
$_$;

REVOKE ALL ON FUNCTION platform.org_usage(p_org uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.org_usage(p_org uuid) TO anon;

-- ROLLBACK: (jamais exécuté depuis le paquet) — les parties dans l'ordre inverse de ce fichier.
-- E12-S02 :
--   drop function platform.org_usage(uuid) ;
-- E12-S01 :
--   drop function platform.signup_org(text, text, text, text[]) ;
--   -- create_org : reprendre le corps de 20260929090000_platform_e05s13.sql (partie 3), puis
--   drop function platform.org_skeleton(text, text, text, text[], uuid).
