# Story E11-S03 — Contexte et conversations : invalidation ciblée des ctx, plafond seul et coupe dite, déplacer et compléter une liste

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 4.2 Faire (une conversation qui ne tourne plus en boucle sur `ctx_stale`) ; 4.4 Concevoir et mettre à jour (Contexte, pages) |
| **Statut** | 🟢 Ready |
| **Priorité** | Must (lot a), Should (lots b et c) |
| **Référence UI** | N/A : aucune phrase nouvelle à l'écran ; la vue « Contexte » (`ui/contexte/`) reconnaît le pointeur neuf ; le reste est du texte servi à l'assistant (`mcp-patterns.md § 4`) |
| **Conventions** | database, supabase, security, mcp, forms, registry, portage, testing |
| **Estimation** | L (trois lots séquentiels : a ctx ciblé M, Ⓜ ; b plafond seul S, moins d'écran et plus de tests réécrits qu'avant D134 ; c `move_block` et `append` S) |
| **Vague** | E11, second worktree, quatrième (ordre S01, S02, S04, S03) |
| **Dépend de** | E10-S04 pour le lot c (modèle des listes `{text, children}`, `LIST_ITEMS_MAX` compté sous-éléments compris, titres à cinq niveaux dans `section-ops.ts`) ; fichiers partagés avec E10-S01 (`parseOpText` dans `block-ops.ts` et `section-ops.ts`, `write-result.ts`) et E10-S02 (`nodes/read.ts`, `read-pages.ts`, `nodes/publish.ts`) : relire les numéros de ligne après leur fusion |
| **Porteuse de migration** | **Oui** (Ⓜ) : colonne `platform.ctx.contexts` ; fusionnée dans le fichier unique de la 1.0.1 (fiches D124, D131) |
| **Invariant touché** | ADR-002 § 2 amendé (le ctx périme par les Contextes servis, plus par `rules_version`) ; ADR-002 § 7 amendé (plafond de 35 000 caractères, plus de taille par bloc, fiche D134) : textes écrits par le pilote avant le code |

## Contexte

Rapport de tests d'un assistant sur l'organisation Démo (FB-0005, FB-0006, FB-0008), fiche D132.

**FB-0005 — un ctx périme pour rien.** `requireCtx` (`server/ctx.ts` l. 85-115) refuse
`ctx_stale` dès que `orgs.rules_version` diffère de la version gardée sur la ligne `ctx` (l. 112).
Le déclencheur `bump_rules_version` (MIG l. 2740, fonction l. 211-220, MIG =
`migrations/20260928100000_platform_base_v1.sql`) incrémente ce compteur à **toute** insertion dans
`node_versions` d'un nœud `context` : le Contexte privé d'un collègue ou celui d'une autre équipe
invalide ma conversation. L'éditeur publie 3 s après la dernière frappe et à la fermeture de la page
(`ui/noeud/publication.tsx` l. 3-5, 29, 104) ; `publish_node` crée une révision même pour un
contenu identique (MIG l. 1413-1433) : H28 promet le contraire, le code ne le tient pas.
L'assistant rappelle `context`, rejoue, et re-périme.

**FB-0006 — coupe muette, tailles arbitraires.** Un Contexte privé ou d'équipe est coupé à 1 200
caractères (`CONTEXT_SIZES`, `server/context/blocks/contexts.ts` l. 30), listes d'enfants comprises.
`partBlock` (l. 162-172) finit par « Rest of this context: <p>_read {…} » (`schemas/context-index.ts`
l. 21) sans dire qu'il y a eu coupe ni pourquoi. Les autres blocs ont aussi leur taille : nouveautés
600 (`blocks/news.ts` l. 29, 104), contenus récents 1 400 (`blocks/recent.ts` l. 25, 127), procédures
utiles 8 000 (`blocks/procedures.ts` l. 24, 108-110) ; le tout sous un budget de 20 000
(`server/context/engine.ts` l. 14). Ces nombres sont des choix, pas des contraintes des hosts : Claude
Code avertit au-delà de 10 000 tokens par résultat d'outil MCP et coupe à 25 000 tokens par défaut.
La procédure reconnue n'a pas de taille dans le code (le PRD lui en prête une de 4 000) : servie entière
ou remplacée par son pointeur (`blocks/procedure.ts`, N2).

**FB-0008 — blocs perdus, listes éclatées.** (a) `move_block` sans `after_block` met le bloc en tête
de page (`server/nodes/block-ops.ts` l. 123-135, `schemas/nodes.ts` l. 62-68), hors de toute section,
absent du plan (`outlineOf`, `server/nodes/read-format.ts` l. 103-112). (b) `append` d'une liste crée
toujours un bloc `list` de plus (`server/nodes/section-ops.ts` l. 121-129) : trois appels donnent trois
listes numérotées qui recommencent chacune.

Décisions du responsable d'Oto : invalidation **ciblée**, sans reprise des ctx existants (D132) ;
**plus de taille par bloc, un plafond total de 35 000 caractères**, toute coupe dite à l'assistant,
aucun chiffre à l'écran (D134, 2026-09-29).

**Refs :**
- PRD : FR-TASK-02 (l. 268), FR-CONC-04 (l. 389), § `context` (l. 224-240), l. 84, NFR-TASK-01 (l. 280) ;
  H27, H28, H30, N6, P14 (`docs/decisions/hypotheses.md`)
