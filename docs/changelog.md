# Changelog

<!-- Ce fichier est mis à jour à chaque commit via /dev.
     Format de chaque entrée :

## [Date] — [Scope]
**Quoi :** Ce qui a été fait
**Pourquoi :** La raison / la story / le bug
**Problèmes :** Ce qui a bloqué et comment c'a été résolu (si applicable)
**Fichiers :** Liste des fichiers créés/modifiés
-->

## [2026-09-29] — Connecteurs dans le paquet (ADR-019)

**Quoi :** ADR-019 : les connecteurs réels s'écrivent en TypeScript dans le paquet (`server/connectors/`), sans service connecteurs séparé ; ADR-007 § 1, § 2 et § 4 remplacés ; fiche D129 ; architecture, PRD (NFR-ADMIN-01 comprise) et stories E04-S02, E04-S03, E04-S05 alignés.

**Pourquoi :** décision de JB à la reprise des connecteurs.

**Fichiers :** `docs/decisions/ADR-019-connecteurs-dans-le-paquet.md`, `docs/decisions/ADR-007-*.md`, `docs/decisions/fiche-decisions.md`, `docs/architecture.md`, `docs/prd.md`, `docs/stories/E04-S0{2,3,5}-*.md`.

## [2026-09-28] — E05-S13 : retours du soir de JB

**Quoi :** A : l'encart du Contexte de Tout le monde dans Organisation liste ses contenus liés ; vue Contexte et encart sans tailles ni états ; parties en lecture seule en cartes et en français ; « À quoi sert cette page » en deux phrases par portée. B : un seul nom d'organisation, plus de domaines (écran et texte servi) ; Usage caché, Retours réservés à l'équipe plateforme, Journal dans les réglages ; « Suppr. définitivement le » ; le titre d'une section du rail la plie ; « Déplacer » retiré de l'en-tête ; « Commencer à écrire ». M (migration `20260929090000`) : Équipes & accès sans « Règles d'accès » ni « Accès plateforme » ; plusieurs responsables par équipe ; équipe par défaut retirée des écrans et des services (colonne vidée, retirée en 1.1) ; résumés des Contextes au modèle de JB. E : les campagnes Playwright tournent sur une organisation jetable, plus sur Démo.

**Pourquoi :** retours de JB du 2026-09-28 au soir (fiches D127, D128).

**Fichiers :** `packages/plateforme/{migrations,server,schemas,mcp,api,ui}/`, `supabase/migrations/`, `src/app/(dashboard)/`, `scripts/`, `tests/`, `playwright.config.ts` ; pilote : registre, `testing-strategy.md`, hypothèses, golden queries, `status.md` (M73), CHANGELOG du paquet.

## [2026-09-28] — Outillage de la coupe : reçu sans commit, licence et liste de refus

**Quoi :** `verify-receipt` compte les fichiers indexés dans un dépôt sans commit (le commit initial d'oto-pkg et d'oto-saas était refusé après `git add -A`) ; `check-public` n'applique pas la liste de refus au contenu d'un fichier `LICENSE` (clôture E01-S12 e, ADR-010 § 4), les règles de secrets toujours. Décision D126 : oto-saas déployé chez Scaleway par le responsable du déploiement.

**Pourquoi :** coupe à blanc du 2026-09-28.

**Fichiers :** `scripts/verify-receipt.mjs`, `scripts/check-public.mjs`, `tests/unit/{hooks,check-public}.test.ts`, `docs/decisions/fiche-decisions.md`.

## [2026-09-28] — M71 et version 1.0.0 du paquet

**Quoi :** M71 (bug JB) : dans l'onglet Contexte de l'accueil, les pages, tableaux et procédures rangés sous un Contexte, et ses pages liées, s'affichent sous l'éditeur quand on peut l'écrire, chacun en lien (titres partagés par `CONTEXT_INDEX`). Le paquet passe en version 1.0.0 (note de version datée du jour).

**Pourquoi :** retour de JB du 2026-09-28 ; publication de la V1 (D96, D98).

**Fichiers :** `packages/plateforme/{schemas/context-index.ts,schemas/index.ts,server/context/blocks/contexts.ts,ui/contexte/}`, `packages/plateforme/package.json`, `packages/plateforme/CHANGELOG.md`, `tests/` ; registre, `status.md` (M72).

## [2026-09-28] — V1 (paquet 1.0.0)

**Quoi :** la plateforme MCP d'entreprise en V1 : le paquet `@otomata_tech/oto_platform` 1.0.0 et l'application
de base qui le monte. État livré, par fonctionnalité :

- **Identité et connexion** : l'organisation est celle de l'adresse appelée ; on n'entre que sur invitation (lien
  magique, ou email envoyé par la plateforme avec un émetteur OIDC), par email et mot de passe, Google ou Microsoft.
  Écrans d'authentification à la marque de l'organisation ; une personne sans organisation voit qui contacter.
- **Assistants et OAuth** : Claude, ChatGPT et Claude Code se branchent par OAuth 2.1 (métadonnées de ressource
  protégée, enregistrement dynamique, consentement habillé). La page « Brancher un assistant » donne l'adresse du
  serveur, les dernières connexions et des exemples de prompts ; un script fait le ménage des clients OAuth.
- **Les six outils et `ctx`** : `context`, `find`, `read`, `write`, `call`, `feedback`, préfixés par l'organisation,
  liste figée (ajout seulement). `context` émet le `ctx` que les autres exigent, périmé quand les règles changent ;
  chaque appel est journalisé par conversation, secrets masqués ; `feedback` ouvre un ticket numéroté par
  organisation ; les procédures publiées lisibles sont offertes en prompts.
