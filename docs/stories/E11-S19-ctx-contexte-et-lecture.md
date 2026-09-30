# Story E11-S19 — `ctx`, `context`, lecture et recherche : l'auteur d'un Contexte continue, le refus porte le changement, `context` léger, routage expliqué, `read`, `find` et `table.rows` plus économes

> Fonction posée pour le lot A (écriture) : **`acceptOwnContextWrite(db, identity, { ctx, path, revision })`**,
> `packages/plateforme/server/ctx.ts`, rend `Promise<boolean>` (`true` : la ligne du code a avancé). Trois arguments,
> le troisième un objet : `max-params` (4) d'ESLint refuse la forme à cinq arguments posée d'abord.

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 4.2 Faire (routage, refus `ctx_stale`) ; 4.4 Concevoir et mettre à jour (Contextes, pages, tableaux) |
| **Statut** | 🟢 Ready |
| **Priorité** | Must (lots a, b), Should (lots c à f) |
| **Référence UI** | N/A : aucun écran ; texte servi à l'assistant par `context`, `read`, `find` et `table.rows` (`mcp-patterns.md § 4`) |
| **Conventions** | coding-standards, database, supabase, security, forms, registry, mcp, testing |
| **Estimation** | L, découpée en six lots courts (a ctx de l'auteur Ⓜ ; b refus `ctx_stale` ; c `context` léger ; d routage expliqué et consignes ; e `read` et `find` ; f `table.rows` en OU) |
| **Version** | 1.1.3 (non publiée), lot B ; le lot A (écriture, `server/nodes/**` hors `read.ts` et `read-body.ts`) est mené en parallèle |
| **Dépend de** | E11-S03 (✅, `ctx.contexts`), E11-S16 (✅, candidates par titre et résumé), E11-S01 (✅, `q` de `table.rows`) |
| **Porteuse de migration** | **Oui** (Ⓜ) : policy `ctx_update_own` et privilège `update (contexts)` sur `platform.ctx`, dans `migrations/20260930150000_v1_1_3.sql` |
| **Invariant touché** | ADR-002 § 2 amendé (refus `ctx_stale` qui porte le nouveau code et les Contextes changés ; l'auteur d'un Contexte n'est pas refusé par sa propre écriture) |

## Contexte

Rapport de frictions d'un assistant qui a migré une base de connaissances SAV vers l'organisation Démo (2026-09-30),
et résumé d'un second retour, relus par le pilote. Constats retenus pour ce lot :

- **L'auteur d'un Contexte est refusé par sa propre écriture.** Chaque publication de `sav/contexte` rendait « Context
  … changed: every conversation it was served to must call … again » ; l'appel suivant, sur une autre page, était
  refusé `ctx_stale`, quatre fois dans la session. La ligne `ctx.contexts` n'est jamais mise à jour
  (`server/ctx.ts` l. 69-90, 153-185 avant cette story ; aucune `update` sur `ctx`, migration 1.1.0 partie 4).
- **Le refus `ctx_stale` coûte un `context` complet** : 6 000 à 8 000 caractères rechargés pour relire un Contexte changé.
- **Tester le routage coûte un `context` complet par phrase** : 24 appels, environ 150 000 caractères pour 24 lignes utiles.
- **Le seuil de service est inconnu et le score n'est pas expliqué** : « impossible de savoir quoi changer » ; aucune
  procédure servie sur 24 phrases (scores 0,32 à 0,59 sous le seuil de 0,65, `server/routing.ts` l. 31-32).
- **`data_question` vaut `true` pour une question d'action** (« Qu'est-ce que je lui réponds ? ») : toute phrase finie par
  « ? » est une question de données (`routing.ts` l. 226, H37).
- **Découvrir le catalogue** : `find` rend trois fonctions au plus (`find.ts` l. 24) ; aucun moyen d'affirmer une absence.
- **`table.rows` `q` exige chaque mot** : « autoconsommation déduction » ne trouve rien, « autoconsommation » trouve deux lignes.
- Second retour : `read` d'une section renvoie aussi le plan JSON de toute la page (`read.ts` l. 246) ; une page longue
  envoie son plan deux fois, dans le texte (`read-body.ts` l. 105-107) et en champ ; `find` ne dit pas la section d'un
  bloc trouvé, il faut relire la page pour écrire ; sur une demande d'édition sans procédure, rien ne dit la marche
  (chercher la phrase exacte, pas le titre du document, puis écrire).

Décisions du pilote (JB le laisse autonome sur cette version) : option a pour le ctx de l'auteur (sa ligne avance) ; option
c pour le refus (il porte le nouveau code et l'écart) ; option a pour le plan (retiré des données quand le texte le porte).

**Refs :**
- PRD : FR-TASK-02, FR-CONC-04, § `context` ; H27, H37, H40, P14, P22, P37 (`docs/decisions/hypotheses.md`)
- ADR-002 § 2 (amendé), ADR-003 (routage lexical), ADR-006 (schéma additif), ADR-012 § 3 (droits dans le service)
- Stories voisines : E11-S03 (ctx ciblé), E11-S16 (candidates), E11-S01 (`q`)

## Périmètre

Lot a : `acceptOwnContextWrite` et sa migration. Lot b : le refus `ctx_stale` des cinq outils. Lot c : l'argument
`since_ctx` de `context`. Lot d : bloc « This request » de `context` (seuil, mots en commun, consigne d'édition) et le
genre d'une question d'action. Lot e : `read` (plan, chemin réservé `functions`) et `find` (section, ligne d'édition).
Lot f : `match` de `table.rows`.

## Hors périmètre

- L'appel de `acceptOwnContextWrite` depuis `write` et le texte « Context … changed » de `write-result.ts` : lot A.
- La réservation de `functions` à l'écriture (`write` refuse ce chemin, comme `journal`) et comme slug d'équipe
  (`server/teams.ts`) : lot A et pilote, texte remis dans le rapport (HN-E11S19-8).
- Les descriptions des six outils (`mcp/tools.ts`), les hypothèses (`hypotheses.md`), l'architecture, le CHANGELOG, les
  golden queries : textes remis au pilote.
- Un champ `triggers` par procédure : écarté, P37 gardée (HN-E11S19-5).
- Une fonction `route.test` : écartée, le mode léger de `context` la remplace (HN-E11S19-4).
- Un filtre sémantique des nouveautés et contenus récents : écarté (D132) ; le mode léger les retire (HN-E11S19-4).
- Écriture par lot, `set_markdown`, `node.move`, dépôt sans lien, propriétés de page, connecteurs MCP tiers : autres lots.

## Critères d'acceptation

### Lot a — l'auteur d'un Contexte continue (Ⓜ)

- [ ] **AC-a1** — **Given** un code `ctx` de la personne qui garde le Contexte `p` à la révision `r − 1` **When**
  `acceptOwnContextWrite(db, identity, { ctx: code, path: p, revision: r })` est appelée après la publication de `p` en révision `r` **Then** la
  ligne du code garde `p` à `r`, rend `true`, et `requireCtx` accepte le code.
- [ ] **AC-a2** — **Given** l'un de : un code qui garde `p` à une autre révision que `r − 1` (un autre changement
  entre-temps) ; un chemin non attendu pour la personne ; un Contexte qui n'est pas publié à `r` ; le code d'une autre
  personne **When** la fonction est appelée **Then** rien ne change et elle rend `false`.
- [ ] **AC-a3** — **Given** la migration **Then** `authenticated` ne peut modifier que la colonne `contexts` de ses propres
  lignes `ctx` dans ses organisations (policy `ctx_update_own`, `with check`), et `pnpm check:migrations` passe.

### Lot b — le refus porte le changement

- [ ] **AC-b1** — **Given** un code dont un Contexte gardé a changé de contenu servi **When** un des cinq outils (sauf
  `feedback`) est appelé **Then** le refus `ctx_stale` porte, dans cet ordre : les chemins changés, un **nouveau** code
  émis pour la personne (même host, même agent), la consigne de rejouer l'appel avec lui, puis la partie de chaque
  Contexte changé telle que `context` la sert maintenant (en-tête, corps), dans l'ordre des parties, sous le plafond de
  `context` ; un Contexte retiré ou vidé a son en-tête et la ligne qui le dit.
- [ ] **AC-b2** — **Given** ce refus **When** l'appel est rejoué avec le nouveau code **Then** il passe sans appel à `context`.
- [ ] **AC-b3** — **Given** un code émis avant la 1.1.0 (`contexts` nul), ou l'émission du nouveau code ou la lecture des
  Contextes en panne **Then** le refus reste celui d'E11-S03 (« call <p>_context again »), sans code.

### Lot c — `context` léger

- [ ] **AC-c1** — **Given** `since_ctx` = un code de la personne dans l'organisation dont aucun Contexte gardé n'a changé
  **When** `context` est appelé **Then** il rend le **même** code, la ligne qui dit que règles et Contextes servis avec lui
  valent encore, le routage de la phrase (et la procédure servie) ; ni règles, ni parties, ni nouveautés, ni procédures
  utiles, ni contenus récents ; aucune ligne `ctx` écrite.
- [ ] **AC-c2** — **Given** `since_ctx` dont des Contextes gardés ont changé **Then** `context` émet un nouveau code et sert,
  après le routage, les seules parties changées (comme AC-b1).
- [ ] **AC-c3** — **Given** `since_ctx` inconnu, d'une autre personne, d'une autre organisation, mal formé ou émis avant la
  1.1.0 **Then** `context` rend le contexte complet, comme sans l'argument.

### Lot d — routage expliqué, consignes

- [ ] **AC-d1** — **Given** des candidates sans procédure servie **When** `context` répond **Then** la ligne dit le seuil de
  service et l'écart du réglage de l'organisation (« steps are served from a score of 0.65, 0.10 ahead of the next »).
- [ ] **AC-d2** — **Given** une candidate montrée **Then** sa ligne dit les mots de la demande trouvés dans son titre ou son
  résumé (« words in common: … »), ou « no word in common ».
- [ ] **AC-d3** — **Given** une phrase qui demande de modifier un texte (verbe d'édition en tête, hors suppression, après une formule de
  demande au besoin) et aucune candidate **Then** la consigne dit : chercher avec `find` les mots exacts à changer, pas le
  titre du document ; chaque bloc trouvé vient avec sa section et la façon de l'éditer avec `write`.
- [ ] **AC-d4** — **Given** « Qu'est-ce que je lui réponds ? » ou « Que dois-je leur dire ? » **Then** `data_question` vaut
  `false` ; « Qu'est-ce que j'ai à faire aujourd'hui ? » reste une question de données.
- [ ] **AC-d5** — La ligne du code dit qu'un refus « context has changed » donne un nouveau code et les Contextes changés, et
  qu'on rejoue l'appel avec ce code.

### Lot e — `read`, `find`

- [ ] **AC-e1** — **Given** `read` avec `section` **Then** `structuredContent` n'a pas `outline` ; `sections_total` reste.
- [ ] **AC-e2** — **Given** une page servie par son plan (au-delà de 12 000 caractères, ou `outline: true`) **Then** le plan
  est dans le texte seulement : pas d'`outline` en données.
- [ ] **AC-e3** — **Given** `read` du chemin `functions` **Then** toutes les fonctions actives de l'organisation, groupées par
  connecteur (ordre alphabétique), chacune avec sa classe et la première phrase de sa description, puis les contrats à
  lire avant d'écrire ; en données, `functions: [{name, connector, class}]`.
- [ ] **AC-e4** — **Given** un bloc trouvé par `find` dans une page **Then** sa ligne dit le titre de sa section
  (`in « <titre> »`, rien avant le premier titre) ; en données, `section` sur chaque emplacement de bloc.
- [ ] **AC-e5** — **Given** un nœud (hors tableau) dont `find` montre des blocs et que la personne peut écrire **Then** une
  ligne `To edit: <p>_write {"path": …, "base_revision": <révision>, "ops": [...]}.` suit ses blocs ; aucune pour un
  lecteur seul.

### Lot f — `table.rows` en OU classé

- [ ] **AC-f1** — **Given** `q` et `match: "any"` **Then** sont rendues les lignes qui portent au moins un mot, celles qui en
  portent le plus d'abord, puis dans l'ordre de `sort` (ou de la clé) ; `total` les compte.
- [ ] **AC-f2** — **Given** `q` sans `match`, ou `match: "all"` **Then** comportement d'E11-S01 inchangé (chaque mot).
- [ ] **AC-f3** — **Given** un curseur d'une requête `match: "any"` **When** il est rejoué avec `match` retiré **Then** il est
  refusé (« This cursor belongs to another query… »).

## Implémentation

### Migrations prévues
- `packages/plateforme/migrations/20260930150000_v1_1_3.sql` (partie 1) : `DROP POLICY IF EXISTS` puis `CREATE POLICY
  ctx_update_own ON platform.ctx FOR UPDATE TO authenticated` (`user_id = auth.uid()` et `org_id in member_orgs()`, en
  `using` et `with check`), `GRANT UPDATE (contexts) ON platform.ctx TO authenticated`. Additive ; rollback commenté.

### Schémas Zod
- `packages/plateforme/mcp/schemas.ts` : `context.since_ctx` (chaîne ≤ 100, facultative).
- `packages/plateforme/schemas/tables.ts` : `tableRowsArgsSchema.match` (`"all" | "any"`, facultatif).

### Fichiers à modifier, par face
- `server/` : `ctx.ts` (lots a, b, c), `context/index.ts` (c), `context/blocks/contexts.ts` (b, c), `context/blocks/code.ts`
  (c, d), `routing.ts` (d), `find.ts` (e), `nodes/read.ts`, `nodes/read-body.ts` (e), `tables/filters.ts`, `tables/rows.ts`,
  `tables/paging.ts` (f).
- `mcp/` : `schemas.ts` (c).
- `schemas/` : `tables.ts` (f).
- `migrations/` : `20260930150000_v1_1_3.sql` (a).
- Tests : `tests/integration/server-ctx.test.ts`, `tests/unit/server-ctx.test.ts`, `tests/unit/context-blocks.test.ts`,
  `tests/unit/routing.test.ts`, `tests/unit/nodes-read.test.ts`, `tests/unit/find.test.ts`, `tests/unit/tables-filters.test.ts`,
  `tests/unit/rls-policies.test.ts`, `tests/integration/mcp-core.test.ts`, `tests/unit/__snapshots__/mcp-tools.test.ts.snap`.

### Patterns à suivre
- `mcp-patterns.md § 4` : ce que le modèle lit va dans le texte ; `structuredContent` reste compact ; refus bornés.
- `security-patterns.md § Droits dans le service` : le service décide (chemin attendu, révision précédente, Contexte publié).
- `database-patterns.md § Règles` : `SECURITY INVOKER` par défaut, policy `for update` avec `with check`.

## Rayon d'impact

### Appelants
- `requireCtx`, `staleCtxMessage`, `issueCtx` — `rg -n "requireCtx|staleCtxMessage|issueCtx\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `mcp/server.ts:150` (seule porte : le refus change de texte, même code `ctx_stale`) ; `server/context/index.ts:96`
  (émission inchangée) ; `tests/unit/server-ctx.test.ts` (texte de repli inchangé) ; `tests/integration/server-ctx.test.ts`
  (attendus du refus réécrits) ; `tests/unit/mcp-server.test.ts` (doublure `requireCtx` qui rend `{code, host}` : forme
  inchangée) ; `ui/contexte/libelles.ts:105` (commentaire seul).
- `codeBlock`, `workspaceRules` — `rg -n "codeBlock\(|workspaceRules\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `context/index.ts` (seul appelant) ; `tests/unit/context-blocks.test.ts`, `tests/integration/mcp-core.test.ts:145-148`
  (ligne du code : texte réécrit) ; `tests/unit/e05s12-texte-servi.test.ts` (règles inchangées).
- `contextParts`, `contextBodies`, `partBlock` — `rg -n "contextBodies\(|contextParts\(|partBlock\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `context/index.ts` ; tests `e05s13-lignes-servies`, `e05s12-texte-servi`, `e05s11-parties-du-contexte` (rendu
  inchangé : `partBlock` prend ses lignes de faits au lieu de `PartFacts`, `contextBodies` prend des chemins facultatifs).
- `buildContext`, `assembleContext`, `previewContext` — `rg -n "buildContext\(|assembleContext\(|previewContext\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `mcp/server.ts:90` (l'entrée validée passe `since_ctx`) ; `src/app/(dashboard)/context/page.tsx`,
  `admin/organization/page.tsx`, `n/[...chemin]/page.tsx` (aperçu, sans `since_ctx` : inchangé) ; tests
  `context-blocks`, `context-engine`, `routing`, `e05s12-sous-contexte-sql`, `m55-procedures-privees` (sans `since_ctx` :
  inchangés, sauf les lignes de candidates et du code).
- `requestKind`, `isDataQuestion` — `rg -n "isDataQuestion|requestKind" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `context/index.ts`, `context/blocks/code.ts` ; `tests/unit/routing.test.ts` (genres réécrits pour « edit »).
- `find` — `rg -n "server/find\"" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` → `mcp/server.ts`,
  `api/search.ts` (la recherche des écrans lit `data.matches` : un champ `section` et `revision` en plus, rien de retiré) ;
  tests `find`, `routing`, `e05s10e-gestes`, `fonctions-metier-imports`.
- `readNode` (plan, `functions`) — `rg -n "\.outline\b|outline:" C:/apps/oto-pkg/tests` → `tests/unit/nodes-read.test.ts:407`
  (plan en données avec `outline: true` : attendu réécrit) ; `mcp-table-read.test.ts:87` (tableau : pas de plan servi,
  `outline: []` reste) ; `read-pages.ts:33` (coupe des données : un champ absent se saute).
- `matchesQuery`, `queryPrint`, `tableRowsArgsSchema` — `rg -n "matchesQuery|queryPrint|tableRowsArgsSchema|TableRowsArgs\b" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `tables/rows.ts`, `tables/screen.ts` (grille : ET inchangé), `schemas/table-screen.ts` (reprend `filter`, `sort`,
  `columns` seulement), tests `tables-filters`, `tables-write`.
- Doublures : `tests/unit/mcp-server.test.ts` double `requireCtx` à sa forme de retour, inchangée.

### Doublons
- Rendu d'une partie de Contexte : `rg -n "headerOf|partBlock" C:/apps/oto-pkg/packages/plateforme/server` → réutiliser
  `partBlock` (lignes de faits en paramètre) plutôt qu'un second rendu.
- Section d'un bloc : `rg -n "sectionOfBlock|nearestHeading" C:/apps/oto-pkg/packages` → `schemas/blocks-render.ts`
  `sectionOfBlock`, réutilisée par `find`.
- Liste des fonctions : `rg -n "firstSentence|searchFunctions|describeFunction" C:/apps/oto-pkg/packages/plateforme/server`
  → `find.ts` `firstSentence` réutilisée ; `isActive`, `catalogFunctions`, `contractNames` réutilisées.
- Ligne « To edit » : `rg -n "To edit:" C:/apps/oto-pkg/packages/plateforme/server` → même forme que `read-body.ts`
  `footerOf` (texte, pas code : deux lignes courtes, pas de factorisation à deux occurrences d'une chaîne composée).
- Mots en commun : `rg -n "normalizeTitle\(" C:/apps/oto-pkg/packages/plateforme/server` → `catalog/registry.ts` a ses mots de
  recherche (privés, trois lettres) ; ici quatre lettres et racine de cinq : laisser, règles différentes.

### Effet produit
- Liste d'outils MCP : `context` gagne `since_ctx` (facultatif, ADR-002 § 1) ; `table.rows` gagne `match` ; descriptions
  des outils inchangées dans ce lot (textes remis au pilote).
- Schéma `platform` et RLS : une policy et un privilège de colonne sur `ctx` ; l'isolation (`tests/integration/isolation/tables.test.ts`)
  lit les privilèges des migrations et attend « 0 rows » sur une ligne de B.
- Écrans : l'aperçu du Contexte (`previewContext`) montre la ligne du code réécrite et les candidates avec leurs mots ;
  la recherche des écrans (`api/search.ts`) reçoit `section` et `revision` en plus ; la grille des tableaux inchangée.
- Journal : un refus `ctx_stale` garde l'ancien code ; le nouveau code apparaît au premier appel qui le porte. La borne
  des nouveautés (dernier `ctx` de la personne) avance aussi à l'émission d'un refus ou d'un `context` léger changé.
- Hôte : une migration à copier et appliquer (`oto-platform migrations sync`).

### Refacto
- Écarté : `requireCtx` garde sa transaction ; le refus riche se compose après elle (émission et lecture hors de la
  transaction de la garde, qu'un refus annulerait). Rien d'autre à extraire.

## Hypothèses

- **HN-E11S19-1 (AC-a1, AC-a2).** La ligne n'avance que si le code gardait la révision précédente : le code avait vu tout
  ce qui précédait l'écriture. Un changement d'un autre auteur entre-temps reste à lire ; le refus qui le porte (lot b) le
  rend bon marché. Policy plutôt que fonction `security definer` (`database-patterns.md § Règles`) ; la personne ne peut
  qu'avancer ou reculer ses propres codes, ce que la garde ne protège de rien d'autre qu'elle-même.
- **HN-E11S19-2 (AC-b1).** Le refus émet un nouveau code (option c) plutôt que de réécrire l'ancien : un code partagé par
  plusieurs sous-agents ne passe pas pour ceux qui n'ont pas lu l'écart. Le nouveau code garde les révisions lues par la
  garde (`ctxState`, passées à `issueCtx` par `request.contexts`), jamais relues à l'émission ; les corps sont lus après.
  Un Contexte republié entre les deux est servi plus récent que la révision gardée : le nouveau code est refusé une fois
  de plus, avec son écart, et ne garde jamais une révision plus récente que ce qui a été servi. Même règle pour le
  `context` léger (révisions lues par `ctxChanges`, avant les corps).
- **HN-E11S19-3 (AC-b1, AC-c2).** L'écart est la partie entière de chaque Contexte changé (en-tête et corps, sans les lignes
  de faits, qui ne périment pas le code), pas un diff de blocs : l'assistant remplace la partie qu'il avait.
- **HN-E11S19-4 (AC-c1).** `since_ctx` sert aussi à tester le routage d'une phrase (demande `route.test`) : pas de fonction
  nouvelle. Sans changement, le même code est rendu : la borne des nouveautés ne bouge pas pour un test de routage.
  Nouveautés et contenus récents sont retirés du mode léger (point 10 du retour), sans filtre sémantique (D132).
- **HN-E11S19-5 (AC-d1, AC-d2).** P37 gardée : pas de champ `triggers`. Les « mots en commun » approchent les lexèmes du
  score : mots de quatre lettres au moins, sans casse ni accents, égaux ou de mêmes cinq premières lettres ; ils disent quoi
  ajouter au résumé, pas le calcul exact (trigrammes et correction par le lexique non montrés).
- **HN-E11S19-6 (AC-d3).** Genre `edit` : liste fermée de verbes qui modifient un texte, en tête (`modifie`, `corrige`,
  `change`, `remplace`, `mets à jour`, `réécris`, `reformule`, `renomme`, et leurs infinitifs après une formule de
  demande). « ajoute » n'y est pas (une création, souvent une procédure), ni `supprime`, `retire`, `efface` : une
  suppression passe par `node.trash` (une page), `table.delete_rows` (une ligne) ou l'en-tête d'un tableau par `write`
  (une colonne), pas par find puis write d'un texte (golden TDN1, PD2, TB3, décision du pilote). La consigne ne s'ajoute
  que sans candidate : avec candidates, la consigne unique d'E11-S16 reste (l'assistant arbitre).
- **HN-E11S19-7 (AC-d4, H37 amendée).** Correction minimale : une question dont le sujet est la personne et l'objet un
  tiers (`lui`, `leur`) avant le verbe est une action. « Qu'est-ce que j'ai à faire ? » reste une question de données
  (golden TD4). « Qu'est-ce que je leur dois ? » passe en action : accepté.
- **HN-E11S19-8 (AC-e3).** `functions` est un chemin réservé de `read`, comme `journal` (P22) : un nœud à ce chemin n'est
  plus lisible par `read` (l'écran le lit). Réserver le chemin à l'écriture et le slug d'équipe revient au lot A et au
  pilote ; aucune contrainte de base (une équipe existante au slug `functions` ferait échouer la migration).
- **HN-E11S19-9 (AC-e2).** Plan retiré des données dès que le texte le porte, `outline: true` compris (`mcp-patterns.md § 4` :
  `structuredContent` compact, pas deux fois la même chose ; Claude Code ne lit que `structuredContent`, qui porte le texte).
- **HN-E11S19-10 (AC-e5).** `find` rend la révision dans la ligne « To edit » (sans elle, `write` exige de relire pour
  `base_revision`) ; seulement pour un nœud à blocs trouvés et une personne qui écrit.
- **HN-E11S19-11 (AC-f1).** Avec `match: "any"`, le nombre de mots trouvés prime sur `sort`, qui départage.
- **HN-E11S19-12 (AC-a1, décision du pilote, option a).** Un code partagé par un orchestrateur et ses sous-agents avance
  par `acceptOwnContextWrite` quand l'un d'eux publie un Contexte : l'orchestrateur connaît l'écriture de son sous-agent,
  et un sous-agent frère n'est pas refusé.

## Actions JB

Aucune (la migration s'applique avec la 1.1.3 ; publication par le pilote).

## Tests attendus

### Unit tests
- [ ] `routing.test.ts` : genres `edit` et question d'action (AC-d3, AC-d4) ; mots en commun (AC-d2).
- [ ] `context-blocks.test.ts` : ligne du code (AC-d5) ; seuil et mots des candidates (AC-d1, AC-d2) ; consigne d'édition (AC-d3) ;
  bloc code du mode léger.
- [ ] `nodes-read.test.ts` : plan absent avec `section`, en plan servi d'office et avec `outline: true` (AC-e1, AC-e2) ;
  `functions` (AC-e3).
- [ ] `find.test.ts` : section et ligne « To edit » (AC-e4, AC-e5), pour un auteur et un lecteur.
- [ ] `tables-filters.test.ts` : `match: "any"` classé, ET par défaut (AC-f1, AC-f2) ; curseur d'une autre requête (AC-f3).
- [ ] `rls-policies.test.ts` : `ctx_update_own` ajoutée.

### Integration tests (données jetables)
- [ ] `server-ctx.test.ts` : `acceptOwnContextWrite`, un cas par condition (AC-a1, AC-a2) ; refus riche et rejeu par MCP
  (AC-b1, AC-b2) ; repli sur un code sans `contexts` (AC-b3) ; `since_ctx` inchangé, changé, inconnu (AC-c1 à AC-c3).
- [ ] `mcp-core.test.ts` : ligne du code réécrite.

## Post-implémentation

### Écarts avec l'architecture
- ADR-002 § 2 amendé (refus qui porte le nouveau code et les Contextes changés, ligne de l'auteur avancée, `since_ctx`).
- H27, H37 à amender (textes remis au pilote) ; `docs/architecture.md` (`ctx`, `context`, `read`, `find`) à compléter par le pilote.

### Fichiers écrits hors de la liste prévue
- `supabase/migrations/20260930150000_v1_1_3.sql` : la copie de l'hôte de référence (`pnpm migrations:sync`), sans
  laquelle la base de test locale ne reçoit pas la migration.
- Tests dont le texte attendu change : `tests/integration/pilot-qualification.test.ts` (emplacement de `find` avec
  `section`), `tests/integration/e10s02-assistant.test.ts` (bloc de fichier « in « Pièces » »), `tests/unit/tables-rows.test.ts`
  (AC-f1 à AC-f3, au lieu de `tables-filters.test.ts`, qui n'a pas la page servie).
- Non mis à jour : `tests/unit/__snapshots__/mcp-tools.test.ts.snap` (porte aussi le schéma de `write` du lot A en cours :
  à régénérer une fois, après les deux lots).

### Composants créés
`acceptOwnContextWrite`, `ctxChanges`, `changedCtxMessage` (`server/ctx.ts`) ; `changedContextParts`, `CONTEXT_GONE`
(`server/context/blocks/contexts.ts`) ; `wordsInCommon` (`server/routing.ts`) ; `functionCatalog`, `FUNCTIONS_PATH`
(`server/find.ts`) ; `queryHits` (`server/tables/filters.ts`).

### Notes
- Preuve du lot a : sans la migration appliquée, `acceptOwnContextWrite` échoue en `42501` (constaté avant la copie
  dans `supabase/migrations/`) ; appliquée, les cinq cas passent.
- `requireCtx` compose le refus hors de sa transaction : un refus levé dedans annulerait le code émis.