- ADR-002 § 2 et § 7 (amendés), ADR-006 (schéma additif), ADR-011 (nœuds et blocs), ADR-012 § 3
- Architecture § 4 Modèle de données (`ctx` l. 190), § Déclencheurs (l. 248), `context/` (l. 284), l. 449
- Golden query C2 (`docs/mcp-golden-queries.md` l. 66)

### Amendement proposé d'ADR-002 § 2 (écrit par le pilote)

> Le code `ctx` garde, pour chaque Contexte que `context` attendait pour la personne (Tout le monde,
> son Privé, chacune de ses équipes), la révision publiée lue à l'émission (0 : aucun). Il devient
> invalide quand l'un **de ceux-là** change de contenu servi ; le refus « context has changed (<chemins>),
> call <préfixe>_context again » nomme lesquels. La publication d'un autre Contexte, ou une republication
> à l'identique, ne l'invalide pas. `rules_version` reste compté, plus lu par la garde.

### Amendement proposé d'ADR-002 § 7 (écrit par le pilote, fiche D134)

> `context` : 35 000 caractères au plus (≈ 10 000 tokens), blocs servis entiers dans l'ordre de
> priorité, sans taille par bloc ; au-delà, le premier bloc qui dépasse est coupé à la ligne entière
> et les suivants omis, et le texte le dit (pointeur vers `read` d'un Contexte coupé, ligne finale qui
> nomme les blocs coupés ou omis).

## Périmètre

- Lot a : ctx ciblé (colonne, émission, garde, texte du refus, `feedback`), résultat de publication.
- Lot b : tailles par bloc retirées, plafond de 35 000, pointeur d'un Contexte coupé par le plafond,
  pointeur des listes arrêtées.
- Lot c : `move_block` vers une section, entrée « début de page » du plan, `append` qui prolonge une liste.

## Hors périmètre

- Invalidation par les enfants ou les pages liées d'un Contexte (titres, résumés) : non comptés
  aujourd'hui non plus ; la conversation suivante les voit.
- Adhésion à une équipe, ou droit de lecture changé, sans nouvelle révision : pas d'invalidation
  (HN-E11S03-7) ; la conversation suivante sert la bonne liste.
