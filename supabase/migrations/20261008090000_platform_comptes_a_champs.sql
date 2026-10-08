-- Version 1.5.0 du paquet : les comptes de connecteur à plusieurs champs et réglages (connecteurs et comptes). Un
-- compte garde tous les champs du secret que déclare son connecteur, chiffrés ensemble dans `secret_ciphertext` (un
-- objet JSON, format v2 du coffre), et ses réglages non secrets en clair ; le jeton d'un échange
-- (`oauth2_client_credentials`) est chiffré à part, pour qu'un renouvellement n'écrase jamais une saisie. Un seul bloc
-- ROLLBACK en fin de fichier.

-- 1. Les colonnes. `settings` : les réglages saisis (région, adresse), validés contre la déclaration par le service.
--    `secret_fields` et `secret_updated_at` : les noms des champs posés et la date de la dernière saisie, ce que l'écran
--    montre sans jamais relire le secret ; la date sert aussi de version à une saisie qui fusionne. `token_ciphertext`
--    et `token_expires_at` : le jeton d'un échange et son échéance. `status_reason` : la raison d'un état `error`,
--    posée par le parcours OAuth du lot suivant.
ALTER TABLE platform.accounts
    ADD COLUMN settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN secret_fields text[] DEFAULT '{}'::text[] NOT NULL,
    ADD COLUMN secret_updated_at timestamp with time zone,
    ADD COLUMN token_ciphertext text,
    ADD COLUMN token_expires_at timestamp with time zone,
    ADD COLUMN status_reason text,
    ADD CONSTRAINT accounts_settings_check CHECK ((jsonb_typeof(settings) = 'object'::text)),
    ADD CONSTRAINT accounts_status_reason_check CHECK ((char_length(status_reason) <= 500));

-- 2. Un secret déjà posé (un champ, format v1) garde sa date : celle de la dernière écriture du compte.
UPDATE platform.accounts SET secret_updated_at = updated_at WHERE secret_ciphertext IS NOT NULL;

-- 3. Droits de colonnes (règle `accounts` : grants de colonnes). `token_ciphertext`, comme `secret_ciphertext`, n'est
--    jamais accordée en lecture : elle se lit par `account_token` seule. Le service décide de chaque écriture.
GRANT SELECT(settings),UPDATE(settings) ON TABLE platform.accounts TO authenticated;
GRANT SELECT(secret_fields),UPDATE(secret_fields) ON TABLE platform.accounts TO authenticated;
GRANT SELECT(secret_updated_at),UPDATE(secret_updated_at) ON TABLE platform.accounts TO authenticated;
GRANT UPDATE(token_ciphertext) ON TABLE platform.accounts TO authenticated;
GRANT SELECT(token_expires_at),UPDATE(token_expires_at) ON TABLE platform.accounts TO authenticated;
GRANT SELECT(status_reason),UPDATE(status_reason) ON TABLE platform.accounts TO authenticated;

-- 4. Le chiffré du jeton d'un compte, comme `account_secret` : au seul membre de l'organisation du compte
--    (`member_orgs`, comme la RLS), rien pour un autre ni pour un compte sans jeton. Le serveur de l'hôte le déchiffre
--    pour le seul appel au tiers ; le service décide du compte avant de l'appeler.
CREATE FUNCTION platform.account_token(p_account uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select a.token_ciphertext from platform.accounts a
   where a.id = p_account and a.org_id in (select platform.member_orgs())
$$;

REVOKE ALL ON FUNCTION platform.account_token(p_account uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.account_token(p_account uuid) FROM anon;
GRANT EXECUTE ON FUNCTION platform.account_token(p_account uuid) TO authenticated;

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   drop function platform.account_token(uuid) ;
--   alter table platform.accounts drop constraint accounts_status_reason_check, drop constraint accounts_settings_check,
--     drop column status_reason, drop column token_expires_at, drop column token_ciphertext,
--     drop column secret_updated_at, drop column secret_fields, drop column settings.
