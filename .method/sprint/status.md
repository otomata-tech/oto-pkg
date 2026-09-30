# Sprint Status

<!-- Ce qui reste ouvert après la V1, et seulement cela : une ligne sort quand elle est livrée (le
     changelog la reprend). L'état livré de chaque exigence est dans `docs/prd.md`. -->

Statuts : ⚪ Backlog · 🟢 Ready · 🔵 In progress · 🔴 Bloquée · 🟣 V2

## En cours

| ID | Titre | Statut |
|----|-------|--------|
| E01-S12 | Clôture de la V1 : dépôt propre, cohérent, sans nom réel | ✅ `@otomata_tech/oto_platform` 1.0.0 publié avec provenance (2026-09-29) ; oto-pkg public, oto-saas privé |
| E05-S13 | Retours du soir de JB : Contexte à l'écran en français, administration simplifiée, Équipes & accès sans Règles ni Accès plateforme, plusieurs responsables, équipe par défaut retirée, bout en bout sur organisation jetable | ✅ fusionné, bout en bout vert, Démo vidée |
| E11-S15 | Retours sur la 1.1.1 : écrans d'un contenu, éditeur et blocs, version corrective 1.1.2 | ✅ livrée dans la 1.1.2 (verify vert : 368 fichiers, 3 870 tests ; suites Supabase sur le projet de test : 155/155) |
| E11-S16 | `context` à l'échelle : trois candidates par titre et résumé, l'assistant arbitre (ADR-003 § 2 amendé), une nouveauté par contenu, procédures utiles au-delà de 15 par titre | ✅ livrée dans la 1.1.2 |
| E11-S17 | Sélection de blocs dans l'éditeur (lot a) ; éditeur visuel (lots 0, b à f) | ✅ lot a livré dans la 1.1.2 (sélection de blocs) ; lots 0, b à f reportés avec ADR-021 |

## Contenus riches et retours de la démo (epics E10 et E11) : 1.1.0 publiée, 1.1.1 corrective

