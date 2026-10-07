-- Version 1.5.0 du paquet : la liste des connecteurs tenue depuis la déclaration de l'hôte (moteur des connecteurs
-- décrits). L'hôte déclare ses connecteurs au paquet (`registerConnectors`) sans écrire de SQL ; le serveur ajoute le
-- nom d'un connecteur déclaré, et son libellé, à `platform.connectors` avant la première ligne qui le cite (activation,
-- compte). La table n'accorde aucune écriture à `authenticated` : cette fonction y insère un nom, au motif du contrôle
-- de la table, sans jamais modifier ni retirer une ligne. Un seul bloc ROLLBACK en fin de fichier.

-- 1. Un nom absent s'ajoute ; un nom présent ne change pas, son libellé compris. Réservée à un membre d'une organisation
--    (`member_orgs`, comme la RLS) : la session d'un appelant que la plateforme connaît. Le nom passe le contrôle
--    `connectors_name_check` de la table ; le libellé tient en 80 caractères.
CREATE FUNCTION platform.declare_connector(p_name text, p_label text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from platform.member_orgs()) then
    raise exception 'declare_connector: reserved to a member of an organisation' using errcode = '42501';
  end if;
  if char_length(p_label) > 80 then
    raise exception 'declare_connector: label longer than 80 characters' using errcode = '22023';
  end if;
  insert into platform.connectors (name, label) values (p_name, p_label) on conflict (name) do nothing;
end
$$;

REVOKE ALL ON FUNCTION platform.declare_connector(p_name text, p_label text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.declare_connector(p_name text, p_label text) FROM anon;
GRANT EXECUTE ON FUNCTION platform.declare_connector(p_name text, p_label text) TO authenticated;

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   drop function platform.declare_connector(text, text).
