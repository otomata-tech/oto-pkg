-- Version 1.5.0 du paquet : la prise des connecteurs (connecteurs et comptes). Les connecteurs forment une table, et
-- toute référence à un connecteur est une clé étrangère vers elle ; le chiffré du secret d'un compte ne se lit que par
-- une fonction, pour l'appel au tiers. Un seul bloc ROLLBACK en fin de fichier, dans l'ordre inverse.

-- 1. Les connecteurs. Un renommage se fait ici, à un seul endroit (les clés suivent) ; une référence à un connecteur
--    inconnu est refusée par la base, au lieu de faire perdre leurs fonctions à des membres en silence. Le catalogue
--    des fonctions reste dans le code (H80) ; seul le nom fait foi ici. Lue par toute session, écrite par aucune :
--    une ligne s'ajoute par une migration du paquet ou de l'hôte.
CREATE TABLE platform.connectors (
    name text NOT NULL,
    label text,
    CONSTRAINT connectors_name_check CHECK ((name ~ '^[a-z][a-z0-9_]{0,39}$'::text))
);

COMMENT ON TABLE platform.connectors IS 'Connecteurs connus de l''hôte : toute référence à un connecteur (accounts, connector_activations, sim_outbox) est une clé étrangère vers name.';

ALTER TABLE ONLY platform.connectors
    ADD CONSTRAINT connectors_pkey PRIMARY KEY (name);

ALTER TABLE platform.connectors ENABLE ROW LEVEL SECURITY;

-- Une liste de noms sans organisation ni donnée de personne : chacun la lit.
DROP POLICY IF EXISTS connectors_select_authenticated ON platform.connectors;
CREATE POLICY connectors_select_authenticated ON platform.connectors FOR SELECT TO authenticated USING (true);

GRANT SELECT ON TABLE platform.connectors TO authenticated;

-- 2. Les connecteurs du paquet, puis chaque nom déjà cité par un hôte installé, avant les clés : sans ces lignes, la
--    pose d'une clé échouerait sur un hôte qui a déjà des comptes, des activations ou des brouillons.
INSERT INTO platform.connectors (name, label) VALUES ('mail', 'Mail'), ('notion', 'Notion');

INSERT INTO platform.connectors (name)
SELECT connector FROM platform.accounts
UNION SELECT connector FROM platform.connector_activations
UNION SELECT connector FROM platform.sim_outbox
ON CONFLICT (name) DO NOTHING;

-- 3. Les clés : un connecteur cité ne se supprime pas ; renommé, ses références suivent.
ALTER TABLE ONLY platform.accounts
    ADD CONSTRAINT accounts_connector_fkey FOREIGN KEY (connector) REFERENCES platform.connectors(name) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY platform.connector_activations
    ADD CONSTRAINT connector_activations_connector_fkey FOREIGN KEY (connector) REFERENCES platform.connectors(name) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY platform.sim_outbox
    ADD CONSTRAINT sim_outbox_connector_fkey FOREIGN KEY (connector) REFERENCES platform.connectors(name) ON UPDATE CASCADE ON DELETE RESTRICT;

-- 4. Le chiffré du secret d'un compte (coffre du paquet, H85) : `secret_ciphertext` n'est pas accordée en lecture à
--    `authenticated`, et cette fonction ne le rend qu'à un membre de l'organisation du compte (`member_orgs`, comme la
--    RLS) ; rien pour un autre, ni pour un compte sans secret. Le serveur de l'hôte le déchiffre pour le seul appel au
--    tiers (`runCall`) ; le service décide du compte avant de l'appeler.
CREATE FUNCTION platform.account_secret(p_account uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select a.secret_ciphertext from platform.accounts a
   where a.id = p_account and a.org_id in (select platform.member_orgs())
$$;

REVOKE ALL ON FUNCTION platform.account_secret(p_account uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.account_secret(p_account uuid) FROM anon;
GRANT EXECUTE ON FUNCTION platform.account_secret(p_account uuid) TO authenticated;

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   drop function platform.account_secret(uuid) ;
--   alter table platform.sim_outbox drop constraint sim_outbox_connector_fkey ;
--   alter table platform.connector_activations drop constraint connector_activations_connector_fkey ;
--   alter table platform.accounts drop constraint accounts_connector_fkey ;
--   drop table platform.connectors.