Fiches D111 à D124, D131 à D150, ADR-016 à ADR-018, ADR-020. Livrées et fusionnées sur `main` (commits
`3a2cc5c` à `b0f6e04`, changelog des 2026-09-29 et 2026-09-30) : les quatre stories d'E10 (S04, S01, S06,
S02) et les neuf d'E11 (S04, S09, S03, S10, S01, S02, S05, S06, S07), avec le harnais de test sans Supabase
(E11-S14). Version 1.1.0 préparée (changelog du 2026-09-30) : `version` 1.1.0 du paquet,
`## 1.1.0 — 2026-09-30` de son `CHANGELOG.md`, et les six migrations de la vague (E11-S04, E11-S10, E10-S04,
E11-S03, E11-S02, E10-S02) réunies en `20260930100000_v1_1_0.sql` au contenu identique (D124, D145).
Version mineure, cassante sur les adresses (ADR-020, D131) : sa PR Renovate se relit à la main chez
l'hôte (D121) : `renovate/preset.json` ne fusionne seules que les correctives, une mineure attend
une revue sous le label `oto-platform-minor`. 1.1.0 publiée, mais ne se construit pas chez un hôte ;
1.1.1 corrective en cours (changelog du 2026-09-30), tag et suites aux actions de JB ci-dessous ; 1.1.2
corrective (E11-S15, E11-S16, E11-S17 lot a) publiée ; restes sans urgence : M86 à M88, M90 à M96.

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
| M24 | `lockWaitOf` commun aux tests ; le chemin des migrations du paquet exporté une fois ; `tests/integration/sql-session.test.ts` passe `${JSON.stringify(…)}` dans un gabarit, contre `database-patterns.md § Paramètres des requêtes (postgres.js)`. |
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
| M76 | `tests/unit/hooks.test.ts` (verify-receipt, `git add` d'un fichier de `src/lib/utils`) et `tests/unit/ui-boundary.test.ts` (délai de 30 s sur le premier `lintText`) échouent quand d'autres sessions travaillent dans le même checkout ou que la RAM manque : isoler le fichier de brouillon hors de l'arbre suivi et relever le délai ou charger la config une fois. |
| M77 | E10-S01 : une panne de la relecture du propriétaire que `writeNode` fait après `publish_node` (`finish`, `server/nodes/write.ts`) fait sortir `createTable` (`server/tables/import.ts`) sans `details.created`, le tableau déjà publié (HN-E10S01-21). |
| M78 | E10-S01 : les 5 000 lignes d'un `table.import` s'écrivent une requête à la fois ; mesurer un import complet contre `maxDuration`. |
| M80 | E10-S04 : dans l'éditeur, un élément racine d'une liste dont le texte commence par deux espaces est relu en sous-élément à la frappe (`elementsLus`, `ui/noeud/editeur/modele.ts`). |
| M81 | E10-S04 : le littéral `.max(500)` des éléments d'une `list` (`schemas/blocks.ts`) est redondant : la borne `LIST_ITEMS_MAX`, du même fichier, compte déjà tous les éléments, sous-éléments compris. |
| M82 | E10-S04 : `beforeOpenFence` (`server/context/engine.ts` depuis E11-S03) lit ses clôtures par `openingFence` et `closesFence` (`schemas/link-syntax.ts`) ; sans cela, la coupe d'un Contexte ne reconnaît que les clôtures d'accents graves sans retrait ; coût : un test de `context` sur une clôture `~~~` coupée. |
| M83 | E10-S01 : le cas « dashes under text » de `tests/unit/nodes-parse-tolerant.test.ts` (textes hostiles, moins d'une seconde) s'approche de sa borne de temps sous charge : le stabiliser. |
| M84 | `choix-de-bloc.tsx` (E10-S06) l. 52, 57, 76-84 : reprendre `useOptionActive` d'E11-S06 (`ui/noeud/editeur/citer.tsx`), l'aide commune du clavier d'une liste d'options. |
| M85 | Un mode sans Supabase pour `org:export`, `org:import`, `test:cleanup` et `oauth:clients` (hors périmètre d'E11-S14) : leurs suites restent gardées par le projet (`tests/unit/gardes-supabase.test.ts`). Avec lui, E11-S14 lot c : deux lancements de `scripts/demo-seed.mjs` ne verrouillent pas encore le mode Supabase par `PLATFORM_OIDC_ISSUER: ""` (`tests/unit/demo-seed.test.ts`, cas « missing variables » ; `tests/integration/org-transfer.test.ts` l. 280) : cette variable posée dans `.env.local`, ils passeraient en mode OIDC. |
| M86 | E10-S02 : les objets du stockage qui perdent leur ligne `files` sans passer par la purge restent orphelins dans le bucket : nœuds supprimés par `forget_user`, organisation supprimée en SQL (la cascade emporte les lignes), `pnpm test:cleanup` et `pnpm demo:seed` ; les supprimer par préfixe `<org_id>/` (ou lire les clés avant la suppression). |
| M87 | E10-S02 : `pnpm org:export --force` vide `<fichier>.files/` avant d'écrire les objets (HN-E10S02-112), et une panne du stockage en cours lève avant le JSON (HN-E10S02-87) : l'ancien JSON reste à côté d'objets en partie réécrits. Écrire dans un dossier temporaire, puis remplacer JSON et dossier ensemble. |
| M88 | E10-S02 : CI du paquet : un service MinIO dans le job d'intégration, pour l'adaptateur S3 réel (SigV4, `copy`, URL signées ; les tests n'ont que l'adaptateur en mémoire) ; la spec d'isolation du HTML (`tests/e2e/e10s02-voir.spec.ts`, F1 à F16, O1 à O7) en Playwright, qui se saute sans stockage. |
| M90 | E11-S02 : `server/tables/import.ts:188` : reprendre `heldByOther` de `row-store.ts` (troisième copie du prédicat). |
| M91 | E11-S02 : `ui/noeud/en-tete-modifiable.tsx` l. 10-11 : le commentaire dit encore qu'un nœud neuf est « jamais publié » ; `FileDOperations` : `brouillon` et `ecrit` de l'instantané sans lecteur ; `EN_TETE.enregistre`, `EN_TETE.aRenvoyer` morts. |
| M92 | Cycles d'imports hors de la garde de `tests/unit/import-cycles.test.ts` (`coding-standards.md § Imports`) : `ui/noeud/editeur/actions.ts` ↔ `gestes-des-fichiers.ts` et ↔ `gestes-du-menu.ts`, `server/files/store.ts` ↔ `s3.ts`. Aucun ne lit de valeur au chargement aujourd'hui ; les casser, puis ajouter `ui` et `server` à `GUARDED_FACES`. |
| M93 | La ligne de base V1 ne s'installe pas par `supabase db push` sur un projet Supabase où `pg_trgm` existe déjà (`permission denied to set parameter "pg_trgm.similarity_threshold"`, 42501 : la bibliothèque n'est pas chargée dans la session) ; contournement écrit dans `packages/plateforme/migrations/README.md` (Installer sur un hôte neuf). Corriger dans la ligne de base elle-même n'est pas possible (fichier appliqué, figé) : `db prepare` ou une migration préalable qui charge la bibliothèque, à décider ; puis un test sur un Postgres où l'extension préexiste. |
| M94 | E11-S15 (HN-E11S15-a6) : le résumé que la base pose sur un Contexte d'équipe ou de Tout le monde (déclencheur de `20260928100000_platform_base_v1.sql`, `20260929090000_platform_e05s13.sql`, script `scripts/demo/30-arbre.mjs`) dit encore « Ce que les assistants… » : le passer à « Ce que votre Claude/ChatGPT/Mistral… » par une migration (et la reprise des résumés posés), dans une 1.2.0. |
| M95 | E11-S15 (AC-b3) : une image garde ses proportions par `h-auto` et `object-contain`, sans `height` ; la cause de l'étirement observé en 1.1.1 n'est établie que dans le code : la confirmer à la campagne visuelle (M96), à chaque largeur (`small`, `medium`, `full`), et la reprendre si l'image s'étire encore. |
| M96 | E11-S15 : campagne visuelle, dans les deux thèmes, d'AC-a3 (zoom 110, 125 et 150 % : page centrée, sans défilement horizontal), AC-a4 (« Partager sur le web » ancré, entier, borné à 70 %), AC-a5 (filet entre les étapes de `/connect` et de « Brancher »), AC-a8 (explication de la vue « Contexte ») et AC-b7 (aucun soulignement rouge en éditant un lien) ; les causes d'a3, a4 et b7 n'y sont établies que dans le code. |

## Actions réservées à JB

| Quand | Action |
|-------|--------|
| Fin de la V1 (D126) | oto-saas se déploie chez Scaleway (responsable du déploiement, `docs/deploiement.md § 3` d'oto-saas) ; le projet Vercel reste sur l'archive jusque-là. Désactiver le service Windows `postgresql-x64-16` du poste. |
| Après la ligne de base V1 | `supabase migration repair` sur le projet du premier client, par la procédure de `packages/plateforme/migrations/README.md` (notre projet est réparé). |
| Sur le poste | Désactiver le service Windows `postgresql-x64-16`, inutilisé par la base de test locale. |
| Maintenant | Renouveler les secrets de la production (clé secrète, mot de passe de la base, mot de passe `platform_app`), puis mettre à jour le `.env.local` d'oto-saas et les variables de Vercel : ils ne vivent plus que là (le `.env.local` d'oto-pkg vise le projet de test). |
| Projet de test séparé, migré et réglé | Sur le projet de test : jouer les suites propres à Supabase (`tests/integration/mcp-read-write.test.ts`, `isolation/contenu`, `e11s02-brouillons-et-suppression`, `espace-prive`) et les specs e2e `e10s04-markdown`, `import-de-fichiers` et `e10s06-editeur`, avec leur contrôle visuel dans les deux thèmes ; poser le bucket et les clés S3 du projet de test pour les specs de fichiers (ligne « Avant la campagne visuelle d'E10-S02 ») et son SMTP pour la limite d'emails d'Auth. |
| Avant la campagne visuelle d'E10-S02 | Bucket privé du SaaS (Scaleway, ou Supabase Storage par son point d'accès S3) et ses clés d'accès S3, règles CORS (`PUT` et `GET` depuis chaque adresse de l'application, en-tête `content-type` : README du paquet), cinq variables `PLATFORM_STORAGE_*` du projet (ADR-016 § 2). |
| Après le bucket et la migration de 1.1.0 | Jouer `tests/e2e/e10s02-voir.spec.ts` (AC-c6, F1 à F16 et O1 à O7, en-têtes reçus, « Voir », lien public ; sautée sans stockage) et la campagne de dépôt sur le bucket réel (image, PDF, `.html` : déposer, voir, relire, voir par un lien public), avec le contrôle visuel dans les deux thèmes ; AC-f17 : banc sur claude.ai (artefact publié, `source_url`) et ChatGPT (formulaire) avec un rapport HTML de 100 ko, résultat noté dans `docs/mcp-golden-queries.md` ; rejouer les golden queries qui mènent à `read` et à `call` (descriptions allongées, journal des révisions du 2026-09-30). |
| Quand JB le veut | Trancher la fiche D118 (duplication d'une page qui a des fichiers) : la story avance sous l'option recommandée, la copie des objets. |
| Après la fusion d'E11-S07 | Projet Supabase de test : ajouter `/auth/confirm` aux adresses de retour autorisées (`uri_allow_list`, `pnpm auth:settings --to <ref> --site-url <url> --redirect <motif> --apply`), puis retirer à la main le motif de `/auth/confirmer`. oto-saas, en prenant la version : renommer ses dossiers de routes, monter l'API sous `api/platform/[...route]`, mettre à jour son middleware (`/auth/confirm` public) et l'exclusion d'en-têtes des routes HTML (`api/platform/…/html`). Renvoyer les invitations en attente de Démo, dont le lien vise `/auth/confirmer` (404). |
| Maintenant | Variables Vercel d'oto-saas : le bucket nommé est `platform-files`, qui n'existe pas (`NoSuchBucket` au dépôt d'un fichier ou d'une image) ; celui du projet est `oto-platform-files` : corriger la variable, puis redéployer. |
| 1.1.2 commitée et poussée, CI verte | Tag `v1.1.2` (`README.md § Publier une version`), puis `npm view @otomata_tech/oto_platform@1.1.2 version` ; oto-saas : monter à 1.1.2 (corrective, aucune migration). |
| 1.1.1 commitée et poussée, CI verte (job `packed-host-build` compris) | Tag `v1.1.1` (`README.md § Publier une version`), puis `npm view @otomata_tech/oto_platform@1.1.1 version`. oto-saas : monter directement de 1.0.0 à 1.1.1 (1.1.0 ne se construit pas chez un hôte) ; relire à la main (mineure cassante sur les adresses, ADR-020, D121, D131 ; renommages : ligne « Après la fusion d'E11-S07 »), `oto-platform migrations sync`, application de `20260930100000_v1_1_0.sql` à sa base (la production), puis `pnpm build`. |
| Après la publication de 1.1.1 | E11-S09 AC-15 : banc Le Chat (signature `initialize` de Mistral relevée, puis la ligne de `hostFamily`) ; bancs d'E10-S02 AC-f17 sur claude.ai et ChatGPT (ligne « Après le bucket et la migration de 1.1.0 »). |
| Avant le premier client | Remettre les limites de débit d'Auth du projet Supabase à leurs valeurs par défaut (inscriptions, connexions et vérifications 30, rafraîchissements 150, par 5 minutes et par IP). |
| Au premier client | Test d'installation réel du paquet publié dans l'ERP du premier client ; chaque écart devient une story ; réglages d'Auth par `pnpm auth:settings`, `platform` retiré du Data API par `pnpm data-api:close`. |
