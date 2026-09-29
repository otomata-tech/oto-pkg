# Sprint Status

<!-- Ce qui reste ouvert après la V1, et seulement cela : une ligne sort quand elle est livrée (le
     changelog la reprend). L'état livré de chaque exigence est dans `docs/prd.md`. -->

Statuts : ⚪ Backlog · 🟢 Ready · 🔵 In progress · 🔴 Bloquée · 🟣 V2

## En cours

| ID | Titre | Statut |
|----|-------|--------|
| E01-S12 | Clôture de la V1 : dépôt propre, cohérent, sans nom réel | ✅ `@otomata_tech/oto_platform` 1.0.0 publié avec provenance (2026-09-29) ; oto-pkg public, oto-saas privé |
| E05-S13 | Retours du soir de JB : Contexte à l'écran en français, administration simplifiée, Équipes & accès sans Règles ni Accès plateforme, plusieurs responsables, équipe par défaut retirée, bout en bout sur organisation jetable | ✅ fusionné, bout en bout vert, Démo vidée |

## Contenus riches (epic E10, après le tag `v1.0.0`)

Fiches D111 à D124, ADR-016 à ADR-018. Les six stories modifient les mêmes fichiers de blocs
(`schemas/blocks.ts`, `schemas/blocks-render.ts`, `server/nodes/markdown-parse.ts`,
`ui/noeud/rendu-des-blocs.tsx`, l'éditeur) : elles passent l'une après l'autre, dans cet ordre.

| Ordre | ID | Titre | Est. | Ⓜ | Dépend de | Statut |
|-------|----|-------|------|---|-----------|--------|
| 1 | E10-S04 | Compatibilité markdown des pages : tableau simple, séparateur, repli, listes imbriquées, titres à cinq niveaux, texte en ligne (mode strict) | L | Ⓜ | E05-S11, M67 | 🟢 Ready |
| 2 | E10-S01 | Markdown et CSV : coller, importer, exporter ; mode tolérant ; `table.import` ; « Convertir en tableau de données » | L | | E10-S04, E07-S04 | 🟢 Ready |
| 3 | E10-S06 | Éditeur des blocs de page : choix du « + » et de `/`, tableau simple, séparateur, repli, `Tab` dans les listes, préfixes de titre | L | | E10-S04, E10-S01 | 🟢 Ready |
| 4 | E10-S02 | Fichiers et images : port S3 (ADR-016), téléversement, bloc `file`, copie à la duplication | L | Ⓜ | E10-S04, E10-S01, E10-S06 | 🟢 Ready (action JB avant la campagne visuelle) |
| 5 | E10-S03 | Bloc `html` : artefacts isolés (ADR-017), page à un seul bloc, lien public, `read {block}` | L | Ⓜ | E10-S04, E10-S01, E10-S06, E10-S02 | 🟢 Ready |
| 6 | E10-S05 | Dépôt par lien à usage unique : `upload.link` et `curl` (ADR-018) | M | Ⓜ | E10-S01, E10-S03 | 🟢 Ready |

- **Livraison** : une seule version, 1.1.0, pour les six (fiche D123), sans drapeau ; chez l'hôte, la
  version mineure se relit avant fusion (fiche D121). Le tag part quand les six sont fusionnées, dans
  le dépôt du paquet. Avant lui, `renovate/preset.json` et le README du paquet ne laissent
  fusionner seules que les versions correctives (le preset fusionne encore les mineures).
- **`### Hosts` du `CHANGELOG.md` du paquet** : une seule migration (D124), à copier par
  `oto-platform migrations sync` puis à appliquer ; titres de niveau 2 et 3 un cran plus bas ; cinq
  variables `PLATFORM_STORAGE_*`, facultatives (sans elles, fichiers désactivés ; bucket privé et
  CORS : README) ; `X-Frame-Options` et `Referrer-Policy` globaux exclus des deux routes HTML ;
  liste d'outils à rafraîchir dans les hosts (champ `block` de `read`, D119).
- **Migrations** : une Ⓜ appliquée à la fois au projet de test, dans l'ordre de ses horodatages,
  toutes additives ; avant le tag `v1.1.0`, le pilote réunit les quatre (S04, S02, S03, S05) en un
  seul fichier `<horodatage>_v1_1_0.sql` au contenu identique, puis répare l'historique du projet de
  test (D124).
- **CI du paquet** : un service MinIO dans le job d'intégration (adaptateur S3 réel : SigV4, `copy`,
  URL signées) ; le test d'isolation du HTML (E10-S03) en Playwright.