- Compteur dans l'éditeur, phrase de taille à l'écran : écartés (D134).
- Avertissement de `write` quand un Contexte publié fait dépasser le plafond : aucun (décision du
  responsable d'Oto, 2026-09-29). Option d'un cran plus simple retenue : l'assistant voit la coupe au
  `context` suivant (pointeur d'AC-b4), la personne dans la vue « Contexte » (AC-b5) ; sans
  `previewContext` à chaque publication d'un Contexte.
- Bornes en lignes des blocs (listes d'un Contexte 20, procédures utiles 60, nouveautés 10, contenus
  récents 20) : gardées, chaque arrêt dit (HN-E11S03-15).
- Texte de l'avis de fin (« Context budget reached. Omitted: … ») : inchangé (HN-E11S03-13).
- Retrait du déclencheur `bump_rules_version` et de `rules_version` : V2 si besoin (HN-E11S03-3).
- Déplacer une section entière : `delete_section` puis `add_section`, inchangé.

## Critères d'acceptation

### Lot a — ctx ciblé (FB-0005)

- [ ] **AC-a1 — Ce que garde le ctx.** **Given** `context` appelé **When** `issueCtx` écrit la
  ligne **Then** `ctx.contexts` vaut un objet `{<chemin>: <révision>}` : une clé par chemin attendu de
  la personne (`contexte`, `private/<handle>/contexte` si elle a un `handle`, `<équipe>/contexte` par
  équipe de l'identité), valeur = `nodes.revision` du nœud `context` publié (révision ≥ 1) à ce
  chemin, lu dans la transaction d'émission sous l'appelant, sans filtre de niveaux ; 0 s'il n'y en a pas.
- [ ] **AC-a2 — Seuls les Contextes gardés comptent.** **Given** un ctx d'une personne de l'équipe `ventes`
  **When** un Contexte est publié avec un contenu différent **Then** son prochain appel (hors
  `context`, `feedback`) rend `ctx_stale` si ce Contexte est `contexte`, `ventes/contexte` ou son
  Privé ; **And** il passe si c'est le Privé d'une autre personne ou `achats/contexte`.
- [ ] **AC-a3 — Premier Contexte, Contexte retiré.** **Given** une clé gardée à 0 **When** ce
  Contexte est publié pour la première fois **Then** `ctx_stale`. **Given** une clé gardée ≥ 1
  **When** le nœud n'est plus publié ni trouvé à ce chemin **Then** `ctx_stale`.
- [ ] **AC-a4 — Republication à l'identique (H28 tenue).** **Given** une clé gardée à la révision
  r et le nœud à r' > r **When** les blocs de `node_versions` à r et r' sont égaux dans l'ordre par
  `sameContent` et la clé (type, texte, données, clé ; ni id, ni position, ni révision de bloc, ni
  provenance) **Then** le ctx reste valide. Le titre et le résumé ne comptent pas : `context` ne les
  sert pas (l'en-tête de partie vient de `contextPaths`).
- [ ] **AC-a5 — Texte du refus.** **Given** un ctx périmé **Then** `ctx_stale`, texte mot pour mot :
  `context has changed (ventes/contexte, contexte): call acme_context again with the same request, then retry this call.`
  (chemins dans l'ordre des parties, liste bornée par `boundedList`). **Given** `contexts` nul (code
  émis avant la 1.0.1) **Then** `ctx_stale` avec le texte actuel, sans parenthèse.
- [ ] **AC-a6 — `feedback` avec un ctx périmé.** **Given** un ctx connu, de la personne et de
  l'organisation, mais périmé **When** `feedback` **Then** le ticket est enregistré, lié à ce ctx
  (HN-E11S03-1, validée). **And** un ctx absent ou inconnu reste `ctx_missing`.
- [ ] **AC-a7 — Ce que dit la publication.** **Given** `write` qui publie un Contexte **When** son
  contenu diffère de la révision publiée précédente (ou première publication) **Then** la ligne est :
  `Context ventes/contexte changed: every conversation it was served to must call acme_context again before any other acme_ tool, this one included if it was.`
  et `data.rules_changed: true` ; **Given** une republication identique **Then** ni ligne ni
  `rules_changed: true`. Même règle pour la ligne du MCP admin (`mcp/admin/tools/node.ts` l. 49-51) :
  `ventes/contexte is a context page: the conversations it was served to expire, and their assistants call acme_context again.`
- [ ] **AC-a8 — Coût.** `requireCtx` garde deux lectures parallèles dans sa transaction (la ligne
  `ctx` ; les révisions des chemins gardés, qui remplacent la lecture d'`orgs`) ; les instantanés de
  `node_versions` ne sont lus que pour une clé dont la révision diffère.

### Lot b — Plafond seul, coupe dite (FB-0006, D134)

- [ ] **AC-b1 — Chaque bloc servi entier.** **Given** un Contexte de 10 000 caractères, 60 procédures
  utiles de 9 000 caractères en tout, 10 nouveautés de 900, et un total sous 35 000 **When** `context`
  **Then** chaque bloc est servi entier, sans pointeur ni ligne finale, et chaque ligne du rapport est
  `full`. `CONTEXT_SIZES`, `NEWS_SIZE`, `RECENT_SIZE`, `PROCEDURES_SIZE` et `withinSize` n'existent plus.
- [ ] **AC-b2 — Listes arrêtées, dites.** **Given** un Contexte dont les listes d'index dépassent
  20 lignes **Then** sa partie finit par
  `Only the first 20 entries are listed. Read the rest: acme_read {"path": "ventes/contexte"}.`
  (20 = `CONTEXT_LIST_MAX`), et compte `cut` au rapport.
- [ ] **AC-b3 — Plafond.** **Given** des blocs dont le total dépasse 35 000 caractères (`CONTEXT_BUDGET`)
  **Then** le texte fait au plus 35 000 ; les blocs sont gardés dans l'ordre servi (code, procédure
  reconnue, Tout le monde, Privé, équipes, nouveautés, procédures utiles, contenus récents) ; le premier
  qui ne tient pas est coupé à la dernière ligne entière (la procédure reconnue, jamais coupée, cède la
  place à son pointeur, N2), les suivants sont omis, et la ligne finale les nomme, texte inchangé :
  `[Context budget reached. Omitted: ventes/contexte (cut), news, procedures, recent content. Use acme_find or acme_read for more.]`
- [ ] **AC-b4 — Contexte coupé par le plafond.** **Given** une partie de Contexte au corps servi
  (`path` posé) coupée par le plafond **Then** la coupe recule avant un bloc clôturé resté ouvert et
  la partie finit par
  `This context is cut: everything served together exceeds 35,000 characters. Read the rest: acme_read {"path": "ventes/contexte"}.`
  (nombre par `formatCount(CONTEXT_BUDGET)`), pointeur compris dans le plafond ; ce pointeur remplace
  celui des listes s'il y en avait un. **Given** une partie dont même la tête ne tient pas **Then** elle
  est omise et nommée (AC-b3). Les débuts des deux pointeurs et `Read the rest:` sont des constantes de
  `CONTEXT_INDEX` ; `CONTEXT_INDEX.rest` disparaît.
- [ ] **AC-b5 — L'écran.** **Given** la vue « Contexte » de l'accueil **Then** aucun compteur ni
  phrase de taille ; **Given** un total sous le plafond **Then** aucune ligne d'avertissement ;
  **Given** un total au-delà **Then** les lignes existantes, textes inchangés : « Budget atteint :
  l'assistant ne lit pas … » en fin de texte, « Cette partie ne tient pas dans le budget : l'assistant
  ne la lit pas. » sur une partie omise, et « La suite de ce contexte est lue à la demande. » sous un
  Contexte coupé, reconnu par les constantes d'AC-b4 et d'AC-b2 (`portage-ecrans.md § 6`) ; aucun
  pointeur brut affiché (HN-E11S03-14).

### Lot c — Déplacer, compléter (FB-0008)

- [ ] **AC-c1 — `move_block` vers une section.** **Given** `{op: "move_block", block, section: "Étapes"}`
  **Then** le bloc va à la fin de la section, sous-sections comprises (même point qu'`append`), et le
  résultat dit `moved block <ref> to the end of « Étapes »`. **And** `section` avec `after_block` :
  `invalid_arguments` « give after_block or section, not both. » ; section inconnue ou ambiguë : les
  refus de `locate` ; le titre même de cette section : « a heading cannot move into the section it heads. »
- [ ] **AC-c2 — Sans destination.** **Given** `move_block` sans `after_block` ni `section` **Then**
  le comportement est inchangé (l'éditeur l'emploie, `ui/noeud/editeur/operations.ts` l. 66-68) et le
  résultat dit `moved block <ref> to the start of the page, outside any section`.
- [ ] **AC-c3 — Le plan montre le début de page.** **Given** une page dont des blocs précèdent le
  premier titre **When** `read` sert son plan, ou un refus de révision son état (`staleState`) **Then**
  la première ligne est `- (start of page, 240 characters)` ; le compte de sections, `data.outline`
  et le plan de l'écran ne changent pas (HN-E11S03-10).
- [ ] **AC-c4 — `append` prolonge une liste.** **Given** une section dont le bloc qui précède le point
  d'insertion est une `list` et un texte dont le premier bloc est une `list` de même `ordered` au
  premier niveau (ou deux `checklist`) **Then** les éléments neufs, enfants compris (modèle d'E10-S04),
  s'ajoutent à la liste existante : même id, révision de bloc incrémentée et provenance posée comme un
  `replace_block`, `start` existant gardé ; les blocs suivants du texte suivent. Résultat :
  `appended to « Tâches » (+45 → 320 characters; the list continues with 3 more items)`.
- [ ] **AC-c5 — Pas de fusion.** **Given** genres différents (puces et numéros, `list` et
  `checklist`), un autre bloc entre, ou un total au-delà de `LIST_ITEMS_MAX` (500, sous-éléments
  compris) **Then** un bloc neuf, comme aujourd'hui ; au-delà de 500, le résultat ajoute
  `; a new list starts: a list holds 500 items at most`.
- [ ] **AC-c6 — Descriptions.** `schemas/nodes.ts` : `section` dit « Section operations, and
  move_block (to the end of that section). » ; `after_block` : « move_block only: reference of the
  block to put it after (default: the start of the page, outside any section). » ; la description de
  `write` (`mcp/tools.ts` l. 76) cite `section` pour `move_block` et reste sous 1 000 caractères
  (`tests/unit/mcp-tools.test.ts` l. 55, 126).

## Implémentation

### Migrations prévues

`packages/plateforme/migrations/<horodatage>_ctx_contexts.sql`, additive :
`alter table platform.ctx add column contexts jsonb, add constraint ctx_contexts_check check
(contexts is null or jsonb_typeof(contexts) = 'object')` ; commentaire de colonne. Nul = émis avant
la 1.0.1, donc périmé (AC-a5) : aucune reprise. Déclencheur, `rules_version` et policies inchangés
(aucune `update` sur `ctx` : la garde ne réécrit pas la ligne). `server/database.ts` régénéré
(`scripts/db-types.mjs`). Le lot b n'a pas de migration.

### Schémas Zod

Aucun schéma nouveau ; `writeOpSchema` (`schemas/nodes.ts`) : descriptions seules. `CONTEXT_INDEX`
(`schemas/context-index.ts`) : `rest` retiré ; débuts des pointeurs d'AC-b2 et d'AC-b4 et `Read the
rest:` ajoutés. `SERVED_BUDGET` inchangé.

### Fichiers à modifier, par face

- `migrations/` : le fichier ci-dessus.
- `server/ctx.ts` : `issueCtx` (lit et écrit `contexts`), `requireCtx` (comparaison, option
  `{ staleAllowed }`), `staleCtxMessage(prefix, paths?)`.
- `server/context/blocks/contexts.ts` : export `expectedContextPaths(identity)` (chemins non nuls de
  `contextPaths`) ; `CONTEXT_SIZES` et `ContextPath.size` retirés ; `partBlock` sert le corps entier,
  pointeur d'AC-b2 si `listsCut` ; `beforeOpenFence` part dans `engine.ts`.
- `server/context/engine.ts` : `CONTEXT_BUDGET = 35_000` et son commentaire ; `withinSize` retiré ;
  dans `renderContext`, le bloc coupé qui a un `path` recule avant un bloc clôturé ouvert et finit par
  le pointeur d'AC-b4 (place réservée avant la coupe) ; doc de `ContextBlock.cut` (bornes en lignes).
- `server/context/blocks/news.ts`, `recent.ts` : `NEWS_SIZE`, `RECENT_SIZE` et l'appel à `withinSize`
  retirés. `blocks/procedures.ts` : `PROCEDURES_SIZE` et la boucle l. 108-110 retirés, 60 lignes au plus.
- `server/nodes/diff.ts` : export `samePublishedContent(before, after)` sur `sameContent` et la clé.
- `server/nodes/publish.ts` : `rulesChanged` = contenu changé (instantané précédent par `snapshotBlocks`).
- `server/nodes/write-result.ts` (l. 108-110), `mcp/admin/tools/node.ts` (l. 49-51) : textes d'AC-a7.
- `mcp/server.ts` l. 147 : `staleAllowed: key === "feedback"`.
- `server/nodes/ops.ts` (`USES.move_block` + `section`, refus des deux champs),
  `server/nodes/block-ops.ts` (`moveBlock`), `server/nodes/section-ops.ts` (export de `locate`,
  fusion dans `append`), `server/nodes/read-format.ts` (`outlineLines`, `staleState`),
  `server/nodes/read-body.ts` (ligne de début de page).
- `schemas/nodes.ts`, `mcp/tools.ts` : AC-c6.
- `ui/contexte/parties-du-contexte.ts` l. 300 : pointeur reconnu par les deux débuts neufs. Ni
  `libelles.ts`, ni `listes-servies.tsx`, ni `contexte-servi.tsx` ne changent.
- `scripts/lib/org-transfer.mjs` l. 163 : `contexts` dans les colonnes de `ctx`.
- Doublures : `tests/helpers/plateforme.ts` l. 464 et `tests/helpers/reference-org-sql.ts` l. 220
  posent `contexts: {}` (aucun Contexte attendu, donc jamais périmé).
- Docs (pilote, avant le code ; pas cette story) : ADR-002 § 2 et § 7 (20 000 → 35 000, plus de tailles
  nominales) ; `hypotheses.md` H27, H28, H30 (l. 44), N6 (l. 526) ; `prd.md` FR-TASK-02, FR-CONC-04,
  § `context` l. 224-240 (colonne « Taille nominale » retirée, « 20 000 caractères au plus, environ
  5 000 tokens » corrigée, phrase « Au-delà du budget » selon l'ordre réel d'AC-b3), l. 84 et NFR-TASK-01
  l. 280 (20 000) ; `architecture.md` l. 190, 248, 284 (budget de 20 000), 449 (« tailles nominales ») ;
  golden query C2 et une C2 bis ; fiche D134.

### Patterns à suivre

- `security-patterns.md § Droits dans le service` : la garde décide, avant le service.
- `database-patterns.md § Migrations` : additive ; `§ Transactions` : lectures de la garde dans une transaction.
- `mcp-patterns.md § 4` : refus et pointeurs en anglais, qui disent quoi faire ; P14 : textes testés mot pour mot.
- `portage-ecrans.md § 6` : une règle du service, une seule source (constantes partagées).

## Rayon d'impact

### Appelants
- `rg -n "requireCtx\(|issueCtx\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src` → `mcp/server.ts`
  l. 147 (seule garde) et `server/context/index.ts` l. 93 (`issueWithHost`, en parallèle de
  `contextBodies` dans `assembleContext` l. 142) : aucun autre.
- `rg -n "staleCtxMessage|rulesChanged|rules_changed" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `server/ctx.ts`, `nodes/publish.ts`, `nodes/write-result.ts`, `mcp/admin/tools/node.ts` ; tests
  `server-ctx` (unit, intégration), `nodes-publish`, `mcp-admin-nodes`. `server/rules.ts`
  `rulesChanged` est un homonyme sans rapport (règles d'accès).
- `rg -n "platform\.ctx|rules_version" C:/apps/oto-pkg/tests C:/apps/oto-pkg/scripts -l` → 26
  fichiers ; doublures qui servent l'ancienne forme : `tests/helpers/plateforme.ts` l. 464,
  `reference-org-sql.ts` l. 220, `server-ctx.test.ts` (intégration, `setRulesVersion`),
  `mcp-core.test.ts` l. 238-242, `platform-rls.test.ts` l. 89 (inchangé : aucune `update`).
  `brouillon-publication.test.ts` (AC19) et `demo-seed.test.ts` lisent `rules_version`, toujours compté.
- `rg -n "CONTEXT_SIZES|PROCEDURES_SIZE|RECENT_SIZE|NEWS_SIZE|withinSize|CONTEXT_BUDGET" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests C:/apps/oto-pkg/scripts`
  → paquet : `context/index.ts` l. 178, 206-208 (`CONTEXT_BUDGET`, valeur seule : `context` et
  `previewContext` suivent), `engine.ts`, `blocks/contexts.ts`, `news.ts`, `recent.ts`, `procedures.ts` ;
  rien dans `src/` ni `scripts/`. Tests : `e05s12-texte-servi.test.ts` l. 116-151 (coupe à 2 400 et
  1 200 : réécrits sur AC-b2 et AC-b4), `context-blocks.test.ts` l. 418, 640-675 (tailles des blocs
  dynamiques : réécrites en « servi entier »), 729, `context-engine.test.ts` l. 49, 195-199
  (`CONTEXT_BUDGET` importé : valides tels quels).
- `rg -n "CONTEXT_INDEX\.rest|Rest of this context" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests C:/apps/oto-pkg/docs/mcp-golden-queries.md`
  → `schemas/context-index.ts` l. 21, `blocks/contexts.ts` l. 169, `ui/contexte/parties-du-contexte.ts`
  l. 300 ; tests `context-blocks.test.ts` l. 363, 867, `e05s12-texte-servi.test.ts` l. 116, 151,
  `m71-listes-du-contexte.test.tsx` l. 75, 81 (doublure du texte servi à l'ancien pointeur : réécrite,
  sinon elle passe le type-check et échoue à l'exécution). Aucune golden query.
- `rg -n "budget: 20_000|budget reached" C:/apps/oto-pkg/tests -c` → 13 fichiers : l'avis de fin ne
  change pas (`context-engine`, `e05s11-parties-du-contexte`, `e05s13-lignes-servies`) ; `budget: 20_000`
  des doublures de `previewContext` (`admin-config-pages`, `e05s10d-organisation-liens`, `m71`…) est une
  forme que l'écran ne lit pas (`rg -n "\.budget\b" C:/apps/oto-pkg/packages/plateforme/ui` : seul
  le libellé `LIGNES_SERVIES.budget`) : inchangées.
- `rg -n "previewContext" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src` → vue « Contexte »
  (`src/app/(dashboard)/page.tsx` l. 86), page d'un nœud (`n/[...chemin]/page.tsx` l. 145, 172),
  Organisation (`admin/organisation/page.tsx` l. 47), `ui/procedure/procedure-du-noeud.tsx` : même
  moteur, voient le plafond neuf sans changement ; aucun appelant neuf.
- `rg -n "partBlock|renderContext\(|morceauxDuContexte|morceauxDeLaFin" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `contexts.ts`, `engine.ts`, `context/index.ts`, `ui/contexte/` (`contexte-servi.tsx`,
  `parties-du-contexte.ts`), `ui/admin/organisation/contexte-de-l-entreprise.tsx` l. 79 ; tests
  `context-engine`, `context-blocks`, `e05s11-parties-du-contexte`, `e05s12-texte-servi`,
  `e05s13-lignes-servies`, `e05s11-contexte-servi`, `m71-listes-du-contexte`.
- `rg -n "outlineOf\(|outlineLines\(|staleState\(" C:/apps/oto-pkg/packages` → `read-body.ts` l. 52
  (texte), `read.ts` l. 202 (`data.outline`) et l. 298 (écran), `read-format.ts` l. 124 : seuls le
  texte et `staleState` gagnent la ligne.
- `rg -n "move_block|after_block" C:/apps/oto-pkg/packages/plateforme` → `ui/noeud/editeur/operations.ts`
  l. 66-68 (tête de page sans `after_block` : comportement gardé), `mcp/tools.ts` l. 76, `schemas/nodes.ts`.
- `rg -n "\"append\"" C:/apps/oto-pkg/packages/plateforme/server` → `section-ops.ts` ;
  `catalog/contracts.ts` l. 59 (exemple d'étape « 4. » ajoutée à une procédure : elle prolonge
  désormais la liste des étapes, ce que vérifient `callLocation` et `stepBefore` d'E10-S04).

### Doublons
- `rg -n "sameContent\(|sameJson\(" C:/apps/oto-pkg/packages/plateforme C:/apps/oto-pkg/scripts` →
  `server/nodes/diff.ts` (`sameContent`) : réutilisé ; `scripts/demo/publication.mjs` l. 224
  (`compared`, mêmes champs) : laisser, script de semis hors paquet.
- `rg -n "snapshotBlocks" C:/apps/oto-pkg/packages/plateforme/server` → `nodes/store.ts` l. 46 :
  réutilisé pour lire les instantanés.
- `rg -n "linesThatFit|beforeOpenFence|withinSize\(" C:/apps/oto-pkg/packages/plateforme/server` →
  une seule coupe reste, celle de `renderContext` ; `beforeOpenFence` déplacé, pas recopié.
- `rg -n "budget|omise|suite" C:/apps/oto-pkg/packages/plateforme/ui/contexte/libelles.ts` → les lignes
  « Budget atteint », « ne tient pas dans le budget » et « La suite… » disent déjà le dépassement :
  réutilisées, aucune phrase neuve (AC-b5).
- Registre (`component-registry.md`, lignes `ctxCodeSchema`, `ContexteServi`) : rien ne fusionne
  deux listes ni ne compare deux révisions servies ; `locate` s'exporte au lieu d'être recopié.

### Effet produit
- Schéma : Ⓜ, une colonne ; transfert d'organisation (`org-transfer.mjs`, test colonne par colonne).
- MCP : liste d'outils inchangée ; texte de `ctx_stale`, de la publication d'un Contexte, des deux
  pointeurs, de `move_block` et `append`, descriptions de `write`. `context` peut rendre jusqu'à
  35 000 caractères au lieu de 20 000, et des Contextes plus longs qu'avant entiers. Golden query C2 à rejouer.
- Toutes les conversations ouvertes au déploiement périment une fois (`contexts` nul).
- Écran : vue « Contexte », encart d'Organisation, aperçu d'un nœud : même moteur, aucune phrase neuve ;
  une partie coupée par le plafond montre la phrase « suite » existante. L'éditeur de nœud : aucun changement.
- Admin : `rulesVersion` de la fiche d'organisation (`server/admin/orgs.ts` l. 212) reste un compteur,
  plus un signal d'invalidation.

### Refacto
- Écarté : retirer le déclencheur et `rules_version` (drop interdit par `check:migrations`, rien ne casse sans).
- Écarté : renommer `rulesChanged` / `rules_changed` en « context changed » : churn de tests, pas de gain.
- Écarté : renommer `CONTEXT_BUDGET` en « plafond » et l'avis « budget reached » : texte servi et
  tests P14 changés pour un mot.

## Hypothèses

- **HN-E11S03-1 — validée (2026-09-29)** : `feedback` accepte un ctx périmé mais connu (un retour sur la
  panne ne doit pas exiger de relire le contexte).
- **HN-E11S03-2 — abandonnée (D134)** : l'écran ne dit aucune taille ; il n'avertit qu'au-delà du plafond (AC-b5).
- **HN-E11S03-3** : déclencheur et `rules_version` gardés, plus lus (source : ADR-006, surface minimale).
- **HN-E11S03-4** : `contexts` nul = périmé, sans reprise (source : décision 4 de D132).
- **HN-E11S03-5** : les révisions se lisent dans la transaction d'`issueCtx`, en parallèle des
  corps : une publication entre les deux lectures peut périmer le ctx une fois de trop, ou, dans
  l'autre ordre, le laisser valide sur un corps plus ancien de quelques millisecondes (source :
  NFR-TASK-02, p50 < 1 s).
- **HN-E11S03-6** : contenu comparé = blocs publiés (type, texte, données, clé) ; titre et résumé
  exclus (source : `diff.ts`, en-tête de partie servi par `contextPaths`).
- **HN-E11S03-7** : révision lue sans filtre de niveaux, à l'émission comme à la garde, pour que les
  deux lectures voient la même chose ; un droit changé sans révision n'invalide pas (source : simple).
- **HN-E11S03-8** : fusion au-delà de 500 éléments : bloc neuf, dit (source : `LIST_ITEMS_MAX`, comportement actuel).
- **HN-E11S03-9** : liste numérotée prolongée : `start` existant gardé, celui du texte ignoré (source : simple).
- **HN-E11S03-10** : la ligne de début de page reste dans le texte du plan (source : l'écran a son propre plan).
- **HN-E11S03-11** : pas de champ `cut` dans `data` de `context` : le texte le dit (§ Justifier une surface nouvelle).
- **HN-E11S03-12 — retirée (2026-09-29)** : `write` n'avertit pas d'un Contexte qui fait dépasser le
  plafond (Hors périmètre).
- **HN-E11S03-13** : ordre au-delà du plafond = ordre servi, sans priorité propre (source : `renderContext`,
  `engine.ts` l. 112-150) : partent d'abord les contenus récents, puis les procédures utiles, les
  nouveautés, les équipes de la dernière à la première, le Privé, Tout le monde ; le premier bloc qui
  ne tient pas est coupé, pas omis. Avis de fin inchangé (mot « budget » gardé, tests P14 intacts).
- **HN-E11S03-14** : si le code, la procédure reconnue et la tête de Tout le monde tiennent mais pas
  son corps, Tout le monde est coupé à la dernière ligne entière avant un bloc clôturé ouvert, avec le
  pointeur d'AC-b4, et tout ce qui suit est omis et nommé ; si la procédure ne tient pas après le code,
  son pointeur la remplace (N2) et l'assemblage continue (source : `renderContext`, `partBlock`,
  `beforeOpenFence`). L'écran réutilise ses lignes, textes inchangés, dans la vue « Contexte » où
  s'écrivent les Contextes : aucune surface neuve (source : `libelles.ts` l. 90, 118, 122).
- **HN-E11S03-15 — validée (2026-09-29)** : les bornes en lignes restent (listes d'un Contexte 20, N20 ;
  procédures utiles 60, H35 ; nouveautés 10, H34 ; contenus récents 20, H36) : elles choisissent quoi
  lister, pas une taille, et chaque arrêt est dit à l'assistant (AC-b2, ligne « … and k more »).
- **HN-E11S03-16** (implémentation) : à la garde, un chemin gardé par le code mais plus attendu (équipe
  quittée), ou attendu mais pas gardé (équipe rejointe), est ignoré (source : HN-E11S03-7).
- **HN-E11S03-17** (implémentation) : le refus nomme les chemins changés dans l'ordre des parties
  (`expectedContextPaths`), bornés par `boundedList` (source : AC-a5).
- **HN-E11S03-18** (implémentation) : le nombre du pointeur d'une partie coupée est tiré du plafond
  (`formatCount(CONTEXT_BUDGET)`), jamais écrit en dur (source : AC-b4).
- **HN-E11S03-19** (implémentation) : une partie dont même la tête ne tient pas n'est omise que si son corps
  est servi (`path` posé) ; les autres blocs se coupent à la dernière ligne entière (source : AC-b4, `renderContext`).
- **HN-E11S03-20** (implémentation) : un instantané de `node_versions` absent pour l'une des deux révisions
  comparées vaut un changement : le code est périmé (source : option sûre, un rappel de `context` de trop).
- **HN-E11S03-21** (implémentation) : nouveautés et contenus récents, arrêtés à 10 et 20 lignes, n'ajoutent
  pas de ligne « … and k more » ; les listes d'un Contexte et les procédures utiles disent leur arrêt
  (source : leur borne choisit les plus récents).
- **HN-E11S03-22** (implémentation, lot c, renumérotée à la fusion) : dans le résultat d'`append` qui
  prolonge une liste, « +N » est la croissance de la section en caractères.
- **HN-E11S03-23** (implémentation, lot c) : « the list continues with N more items » compte les éléments
  ajoutés, sous-éléments compris (source : `LIST_ITEMS_MAX`, E10-S04).
- **HN-E11S03-24** (implémentation, lot c) : `staleState` d'une page sans titre : la ligne de début de page,
  puis « - (no section) ».
- **HN-E11S03-25** (implémentation, lot c) : le résultat de `move_block` vers une section cite son titre
  tel que rangé, non tel que demandé.
- **HN-E11S03-26** (implémentation, lot c) : un titre déplacé vers une sous-section de la section qu'il
  ouvre n'est pas refusé ; seul `section` égal à la section qu'il ouvre l'est (AC-c1).

## Actions JB

- Aucune action externe ; aucune hypothèse à trancher.

## Tests attendus

### Unit tests
- [ ] `server-ctx.test.ts` : `staleCtxMessage` avec chemins et sans (mot pour mot) ; garde : nul → périmé.
- [ ] `nodes-read.test.ts` (qui teste déjà `nodes/diff`) : `samePublishedContent` ignore id, révision,
  provenance ; voit un texte, une donnée, une clé, un ordre changés.
- [ ] `nodes-publish.test.ts` : ligne d'AC-a7 ; republication identique sans ligne.
- [ ] `context-engine.test.ts` : AC-b3 et AC-b4 (Contexte coupé avec pointeur, bloc clôturé non
  ouvert, texte ≤ 35 000, tête qui ne tient pas → omise), avis de fin inchangé.
- [ ] `e05s12-texte-servi.test.ts` : réécrit sur AC-b1 (Contexte de 10 000 entier) et AC-b2 (listes).
- [ ] `context-blocks.test.ts` : blocs dynamiques servis entiers (l. 640-675 réécrites), pointeurs neufs.
- [ ] `nodes-ops.test.ts` : AC-c1 à AC-c5 (dont liste imbriquée d'E10-S04 gardée à la fusion,
  `checklist`, puces contre numéros, 500).
- [ ] `nodes-read.test.ts` : ligne de début de page du plan et de `staleState`.
- [ ] `e05s11-parties-du-contexte.test.ts` : parité avec le moteur pour les deux pointeurs.

### Integration tests (données jetables)
- [ ] `server-ctx.test.ts` : `contexts` écrit (Privé sans `handle` absent, équipe sans Contexte à 0) ;
  AC-a2 (quatre cas), AC-a3 (deux), AC-a4, AC-a5 nul.
- [ ] `org-transfer.test.ts` : colonnes de `ctx` (test existant, l. 521).
- [ ] `m71-listes-du-contexte.test.tsx` : doublure au pointeur neuf ; phrase « suite », aucun pointeur brut.
### MCP (`mcp-core.test.ts`, `InMemoryTransport`)
- [ ] Publication d'un Contexte servi → `ctx_stale` au texte d'AC-a5 ; d'un Privé d'autrui → l'appel passe.
- [ ] `feedback` avec un ctx périmé enregistré ; `read` refusé.
- [ ] `mcp-tools.test.ts` : descriptions sous 1 000 caractères.

### Golden queries (pilote, `docs/mcp-golden-queries.md`)
- [ ] C2 : entre les tours, le Contexte de Tout le monde est publié changé → `ctx_stale` nommant `contexte`.
- [ ] C2 bis (négatif) : le Privé d'une autre personne est publié → aucun refus, aucun rappel de `context`.

### E2E tests
- [ ] Contrôle visuel de la vue « Contexte » avec une partie coupée par le plafond, thèmes clair et sombre.

## Post-implémentation

### Écarts avec l'architecture

Invariants touchés comme prévu : ADR-002 § 2 et § 7 amendés par le pilote à la fusion ; `docs/architecture.md`
(`ctx`, `bump_rules_version`, `context/`, « Flexible sans ADR ») et `docs/prd.md` suivent. La version qui réunit
E10 et E11 est la 1.1.0 (fiche D145) : les mentions « 1.0.1 » de cette story valent 1.1.0. Migration renommée à
la fusion `20260929180000_ctx_contexts.sql` (depuis `20260929150000`), après `20260929170000` d'E10-S04.
`beforeOpenFence` passe de `blocks/contexts.ts` à `engine.ts` (la tâche M82 suit).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `expectedContextPaths` | `packages/plateforme/server/context/blocks/contexts.ts` | Chemins des Contextes attendus de la personne, dans l'ordre des parties ; ceux que garde le `ctx` (AC-a1) |
| `readRest` | `packages/plateforme/server/context/engine.ts` | Fin commune des deux pointeurs d'un Contexte servi en partie (AC-b2, AC-b4) |
| `samePublishedContent` | `packages/plateforme/server/nodes/diff.ts` | Deux états publiés au même contenu servi (AC-a4, H28) |
| `startOfPageLines` | `packages/plateforme/server/nodes/read-format.ts` | Ligne « - (start of page, N characters) » du plan et de `staleState` (AC-c3) |
| `locate` (exporté) | `packages/plateforme/server/nodes/section-ops.ts` | Section d'un titre, refus communs d'`append` et de `move_block` vers une section (AC-c1) |

### Notes

- Lots a et b livrés dans le worktree `e11-s03`, lot c dans `e11-s03c` (parti de `main` avec E10) ; revue
  approuvée ; fusion sur `main` sans commit, commit commun à venir.
- Hypothèses d'implémentation HN-E11S03-16 à 26 (celles du lot c renumérotées 22 à 26 à la fusion),
  reportées dans `docs/decisions/hypotheses.md`.
- La migration attend son application au projet Supabase de test avant le `verify` de la fusion (action JB,
  `status.md`) ; toutes les conversations ouvertes au déploiement rappellent `context` une fois.
- Golden queries C2 (réécrite), C2 bis, RW9 et RW10 ajoutées, à jouer sur les hosts.
