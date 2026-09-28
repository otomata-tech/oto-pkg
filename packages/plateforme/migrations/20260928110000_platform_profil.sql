-- Migration : platform_profil
-- Description : story E05-S11, lot a (page « Profil », fiche D105, D107). `update_my_profile` re-versionnée
-- avec sa signature : la fiche d'une personne prend, en plus du nom (80) et de la langue (`fr`, `en`), son
-- prénom (`first_name`, 80), son nom de famille (`last_name`, 80) et sa couleur (`theme`, un des huit thèmes
-- du jeu Oto, `OTO_THEMES` de `schemas/brand.ts`). Écrire le prénom ou le nom recompose `name`
-- (« Prénom Nom »), lu par tous les lecteurs du nom (annuaire, `org_contact`, identité, bloc « You work
-- for ») : aucun ne change (HN-E05S11-2). Une chaîne vide retire la clé, comme avant ; prénom et nom vides
-- retirent `name`.
-- Additive au sens de FR-INST-04 : une fonction re-versionnée avec sa signature (ses privilèges restent,
-- redits ci-dessous), aucune table ni colonne, tout dans `platform`. Portable : Supabase comme Postgres nu.

create or replace function platform.update_my_profile(p_org uuid, p_patch jsonb) returns jsonb
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_uid uuid := (select auth.uid());
  v_limits constant jsonb := '{"name": 80, "first_name": 80, "last_name": 80, "language": 2, "theme": 9}';
  v_themes constant text[] := array['manuscrit', 'ardoise', 'grenat', 'brique', 'foret', 'lagune', 'cobalt', 'violet'];
  v_profile jsonb;
  v_key text;
  v_value jsonb;
  v_text text;
  v_name text;
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
      raise exception 'unknown profile field %; fields: name, first_name, last_name, language, theme', v_key
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
    elsif v_key = 'theme' and not (v_text = any (v_themes)) then
      raise exception 'theme must be one of %', array_to_string(v_themes, ', ') using errcode = '22023';
    else
      v_profile := jsonb_set(v_profile, array[v_key], to_jsonb(v_text));
    end if;
  end loop;
  -- Le prénom ou le nom écrit recompose le nom affiché, après le `name` que le même patch porterait.
  if p_patch ? 'first_name' or p_patch ? 'last_name' then
    v_name := concat_ws(' ', v_profile ->> 'first_name', v_profile ->> 'last_name');
    if v_name = '' then
      v_profile := v_profile - 'name';
    else
      v_profile := jsonb_set(v_profile, '{name}', to_jsonb(v_name));
    end if;
  end if;
  update platform.members set profile = v_profile where org_id = p_org and user_id = v_uid;
  return v_profile;
end;
$$;

revoke all on function platform.update_my_profile(p_org uuid, p_patch jsonb) from public;
grant all on function platform.update_my_profile(p_org uuid, p_patch jsonb) to authenticated;

-- ROLLBACK:
-- le corps d'`update_my_profile` de `20260928100000_platform_base_v1.sql` (limites `name` et `language`
--   seules), par `create or replace function` ; ses privilèges ne changent pas.