## Stories V2 (marquées, non planifiées)

| ID | Titre | Remplace ou prolonge |
|----|-------|----------------------|
| E04-S02 | Client du service connecteurs et Sellsy réel | — |
| E04-S03 | Connecteur mail réel | le `mail` simulé de la V1 |
| E04-S05 | Comptes tiers et coffre (AES-GCM, OAuth ou clé du tiers, santé) | — |
| E05-S06 | Écran Connecteurs | — |
| E05-S11 g | Traduction des écrans (fiche D105) | les écrans en français de la V1 |
| E06-S03 | Pilote V2 : relance des devis réelle (Sellsy, mail) | — |
| E08-S08 | Sondes de santé et alertes des comptes | — |
| E08-S10 | Registre central des versions de plusieurs applications | — |

## Tâches de suite ouvertes

Sans story, sans urgence sauf mention. L'identifiant reste celui que citent les commentaires du code.

| ID | Tâche |
|----|-------|
| M11c | Élagage des tests au minimum vital (`testing-strategy.md § Budget de tests`), même grille que les passes précédentes : les fichiers postérieurs au dernier élagage et les tests que la suite d'isolation rend redondants ; un agent classe chaque fichier (garder, fusionner, retirer), JB valide la liste avant toute suppression. |
| M13 | Suites de revue sans urgence : formes de commande qui passent encore le gate sans marqueur (`Git push`, `git.exe push`, `$r = (git push)`, `{git push}`) et faux positifs (`*>&1`, `Out-File` d'un objet contenant `vitest`, heredoc de markdown qui écrit « (git push ») ; gate ouvert si `scripts/verify-receipt.mjs` ne se charge pas ; lectures sans borne (`teamRoster`, équipes de `checkName`, `listPrompts`) ; conflits écrits en ligne à passer par `changedMeanwhile` ; lectures par pages communes (`readPages`, `readIn`) ; doublons entre la porte MCP et le MCP admin. |
| M15b | Suites de revue sans urgence : commentaires de `server/` que l'isolation par organisation a rendus faux ; une aide « lignes d'une organisation dans une table de la carte » à côté de `TABLES` ; `positionBetween` sans appelant ; garde `isJsonObject` en double ; un seul mécanisme de concurrence dans la base simulée ; aides de test recopiées ; rapport Playwright en `line` (le rapport HTML garde les saisies). |
| M18b | Curseur pour les listes au-delà de 200 éléments (décision à prendre) ; upsert et vue du sujet des règles (`server/rules.ts`) ; curseur (instant, id) commun à `server/feedback.ts`, `server/usage.ts` et `server/admin/journal.ts`. |
| M20b | `DirectoryEntry.email` et `StaffEntry` en `string \| null` avec leurs vues ; les textes qui impriment « null » pour un email absent ; `server/admin/grants.ts` sur `sameEmail` ; le libellé `user <sub>` partagé avec `memberDirectory`. |
| M24 | `lockWaitOf` commun aux tests ; un signataire de jetons commun aux suites MCP et API ; le chemin des migrations du paquet exporté une fois ; `tests/integration/sql-session.test.ts` passe `${JSON.stringify(…)}` dans un gabarit, contre `database-patterns.md § Paramètres des requêtes (postgres.js)`. |
| M25 | Aides de la base de test : `seed.cleanup` qui réunit ses deux erreurs, `valuesOf` qui lève sur une colonne inconnue, `ref.write` qui refuse `admin_journal` hors de la base admin, le nom de l'appelant passé aussi sur Postgres nu par `personDb`. |
| M51 | Avant un déploiement hors de Vercel : l'image du conteneur (`output: "standalone"`, `Dockerfile`), dans le dépôt du SaaS. |
| M52 | Restes de la reprise des écrans : export de `recentDocuments` par `./server` (contenus récents de l'accueil), `connexionsDe` en double entre `/` et `/connect`, lien d'évitement `#main-content` qui vise le `<main>` du contenu, `/auth/confirmer` au `Button` du design system, aides des specs e2e à factoriser. |
| M56 | Deux `table.write` qui prennent les mêmes lignes dans des ordres contraires peuvent s'interbloquer : écrire les lignes d'un appel dans un ordre commun. |
| M57 | `check:framework` refuse tout caractère invisible ou combinant écrit tel quel (catégories Cf, Co, Zl, Zp, marques combinantes isolées) dans `packages/`, `src/`, `tests/`, `scripts/`, avec son test. |
| M58 | `search_content` et `route_candidates` excluent la corbeille en SQL avant la coupe à 50 lignes. |
| M60 | Mesurer `prepare: true` de `server/sql.ts` sur Supavisor en mode transaction (40 → 22 ms par requête mesurés sur le pooler) ; les quatre lectures de `personInOrg` (`server/identity.ts`) en une instruction ; `lireLesEquipes` au lieu de `listTeams` dans `equipes`, `journal`, `admin/usage`, `admin/connecteurs`. |
| M61 | Une seule copie d'`aplatir` (`ui/arbre/depuis-l-arbre.ts`, `ui/noeud/sous-pages.tsx`) ; code mort `AIDE_DU_RESUME` et prop `aideDuResume` ; `ProcedureDuNoeud` et `ApercuDUnePhrase` sans appelant ; commentaire de `tests/e2e/e05s10b.spec.ts` (Démo n'a qu'un membre). |
| M62 | Suites de la base de test locale : ménage des bases `test_agent_*` du Postgres du poste. |
| M65 | Retirer `RailThemePicker`, les écrans Marque, Drapeaux et Accès plateforme et leurs clés d'adresse (HN-E05S11-15). |
| M66 | `ContenusLies` (`ui/noeud/sous-pages.tsx`) recopie les sous-pages dans son repli pendant le flux (`portage-ecrans.md § 2`). |
| M69 | Après un déplacement par « ⋯ », le focus tombe sur le document (le « ⋯ » disparaît) : le rendre au nœud déplacé ou à sa ligne. |
| M70 | Fiche D125 pour toute création : une création titrée d'un assistant sur un chemin tenu par un nœud invisible ou à la corbeille refuse encore (`conflict`) au lieu de prendre le premier chemin libre ; branche `context` inatteignable de `createsElsewhere` (`write.ts`) à retirer ou dire défensive. |
| M72 | Vue « Contexte » de l'accueil : pour un Contexte écrivable, la ligne « Not loaded: … » (échec de lecture des Contextes) est masquée par l'éditeur, comme l'étaient les listes avant M71. |
| M73 | Suites d'E05-S13 : `default_team_id` et `lead_user_id` vidés, à retirer en 1.1 ; services et API des règles d'accès et des accès plateforme sans écran client ; `EcranUsage` et `usageSummary` sans page ; `Onglets.titre` mort ; lignes de faits et de connecteurs du Contexte en anglais à l'écran (traduction : ADR-015). |
| M74 | `oto-platform migrations sync` compare les copies de l'hôte octet pour octet : sur un checkout Windows (autocrlf), les copies en CRLF diffèrent toutes du paquet (LF) et la commande refuse d'écrire. Comparer sans les retours chariot, et dire dans le README des migrations d'ajouter `supabase/migrations/*.sql text eol=lf` au `.gitattributes` de l'hôte (fait dans oto-saas). |

## Actions réservées à JB

| Quand | Action |
|-------|--------|
| Fin de la V1 (D126) | oto-saas se déploie chez Scaleway (responsable du déploiement, `docs/deploiement.md § 3` d'oto-saas) ; le projet Vercel reste sur l'archive jusque-là. Désactiver le service Windows `postgresql-x64-16` du poste. |
| Après la ligne de base V1 | `supabase migration repair` sur le projet du premier client, par la procédure de `packages/plateforme/migrations/README.md` (notre projet est réparé). |
| Sur le poste | Désactiver le service Windows `postgresql-x64-16`, inutilisé par la base de test locale. |
| Avant la campagne visuelle d'E10-S02 | Bucket du SaaS (Scaleway, ou Supabase Storage par son point d'accès S3), règles CORS et variables `PLATFORM_STORAGE_*`. |
| Après la fusion des six stories d'E10 | Tag `v1.1.0` (après la fusion de leurs migrations) ; dans le dépôt SaaS, Renovate réglé pour ne fusionner seules que les versions correctives (fiche D121). |
| Avant le premier client | Remettre les limites de débit d'Auth du projet Supabase à leurs valeurs par défaut (inscriptions, connexions et vérifications 30, rafraîchissements 150, par 5 minutes et par IP). |
| Au premier client | Test d'installation réel du paquet publié dans l'ERP du premier client ; chaque écart devient une story ; réglages d'Auth par `pnpm auth:settings`, `platform` retiré du Data API par `pnpm data-api:close`. |
