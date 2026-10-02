# Story — Widgets dans la conversation (widget routeur)

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Canal MCP |
| **Parcours** | Travailler depuis l'assistant (Claude, ChatGPT) |
| **Statut** | 🟢 Ready (lot 1) ; lots 2 et 3 en attente du banc |
| **Priorité** | Should |
| **Référence UI** | Composants du design system d'`ui/` (ADR-008 § 5) ; vues d'un ERP fournies par l'hôte (lot 2) |
| **Conventions** | mcp, security, a11y, testing, stack, portage, deploy |
| **Estimation** | L, découpée en trois lots (voir « Découpage ») |
| **Dépend de** | Aucune story ouverte |
| **Porteuse de migration** | Non |

## Contexte

Le paquet sert six outils figés, en texte seul (ADR-009 § 3, [outils MCP](../../conception/outils-mcp.md)).
Les widgets ont été reportés « jusqu'au retour des premiers utilisateurs » ; un ERP construit sur le
paquet en demande maintenant : voir un tableau, une fiche ou un devis rendus dans la conversation, pas
seulement leur texte. Un widget MCP Apps se déclare **par outil**, dans `tools/list` ; or tout le métier
passe par `call` et `read`. Ajouter un outil par vue contredirait ADR-002 § 6.

Proposition : **un seul widget, déclaré sur `call` et `read`, qui choisit sa vue d'après le résultat**.
Les six outils restent figés (aucun nom, schéma ni description modifiés, sauf le `_meta` de deux
d'entre eux) ; ADR-009 § 3 est révisé après la mesure, ADR-002 tenu.

**Refs :**
- Conception : `docs/conception/outils-mcp.md` (ADR-002, ADR-009), `docs/conception/ecrans-et-coque.md` (ADR-008 § 3 à § 5), `docs/conception/connecteurs-et-comptes.md` (fonctions sensibles en deux temps)
- Contrat de fonction : `packages/plateforme/server/catalog/{define,erp}.ts`, `server/tool-output.ts`
- Règles dual-host : `mcp-patterns.md` § 5 (triple méta, deux resources, bridge `ext-apps`, single-file)

## Décisions (session du 02/10/2026)

- **Thème** : la vue prend le thème de la personne, sinon celui de l'organisation (`preferredTheme`, déjà sur l'identité, aucune requête) ; les huit thèmes `.oto` sont dans le bundle ; la nuit suit l'host.
- **Données d'une vue** : `structuredContent.view` ne porte que `{ kind, theme }` ; le widget lit les données déjà présentes dans le résultat (`result` de `call`). Aucune copie de `result` (Claude Code lit `structuredContent` en entier). Seule exception : la vue `page`, pour laquelle `read` ajoute les blocs servis (son texte est du markdown assemblé).
- **Vues du paquet** : `table`, `record`, `page`. `list` est retirée du contrat : elle visait `find`, qui ne porte pas de widget. `procedure` est rendue par `page`.
- **Actions depuis le widget** : aucune au lot 1 ; l'AC des actions passe au lot 2.
- **Bundle** : construit, jamais commité (`pnpm widgets:build`), avant `type-check` (s'il manque), `build`, le job `bare-postgres` et `npm pack` (`prepack`) ; `verify` le trouve par `type-check`, son script restant celui du framework.
- **Interrupteur** : `handleMcpPost(request, { …, widgets: true })` allume les widgets ; sans l'option, le serveur sert exactement ce qu'il servait (texte seul, ni méta, ni resources, ni `view`). oto-saas peut monter de version sans changement visible ; l'hôte de référence l'allume par `PLATFORM_MCP_WIDGETS=on`, pour le banc.

## Périmètre (lot 1)

- Contrat de vue : `view: { kind, theme }` dans `structuredContent`, posé par la porte quand les widgets sont allumés.
- Vues du paquet : `table` (`table.rows` de 0 ou plusieurs lignes), `record` (`table.rows` d'une ligne, `table.claim` d'une ligne réservée), `page` (`read` d'une page ou d'une procédure servie entière).
- Widget routeur single-file, servi en deux resources ; triple méta sur `call` et `read`.
- Interrupteur `widgets` de `handleMcpPost` ; variable `PLATFORM_MCP_WIDGETS` de l'hôte de référence.

## Hors périmètre

- Vues de l'ERP (`view` dans `defineErpFunction`, `oto-platform widgets build`, `registerWidgetViews`) : lot 2.
- Actions depuis le widget (`call` non sensibles, `ctx` de la conversation) : lot 2.
- Vue d'une section, d'un écart (`since_revision`), d'un brouillon, d'une page servie par son plan ou en plusieurs parties : texte seul ; à rouvrir après le banc.
- Liens vers un chemin du nœud, images et fichiers joints dans la vue `page` : rendus sans navigation ni chargement ; diagrammes Mermaid en texte (mermaid hors bundle : `mermaid.min.js` pèse 3,5 Mo, mesuré dans `node_modules`). Un lien `https:` reste celui des écrans (`target="_blank"`, `noopener`) : son ouverture dépend du bac à sable de l'host.
- Révision d'ADR-009 § 3 et passage de l'interrupteur à vrai par défaut : lot 3, après la mesure.

## Conception

### 1. Le contrat de vue

- `ToolOutput.view` (facultatif) : `{ kind }`, posé par le service ; la porte y ajoute `theme` et le sert en `structuredContent.view`, ou le retire quand les widgets sont éteints.
- `FunctionOutput.view` (facultatif) : une fonction native dit sa vue (`table.rows`, `table.claim`) ; `runCall` la recopie. Le lot 2 y ajoute `erp:<nom>`.
- Noms des vues du paquet dans `schemas/views.ts` (`PACKAGE_VIEWS`), lus par le serveur et par le widget.
- Au-delà de `MAX_DATA_CHARS`, le formateur omet les données (`data_omitted`) : la vue part avec elles. `read` n'ajoute ses blocs que si les données tiennent encore sous ce plafond.

### 2. Le widget routeur

- Un bundle HTML single-file (Vite 7, `vite-plugin-singlefile`), zéro requête externe ; bridge sur le SDK officiel `@modelcontextprotocol/ext-apps` (entrée `app-with-deps`), plus `window.openai` (ChatGPT).
- Il lit `structuredContent.view`, rend le composant de son `kind`, et sinon **ne rend rien, à hauteur nulle** (`autoResize`) — à mesurer, voir questions ouvertes.
- Les vues réutilisent `Table` du DS, `RenduDUnBloc` d'`ui/noeud/rendu-des-blocs.tsx`, `EmptyState`, `Skeleton`, `Alert`, sous `.oto` au thème reçu, `.dark` posé d'après le contexte de l'host.
- Quatre états : chargement (12 s au plus, puis erreur actionnable), données, vide, erreur.

### 3. Déclaration et service

- Allumé : `capabilities.resources` ; deux resources : `ui://oto/view.html` (`text/html;profile=mcp-app`) et `ui://oto/view-skybridge.html` (`text/html+skybridge`), même HTML.
- `call` et `read` portent la triple méta (`ui.resourceUri`, alias plat `ui/resourceUri`, `openai/outputTemplate`) en plus de `securitySchemes` ; `context`, `find`, `write`, `feedback` restent sans widget. Clés dans `mcp/widget-meta.ts` seul.
- Bundle servi en mémoire, depuis `mcp/widgets/generated.ts` (généré par `widgets/build.mjs`, ignoré par git, livré dans le paquet) : aucune lecture de fichier à l'exécution.

### 4. Build et vues de l'hôte (lot 2)

- Un hôte qui déclare des vues ERP : `oto-platform widgets build --views src/widgets` construit **un** bundle (vues du paquet + vues de l'hôte) dans un module généré que l'hôte passe à `registerWidgetViews(...)`, sur le modèle de `registerFunctions`. Sans vues ERP, rien à construire.
- Une fonction qui déclare une `view` absente du bundle est refusée à l'inscription (`CatalogRegistrationError`).

## Critères d'acceptation (lot 1)

- [ ] **Given** l'interrupteur éteint (défaut) **When** l'assistant liste les outils, appelle `call table.rows` ou `read` d'une page **Then** liste, `structuredContent` et capacités sont identiques à avant (test du contrat figé inchangé), sans `resources`.
- [ ] **Given** l'interrupteur allumé **When** l'assistant liste les outils **Then** `call` et `read` portent la triple méta, les quatre autres non ; noms, titres, descriptions et schémas sont identiques à avant ; `resources/list` sert les deux variantes, `resources/read` le même HTML sous chaque type MIME.
- [ ] **Given** l'interrupteur allumé **When** `resources/read` reçoit une adresse inconnue **Then** erreur JSON-RPC `-32002` (« resource not found » de la spécification MCP) « Unknown resource <uri>. », journalisée.
- [ ] **Given** l'interrupteur allumé **When** `call table.rows` rend deux lignes ou aucune **Then** `structuredContent.view = { kind: "table", theme }`, le texte est inchangé, et le widget rend les lignes (ou l'état vide).
- [ ] **Given** l'interrupteur allumé **When** `call table.rows` rend une seule ligne, ou `table.claim` en réserve une **Then** `view.kind = "record"` et le widget rend la fiche.
- [ ] **Given** l'interrupteur allumé **When** `read` sert une page entière **Then** `view.kind = "page"`, les blocs servis sont dans `structuredContent.blocks`, et le widget les rend ; une section, un écart, un brouillon, un plan ou une page en plusieurs parties : ni vue ni blocs.
- [ ] **Given** des données au-delà de `MAX_DATA_CHARS` **When** le résultat est formaté **Then** aucune vue n'est posée.
- [ ] **Given** un résultat sans `view`, ou un `kind` inconnu du bundle **When** le widget le reçoit **Then** il ne rend rien, à hauteur nulle.
- [ ] **Given** le widget sans résultat après 12 s **When** le délai passe **Then** il dit en `role="alert"` quoi demander dans la conversation.
- [ ] Matrice dual-host (`mcp-patterns.md` § 5.4) passée sur Claude et ChatGPT, golden queries rejouées sans régression de routage (action JB, banc entre les lots 1 et 2).

## Implémentation (lot 1)

### Fichiers à créer
- `schemas/views.ts` : `PACKAGE_VIEWS`, type `ViewKind`.
- `mcp/widget-meta.ts` : URI, types MIME, triple méta, resources (liste et lecture).
- `widgets/` : `index.html`, `main.tsx` (routeur), `bridge.ts`, `vues.tsx` (table, record, page, états), `styles.css`, `build.mjs` (Vite), `mermaid-absent.ts`.
- `mcp/widgets/generated.ts` : généré, ignoré par git.

### Fichiers à modifier
- `server/tool-output.ts` (`view`), `server/catalog/define.ts` (`FunctionOutput.view`), `server/calls.ts`, `server/tables/rows.ts`, `server/tables/claim.ts`, `server/nodes/read.ts` (option `views`).
- `mcp/tools.ts` (`_meta` de `call` et `read`), `mcp/server.ts` (capacité, handlers des resources, `view` et thème), `mcp/handler.ts` (option `widgets`), `mcp/result.ts` (`view` dans `structuredContent`).
- Hôte : `src/app/api/mcp/route.ts` (`PLATFORM_MCP_WIDGETS`), `.env.example`.
- `packages/plateforme/package.json` (`devDependencies`, `prepack`), `package.json` racine (scripts), `.gitignore`, `eslint.config.mjs`, `.github/workflows/ci.yml`.

### Migrations prévues
- Aucune : la vue est calculée à la réponse, rien n'est stocké.

### Schémas Zod partagés
- Aucun nouveau : la vue est produite par le serveur, jamais reçue ; `PACKAGE_VIEWS` est une liste fermée de `schemas/views.ts`.

## Rayon d'impact

### Appelants
- `ToolOutput` — `rg -n "ToolOutput\b" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` : 17 fichiers de `server/` et `mcp/` ; `view` facultatif, aucun ne change hors `calls.ts`, `read.ts`, `result.ts` et `server.ts`.
- `FunctionOutput` — `rg -n "FunctionOutput\b" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` : fonctions de `server/tables/`, `catalog/`, doublures de `tests/factories/table-fixture.ts` et de trois suites `tables-*` ; `view` facultatif, les doublures restent valides.
- `formatResult` — `rg -n "formatResult" …` : la porte, la porte admin (`mcp/admin/server.ts`, qui ne pose jamais `view`) et cinq suites ; inchangé sans `view`.
- `buildTools`, `serverOptions`, `installPlatformMcp`, `McpDeps` — `rg -n "formatResult|serverOptions|buildTools\(|installPlatformMcp|handleMcpPost" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests /home/user/oto-saas/src /home/user/oto-saas/tests` : `mcp/handler.ts`, `tests/helpers/mcp.ts`, `mcp-tools`, `mcp-server`, `feedback`, `erp-functions`, `mcp-core` ; nouvelle option facultative, défaut éteint : sorties identiques.
- `handleMcpPost` — même commande : route de l'hôte de référence, route d'oto-saas (`src/app/api/mcp/route.ts`, paquet épinglé en 1.3.8), `mcp-handler`, `mcp-metadata`, `mcp-http` ; signature étendue d'une option facultative.
- `readNode` — `rg -n "readNode\(" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` : la porte et quatorze suites ; l'option `views` est facultative, éteinte par défaut.
- `runCall` — `rg -n "runCall\(" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` : la porte, `calls`, `catalog-contracts`, `e11s02-brouillons-et-suppression` ; `view` ajouté seulement si la fonction en rend une.

### Doublons
- `rg -n "ui://|outputTemplate|resourceUri|text/html\+skybridge|profile=mcp-app" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests /home/user/oto-saas/src` : aucune déclaration de widget. Rendu : `Table` (DS), `RenduDUnBloc`, `EmptyState`, `Skeleton`, `Alert` réutilisés (`component-registry.md`) ; thème : `preferredTheme` réutilisé.

### Effet produit
- Liste d'outils servie aux hosts : inchangée interrupteur éteint ; allumé, seul le `_meta` de deux outils change.
- oto-saas : aucun changement tant qu'elle ne passe pas `widgets: true` ; le paquet publié livre le module généré (`prepack`, job `packed-host-build`).
- Publication : `npm pack` construit le bundle ; `mcp/widgets/generated.ts` pèse 1,1 Mo dans l'archive (`npm pack --dry-run`).

### Refacto
- Écarté : aucun déplacement des écrans d'`ui/` ; les vues réutilisent les composants tels quels.

## Sécurité et confidentialité

- Canaux fermés au lot 1 : aucune ressource externe chargée (bundle tout inliné, CSP des hosts) ; aucun appel d'outil depuis le widget ; aucun lien vers un chemin de l'organisation ; aucune donnée hors du résultat déjà servi au modèle.
- Canaux ouverts : le contenu du résultat, rendu par React sans `dangerouslySetInnerHTML` (mermaid absent du bundle), sa confidentialité étant celle du résultat, déjà décidée par le service ; un lien `https:` d'une page, rendu comme à l'écran (`noopener noreferrer nofollow`), qu'un clic ouvre si l'host le permet ; un `fetch` du rendu d'un fichier joint, que la CSP des hosts bloque.
- Tests : rendu d'un texte hostile (balise) en texte, d'un lien `javascript:` sans lien, d'un lien `https:` comme à l'écran ; bundle sans `<script src>`, `<link href>`, `src="http…"` ni `url(http…)`.

## Tests attendus

- Unit : `formatResult` avec `view` (posée, omise au-delà de `MAX_DATA_CHARS`) ; `runCall` recopie la vue ; `table.rows` et `table.claim` (une ligne, plusieurs) ; `read` d'une page (blocs, et rien pour section, écart, plan) ; outils, capacités et resources interrupteur allumé et éteint (`InMemoryTransport`), contrat figé inchangé.
- Widget (jsdom) : routeur sur le `structuredContent` réel de chaque vue, état sans vue à hauteur nulle, `kind` inconnu, délai de 12 s.
- Banc : matrice dual-host et golden queries (Claude, ChatGPT), action JB.

## Découpage

1. Contrat de vue + vues du paquet (`table`, `record`, `page`) + routeur + déclaration + interrupteur (M).
2. Vues de l'ERP : champ `view`, CLI `widgets build`, `registerWidgetViews` ; actions depuis le widget (M). Ne démarre qu'après le feu vert de JB sur le banc du lot 1.
3. Mesure sur le banc, puis révision d'ADR-009 § 3 dans `outils-mcp.md` et défaut de l'interrupteur (S).

## Post-implémentation (lot 1)

### Écarts avec la référence UI
- Liens vers un chemin, images et fichiers joints de la vue `page` sans navigation ni chargement (« Hors périmètre »).

### Écarts avec la conception
- `mcp-patterns.md § 4` (`structuredContent` compact, jamais l'entité complète que le widget affiche) : la vue `page` ajoute les blocs servis, décision de la session (seul doublon), bornée par `MAX_DATA_CHARS`, et seulement interrupteur allumé.
- `mcp-patterns.md § 5.2`, canal (c) (postMessage d'avant la GA) non écouté : aucun host visé ne le parle ; MCP Apps et `window.openai` (événement et relecture de secours) le sont.
- `mcp-patterns.md § 5.3`, poids : 994 Ko, 306 Ko compressé (sortie de `pnpm widgets:build`), au-delà de la cible (600 Ko, 150 Ko compressé). Les deux polices embarquées en pèsent 118 Ko (data URI du bundle) ; le SDK `ext-apps` et ses dépendances, React et la CSS du design system font le reste. Accepté pour le banc (décision de la session) ; l'allègement se tranche avec la question « Poids », avant le lot 2.
- ADR-009 § 3 (texte seul) tenu interrupteur éteint ; révisé au lot 3 (`outils-mcp.md`, « Écart avec le code »).
- Plusieurs lignes réservées par `table.claim` : texte seul (la vue `record` ne vaut que pour une ligne).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| Widget, VueDuResultat, VueDeChargement, VueDuDelai, sourceDeLHost | `packages/plateforme/widgets/` | Ajoutés au registry |

### Notes
- Banc : lignes W1 à W6 de `docs/reference/mcp-golden-queries.md` (« Widget routeur »), à jouer par JB interrupteur allumé.

## Actions JB

- Déployer l'hôte de référence avec `PLATFORM_MCP_WIDGETS=on`, puis jouer la matrice § 5.4 et les golden queries sur Claude et ChatGPT ; dire si un résultat sans vue ouvre un cadre visible.
- Feu vert du lot 2 ; publication d'une version (tag) quand il le décide.

## Questions ouvertes

- **Widget déclaré sur `call` quand le résultat n'a pas de vue** : Claude et ChatGPT ouvrent-ils un cadre vide, même à hauteur nulle ? Mesure obligatoire avant le lot 2 ; si le cadre reste visible, repli : un outil `view` dédié (ajout permis par ADR-002), qui affiche un résultat déjà obtenu.
- **Poids** (avant le lot 2) : un bundle par hôte (vues du paquet + ERP) ou deux bundles (paquet, ERP) — le second impose deux widgets, donc un choix par fonction de l'outil qui les déclare : non retenu sans mesure. Et où vit l'outillage de build chez l'hôte (Vite en dépendance du paquet ou de l'hôte).
