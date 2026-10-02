# Story — Widgets dans la conversation (widget routeur)

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Canal MCP |
| **Parcours** | Travailler depuis l'assistant (Claude, ChatGPT) |
| **Statut** | ⬜ Draft — conception proposée, à valider avant tout code |
| **Priorité** | Should |
| **Référence UI** | Composants du design system d'`ui/` (ADR-008 § 5) ; vues d'un ERP fournies par l'hôte |
| **Conventions** | mcp, security, a11y, testing, stack |
| **Estimation** | L (découpable : voir « Découpage ») |

## Contexte

Le paquet sert six outils figés, en texte seul (ADR-009 § 3, [outils MCP](../../conception/outils-mcp.md)).
Les widgets ont été reportés « jusqu'au retour des premiers utilisateurs » ; un ERP construit sur le
paquet en demande maintenant : voir un tableau, une fiche ou un devis rendus dans la conversation, pas
seulement leur texte. Un widget MCP Apps se déclare **par outil**, dans `tools/list` ; or tout le métier
passe par `call` et `read`. Ajouter un outil par vue contredirait ADR-002 § 6.

Proposition : **un seul widget, déclaré sur `call` et `read`, qui choisit sa vue d'après le résultat**.
Les six outils restent figés (aucun nom, schéma ni description modifiés, sauf le `_meta` de deux
d'entre eux) ; ADR-009 § 3 est révisé, ADR-002 tenu.

**Refs :**
- Conception : `docs/conception/outils-mcp.md` (ADR-002, ADR-009), `docs/conception/ecrans-et-coque.md` (ADR-008 § 5)
- Contrat de fonction : `packages/plateforme/server/catalog/erp.ts`, `server/tool-output.ts`
- Règles dual-host du template : `mcp-patterns.md` § 5 (triple méta, deux resources, bridge `ext-apps`, single-file)

## Conception proposée

### 1. Le contrat de vue

- `ToolOutput.data.view` (facultatif) : `{ kind: string, data: unknown }`. Absent : aucune vue, le texte suffit.
- Vues du paquet (`kind` sans préfixe) : `table` (lignes d'un tableau, `table.rows`), `record` (une ligne ou un objet), `page` (rendu d'un nœud lu par `read`), `procedure`, `list` (résultats de `find`).
- Vues de l'ERP (`kind` = `erp:<nom>`) : une fonction déclare `view: "<nom>"` dans `defineErpFunction` (champ **facultatif**, ajout seulement) ; `runCall` pose `data.view = { kind: "erp:<nom>", data: <sortie de run> }`.
- La vue ne porte que des données déjà présentes dans le résultat : `structuredContent` reste sous `MAX_DATA_CHARS` ; au-delà, pas de vue (le texte et sa continuation suffisent).

### 2. Le widget routeur

- Un bundle HTML single-file (Vite, `vite-plugin-singlefile`), zéro requête externe ; bridge sur le SDK officiel `@modelcontextprotocol/ext-apps` (entrée `app-with-deps`).
- Il lit `structuredContent.view`, rend le composant de son `kind`, et sinon **ne rend rien et se réduit à hauteur nulle** (`autoResize`) — à mesurer, voir questions ouvertes.
- Les vues du paquet réutilisent les composants d'`ui/ds/` (ADR-008 § 5), sous le thème de l'organisation passé dans la vue ; nuit suivie par le contexte de l'host.
- Quatre états : chargement (jamais terminal, 12 s), données, vide, erreur actionnable.
- Actions depuis le widget : seulement des `call` non sensibles, avec le `ctx` de la conversation ; une fonction sensible ne s'exécute jamais depuis le widget (H26 : `next_actions` ne propose jamais de fonction sensible).

### 3. Déclaration et service

- `capabilities.resources` ajouté au serveur ; deux resources par bundle : `ui://oto/view.html` (`text/html;profile=mcp-app`) et `ui://oto/view-skybridge.html` (`text/html+skybridge`).
- `call` et `read` portent la triple méta (`ui.resourceUri`, alias plat, `openai/outputTemplate`) ; `context`, `find`, `write`, `feedback` restent sans widget.
- Bundle servi en mémoire, depuis un module généré : aucune lecture de fichier à l'exécution.

### 4. Build et vues de l'hôte

- Le paquet étant publié en sources TypeScript, le bundle des **vues du paquet** est construit à la publication (`publish.yml`) et livré généré dans le paquet.
- Un hôte qui déclare des vues ERP : `oto-platform widgets build --views src/widgets` construit **un** bundle (vues du paquet + vues de l'hôte) dans un module généré que l'hôte passe à `registerWidgetViews(...)`, sur le modèle de `registerFunctions`. Sans vues ERP, rien à construire.
- Une fonction qui déclare une `view` absente du bundle est refusée à l'inscription (`CatalogRegistrationError`), comme une suite inconnue.

## Critères d'acceptation

- [ ] **Given** un hôte sans vue ERP **When** l'assistant liste les outils **Then** `call` et `read` portent la triple méta, les quatre autres non, et `resources/list` sert les deux variantes du bundle du paquet.
- [ ] **Given** `call table.rows` **When** le résultat arrive **Then** `structuredContent.view.kind = "table"`, le texte est inchangé, et le widget rend les lignes.
- [ ] **Given** une fonction ERP déclarée avec `view: "devis"` et sa vue construite par la CLI **When** elle est appelée **Then** `view.kind = "erp:devis"` et le widget rend la vue de l'hôte.
- [ ] **Given** une fonction ERP qui déclare une vue absente du bundle **When** l'hôte inscrit ses fonctions **Then** `CatalogRegistrationError` et rien n'est inscrit.
- [ ] **Given** un résultat sans `view` **When** le widget le reçoit **Then** il ne rend rien, à hauteur nulle.
- [ ] **Given** un résultat au-delà de `MAX_DATA_CHARS` **When** il est formaté **Then** aucune vue n'est posée.
- [ ] **Given** le widget **When** il propose une action **Then** seule une fonction non sensible est appelable, avec le `ctx` courant.
- [ ] **Given** les six outils **When** le test du contrat figé tourne **Then** noms, titres, descriptions et schémas sont identiques à avant ; seul le `_meta` de `call` et `read` change.
- [ ] Matrice dual-host (`mcp-patterns.md` § 5.4) passée sur Claude et ChatGPT, et golden queries rejouées sans régression de routage.

## Implémentation

### Fichiers à créer
- `packages/plateforme/mcp/widgets/` : déclaration des resources, module généré, triple méta.
- `packages/plateforme/widgets/` : sources du routeur et des vues du paquet, bridge, config Vite.
- `packages/plateforme/cli/widgets.ts` : commande `widgets build`.
- `packages/plateforme/server/catalog/views.ts` : `registerWidgetViews`, noms de vues connus.

### Fichiers à modifier
- `mcp/server.ts` (capacité `resources`, `_meta` de `call` et `read`), `mcp/tools.ts`.
- `server/tool-output.ts` (`data.view`), `server/calls.ts` (pose de la vue), `server/catalog/erp.ts` (`view` facultatif, contrôle à l'inscription), lecture d'un nœud (vue `page`).
- `packages/plateforme/package.json` (dépendances de build en `devDependencies`, entrée `./widgets`), `publish.yml` (build du bundle).
- `docs/conception/outils-mcp.md` : ADR-009 § 3 révisé à la livraison.

## Rayon d'impact

### Appelants
- `ToolOutput` — `rg -n "ToolOutput" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` : à relever à l'implémentation ; le champ `view` est facultatif, aucun appelant n'a à changer.
- `defineErpFunction` / `registerFunctions` — `rg -n "defineErpFunction|registerFunctions" /home/user/oto-pkg` : `view` facultatif, les fonctions existantes restent valides.
- `serverOptions` — `rg -n "serverOptions" /home/user/oto-pkg/packages` : ajout de `resources` aux capacités.

### Doublons
- `rg -n "ui://|outputTemplate|resourceUri" /home/user/oto-pkg/packages /home/user/oto-pkg/src` : aucune déclaration de widget aujourd'hui. Le bridge et le build se reprennent du template d'app MCP (code éprouvé), pas d'un module du paquet.

### Effet produit
- Liste d'outils servie aux hosts : seul le `_meta` de deux outils change ; les hosts rafraîchissent au geste habituel (le contrat ne change pas).
- Application hôte : aucune action sans vue ERP ; avec vues ERP, une commande de build et un appel `registerWidgetViews`.
- Publication : `publish.yml` construit le bundle ; poids du paquet en hausse (bundle d'environ 500 Ko, gzip 140 Ko, mesure du template).

### Refacto
- Écarté : aucun déplacement des écrans d'`ui/` ; les vues réutilisent les composants du DS tels quels.

## Tests attendus

- Unit : pose de `data.view` par `runCall` (fonction native, fonction ERP, résultat trop gros) ; refus à l'inscription d'une vue inconnue ; triple méta et deux resources (`InMemoryTransport`) ; contrat figé des six outils inchangé hors `_meta`.
- Widget : rendu de chaque vue du paquet sur le `structuredContent` réel ; état sans vue à hauteur nulle.
- Banc : matrice dual-host et golden queries (Claude, ChatGPT).

## Découpage

1. Contrat de vue + vues du paquet (`table`, `record`, `page`) + routeur + déclaration (S/M).
2. Vues de l'ERP : champ `view`, CLI `widgets build`, `registerWidgetViews` (M).
3. Mesure sur le banc, puis révision d'ADR-009 § 3 dans `outils-mcp.md` (S).

## Questions ouvertes

- **Widget déclaré sur `call` quand le résultat n'a pas de vue** : Claude et ChatGPT ouvrent-ils un cadre vide, même à hauteur nulle ? Mesure obligatoire avant la vague 2 ; si le cadre reste visible, repli : un outil `view` dédié (ajout permis par ADR-002), qui affiche un résultat déjà obtenu.
- **Thème** : la vue reçoit-elle les couleurs de l'organisation dans `view`, ou le widget suit-il seulement le clair et le sombre de l'host ?
- **Poids** : un bundle par hôte (vues du paquet + ERP) ou deux bundles (paquet, ERP) — le second impose deux widgets, donc un choix par fonction de l'outil qui les déclare : non retenu sans mesure.
