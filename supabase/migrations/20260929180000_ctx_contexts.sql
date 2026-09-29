-- E11-S03 (lot a) : un code `ctx` ne périme plus par `orgs.rules_version`, mais par les Contextes qu'il a
-- servis (ADR-002 § 2 amendé, fiche D132). Réunie par le pilote dans la migration unique de 1.1.0 (fiches
-- D131, D124).
--
-- `contexts` garde, pour chaque Contexte que `context` attendait pour la personne (Tout le monde, son Privé,
-- chacune de ses équipes), la révision publiée lue à l'émission (0 : aucune), `{<chemin>: <révision>}` ; la
-- garde (`server/ctx.ts`) refuse le code quand l'un d'eux a changé de contenu servi depuis. Nul : code émis
-- avant cette colonne, périmé, sans reprise (HN-E11S03-4). Aucune `update` sur `ctx` : la garde ne réécrit
-- pas la ligne. Déclencheur `bump_rules_version`, `rules_version` et policies inchangés (HN-E11S03-3).
ALTER TABLE platform.ctx
    ADD COLUMN contexts jsonb,
    ADD CONSTRAINT ctx_contexts_check CHECK (((contexts IS NULL) OR (jsonb_typeof(contexts) = 'object'::text)));

COMMENT ON COLUMN platform.ctx.contexts IS 'Révision publiée de chaque Contexte attendu à l''émission, {chemin: révision} (0 : aucun) ; nul : émis avant la 1.1.0, périmé (E11-S03).';
