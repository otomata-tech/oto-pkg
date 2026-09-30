-- Version 1.1.3 du paquet : les migrations de la version, réunies dans ce fichier, chacune précédée d'une bannière
-- qui nomme sa story ; un seul bloc ROLLBACK en fin de fichier, les parties dans l'ordre inverse.

-- ====================================================================================================
-- Partie 1 : E11-S19, lot a (l'auteur d'un Contexte n'est plus refusé par sa propre écriture).
-- ====================================================================================================

-- E11-S19 (AC-a1, HN-E11S19-1) : après la publication d'un Contexte, `write` avance la ligne `ctx` de l'auteur à la
-- révision qu'il vient de publier (`acceptOwnContextWrite`, `server/ctx.ts`) ; sans elle, son appel suivant était
-- refusé `ctx_stale` par son propre changement. Jusqu'ici aucune `update` sur `ctx` : la garde ne réécrit pas la
-- ligne, seul ce geste le fait.
--
-- Une policy plutôt qu'une fonction `security definer` (`database-patterns.md § Règles`, SECURITY INVOKER par
-- défaut) : la RLS dit tout ce que la base garde, la ligne de l'appelant dans une de ses organisations ; le privilège
-- ne porte que sur la colonne `contexts`. Le reste (chemin attendu, révision précédente gardée, Contexte publié à la
-- révision dite) est décidé par le service, dans la requête (`security-patterns.md § Droits dans le service`).
-- Aucune table, colonne ni index.
DROP POLICY IF EXISTS ctx_update_own ON platform.ctx;
CREATE POLICY ctx_update_own ON platform.ctx FOR UPDATE TO authenticated
    USING (((user_id = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))))
    WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

GRANT UPDATE (contexts) ON TABLE platform.ctx TO authenticated;

-- ====================================================================================================
-- Partie 2 : E11-S18 (le chemin `functions` réservé, comme `journal`).
-- ====================================================================================================

-- E11-S18 (HN-E11S18-13) : `read {"path": "functions"}` liste les fonctions (E11-S19) ; `write` refuse ce chemin et
-- le service refuse ce slug d'équipe (`RESERVED_SLUGS`, `server/teams.ts`). La contrainte en est la seconde barrière,
-- recréée avec la liste d'avant plus `functions`. Une équipe dont le slug est déjà `functions` fait échouer cette
-- partie : son slug est figé (N38), l'hôte la renomme dans la base avant d'appliquer (`migrations/README.md`).
ALTER TABLE platform.teams DROP CONSTRAINT teams_slug_reserved, ADD CONSTRAINT teams_slug_reserved CHECK ((slug <> ALL (ARRAY['guide'::text, 'perso'::text, 'private'::text, 'contexte'::text, 'journal'::text, 'functions'::text])));

-- ROLLBACK: (jamais exécuté depuis le paquet) — les parties dans l'ordre inverse de ce fichier.
-- E11-S18 :
--   alter table platform.teams drop constraint teams_slug_reserved, add constraint teams_slug_reserved check ((slug <> all (array['guide'::text, 'perso'::text, 'private'::text, 'contexte'::text, 'journal'::text]))) ;
-- E11-S19, lot a :
--   revoke update (contexts) on table platform.ctx from authenticated ;
--   drop policy ctx_update_own on platform.ctx.