- **Routage et recherche** : `context(phrase)` sert les étapes de la procédure qui correspond nettement, sinon des
  candidats, par plein texte français et trigrammes, sans IA côté serveur. `find` cherche titres, résumés, contenu
  et lignes de tableau, dit où, et corrige une faute de frappe en dernier recours ; seul ce qui est lisible compte.
- **Arbre, pages, procédures, liens** : contenus en nœuds typés et en blocs, brouillon partagé, publication
  atomique gardée par la révision ; `read` par page, section, plan ou révision, `write` par section ou par bloc.
  Liens `[[chemin]]` suivis dans les deux sens, blocs de référence ; l'adresse d'un contenu suit son titre publié,
  l'ancienne reste un alias, et un chemin pris donne le premier libre, jamais un refus. `context` sert d'abord les
  règles de l'espace, puis une partie par Contexte (tout le monde, Privé, équipes) ouverte par sa ligne de faits et
  les contenus rangés dessous, avec nouveautés, procédures utiles et contenus récents, et dit la langue de réponse ;
  les espaces personnels vivent sous `private`. Un bloc d'une version plus récente est gardé, servi en ligne de
  commentaire. Une procédure porte des blocs `call`, contrôlés à la publication.
- **Tableaux et revue** : tableaux typés (clé, colonnes, file de travail, clôture) derrière `call` : `table.schema`,
  `rows`, `aggregate`, `write` (une valeur nouvelle porte sa preuve, provenance par cellule), `claim` et `release`.
  Schéma créé et modifié par `write` ; à l'écran, grille triée et filtrée et file de revue humaine.
- **Équipes et droits** : niveaux hérités par l'arbre (aucun, lecture, écriture, gestion) sur les nœuds et les
  comptes, pour une personne, une équipe ou toute l'organisation ; un espace Privé par personne ; responsables
  d'équipe. Les services décident chaque droit avant la requête, la base isole les organisations ; l'isolation de
  deux organisations est prouvée de bout en bout.
- **Écrans** : repris d'oto-frontend (design system, huit thèmes, jour et nuit) sous une seule coque, le rail
  (espaces, arbre, recherche ⌘K, glisser-déposer pour ranger ou rendre enfant, ordre des frères, aperçu des accès
  avant un déplacement). Accueil, page, Contexte et tableau s'éditent en place et se publient seuls, 3 s après la
  frappe et en quittant ; « @ » cite un contenu ; une procédure s'édite et se lit comme une page. « Partager » à la
  manière de Notion, accès général de toute l'organisation en lecture ou en modification, lien public en lecture
  seule jamais indexé, qui ne sert que ce que son auteur lit (lignes d'un tableau comprises) ; « Contenus liés »,
  duplication, corbeille de 30 jours ; liens lus dans la phrase ; page Profil (prénom, nom, langue de réponse,
  couleur) et menu du compte ; accueil en onglets : Activités (le fil des gestes de chacun dans la portée du
  journal, « Procédures les plus utilisées ») et Contexte (une partie par Contexte ouverte par ses faits, « Règles
  Oto » repliée) ; listes de choix en popover, au clavier ; Équipes et accès ; journal des conversations.
- **Administration** : tableau de bord de l'organisation (réglages, marque et langue, activation des connecteurs et comptes
  simulés, drapeaux, accès de l'équipe plateforme, usage et retours des assistants). MCP admin à huit outils pour
  l'équipe plateforme, sous un accès daté et révocable, avec son journal ; état de la cellule (version, migrations,
  santé).
- **Cellule, marque, sous-domaines** : l'application de base sert plusieurs organisations en cellule partagée ;
  chacune a sa marque (thème, logo, nom affiché, icône d'onglet) et reçoit un sous-domaine à sa création, geste
  coupé sans ses variables ; ses fonctions tournent à Paris, à côté de la base.
- **Portabilité** : le paquet parle à Postgres par sa propre connexion, sous l'appelant vérifié, sur Supabase comme
  sur un Postgres nu ; `platform` hors du Data API. Émetteur d'identité configurable : Supabase Auth, Logto ou
  Keycloak. Le schéma sort en une seule ligne de base V1, sans colonne ni contrôle de base que plus rien ne lit ;
  elle s'installe sur tout Postgres, vérifiée en CI sur un Postgres nu ; sur le poste, les tests tournent sur un
  Postgres natif (`pnpm db:local`).
- **Installation et publication** : paquet npm public en sources TypeScript, licence MIT, publié avec provenance
  sur un tag ; commande `oto-platform` (`migrations sync|check`, `db prepare`) ; preset Renovate (mineures
  fusionnées si la CI passe, majeures en revue) ; fonctions métier d'un ERP au catalogue ; export-import d'une
  organisation ; organisation « Démo » rejouable ; scripts des réglages d'Auth, du Data API et de l'équipe
  plateforme.

**Reporté en V2 :** service connecteurs et connecteurs tiers réels, comptes tiers et coffre, écran Connecteurs,
sondes et alertes des comptes, registre central des versions, jetons de service, relance des devis réelle,
traduction des écrans (ADR-015).

**Après la V1 :** epic E10, contenus riches (markdown et CSV importés et exportés, fichiers et images derrière un
port S3, bloc HTML isolé, dépôt par lien à usage unique) : six stories prêtes, livrées ensemble en 1.1.0
(ADR-016 à ADR-018).

**Pourquoi :** clôture de la V1 : les dépôts neufs partent d'un changelog propre, une entrée par version ;
l'historique du chantier reste dans l'archive privée.
