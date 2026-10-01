-- Version 1.3.0 du paquet : les migrations de la version, réunies dans ce fichier, chacune précédée d'une bannière
-- qui nomme son sujet ; un seul bloc ROLLBACK en fin de fichier, les parties dans l'ordre inverse.

-- ====================================================================================================
-- Partie 1 : plusieurs organisations par personne (offres de l'hôte, inscription libre).
-- ====================================================================================================

-- Une personne crée autant d'organisations qu'elle veut par l'inscription (décision du 2026-10-01,
-- `docs/conception/offres-de-l-hote.md`) : `signup_org` ne refuse plus une personne déjà membre d'une organisation, et
-- le verrou 7801, qui sérialisait ses inscriptions pour ce contrôle, part avec lui. L'identité d'un sujet OIDC inconnu
-- se crée toujours ici, sans course : `on conflict do nothing`, puis relecture. Le reste est inchangé : refus `42501`
-- sans email ni émetteur, arbre par `org_skeleton`, premier membre `admin`, aucune équipe, aucun accès plateforme.
CREATE OR REPLACE FUNCTION platform.signup_org(p_name text, p_slug text, p_prefix text, p_hosts text[]) RETURNS uuid
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
  if v_user is null then
    if v_claims ->> 'issuer_kind' is distinct from 'oidc' then
      raise exception 'signup_org needs a verified caller with an email' using errcode = '42501';
    end if;
    insert into platform.identities (issuer, subject, user_id)
    values (v_issuer, v_subject, gen_random_uuid())
    on conflict do nothing;
    select i.user_id into v_user from platform.identities i where i.issuer = v_issuer and i.subject = v_subject;
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

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   signup_org : reprendre le corps de 20261001090000_v1_2_0.sql (partie 1, point 3).
