# Sprint Status

<!-- Ce qui reste ouvert après la V1, et seulement cela : une ligne sort quand elle est livrée (le
     changelog la reprend). L'état livré de chaque exigence est dans `docs/prd.md`. -->

Statuts : ⚪ Backlog · 🟢 Ready · 🔵 In progress · 🔴 Bloquée · 🟣 V2

## En cours

| ID | Titre | Statut |
|----|-------|--------|
| E01-S12 | Clôture de la V1 : dépôt propre, cohérent, sans nom réel | ✅ `@otomata_tech/oto_platform` 1.0.0 publié avec provenance (2026-09-29) ; oto-pkg public, oto-saas privé |
| E05-S13 | Retours du soir de JB : Contexte à l'écran en français, administration simplifiée, Équipes & accès sans Règles ni Accès plateforme, plusieurs responsables, équipe par défaut retirée, bout en bout sur organisation jetable | ✅ fusionné, bout en bout vert, Démo vidée |

## Contenus riches et retours de la démo (epics E10 et E11, après le tag `v1.0.0`)

Fiches D111 à D124, D131 à D134, D137, ADR-016 à ADR-018. Les quatre stories modifient les mêmes fichiers de blocs
(`schemas/blocks.ts`, `schemas/blocks-render.ts`, `server/nodes/markdown-parse.ts`,
`ui/noeud/rendu-des-blocs.tsx`, l'éditeur) : elles passent l'une après l'autre, dans cet ordre.

| Ordre | ID | Titre | Est. | Ⓜ | Dépend de | Statut |
|-------|----|-------|------|---|-----------|--------|
| 1 | E10-S04 | Compatibilité markdown des pages : tableau simple, séparateur, repli, listes imbriquées, titres à cinq niveaux, texte en ligne (mode strict) | L | Ⓜ | E05-S11, M67 | 🟢 Ready |
| 2 | E10-S01 | Markdown et CSV : coller, importer, exporter ; mode tolérant ; `table.import` ; « Convertir en tableau de données » | L | | E10-S04, E07-S04 | 🟢 Ready |
| 3 | E10-S06 | Éditeur des blocs de page : choix du « + » et de `/`, tableau simple, séparateur, repli, `Tab` dans les listes, préfixes de titre | L | | E10-S04, E10-S01 | 🟢 Ready |
| 4 | E10-S02 | Fichiers : port S3 (ADR-016), bloc `file`, images, « Voir » (HTML isolé, ADR-017), `read {file}`, dépôt par lien (`upload.link`, ADR-018) ; absorbe E10-S03 et E10-S05 (D137) | XL | Ⓜ | E10-S04, E10-S01, E10-S06 | 🟢 Ready (action JB avant la campagne visuelle) |

Retours de la démo (epic E11, fiches D131 à D136, rapport de tests FB-0001 à FB-0010, retours
d'écran du 2026-09-29). Neuf stories, longues à dessein. Deux stories en cours ne touchent jamais le
même fichier source (`vagues.md § Parallélisme`), ni un fichier d'une story E10 en cours : l'ordre
suit la matrice des fichiers communs, et la mémoire du poste ne laisse qu'un créneau aux commandes
lourdes.

| Vague | ID | Titre | Est. | Ⓜ | Dépend de | Statut |
|-------|----|-------|------|---|-----------|--------|
| 1 | E11-S04 | Routage des procédures : trois candidates proposées, égalités, formulations, fautes de frappe (routage et `find`, M58) | L | Ⓜ | — | ✅ approuvée, fusionnée sur main (non commitée) |
| 1 | E11-S09 | Brancher mon Claude, ChatGPT ou Mistral : un guide par onglet, grande fenêtre et `/connect` | M | | — | ✅ approuvée, fusionnée sur main (non commitée) ; AC-15 en attente (banc Le Chat) |
| 2 | E11-S03 | Contexte et conversations : invalidation ciblée des ctx, plafond seul et coupe dite, déplacer et compléter une liste | L | Ⓜ | E11-S04 (fichiers communs) ; lot c : E10-S04 | 🟢 Ready |
| 2 | E11-S10 | Rail : espace Privé dès la première connexion, équipes où l'on est membre, créateur inscrit, vue Contexte dans le menu | L | Ⓜ | E11-S09 (accueil) ; E10-S01 (`ui/coque/`) | 🟢 Ready |
| 3 | E11-S01 | Tableaux : créer sans écraser, colonne stricte, recherche par mots, révision et auteur, revue par l'agent, preuve par tableau, réglages à l'écran | L | | E10-S01 (fichiers des tableaux) ; lot g après E11-S02 | 🟢 Ready (lots a à f en vague 3, lot g en vague 4 après S02) |
| 4 | E11-S02 | Publication directe, brouillons refusés, corbeille et suppression de lignes depuis un assistant | L | Ⓜ | E11-S01, E11-S03 | 🟢 Ready |
| 5 | E11-S05 | Écrans d'un contenu : encarts repliables à droite, cellules, lignes à revoir, télécharger, résumé, page et tableau vides | L | | E10-S01, E10-S06, E11-S01, E11-S02, E11-S10 | 🟢 Ready |
| 5 | E11-S06 | Éditeur : une puce par élément de liste, modifier un lien dans un panneau | M | | E10-S04, E10-S06 | 🟢 Ready |
| 2 | E11-S14 | Harnais de test sans Supabase : 16 suites sur Postgres nu, 7 gardent le projet | L | | lot a : — ; lot b : E11-S03, E11-S10 ; lot c : E10-S02, E10-S04 | 🔵 In progress (lot a, worktree `e11-s14`) |
| 6 | E11-S07 | Adresses en anglais : routes, paramètres, ancres, préfixe d'API | L | | toutes les autres | 🟢 Ready (cassante) |

- **Livraison** : une seule version, 1.0.1, pour les quatre stories d'E10 et les neuf d'E11 (fiche
  D131), sans drapeau ni alias d'anciennes adresses. Le tag part quand toutes sont fusionnées, dans
  le dépôt du paquet. Version corrective : le preset Renovate la fusionne seule chez l'hôte si la CI
  est verte ; la PR de l'hôte se relit à la main (adresses renommées, migration).
- **`### Hosts` du `CHANGELOG.md` du paquet** : une seule migration (D124), à copier par
  `oto-platform migrations sync` puis à appliquer ; titres de niveau 2 et 3 un cran plus bas ; cinq
  variables `PLATFORM_STORAGE_*`, facultatives (sans elles, fichiers désactivés ; bucket privé et
  CORS : README) ; `X-Frame-Options` et `Referrer-Policy` globaux exclus des deux routes HTML ;
  liste d'outils à rafraîchir dans les hosts (champ `file` de `read`, D119).
- **Migrations** : une Ⓜ appliquée à la fois au projet de test, dans l'ordre de ses horodatages,
  toutes additives ; avant le tag `v1.0.1`, le pilote réunit celles d'E10 (S04, S02) et
  d'E11 (S02, S03, S04, S10) en un seul fichier `<horodatage>_v1_0_1.sql` au contenu identique, puis
  répare l'historique du projet de test (D124).
- **CI du paquet** : un service MinIO dans le job d'intégration (adaptateur S3 réel : SigV4, `copy`,
  URL signées) ; le test d'isolation du HTML (E10-S02) en Playwright.

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
| Après la fusion des stories d'E10 et d'E11 | Tag `v1.0.1` (après la fusion de leurs migrations, D131) ; dans le dépôt SaaS, relire à la main la PR Renovate de cette version (adresses renommées) et renommer les routes de l'hôte. |
| Avant le premier client | Remettre les limites de débit d'Auth du projet Supabase à leurs valeurs par défaut (inscriptions, connexions et vérifications 30, rafraîchissements 150, par 5 minutes et par IP). |
| Au premier client | Test d'installation réel du paquet publié dans l'ERP du premier client ; chaque écart devient une story ; réglages d'Auth par `pnpm auth:settings`, `platform` retiré du Data API par `pnpm data-api:close`. |
