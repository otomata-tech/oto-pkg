# Story E11-S01 — Tableaux : créer sans écraser, colonne obligatoire stricte, recherche par mots, révision et auteur, décision de revue par l'agent, preuve par tableau, réglages à l'écran

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 5.4 Concevoir, organiser, partager (§ Tableau, `docs/prd.md` l. 340-356) ; 5.2 Faire une tâche avec son assistant |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | Lot f : `packages/plateforme/ui/tableau/file-de-revue.tsx` (mention « sans preuve » de la fiche à revoir, AC-f7). Lot g : en-tête d'écran du nœud (`packages/plateforme/ui/noeud/en-tete-du-noeud.tsx`, créneau `access` de `ScreenHeader`) ; popover du design system (`ui/ds/react/popover.tsx`) ; commutateur natif de `ui/public/partage-sur-le-web.tsx` l. 62-82 (`oto-choice`, `oto-switch-track`, `ui/ds/components/css/choice.css` l. 126-158), sorti en `Switch` (AC-g9). Lots a à e : N/A, aucun écran ; textes servis à l'assistant (`mcp-patterns.md`) |
| **Conventions** | forms, supabase, security, registry, mcp, testing, a11y, portage |
| **Estimation** | L (sept lots, sans migration : six lots de taille S côté service et MCP, un écran touché au lot f ; au lot g, un îlot d'écran nouveau et un composant du design system extrait, sur une route et un service existants) |
| **Vague** | E11, ordre 1 pour les lots a à f (second worktree, en parallèle d'E10) ; lot g après E11-S02 (tous ses lots, publication directe comprise) et E11-S05 (même en-tête de nœud), avant E11-S07 ; version 1.0.1 (fiche D131) |
| **Dépend de** | Lots a à f : — . Lot g : E11-S02 lots a et d (AC-a2 : le niveau écriture publie l'en-tête d'un tableau publié ; `node.discard_draft`, que la phrase d'AC-g6 demande à l'assistant) ; E11-S05 (même en-tête de nœud, `en-tete-du-noeud.tsx`, créneau `access`) |
| **Porteuse de migration** | Non : la provenance est le JSON `blocks.provenance`, l'en-tête le JSON `nodes.meta`, écrit par le service existant |

## Contexte

Chemins relatifs à `packages/plateforme/`.

Un assistant a bâti une todo multi-projets sur l'organisation Démo, par MCP. Cinq de ses tickets
portent sur les tableaux :

- **FB-0001** : `table.write` sur une clé existante met la ligne à jour sans le dire. La fusion est
  voulue (PRD l. 346, H92, N3 d'E07-S02) : `writeRow` choisit création ou mise à jour selon
  l'existence de la ligne (`server/tables/write.ts` l. 223-225) ; une création croisée est relue
  puis appliquée en mise à jour (l. 188). Un assistant qui croit créer écrase.
- **FB-0002** : une colonne `required` se satisfait d'un `verified_empty` (`write-row.ts` l. 244-248,
  `missing()` ; l. 262-264 à la création ; l. 273 en note). Le contrat dit l'inverse : « a row cannot
  lack a value » (`schemas/tables.ts` l. 32 et l. 276).
- **FB-0003** : `q` cherche une seule sous-chaîne par cellule (`server/tables/filters.ts` l. 217-223) :
  « mairie valbrune » ne trouve rien, alors que `table.rows` promet « filtered by words »
  (`rows.ts` l. 307). `limit: 100` rend « Too big: expected number to be <=50 » (`schemas/tables.ts`
  l. 200).
- **FB-0010**, parties 1 et 2 : `table.schema` ne rend pas la révision (`server/tables/schema.ts`
  l. 86-94, 129-134), que `read` rend (`server/nodes/read-format.ts` l. 89). La provenance garde
  `{origin, by, ctx, at}` (`write-row.ts` l. 139-142) ; `table.rows` n'en sert ni le client MCP ni le
  travailleur (`rows.ts` l. 130-141, `schemas/tables.ts` l. 245-252). Le client est dans
  `platform.ctx.host` (migration de base l. 2178-2187 ; N3 l. 347 : signature `nom@version`) ; le
  libellé du travailleur ne vit que pendant le bail (`claimed_by`).
- **FB-0009** : `table.release` et `table.write` refusent les états de décision (`release.ts`
  l. 31-39, `row-rules.ts` l. 73-81) ; seule la revue de l'écran les pose (`review.ts` l. 81-108,
  provenance `human`). C'est P10 (hypotheses.md l. 112) et N9 d'E07-S02 (l. 749). Pour une todo,
  la revue humaine n'a pas de sens.
- **Preuve par tableau** (lot f, décision du responsable d'Oto, sans ticket) : les tableaux sont
  jugés trop lourds face à un tableur. Toute valeur nouvelle d'une colonne de valeur exige
  `{value, comment | link}`, sinon l'appel entier est refusé (`withoutBareValues`,
  `server/tables/write.ts` l. 82-104, appelé l. 261 ; fiches D99, D100 ; HN-M53-5). La publication
  d'une procédure refuse de même un bloc `call` de `table.write` sans preuve
  (`server/tables/check.ts` l. 107-110, HN-M53-10). La file de revue marque « sans preuve » la valeur
  nue d'un assistant (`ui/tableau/file-de-revue.tsx` l. 50-54). La file de travail et la revue sont
  déjà facultatives par tableau (`lifecycle`, `lifecycle.review`) ; la preuve ne l'est pas.
- **Réglages à l'écran** (lot g, décision du responsable d'Oto, sans ticket) : aucun écran n'écrit
  l'en-tête d'un tableau ; seul `write` le fait (`server/nodes/write.ts` l. 124-130,
  `tableHeaderEdit`). La route `POST /api/plateforme/nodes` (`api/nodes.ts` l. 70-81) accepte déjà
  `header` et `publish` par `writeNodeBodySchema` (`schemas/node-body.ts` l. 20, `schemas/nodes.ts`
  l. 151) et appelle `writeNode`, le service de `write`. L'écran connaît le niveau de la personne
  par `vue.level` (`schemas/nodes.ts` l. 194 ; 2 = écriture, 3 = gestion ; publier exige aujourd'hui
  la gestion, `server/access.ts` l. 46, `publish: ACCESS_LEVELS.manage`, et l'écriture après E11-S02
  AC-a1 et AC-a2). Au niveau écriture, l'écran d'un tableau est monté sous la file
  d'opérations de la page (`ui/noeud/ecran-de-noeud.tsx` l. 178, `FileDOperations`), qui pose la
  révision et le tampon courants de chaque écriture. Un brouillon d'en-tête en attente (écrit par
  un assistant sans publication) est la base de toute écriture d'en-tête : le service y fusionne le
  changement et publie le brouillon entier (`tableHeaderEdit`, `publishAfter`,
  `server/nodes/write.ts` l. 203-213) ; l'abandonner se fait par un assistant (`node.discard_draft`,
  E11-S02). Le commutateur natif du design system existe déjà, local et non exporté, dans le
  partage sur le web (`ui/public/partage-sur-le-web.tsx` l. 62-82, `Commutateur`).

Décisions du responsable d'Oto (2026-09-29) : `create_only` seul, sans clé auto-incrémentée ;
option par colonne qui exige une vraie valeur, défaut inchangé ; option par tableau qui laisse
l'agent décider, défaut non, provenance `agent`, amende P10. Même jour, pour le lot f (fiche D133) :
la preuve devient une option **par tableau** (une option par organisation est écartée), attribut
d'en-tête `proof`, défaut `false` ; sans lui, `table.write` accepte une valeur nue ; avec lui, la
règle actuelle s'applique inchangée, refus à la publication d'une procédure compris. Aucune reprise
des tableaux existants (stade R&D, sans client). Un tableau « simple » est un tableau sans
`lifecycle` et sans `proof`. Même jour, pour le lot g : les options d'un tableau s'activent par
l'assistant (`write`, `header.*`) **et** par un petit panneau d'écran « Réglages du tableau », pour
qui écrit dans le tableau (niveau écriture, décision du 2026-09-29 ; HN-E11S01-21) ; trois options : `proof` (lot f), `lifecycle.review.agents_may_decide` (lot e)
et `closed` (E07-S04) ; le panneau est bloqué par un brouillon d'en-tête en attente (AC-g6) ; le
commutateur sort en `Switch` du design system, repris par les deux écrans (AC-g9).

Publication directe (E11-S02 lots a à c, fiche D135, livrée après les lots a à f et avant le lot
g) : écrire publie au niveau écriture, en-tête d'un tableau déjà publié compris (E11-S02 AC-a2,
HN-E11S02-17 tranchée le 2026-09-29). Le panneau du lot g s'ouvre donc au niveau écriture, et le
service le suit sans refus propre au rédacteur (AC-g1, AC-g8, HN-E11S01-21).

**Refs :**
- PRD : FR-CONC-05 ; § Tableau (l. 340-356) ; l. 38 et métrique l. 571 (amendées avec cette story) ;
  l. 347, 354, 390 et 557 (preuve, lot f)
- Architecture : § 5, ligne `tables/` (l. 291) ; ADR-008 § 4 (les écrans du paquet écrivent par
  `/api/plateforme/*`, lot g)
- Hypothèses : H62 (`write.table`), H92, H94, H96, P10, N3 et N9 d'E07-S02, N3 (`ctx.host`, l. 347),
  N9 (l. 466) ; HN-M53-5, HN-M53-10 ; HN-E01S12c-12 (page publique sans preuve) ; HN-E11S02-17
- Fiches D99, D100 (preuve), D132, D133 (preuve par tableau), D135 (publication directe, E11-S02 lots a à c)
- ADR-002 (champ facultatif ajouté à une fonction de `call`, attribut d'en-tête facultatif : ajout
  libre), ADR-011 § 2 (provenance)
- Référence UI : voir Meta

## Périmètre

- `create_only` sur `table.write`.
- Attribut de colonne `allow_verified_empty`, et le contrat de `required` corrigé.
- `q` par mots ; messages des bornes `limit` et `rows`.
- `revision` dans `table.schema` ; `host` et `worker` dans la provenance servie.
- `review.agents_may_decide` dans l'en-tête d'un tableau.
- `proof` dans l'en-tête d'un tableau : la preuve exigée seulement si le tableau la déclare ; textes
  servis, contrôle des procédures, mention « sans preuve » de la file de revue et tableau de la Démo
  à suivre.
- Lot g : bouton « Réglages » dans l'en-tête d'un tableau, dès le niveau écriture ; popover « Réglages du
  tableau » ; trois interrupteurs (`proof`, `review.agents_may_decide`, `closed`), chaque bascule
  publiant l'en-tête en un geste par la route et le service de `write` ; panneau bloqué quand un
  brouillon d'en-tête attend ; `Switch` du design system, extrait du partage sur le web.

## Hors périmètre

- Clé auto-incrémentée : écartée (fiche D132, epic E11 OUT).
- Historique des valeurs d'une cellule : table de versions, migration, taille L (epic E11 OUT).
- Afficher `host` et `worker` dans le détail d'une cellule à l'écran : E11-S05 (détail au survol)
  s'il le reprend, sinon plus tard. Le service les sert déjà à l'écran (`toReadRow`).
- Lignes « à revoir » distinguées dans la grille : E11-S05.
- Suppression de lignes, abandon d'un brouillon : E11-S02. Contexte et ctx : E11-S03.
- `create_only` pour `table.import` : E10-S01 garde la fusion par clé (HN-E10S01-4).
- Preuve exigée par organisation : écartée (fiche D133).
- Reprise des tableaux existants (poser `proof: true` sur ceux qui exigeaient la preuve) : aucune,
  stade R&D sans client (fiche D133) ; seul le tableau de la Démo la pose (AC-f8).
- Repli des cellules de la grille et détail de provenance : E11-S05 (AC-a1, AC-a2), qui ne montre
  pas « sans preuve » ; rien à y changer ici.
- Page publique d'un tableau : ne montre aucune preuve (HN-E01S12c-12), inchangée.
- `table.import` (E10-S01) : ses valeurs portent `origin: "import"` et leur commentaire d'import
  (HN-E10S01-6), hors du jugement de la preuve ; inchangé.
- Colonnes, clé et cycle de vie à l'écran : écrits par l'assistant seul ; un éditeur d'en-tête
  complet à l'écran n'est demandé par aucune story (V2 s'il le faut).
- Réglages vus par un lecteur : aucun (V2 s'il le faut ; HN-E11S01-21).
- Abandonner ou publier un brouillon d'en-tête depuis l'écran : E11-S02 le réserve à l'assistant
  (HN-E11S02-12) ; le panneau le dit (AC-g6).
- Le bouton « Télécharger en .csv » du même créneau : E11-S05 (lot c) ; l'ordre est fixé ici
  (HN-E11S01-16).
- Le sens de `closed` côté assistant (textes servis, refus, contrôle des procédures) : E07-S04,
  inchangé.

## Critères d'acceptation

### Lot a — Créer sans écraser (FB-0001)

- [ ] **AC-a1** — **Given** une ligne de clé « Atelier 2 » à la révision 3 **When** `table.write`
  avec `create_only: true` et `rows: [{key: "Atelier 2", set: {…}}]` **Then** rien n'est écrit pour
  elle ; elle sort `refused`, code `conflict`, avec `current` (la ligne telle qu'elle est), et la
  phrase : `Atelier 2: refused (conflict): a row with this key already exists (revision 3); nothing written (create_only). Current row: <ligne JSON>. Pick another key, or write without create_only to update it.`
  **And** les autres lignes de l'appel sont créées.
- [ ] **AC-a2** — **Given** `create_only: true` et deux créations concurrentes de la même clé
  **When** la seconde reçoit `duplicate` d'`insertRow` (`write.ts` l. 188) **Then** elle relit la
  ligne et la refuse comme AC-a1, sans la mettre à jour ; `console.error("[platform] tables: write:
  create_only key taken meanwhile", <cible>)` précède le refus.
- [ ] **AC-a3** — **Given** `create_only: true` et une clé écrite deux fois dans l'appel **Then** la
  première crée la ligne, la seconde est refusée comme AC-a1.
- [ ] **AC-a4** — **Given** `create_only: true` et une ligne qui porte `revision` **Then** le schéma
  refuse l'appel (`invalid_arguments`), au chemin `rows.<i>.revision` : « revision is for an existing
  row; create_only only creates rows: remove one of them ».
- [ ] **AC-a5** — Sans `create_only` (défaut `false`), `table.write` fusionne comme avant : tests
  d'E07-S02 inchangés.
- [ ] **AC-a6** — **Given** une procédure dont un bloc `call` de `table.write` porte `create_only:
  true` sur un tableau fermé **When** elle est publiée **Then** `checkWriteArgs` dit « create_only on
  a closed table: no row can be created ».
- [ ] **AC-a7** — La description de `table.write` et son argument `create_only` disent : « create_only:
  true only creates rows: a key that already exists is refused (conflict) with the row as it is, and
  nothing is written for it (default false: a known key updates its row) ».

### Lot b — Colonne obligatoire stricte (FB-0002)

- [ ] **AC-b1** — Les descriptions de `required` (`schemas/tables.ts` l. 32 et l. 276) disent : « true:
  a row cannot lack this column: a value, or verified_empty with a reason (default false) ».
- [ ] **AC-b2** — **Given** une colonne `allow_verified_empty: false` **When** `table.write` pose
  `verified_empty` sur elle **Then** la ligne est refusée : « <colonne>: needs a real value;
  verified_empty is not allowed for this column. ».
- [ ] **AC-b3** — **Given** une colonne `required: true, allow_verified_empty: false` **When** une
  ligne est créée sans valeur pour elle **Then** la ligne est refusée : « <colonne>: required when
  creating a row: set it with its proof; verified_empty is not allowed for this column. » sur un tableau `proof: true`, « … set it; verified_empty is not allowed for this column. » sans `proof` (amendé en revue le 2026-09-29 : « with its proof » ne se dit que si le tableau l'exige). **And**
  sur une ligne existante qui n'a qu'un `verified_empty` rangé, une écriture rend la note « note:
  <colonne> is required and has no value on this row. ».
- [ ] **AC-b4** — Sans l'attribut (défaut `true`), `required` se satisfait d'un `verified_empty` comme
  avant.
- [ ] **AC-b5** — L'attribut s'écrit par `write` (`header.columns`, fusion par nom) ; publier
  `allow_verified_empty: false` sur une colonne requise avertit (`missing_required`) du nombre de
  lignes qui n'y ont qu'un `verified_empty`, sans réécrire de ligne.
- [ ] **AC-b6** — `table.schema` dit, par colonne : `required (a value or verified_empty)` par défaut,
  `required (a value; verified_empty not allowed)` avec l'attribut ; la clé et la colonne d'état se disent `required` seul, puisque `verified_empty` y est toujours refusé (amendé en revue le 2026-09-29). **And** la règle 1 du contrat
  `write.table` nomme l'attribut. **And** `checkWriteArgs` refuse un `verified_empty` sur une telle
  colonne à la publication d'une procédure.

### Lot c — Recherche par mots, bornes dites (FB-0003)

- [ ] **AC-c1** — **Given** `q: "mairie valbrune"` **When** `table.rows` **Then** une ligne répond
  si chaque mot apparaît, sans casse ni accent, dans l'une de ses cellules cherchables (colonnes
  `text`, `email`, `url`, `enum` et la clé), dans n'importe quel ordre et dans des cellules
  différentes au besoin. Les mots se découpent sur tout ce qui n'est ni lettre ni chiffre ; un mot
  répété compte une fois.
- [ ] **AC-c2** — **Given** un `q` sans lettre ni chiffre (« -- ») **Then** `table.rows` le refuse :
  « q: write at least one word (letters or digits) » ; la grille l'ignore.
- [ ] **AC-c3** — La grille et les vues de tableau (`server/tables/screen.ts` l. 53) appliquent la
  même règle, par la même fonction.
- [ ] **AC-c4** — Refus des bornes, mot pour mot :
  - `table.rows` `limit` au-delà de 50 : « 50 rows at most per page; use next_cursor for more » ;
  - `table.claim` `limit` au-delà de 5 : « 5 rows at most per claim; call table.claim again for more » ;
  - `table.write` plus de 50 lignes : « 50 rows at most per call; send the others in another call ».
- [ ] **AC-c5** — La description de `q` dit : « Words to find, without case or accents, in any order:
  each word must appear in a text, email, url or enum column or in the key, e.g. "mairie valbrune" ».

### Lot d — Révision et auteur (FB-0010, parties 1 et 2)

- [ ] **AC-d1** — **Given** un tableau publié à la révision 4 **When** `table.schema` **Then** le
  contenu structuré porte `revision: 4` et la deuxième ligne du texte finit par « Revision: 4 (the
  base_revision of <p>_write to change the header). ».
- [ ] **AC-d2** — **Given** une écriture faite sous un `ctx` dont `host` vaut `claude-ai@0.1.0`
  **When** `table.write`, `table.claim` ou `table.release` pose une cellule **Then** sa provenance
  rangée porte `host: "claude-ai@0.1.0"` ; sans `host` connu, le champ est absent.
- [ ] **AC-d3** — **Given** `table.claim` avec `worker: "claude-claire"` **Then** la provenance de
  l'état porte `worker: "claude-claire"` ; de même `table.release`. **And** `table.write` sur une
  ligne sous le bail actif de la même personne porte le `worker` du bail sur chaque cellule posée ;
  sans bail, pas de `worker`.
- [ ] **AC-d4** — **Given** `table.rows` avec `provenance: true` **Then** chaque cellule sert
  `host` et `worker` quand ils sont rangés. **And** le code `ctx` n'est jamais servi.
- [ ] **AC-d5** — La revue de l'écran (`review.ts`) ne pose ni `host` ni `worker` (décision d'une
  personne, sans `ctx`).

### Lot e — Décision de revue par l'agent (FB-0009)

- [ ] **AC-e1** — `tableReviewSchema` admet `agents_may_decide` (booléen, défaut `false`), décrit :
  « true: an assistant may also set approve or reject, with table.write or table.release; its decision
  is traced with origin agent (default false) ».
- [ ] **AC-e2** — **Given** un tableau avec `agents_may_decide: true` **When** `table.release` pose
  `review.approve` sur la ligne qu'il tient **Then** l'état est posé, provenance `origin: "agent"`
  avec `host` et `worker`. **And** `table.write` le pose aussi, nu, comme tout état permis.
- [ ] **AC-e3** — **Given** `agents_may_decide` absent ou `false` **Then** refus inchangés : `table.release`
  et `table.write` renvoient à la revue (textes actuels de `release.ts` l. 36 et `write-row.ts` l. 155).
- [ ] **AC-e4** — `table.schema` ajoute, avec l'attribut : « An assistant may also decide: set « <approve> »
  or « <reject> » with table.release or table.write. ». **And** la description de `table.release`
  finit par « …and the decisions of a review only by a person, unless the table lets assistants decide
  (table.schema says it). ». **And** `checkReleaseArgs` et `checkWriteArgs` acceptent alors ces états.
- [ ] **AC-e5** — La revue à l'écran reste possible sur un tableau qui l'autorise (aucun changement
  de `review.ts`).

### Lot f — Preuve par tableau (fiche D133)

- [ ] **AC-f1 — Schéma.** `tableHeaderSchema` admet `proof` (booléen, défaut `false`) après `closed`,
  décrit : « true: every new value written by table.write needs its proof, {value, comment | link}
  (default false). » ; `tableHeaderPatchSchema` l'admet après `closed`, décrit : « true: every new
  value written by table.write needs its proof, {value, comment | link}, e.g. true (default:
  unchanged; false for a new table). ». **Given** un tableau publié sans l'attribut **When** `write`
  avec `header: {"proof": true}` et `publish: true` **Then** l'en-tête publié porte `proof: true` et
  la publication dit « proof required » ; l'inverse dit « proof optional ». **And** la ligne des
  changements en attente dit « require proof » ou « stop requiring proof ». **And** un en-tête rangé
  sans l'attribut se lit `proof: false`. **And** le refus d'un en-tête qui n'est pas un objet dit :
  « header: expected an object {columns, key, lifecycle?, closed?, proof?}. ».
- [ ] **AC-f2 — Écriture sans preuve.** **Given** un tableau sans `proof` **When** `table.write` avec
  `rows: [{key: "Boulangerie du Pont", set: {ville: "Valbrune"}}]` (ligne nouvelle), ou
  `set: {ville: {value: "Valbrune"}}` sur une ligne existante **Then** la valeur s'écrit ; sa
  provenance porte `origin: "agent"`, `by`, `at` (et `host`, `worker` du lot d), sans `comment` ni
  `link` ; le rapport dit « ventes/suivi_prospects: 1 row(s) written (1 created, 0 updated), 0
  unchanged, 0 refused. » pour la création. **And** `{value, comment | link}` s'écrit et se range en
  provenance comme aujourd'hui. **And** une valeur nue égale à la valeur rangée reste ignorée : la
  cellule et sa provenance (commentaire, lien, origine) ne changent pas.
- [ ] **AC-f3 — Écriture avec preuve.** **Given** un tableau `proof: true` **When** `table.write`
  porte une valeur nue nouvelle **Then** l'appel entier est refusé (`invalid_arguments`), texte
  inchangé : « Nothing was written: a bare value equal to the stored one is ignored; any new value
  needs its proof. rows.<i>.set.<colonne>: new value without its proof: write {"value": …,
  "comment": "…"} (where you found it) or {"value": …, "link": "https://…"} (the source); a column
  searched without result goes in verified_empty with a reason. ». **And** les tests de M53
  (`tables-write.test.ts`, `tables-write-service.test.ts`) passent sans changer leurs assertions de
  refus, sur un en-tête de fixture `proof: true` (HN-E11S01-13).
- [ ] **AC-f4 — `table.schema`.** **Given** un tableau `proof: true` **When** `table.schema` (ou `read`
  du tableau, même description) **Then** le texte finit, après la ligne « Closed: … », par : « Proof:
  required — every new value needs {value, comment | link}; a new value without it refuses the whole
  call. ». La ligne « Write with table.write: … » reste celle d'aujourd'hui. **Given** un tableau sans
  `proof` **Then** la dernière ligne dit : « Proof: optional — a bare value is written as it is;
  {value, comment | link} keeps where it comes from. » ; et la ligne d'écriture devient : « Write
  with table.write: rows [{key, revision?, set: {column: value | {value, comment | link}}, clear:
  [column], verified_empty: [{column, reason}]}]; a bare value equal to the stored one is ignored;
  null is refused; unnamed columns stay unchanged. ». **And** le contenu structuré porte `proof:
  true` ou `proof: false`, après `closed`.
- [ ] **AC-f5 — Descriptions.** Mot pour mot :
  - `table.write` (`server/tables/write.ts` l. 280) commence par : « Writes rows of a table by key:
    set {column: value}, or {column: {value, comment | link}} with a comment saying where you found
    it or the link of the source; a new value needs its proof when the table requires it
    (table.schema says it), except the state column, set bare within its allowed changes; a bare
    value equal to the stored one is ignored. » et finit par : « …each row is written or refused on
    its own, except a new value without its proof on a table that requires it, which refuses the
    whole call; the answer says which and why. ». Avec la phrase d'AC-a7, la description reste sous
    1 000 caractères (`mcp-patterns.md § 3`).
  - Son refus (l. 298) : « A new value without its proof on a table that requires it (a bare value
    that differs from the stored one, or on a new row): nothing is written in the whole call; add the
    comment or the link, then call again. ».
  - La cellule (`tableCellInputSchema`, `schemas/table-write.ts` l. 75) : « A value (text, number,
    true or false), or {"value": …, "comment": "…"} or {"value": …, "link": "https://…"}: the value
    with a comment saying where you found it (1,000 characters at most) or the link of the source; a
    new value needs its proof when the table requires it (table.schema says it), except the state
    column, set bare within its allowed changes; a bare value equal to the stored one is ignored; a
    null refuses its row: use clear, or verified_empty with a reason. ».
  - Son refus de forme (`CELL_REFUSED`, l. 57) : « expected a value, {"value": …, "comment": "…"} or
    {"value": …, "link": "https://…"}; a new value needs its proof when the table requires it
    (table.schema says it) ».
  - `set` (l. 96) : « Values by column, e.g. {"contact": {"value": "Anne Roy", "comment": "Page
    équipe du site"}, "email": {"value": "anne@exemple.test", "link": "https://exemple.test/contact"}};
    a new value needs its proof when the table requires it (table.schema says it), except the state
    column, set bare within its allowed changes; a bare value equal to the stored one is ignored; a
    null refuses its row (default: none). ».
  - Contrat `write.table` (`server/catalog/contracts.ts`) : la première phrase de la description
    (l. 93) dit « …the work queue of the rows (lifecycle), whether new rows can be created (closed)
    and whether each new value needs its proof (proof). » ; la règle 3 (l. 103) : « 3. key,
    lifecycle, closed and proof replace their value; lifecycle is replaced whole, and the options of
    its state column change in the same header as its states. ».
- [ ] **AC-f6 — Procédures.** **Given** une procédure dont un bloc `call` de `table.write` écrit
  `{"ville": "Valbrune"}` nu dans un tableau sans `proof` **When** elle est publiée **Then**
  `checkWriteArgs` ne rend aucun problème de preuve ; les refus de type, d'état et de `null`
  restent. **Given** le même bloc sur un tableau `proof: true` **Then** le refus d'aujourd'hui : « ville:
  a new value needs its proof: write {"value": …, "comment": "…"} or {"value": …, "link": "…"} »
  (HN-M53-10).
- [ ] **AC-f7 — Écran, file de revue.** **Given** un tableau sans `proof` et une ligne à revoir dont
  `contact` a été écrit nu par un assistant **When** la fiche s'affiche **Then** elle rend « contact
  Luc Moreau », sans « (sans preuve) ». **And** un commentaire, un lien ou la raison d'un
  `verified_empty` restent affichés comme aujourd'hui. **Given** un tableau `proof: true` **Then**
  « (sans preuve) » s'affiche comme aujourd'hui (`file-de-revue.test.tsx` l. 140-162, en-tête
  `proof: true`).
- [ ] **AC-f8 — Jeu de démo.** `PILOT_TABLE.header` (`scripts/lib/pilot-qualification.mjs` l. 173-192,
  et son type l. 160-165), que la section `tableau` publie (`scripts/demo/50-tableau.mjs` l. 152-155,
  `publishWhenChanged`), porte `proof: true`. **When** `pnpm demo:seed` repasse **Then** l'en-tête du
  tableau de la Démo est republié une fois, puis laissé ; la procédure pilote garde ses refus de
  preuve (`procedures-table-check.test.ts` inchangé).

### Lot g — Réglages du tableau à l'écran (preuve exigée, revue décidée par l'assistant, fermé)

- [ ] **AC-g1 — Qui voit le panneau.** **Given** un nœud `table` lu au niveau écriture ou gestion
  (`vue.level >= 2`), hors de `?version=publiee` **Then** l'en-tête d'écran montre un bouton « Réglages » dans le
  créneau `access` de `ScreenHeader`, après « Télécharger en .csv » (E11-S05) et avant « Partager ·
  <espace> » (HN-E11S01-16). **When** on l'active **Then** un popover s'ouvre, nommé « Réglages du
  tableau » (`aria-label` du panneau et titre visible). **Given** le même tableau au niveau lecture,
  ou en `?version=publiee`, ou une page, une procédure, un Contexte **Then** aucun bouton
  « Réglages » (HN-E11S01-21).
- [ ] **AC-g2 — Trois interrupteurs.** **Given** le panneau ouvert **Then** il montre, dans cet
  ordre, des `Switch` (`<input type="checkbox" role="switch">`), chacun nommé par son intitulé
  (`aria-labelledby`) et décrit par son aide (`aria-describedby`), cochés selon l'en-tête publié :
  - « Preuve exigée » (`proof`) ; aide : « Chaque valeur nouvelle écrite par un assistant doit citer
    sa source : un commentaire ou un lien. » ;
  - « L'assistant peut décider la revue » (`lifecycle.review.agents_may_decide`) ; aide : « Un
    assistant peut aussi passer une ligne « <review.state> » à « <review.approve> » ou
    « <review.reject> » ; sa décision est tracée comme venant d'un assistant. » ; présent seulement
    si l'en-tête déclare `lifecycle.review`, absent sinon (HN-E11S01-17) ;
  - « Fermé » (`closed`) ; aide : « Seules les lignes existantes s'écrivent : aucune ligne nouvelle
    n'est créée. ».
- [ ] **AC-g3 — Un geste, une publication.** **Given** « Preuve exigée » décoché **When** on le coche
  **Then** un seul `POST /api/plateforme/nodes` part, par la file d'opérations de la page
  (HN-E11S01-18), de corps `{"path": "<chemin>", "base_revision": <révision de la file>, "header":
  {"proof": true}, "publish": true}` ; « Fermé » envoie `{"closed": <valeur>}` ; l'interrupteur de
  revue envoie `{"lifecycle": <cycle publié, où seul review.agents_may_decide change>}`, le cycle
  étant remplacé entier (règle 3 de `write.table`). **And** pendant l'envoi les interrupteurs sont
  désactivés et le focus reste sur celui qu'on a touché. **And** au succès, une annonce
  (`role="status"`) dit « Preuve exigée : activée. » ou « Preuve exigée : désactivée. » (de même
  avec l'intitulé des deux autres), puis la page se relit (`useRafraichir`) et l'interrupteur suit
  l'en-tête publié (HN-E11S01-19).
- [ ] **AC-g4 — Publication directe, sans confirmation.** **Given** un tableau qui a des lignes
  **When** l'un des trois attributs change par le panneau **Then** la publication passe en un temps :
  ni `needs_confirmation`, ni ligne relue (`readsRows`, `server/tables/evolution-checks.ts`
  l. 96-104 : fermer, rouvrir et un cycle dont l'état de travail et la colonne ne bougent pas ne
  lisent pas les lignes ; `proof` n'y figure pas, AC-f1). **And** la révision du nœud avance de 1,
  et la publication se lit « proof required », « closed » ou « lifecycle replaced » comme par
  `write`. **And** la ligne de journal est celle de la route (`target` : le chemin du tableau).
- [ ] **AC-g5 — Refus.** **Given** la révision du tableau a changé depuis la lecture de la page
  (`stale_revision`) **Then** le panneau dit, en `role="alert"` sous les interrupteurs : « Le tableau
  a changé pendant que la page était ouverte. Rechargez la page, puis réessayez. » ; l'interrupteur
  revient à l'état publié ; le focus reste sur lui. **And** tout autre refus se dit par
  `messageDErreur` (`forbidden` : « Vous n'avez pas le droit de faire cela. »).
- [ ] **AC-g6 — Brouillon d'en-tête en attente.** **Given** un brouillon du tableau qui porte un
  en-tête en attente (`vue.draft.meta` non nul) **When** le panneau s'ouvre **Then** les
  interrupteurs sont désactivés (état publié affiché) et le panneau dit, sous son titre : « Un
  changement de l'en-tête attend en brouillon. Demandez à l'assistant de le publier ou de
  l'abandonner, puis rechargez la page. ». **And** aucune requête ne part. **Given** un brouillon
  sans en-tête en attente (`vue.draft.meta` nul, titre ou résumé seuls) **Then** le panneau n'est pas
  bloqué.
- [ ] **AC-g7 — Clavier et thèmes.** **Given** le panneau ouvert **Then** `Tab` atteint chaque
  interrupteur, `Espace` le bascule ; `Échap` ferme le popover et rend le focus à « Réglages ».
  **And** en thème clair et sombre, l'intitulé est en `text-ink`, l'aide en `text-mute`, la piste
  celle d'`oto-switch-track` (coché, désactivé, focus visible) ; l'état n'est jamais dit par la
  seule couleur (la position du curseur et l'état `checked` le disent).
- [ ] **AC-g8 — Le service décide.** **Given** une personne au niveau écriture qui envoie le même
  corps à la route **Then** l'en-tête est publié comme au niveau gestion, sans refus propre au
  rédacteur (E11-S02 AC-a2, HN-E11S02-17) : révision + 1, ligne de publication et ligne de journal
  d'AC-g4. **Given** une personne au niveau lecture **Then** l'écriture est refusée (`forbidden`,
  décidé par `writeNode` avant toute requête) et rien n'est enregistré. Aucune règle nouvelle dans
  la route ni dans l'écran. **And** l'assistant
  garde la même porte, `write` avec `header.proof`, `header.closed` ou `header.lifecycle` (parité,
  `mcp-patterns.md § 1`).
- [ ] **AC-g9 — `Switch` extrait, partage sur le web inchangé.** `ui/ds/react/switch.tsx` exporte
  `Switch` : intitulé, description, `checked`, `disabled`, `onChange` et `ref` vers l'`<input>` ; même
  balisage que `Commutateur` (`label.oto-choice`, `input` `role="switch"` nommé par l'intitulé et
  décrit par la description, piste `aria-hidden`). **Given** le partage sur le web
  (`partage-sur-le-web.tsx`) passé à `Switch` **Then** ses tests passent sans changer une assertion
  (`tests/integration/components/e05s10d-partage-web.test.tsx`, `tests/e2e/partage-public.spec.ts`
  l. 55, 70, 158).

## Implémentation

### Migrations prévues

Aucune : la provenance est le JSON `blocks.provenance`, l'en-tête le JSON `nodes.meta`, écrit et
publié par `writeNode` (lot g compris).

### Schémas Zod

- `schemas/table-write.ts` : `create_only` dans `tableWriteArgsSchema` (et son `superRefine` d'AC-a4) ;
  messages de `rows.max` et de `limit` de `tableClaimArgsSchema`.
- `schemas/tables.ts` : `allow_verified_empty` dans `tableColumnSchema` et `tableColumnPatchSchema` ;
  `agents_may_decide` dans `tableReviewSchema` ; descriptions de `required` ; `q` (description,
  refus d'AC-c2) et message de `limit` dans `tableRowsArgsSchema` ; `host` et `worker` dans
  `provenanceReadSchema` ; `proof` dans `tableHeaderSchema` (l. 54-59, `.default(false)` comme
  `closed`) et `tableHeaderPatchSchema` (l. 283-296, `.optional()`), AC-f1.
- `schemas/table-write.ts` (lot f) : textes d'AC-f5 de `CELL_REFUSED` (l. 57), `tableCellInputSchema`
  (l. 75) et `set` (l. 96) ; aucune forme changée.
- Lot g : aucun schéma nouveau. `writeNodeBodySchema` (`schemas/node-body.ts` l. 20) porte déjà
  `header` et `publish` ; l'en-tête publié se lit à l'écran par `tableHeaderSchema.safeParse(vue.meta)`
  (`proof` et `agents_may_decide` des lots e et f).

### Fichiers à créer

- Lots a à f : aucun fichier de code. Tests : voir « Tests attendus ».
- Lot g, `ui/ds/react/switch.tsx` : `Switch`, sorti de `Commutateur` (AC-g9). Sans lui, le balisage
  du commutateur se recopie dans un second écran.
- Lot g, `ui/tableau/options-du-tableau.tsx` (`"use client"`) : `OptionsDuTableau`, le bouton
  « Réglages », le `Popover`, les `Switch` d'AC-g2, l'envoi par `useFileDOperations().envoyer`
  (AC-g3), l'annonce et le refus (AC-g5), l'état bloqué d'AC-g6. Nommé « options » et non
  « réglages » : `ui/tableau/adresse.ts` appelle déjà `Reglages` le tri et les filtres de l'adresse.
  Sans lui, une personne qui gère le tableau ne change ces trois attributs qu'en le demandant à un
  assistant.

### Fichiers à modifier, par face

- `ui/` :
  - lot f, `ui/tableau/file-de-revue.tsx` : `ValeursDeLaLigne` passe `entete.proof === true` à
    `PreuveDeLaValeur` (l. 50-54, 85), qui ne rend « sans preuve » que si la preuve est exigée
    (AC-f7) ;
  - lot g, `ui/noeud/en-tete-du-noeud.tsx` : prop facultative `reglages?: ReactNode`, rendue dans le
    créneau `access` avant l'`AccessPanel`, après le bouton d'E11-S05 ;
  - lot g, `ui/noeud/ecran-de-noeud.tsx` : pour `vue.kind === "table"` et `niveauDEcriture !== null`
    (l. 120 : niveau écriture ou gestion, hors de `?version=publiee`), l'en-tête publié lu par
    `tableHeaderSchema.safeParse(vue.meta)` et `OptionsDuTableau` passé en `reglages` (l. 130-140), sous `FileDOperations` (l. 178) ;
  - lot g, `ui/tableau/libelles.ts` : `OPTIONS` (intitulés, aides, annonces, refus d'AC-g2 à AC-g6) ;
  - lot g, `ui/public/partage-sur-le-web.tsx` : `Commutateur` (l. 62-82) remplacé par `Switch` ; ses
    textes (`PARTAGE_WEB`) passés en props.
- `schemas/` : `table-write.ts`, `tables.ts` (ci-dessus).
- `server/tables/` (lot f) :
  - `write.ts` : `withoutBareValues` (l. 82-104) retire toujours une valeur nue égale à la valeur
    rangée ; il ne lit `provedColumn` et ne rend un problème que si `header.proof` (AC-f2, AC-f3) ;
    description (l. 280) et refus (l. 298) d'AC-f5 ; `BARE_CALL_REFUSED` et `NEW_VALUE_UNPROVED`
    inchangés ;
  - `schema.ts` : `describeTable` (l. 72-95), ligne « Write with table.write » selon `proof`, ligne
    « Proof: » après « Closed: », `proof` dans `data` (AC-f4) ;
  - `check.ts` : `rowProblems` (l. 107-110) ne pose `PROOF_REQUIRED` que si `table.header.proof`
    (AC-f6) ;
  - `header.ts` : refus d'un en-tête qui n'est pas un objet (l. 174) ; les attributs admis se lisent
    déjà sur les clés du schéma (`ATTRIBUTES.header`, l. 25-30) ;
  - `evolution.ts` : fusion `proof: patch.proof ?? base?.proof ?? false` (l. 187), `HeaderDiff.proof`
    (l. 231-239), `diffTableHeaders` (l. 265), `changeList` (l. 277) ; `evolution-publish.ts` :
    `publishedChanges` (l. 256). Le chemin est celui de `closed` ; `ATTRIBUTES` (l. 37) ne liste que
    les attributs de colonne et ne change pas au lot f.
- `server/tables/` (lots a à e) :
  - `write.ts` : `create_only` dans `writeRow` (existante → AC-a1 ; `duplicate` → AC-a2) ; `worker`
    du bail dans l'acteur de la ligne ; description et refus de `table.write` ;
  - `write-row.ts` : `RowActor` gagne `host` et `worker` ; `cellProvenance` les range s'ils sont
    connus ; `missing()` et `applyVerifiedEmpty` lisent `allow_verified_empty` ; texte d'AC-b3 ;
  - `row-rules.ts` : `stateRule` ne rend plus `decision` quand `review.agents_may_decide` ;
  - `release.ts`, `claim.ts` : acteur avec `host` et `worker` ; description de `table.release` ;
  - `filters.ts` : `queryWords` (découpe d'AC-c1) et `matchesQuery(cells, header, words)` ;
  - `rows.ts` : `parseQuery` passe par `queryWords` ; `servedProvenance` sert `host` et `worker` ;
  - `screen.ts` : `checkedSelection` passe par `queryWords` (l. 43) ;
  - `schema.ts` : `revision` (AC-d1), ligne de colonne (AC-b6), ligne de revue (AC-e4) ;
  - `check.ts` : AC-a6 et AC-b6 ;
  - `evolution.ts` (`ATTRIBUTES`, l. 37 ; `attributeValue`, l. 242) et `evolution-checks.ts`
    (`filled`, `missingRequired`) : AC-b5.
- `server/catalog/contracts.ts` : règle 1 de `write.table` (AC-b6) ; description (l. 93) et règle 3
  (l. 103) d'AC-f5.
- `server/catalog/define.ts` : `FunctionContext.host?: string | null`.
- `server/calls.ts` : `CallDeps.ctxHost?` passé au contexte (l. 160).
- `mcp/server.ts` : `ctxHost: ctx?.host ?? null` à `runCall` (l. 93).
- Lot g : `api/`, `server/`, `migrations/`, `mcp/` inchangés par ce lot ; hôte (`src/`) : aucun,
  l'écran de nœud du paquet porte le panneau.
- Hors du paquet (lot f) : `scripts/lib/pilot-qualification.mjs` (`PILOT_TABLE.header`, l. 191, et
  son type, l. 160-165), AC-f8 ; `tests/factories/table-fixture.ts` (`PROSPECTS_HEADER`, l. 35) :
  `proof: true` (HN-E11S01-13).
- Documentation, mise à jour avec la story (par qui la livre) :
  - `docs/decisions/hypotheses.md` : P10 (l. 112) et N9 d'E07-S02 (l. 749) : « sauf un tableau dont
    la revue déclare `agents_may_decide` » ; H94 (l. 88) : `host?`, `worker?` ; H96 (l. 90) : `q`
    par mots ;
  - `docs/prd.md` : l. 38 (« avec une revue humaine de chaque décision, sauf si le tableau la confie
    à l'assistant »), tableau § Tableau l. 350, métrique l. 571 (« décision d'un assistant hors d'un
    tableau qui l'autorise : 0 ») ;
  - `docs/architecture.md` l. 291 : « revue humaine, ou par l'assistant si le tableau l'autorise ».
  - Lot f, `docs/prd.md` : l. 347 (« commentaire ou lien de preuve, exigé si le tableau le
    déclare ») ; l. 354 (« Une valeur nouvelle porte sa preuve si le tableau l'exige (`proof`) ;
    sinon elle s'écrit nue ») ; l. 390 (« dont le contrat dit la forme de la preuve, exigée par
    tableau ») ; l. 557 (« `table.write` refuse une valeur nouvelle sans preuve dans un tableau qui
    l'exige ») ; métrique l. 571 (« valeur écrite sans preuve dans un tableau qui l'exige : 0 »).
  - Lot f, `docs/architecture.md` l. 291 : « preuve exigée pour toute valeur nouvelle » devient
    « preuve exigée pour toute valeur nouvelle si le tableau l'exige (`proof`) ».
  - Lot f, `docs/decisions/hypotheses.md` : H92 (l. 86), « une valeur nouvelle exige sa preuve […]
    dans un tableau `proof` » ; HN-M53-5 (l. 942) et HN-M53-10 (l. 941), « sur un tableau
    `proof: true` » (fiche D133).
  - Lot f, `packages/plateforme/CHANGELOG.md` (entrée de la 1.0.1) : la preuve devient une option
    par tableau, et un tableau existant la perd tant que `proof: true` n'est pas publié.
  - Lot g, `docs/prd.md` § Tableau : une ligne « Réglages du tableau à l'écran (écriture) : preuve
    exigée, revue par l'assistant, fermé ».
- `.method/conventions/component-registry.md` : `queryWords` sur la ligne de `filters.ts` (l. 297) ;
  lot g, `Switch` ajouté à la ligne du design system (l. 62) et une ligne `OptionsDuTableau`
  (`ui/tableau/options-du-tableau.tsx`).

### Points de départ

- `write.ts` l. 147-153 (`staleRevision`) : la ligne rendue en forme de lecture, reprise par AC-a1.
- Oto et la maquette : ni `create_only` ni décision par l'agent ; rien à reprendre.
- Lot g : `Commutateur` (`ui/public/partage-sur-le-web.tsx` l. 66-82) pour `Switch` ;
  `ui/tableau/decision-de-revue.tsx` pour l'annonce et la relecture (`useRafraichir`).

### Patterns à suivre

- `mcp-patterns.md § 4` : refus en anglais qui disent quoi faire ; texte et structuré identiques.
- `security-patterns.md § Idempotence et mutations concurrentes` : course d'AC-a2 journalisée.
- `security-patterns.md § Validation des inputs` : découpe de `q` en une passe.
- `forms-patterns.md § Principe` : AC-a4 au schéma, un seul contrôle.
- `forms-patterns.md § Formulaire progressif (sans JavaScript)` : exception des écrans du paquet,
  écriture par `/api/plateforme/*`, message par `messageDErreur` (lot g).
- `accessibility-patterns.md § Focus Management` : focus gardé sur l'interrupteur pendant et après
  l'envoi, rendu au déclencheur à `Échap` (le `Popover` le fait déjà).
- `portage-ecrans.md § 3` : tokens du jeu Oto seulement ; les deux thèmes contrôlés à l'œil.
- `CLAUDE.md § Garde-fous conditionnels` : extraction de `Switch`, tests du partage sur le web
  identiques avant et après.

## Sécurité : canaux

- *fermé* — écrasement silencieux sous `create_only` : AC-a1 à AC-a3, course comprise.
- *fermé* — code `ctx` d'une autre personne : jamais servi (AC-d4) ; test sur la forme servie.
- *ouvert, voulu* — `host` et `worker` lisibles par qui lit le tableau, comme `by` aujourd'hui.
- *ouvert, voulu* — un assistant au niveau écriture peut publier `agents_may_decide: true` par
  `write`, puis décider (HN-E11S01-7, tranchée le 2026-09-29 ; la gestion jusqu'à E11-S02 AC-a2).
  Borné par le niveau écriture ; tracé : la ligne de publication (« lifecycle replaced »), la ligne
  de journal du `write` (`header` dans ses arguments) et la provenance `agent` de chaque décision ;
  test que la décision porte `origin: "agent"`.
- *ouvert, voulu* — sans `proof`, une valeur sans source s'écrit (fiche D133) ; sa provenance
  `origin: "agent"`, `by` et `at` est gardée, et elle ne remplace jamais la provenance d'une valeur
  égale déjà rangée (AC-f2) ; test que la provenance rangée porte `origin: "agent"` sans `comment`
  ni `link`, et qu'une valeur nue égale laisse la provenance prouvée intacte.
- *ouvert, voulu* — un assistant au niveau écriture peut activer ou retirer `proof` par `write`, puis
  écrire sans preuve ; même traitement qu'`agents_may_decide` (HN-E11S01-7) : borné par le niveau
  écriture ; tracé par la ligne de publication (« proof required » ou « proof optional »), la ligne
  de journal et la provenance `agent` ; test de la publication d'AC-f1 dans les deux sens.
- *borné* — coût de `q` : 200 caractères au plus, donc 100 mots ; chaque cellule normalisée une fois
  par ligne ; test hostile en moins d'une seconde.
- *fermé* — un réglage changé à l'écran par qui n'écrit pas dans le tableau : le bouton n'est rendu
  qu'au niveau écriture ou gestion (AC-g1), mais la décision reste au service : au niveau lecture,
  `writeNode` refuse l'écriture avant toute requête (`security-patterns.md § Droits dans le
  service`) ; test d'AC-g8 au niveau lecture.
- *fermé* — publier sans les voir des changements d'en-tête laissés en brouillon par un assistant :
  le panneau est bloqué (AC-g6) ; test qu'aucune requête ne part.
- *ouvert, voulu* — une personne au niveau écriture ou gestion change les trois attributs sans
  assistant (HN-E11S01-21) ; même porte et même journal que `write` (route
  `POST /api/plateforme/nodes`, contrôle d'origine des mutations de `api/handler.ts` l. 267) ; test que la ligne de journal porte le chemin du tableau.

## Rayon d'impact

### Appelants

- `stateRule`, `releaseStates`, `decisionNames` :
  `rg -n "stateRule|releaseStates|decisionNames" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests C:/apps/oto-pkg/src`
  → `check.ts` l. 115-117 et 168-169, `release.ts` l. 32-36, `write-row.ts` l. 153-155 ; aucun test
  direct. Le seul changement est dans `stateRule` : les trois suivent.
- `cellProvenance`, `RowActor`, `ProvenanceExtra` :
  `rg -n "cellProvenance|RowActor|ProvenanceExtra" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests C:/apps/oto-pkg/src`
  → `write-row.ts` (l. 24, 131, 139, 184, 194, 239, 254, 259), `write.ts` l. 38 et 109, `claim.ts`
  l. 28, 88, 102, `release.ts` l. 57, `review.ts` l. 53. `host` et `worker` sont facultatifs :
  `review.ts` ne change pas.
- `matchesQuery` : `rg -n "matchesQuery" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `rows.ts` l. 232 et `screen.ts` l. 53. Les deux passent la liste de mots.
- `normalizeTitle` sur `q` : `rg -n "normalizeTitle\((args|selection)\.q" C:/apps/oto-pkg/packages`
  → `rows.ts` l. 218, `screen.ts` l. 43 ; remplacés par `queryWords`.
- `insertRow` : `rg -n "insertRow\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` → `write.ts`
  l. 187 seul (définition `row-store.ts` l. 127, inchangée).
- `tableReviewSchema`, `tableColumnSchema` : `rg -n "tableReviewSchema|tableColumnSchema\b|tableColumnPatchSchema" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `header.ts` l. 27-29 et `evolution.ts` l. 80-82 lisent les clés du schéma (attributs admis
  sans autre code) ; `contracts.ts` l. 82 sert le JSON Schema ; `schemas/index.ts` l. 109-112.
- `column.required` : `rg -n "\.required" C:/apps/oto-pkg/packages/plateforme/server/tables`
  → `write-row.ts` l. 203, 263, 273 ; `schema.ts` l. 44 ; `evolution.ts` l. 243 ;
  `evolution-checks.ts` l. 85 et 181. Seuls `missing()`, `filled` et `columnLine` lisent en plus
  `allow_verified_empty`.
- Contexte d'une fonction : `rg -n "ctxCode|: FunctionContext = \{" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `calls.ts` l. 160 (seule construction), `mcp/server.ts` l. 93 ; `tests/unit/calls.test.ts`
  l. 114 et `catalog-contracts.test.ts` l. 55 appellent `runCall` sans `ctxHost` : champ facultatif.
- Doublures : les tests d'E07-S02 à S04 (`tests/unit/tables-*.test.ts`, `mcp-tables.test.ts`)
  comparent des textes servis ; ceux qui changent sont listés aux AC (description de `table.write`,
  de `table.release`, de `q`, ligne de colonne de `table.schema`, règle 1 de `write.table`).
- Lot f, preuve à l'écriture :
  `rg -n "withoutBareValues|provedColumn|bareValue\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests C:/apps/oto-pkg/src`
  → `write.ts` l. 56, 70, 82, 93, 95 et 261 (seul appel de service) ; `tests/unit/tables-write.test.ts`
  l. 18 et 185 (sur `HEADER`, tiré de `PROSPECTS_HEADER`). `bareValue` et `provedColumn` ne sortent
  pas du fichier ; la signature de `withoutBareValues` ne change pas.
- Lot f, règle HN-M53-10 : `rg -n "PROOF_REQUIRED|proofRequired" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `check.ts` l. 22 et 110 ; `tests/unit/tables-check.test.ts` l. 31, 77 et 87, sur la fixture :
  inchangés si `PROSPECTS_HEADER` porte `proof: true` ; `procedures-table-check.test.ts` suit
  `PILOT_TABLE` (AC-f8).
- Lot f, textes servis de la preuve :
  `rg -n "needs its proof|without its proof" C:/apps/oto-pkg/tests`
  → `tables-write.test.ts` l. 181 (`SHAPE`, change avec `CELL_REFUSED`) et 183 (inchangé) ;
  `tables-write-service.test.ts` l. 41 et 359 (inchangés, AC-f3) ; `tables-check.test.ts` l. 31
  (inchangé) ; `tables-read.test.ts` l. 210 et `mcp-table-read.test.ts` l. 80 (ligne « Write with
  table.write », inchangée sur un en-tête `proof: true`). La ligne « Proof: » s'ajoute après
  « Closed: » : `rg -n "Closed: (yes|no)" C:/apps/oto-pkg/tests` → `tables-read.test.ts` l. 190,
  `mcp-table-read.test.ts` l. 81.
- Lot f, contrat `write.table` : `rg -n "\"closed\", \"confirm_remove\"" C:/apps/oto-pkg/tests`
  → `tests/unit/mcp-table-schema.test.ts` l. 57 : la liste des clés du JSON Schema gagne `proof`.
  `rg -n "write.table|table.write" C:/apps/oto-pkg/tests/unit/catalog-contracts.test.ts` → rien :
  ce fichier ne couvre que `write.procedure` ; les textes d'AC-f5 se testent dans `mcp-tables.test.ts`.
- Lot f, en-têtes écrits en dur : `rg -n "closed: (false|true)|: TableHeader = \{" C:/apps/oto-pkg/tests C:/apps/oto-pkg/scripts -l`
  → 15 fichiers. Typés `TableHeader` (sortie du schéma, `proof` requis par le défaut) :
  `tests/integration/components/file-de-revue.test.tsx` l. 14 et 141, `grille.test.tsx` l. 22,
  `tests/integration/pages/noeud-tableau-page.test.tsx` l. 55 → `proof: false` ajouté. Comparés par
  `toEqual` à un en-tête lu : `tables-schema-write.test.ts` l. 66, 83, 123, `tables-meta.test.ts`
  l. 23, `tables-read.test.ts` l. 199 (contenu structuré), `pilot-content.test.ts` l. 36 → `proof`
  ajouté. Les autres (`acme.ts`, `donnees.ts`, `search-content.test.ts`, `demo-seed.test.ts` l. 382,
  `tables-header-patch.test.ts`, `tables-evolution.test.ts`) passent des entrées que le schéma
  complète : inchangés.
- Lot f, écran : `rg -n "PreuveDeLaValeur|FileDeRevue" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `tableau-du-noeud.tsx` l. 47 passe déjà `entete` ; `PreuveDeLaValeur` n'a qu'un appelant
  (`file-de-revue.tsx` l. 85) ; test `tests/integration/components/file-de-revue.test.tsx`.
- Lot f, lecteurs de `closed` (modèle suivi) :
  `rg -n "describeTable|header\.closed|\.closed\b" C:/apps/oto-pkg/packages/plateforme`
  → `evolution.ts` l. 187, 265, 277 ; `evolution-publish.ts` l. 256 ; `write.ts` l. 180 ;
  `schema.ts` l. 75, 84, 92 (`describeTable`, appelée l. 127 par `table.schema` et l. 157 par `read`).
- Lot g, en-tête d'écran : `rg -n "EnTeteDuNoeud|ChapoDuNoeud" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `ui/noeud/ecran-de-noeud.tsx` l. 36 et 130, seul appelant ; la prop `reglages` est facultative,
  les autres écrans ne la passent pas. Tests qui montent `EcranDeNoeud` :
  `rg -ln "EcranDeNoeud" C:/apps/oto-pkg/tests` → `ecran-de-noeud.test.tsx`, `contexte.test.tsx`,
  `procedure.test.tsx`, `e05s10b-partage.test.tsx`, `e05s10d-partage-web.test.tsx`,
  `e05s13-coque.test.tsx`, `flux-des-liens.test.tsx` : seul un tableau au niveau écriture ou gestion
  gagne le bouton ; aucun ne compte les boutons de l'en-tête d'un tableau.
- Lot g, écritures de l'écran par la route de `write` :
  `rg -n "ressource: \"nodes\"" C:/apps/oto-pkg/packages/plateforme/ui`
  → `ui/noeud/editeur/file-d-operations.tsx` l. 194 (la file, empruntée ici) et
  `ui/coque/creation-dans-le-rail.tsx` l. 68 (création) ; ni l'un ni l'autre ne change.
  `rg -n "writeNodeBodySchema|header" C:/apps/oto-pkg/packages/plateforme/api` → `api/nodes.ts`
  l. 3, 13, 74 (et `api/handler.ts`, en-têtes HTTP seulement) : la route passe `header` au service
  sans le lire ; aucune route nouvelle.
- Lot g, contrôles de publication : `rg -n "readsRows" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `evolution-checks.ts` l. 101, `evolution-publish.ts` l. 21 et 226 ; inchangés, AC-g4 le vérifie.
- Lot g, `Commutateur` : `rg -n "Commutateur" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests C:/apps/oto-pkg/src`
  → `ui/public/partage-sur-le-web.tsx` seul (définition l. 66, un appel l. 160) ; ses tests le lisent
  par son rôle (`getByRole("switch", …)`, `tests/e2e/partage-public.spec.ts` l. 55, 70, 158), donc
  sans dépendre de son nom.

### Doublons

- Découpe en mots : `rg -n "\\p\{L" C:/apps/oto-pkg/packages/plateforme --glob "*.ts"`
  → aucune découpe en mots : `server/journal-rows.ts` l. 217 reconnaît un caractère de nom,
  `ui/noeud/en-ligne.ts` l. 109 l'italique ; `component-registry.md` l. 201 et 297 :
  `normalizeTitle`, `matchesQuery`. Verdict :
  réutiliser `normalizeTitle`, créer `queryWords` à côté de `matchesQuery`. Le routage (SQL
  `route_candidates`, E11-S04) est une autre recherche, en base.
- Refus d'une ligne existante : `staleRevision` (`write.ts` l. 147) rend déjà la ligne actuelle.
  Verdict : réutiliser `toReadRow` et `refusedRow`.
- Lot f, option booléenne d'en-tête : `rg -n "z.boolean\(\)" C:/apps/oto-pkg/packages/plateforme/schemas/tables.ts`
  → `closed` (l. 58, 293) est le seul booléen d'en-tête ; `required` (l. 32, 276) est de colonne ;
  `agents_may_decide` (lot e) vit dans `lifecycle.review`. Verdict : réutiliser le chemin de
  `closed` (schéma, `.default(false)`, fusion et écart d'`evolution.ts`, ligne de `describeTable`) ;
  aucune fonction nouvelle. Au registry :
  `rg -n "withoutBareValues|PreuveDeLaValeur|describeTable|closed" C:/apps/oto-pkg/.method/conventions/component-registry.md`
  → rien ; aucune ligne à ajouter pour le lot f (aucune surface exportée nouvelle).
- Lot g, interrupteur : `rg -n -i "switch|commutateur|interrupteur" C:/apps/oto-pkg/.method/conventions/component-registry.md`
  → rien au registry, hormis `OrgSwitcher` (l. 62, autre chose) ; aucun `Switch` dans
  `ui/ds/react/`. Sur ce que fait la surface :
  `rg -n "role=\"switch\"|oto-switch-track" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/src --glob "*.tsx"`
  → `ui/public/partage-sur-le-web.tsx` l. 73-74 (`Commutateur`, local, textes en dur). Verdict :
  fusionner, par l'extraction de `Switch` (AC-g9, décision du 2026-09-29 ;
  `coding-standards.md § DRY`, deux occurrences).
- Lot g, panneau ouvert depuis l'en-tête : `AccessPanel` (`ui/ds/react/access-panel.tsx`) est propre
  au partage (« Partager · <espace> », chevron) ; `Popover` (`ui/ds/react/popover.tsx`, registry
  l. 62) est le panneau générique. Verdict : réutiliser `Popover` avec un `Button`.
- Lot g, envoi, annonce, refus : `rg -n "useRafraichir" C:/apps/oto-pkg/packages/plateforme/ui --glob "*.ts*"`
  → `ui/components/action-plateforme.tsx` l. 20 et 51, `ui/noeud/publication.tsx`,
  `ui/tableau/decision-de-revue.tsx` ; `messageDErreur` (`ui/api/messages.ts`). Verdict : réutiliser
  la file d'opérations (`useFileDOperations`, `file-d-operations.tsx` l. 217), `useRafraichir` et
  `messageDErreur` ; `ActionPlateforme` n'est pas repris : il appelle `appelerPlateforme` hors de la
  file et enverrait une révision périmée après une édition du titre (HN-E11S01-18).
- Lot g, nom : `rg -n "Reglages\b|export type Reglages" C:/apps/oto-pkg/packages/plateforme/ui/tableau/adresse.ts`
  → `Reglages` (l. 23) désigne le tri et les filtres de l'adresse. Verdict : `OptionsDuTableau`.

### Effet produit

- MCP : liste d'outils inchangée ; `table.write` gagne un champ facultatif, l'en-tête un attribut
  facultatif (ADR-002) ; textes de `table.write` (description, cellule, `set`, refus),
  `table.release`, `table.rows` (`q`, `limit`), `table.claim` (`limit`), `table.schema`, `read` d'un
  tableau et du contrat `write.table` changent (P14 : tests mot pour mot). Le lot g ne change aucun
  texte servi.
- Écran, recherche : la grille et les vues de tableau (bloc `reference` avec `view.q`) suivent
  AC-c1 ; « mairie de » trouve désormais plus de lignes. Le détail d'une cellule reçoit `host` et
  `worker` sans les afficher.
- Revue : sur un tableau `agents_may_decide`, des lignes peuvent passer d'un état de travail à une
  décision sans passer par la file de l'écran.
- Procédures : leurs blocs `call` sont recontrôlés par `check.ts` à la publication (AC-a6, AC-b6,
  AC-e4). Une procédure publiée sur un tableau sans `proof` perd le refus HN-M53-10 ; ses blocs
  `call` peuvent écrire des valeurs nues. Une procédure publiée n'est pas recontrôlée quand `proof`
  ou `closed` change, par `write` comme par le panneau (HN-E11S01-12).
- Tableaux existants : tous se lisent `proof: false` après la mise à jour (aucune reprise, fiche
  D133) ; seul le tableau de la Démo repose `proof: true` (AC-f8).
- Écran, file de revue : celle d'un tableau sans `proof` n'affiche plus « sans preuve » ;
  `file-de-revue.tsx` est aussi touché par E11-S05 (AC-a5, phrase du cycle) : deux zones
  distinctes du fichier, à fusionner dans l'ordre de la vague. La grille (E11-S05 AC-a1, AC-a2) et
  la page publique (HN-E01S12c-12) ne montrent pas de « sans preuve » : inchangées.
- Écran, en-tête (lot g) : sur un tableau, dès le niveau écriture, un bouton de plus dans l'en-tête,
  entre « Télécharger en .csv » et « Partager » ; E11-S05 touche le même fichier
  `en-tete-du-noeud.tsx` et le même créneau : à fusionner dans l'ordre de la vague. Rien ne change
  pour une page, une procédure ou un Contexte. Un réglage changé à l'écran se lit par l'assistant à
  la prochaine lecture de `table.schema` ou de `read` (AC-e4, AC-f4).
- Partage sur le web : même rendu, même comportement (AC-g9) ; seul le composant change de fichier.
- E11-S02 (publication directe, livrée après les lots a à f et avant le lot g) : le niveau écriture
  publie l'en-tête d'un tableau publié (AC-a2) ; les attributs `proof` et `agents_may_decide` des
  lots e et f s'écrivent donc au niveau écriture, par `write` comme par le panneau (HN-E11S01-7,
  HN-E11S01-21) ; AC-g6 devient plus rare.
- Aucune route, policy, migration, ni journal nouveaux ou changés.

### Refacto

- Écarté : lire `host` dans `platform.ctx` à la lecture plutôt que le ranger. Une requête de plus
  par page, et `forget_user` efface les `ctx` d'une personne (migration de base l. 447).
- Écarté : `required: "value"` au lieu d'un attribut à part. Il élargit un booléen que trois
  endroits comparent à `true` (`evolution.ts` l. 243, `evolution-checks.ts` l. 85, 181).
- Lot f, écarté : réunir `closed` et `proof` dans une table d'attributs d'en-tête parcourue par
  `merge`, `diffTableHeaders`, `changeList` et `publishedChanges`. Deux booléens ne paient pas la
  table ; sans elle, chaque attribut d'en-tête suivant se recopie en quatre endroits d'`evolution.ts`
  et `evolution-publish.ts`.
- Lot f, écarté : sortir de `write.ts` le jugement de la preuve dans un module à part. La condition
  `header.proof` tient en une ligne dans `withoutBareValues`.
- Lot g, accepté (décision du 2026-09-29) : `Commutateur` sort en `Switch` (`ui/ds/react/switch.tsx`),
  repris par le partage sur le web et par `OptionsDuTableau` (AC-g9). Coût : un fichier de plus, le
  partage sur le web touché, ses tests rejoués sans changer d'assertion.
- Lot g, écarté : une route `POST /api/plateforme/tables/options` avec son service. La route de
  `write` sert déjà `header` et `publish` (AC-g8, parité) ; une seconde porte doublerait les droits.

## Hypothèses

- **HN-E11S01-1** : `create_only` est un indicateur **par appel**, pas par ligne (source : simple ;
  l'assistant crée un lot de tâches ; un champ par ligne s'ajouterait sans casser, ADR-002).
- **HN-E11S01-2** : `create_only` avec `revision` sur une ligne est refusé au schéma (AC-a4) ; une
  valeur nue d'un appel `create_only` suit la règle de l'appel entier (`withoutBareValues`), jugée
  avant tout (source : `forms-patterns.md § Principe`, HN-M53-5).
- **HN-E11S01-3** : l'attribut s'appelle `allow_verified_empty` (défaut `true`) et vaut pour toute
  colonne ; « obligatoire strict » = `required: true` et `allow_verified_empty: false` (source :
  décision 7 ; nom de l'opération qu'il refuse).
- **HN-E11S01-4** : un mot se découpe sur `[^\p{L}\p{N}]+` après `normalizeTitle` et se cherche en
  sous-chaîne ; aucune borne du nombre de mots au-delà des 200 caractères de `q` (source : simple ;
  coût borné et testé).
- **HN-E11S01-5** : `host` et `worker` se rangent à l'écriture dans la provenance ; `host` est la
  signature de `ctx.host` telle que rangée (source : ADR-011 § 2, la provenance dit l'instant ; N3
  l. 347).
- **HN-E11S01-6** : `table.write` n'a pas d'argument `worker` ; il range celui du bail actif de la
  même personne (source : N4 d'E07-S02, `claimed_by_user` fait foi).
- **HN-E11S01-7**, tranchée (le responsable d'Oto, 2026-09-29) : un assistant au niveau écriture
  peut activer `agents_may_decide` et `proof` par `write`, comme tout attribut d'en-tête (la gestion
  jusqu'à la fusion d'E11-S02 AC-a2) ; canal ouvert voulu, tracé par la ligne de publication, le
  journal et la provenance `agent` (§ Sécurité). Source : H62, l'en-tête s'écrit par `write` ;
  HN-E11S02-17 ; le panneau du lot g l'ouvre aussi à l'écran, au même niveau. Alternative écartée :
  réservé à une personne, refus dans `evolution.ts` quand l'auteur est un assistant.
- **HN-E11S01-8** : une décision d'agent garde `origin: "agent"`, sans origine nouvelle ni
  commentaire exigé ; la colonne d'état s'écrit nue (source : PRD l. 356 ; décision 6).
- **HN-E11S01-9** : la révision servie par `table.schema` est celle du nœud publié, celle que
  `write` attend en `base_revision` (source : `read-format.ts` l. 89).
- **HN-E11S01-10** : l'attribut s'appelle `proof`, booléen, plutôt que `require_proof` (source :
  même forme que `closed`, un nom court sans verbe ; la description dit « true: every new value …
  needs its proof »).
- **HN-E11S01-11** : un tableau créé sans l'attribut, ou rangé avant la 1.0.1, se lit `proof: false`
  (source : fiche D133, « par défaut, la preuve est facultative » ; `.default(false)` comme
  `closed`).
- **HN-E11S01-12** : passer `proof` de `true` à `false` n'avertit de rien ; de `false` à `true`, rien
  n'est réécrit ni compté : les valeurs nues déjà rangées restent, seules les écritures suivantes
  sont jugées. Une procédure publiée n'est pas recontrôlée au changement de `proof` ; ses appels
  sont jugés à l'exécution par `table.write` (source : règle 7 de `write.table`, « a header change
  never rewrites a row » ; `closed` n'avertit pas non plus).
- **HN-E11S01-13** : la fixture de référence `PROSPECTS_HEADER` (`tests/factories/table-fixture.ts`)
  porte `proof: true`, pour que les tests de M53 et d'HN-M53-10 gardent leurs assertions ; un
  en-tête dérivé sans `proof` sert les cas d'AC-f2, AC-f4, AC-f6 et AC-f7 (source : AC-f3 ;
  `testing-strategy.md § Budget de tests`).
- **HN-E11S01-14** : textes servis du changement d'en-tête, sur le modèle de `close` / `closed` et
  `reopen` / `reopened` : « require proof » et « stop requiring proof » en attente (`changeList`),
  « proof required » et « proof optional » à la publication (`publishedChanges`) (source :
  `evolution.ts` l. 277, `evolution-publish.ts` l. 256).
- **HN-E11S01-15** : sur un tableau sans `proof`, `withoutBareValues` retire encore une valeur nue
  égale à la valeur rangée, pour qu'un renvoi tel quel ne remplace pas une provenance prouvée ou
  importée par une provenance `agent` nue (source : HN-M53-5, première moitié ; AC-f2).
- **HN-E11S01-16** (ex-HN-E11S08-1), validée (JB, 2026-09-29) : dans le créneau `access` de
  l'en-tête, l'ordre est « Télécharger en .csv » (E11-S05), « Réglages », puis « Partager ·
  <espace> » ; « Partager » reste le dernier, à droite (source : E11-S05 AC-c1, « avant « Partager »
  dans le DOM et à l'écran »).
- **HN-E11S01-17** (ex-HN-E11S08-2) : sans `lifecycle.review`, l'interrupteur de revue est absent,
  pas désactivé : un tableau sans revue n'a rien à décider (source : AC-e1, l'attribut vit dans
  `lifecycle.review` ; décision du 2026-09-29, « seulement si le tableau a un cycle avec revue »).
- **HN-E11S01-18** (ex-HN-E11S08-3) : le geste part par la file d'opérations de la page
  (`useFileDOperations`, `CorpsDEnvoi` = corps de `write` sans `path`, `base_revision` ni
  `draft_stamp`, `file-d-operations.tsx` l. 21 et 39-45), qui pose la révision et le tampon
  courants : une édition du titre se publie 3 s après la frappe et fait avancer la révision
  (source : `ui/noeud/publication.tsx` l. 3-5 ; à tout niveau d'écriture après E11-S02, lots a à c) ; un appel
  direct avec `vue.revision` serait refusé `stale_revision`.
- **HN-E11S01-19** (ex-HN-E11S08-4) : l'annonce de succès nomme l'interrupteur et son nouvel état ;
  la page se relit pour que l'en-tête publié et la file de revue suivent (source : une annonce par
  geste, `accessibility-patterns.md` ; `useRafraichir` comme la décision de revue).
- **HN-E11S01-20** (ex-HN-E11S08-5), validée (JB, 2026-09-29) : un brouillon d'en-tête en attente
  bloque le panneau (AC-g6), plutôt que publier le brouillon entier avec le réglage ou écrire le
  réglage sur l'en-tête publié par une porte de service nouvelle (source : `tableHeaderEdit`
  fusionne sur le brouillon, `server/nodes/write.ts` l. 124-130 ; un retrait de colonne en attente
  rendrait `needs_confirmation`).
- **HN-E11S01-21**, tranchée (le responsable d'Oto, 2026-09-29, avec HN-E11S02-17) : le panneau
  s'ouvre au niveau écriture (`vue.level >= 2`, AC-g1), comme la publication d'un en-tête changé
  d'un tableau publié après E11-S02 AC-a2 ; AC-g8 n'a plus de refus au niveau écriture ; le lot g
  vient donc après E11-S02. Option écartée : le panneau réservé à la gestion.
- **HN-E11S01-22** (implémentation) : `agents_may_decide` est `.optional()` dans `tableReviewSchema`, sans
  défaut écrit : absent, il se lit faux, et un en-tête lu ne gagne pas la clé (écart de forme avec AC-e1,
  même comportement).
- **HN-E11S01-23** (implémentation) : la description de `required` du patch d'en-tête
  (`tableColumnPatchSchema`) reprend celle d'AC-b1, avec son exemple et son défaut (« e.g. true (default:
  unchanged; false for a new column) »).
- **HN-E11S01-24** (implémentation) : dans `table.schema`, la clé et la colonne d'état se disent `required`
  seul, `verified_empty` y étant toujours refusé (AC-b6 amendé en revue).
- **HN-E11S01-25** (implémentation) : publier `allow_verified_empty: false` sur une colonne déjà requise
  avertit (`missing_required`) des seules lignes qui n'y ont qu'un `verified_empty` ; une colonne rendue
  requise et stricte d'un coup avertit de toute ligne sans vraie valeur (AC-b5).
- **HN-E11S01-26** (implémentation) : `table.release` range toujours le `worker` de l'appel dans la
  provenance de l'état ; sa description et sa ligne de refus disent l'exception d'un tableau qui laisse
  l'assistant décider (AC-d3, AC-e4).

## Actions JB

- Aucune (HN-E11S01-21 tranchée le 2026-09-29, avec HN-E11S02-17).

## Tests attendus

### Unit tests
- [ ] `tests/unit/tables-write.test.ts` (`applyRowWrite`) : AC-b2, AC-b3 (création et note), AC-b4 ;
  `host` et `worker` rangés, absents sans valeur (AC-d2, AC-d3).
- [ ] `tests/unit/tables-filters.test.ts` : `queryWords` et `matchesQuery` (AC-c1 : ordre, deux
  cellules, accents, doublon) ; AC-c2 ; 100 mots sur 5 000 lignes de 20 colonnes en moins d'une
  seconde.
- [ ] Schémas : AC-a4 et les trois messages d'AC-c4, mot pour mot.
- [ ] `tests/unit/tables-write.test.ts` (`withoutBareValues`, lot f) : sur `proof: true`, les cas
  actuels ; sans `proof`, une valeur nue nouvelle et une ligne à créer passent sans problème, une
  valeur nue égale sort de `set` (AC-f2, AC-f3, HN-E11S01-15) ; `SHAPE` suit `CELL_REFUSED` (AC-f5).
- [ ] `tests/unit/tables-meta.test.ts` : un en-tête sans l'attribut se lit `proof: false`, avec lui
  `proof: true` (AC-f1).
- Lot g : aucune fonction pure nouvelle ; `Switch` est couvert par ses deux écrans.

### Integration tests (fixture d'E07-S01, `seedTableFixture`)
- [ ] `tests/unit/tables-write-service.test.ts` : AC-a1, AC-a3 ; AC-a2 par `spyDb` (course forcée) ;
  AC-d3 (écriture sous bail) ; lot f, AC-f2 sur un tableau sans `proof` (création et mise à jour
  nues, provenance relue `origin: "agent"` sans `comment` ni `link` ; valeur nue égale qui laisse la
  provenance prouvée) ; AC-f3 : cas de M53 inchangés sur `proof: true`.
- [ ] `tests/unit/tables-queue.test.ts` : AC-d2 et AC-d3 (claim, release) ; AC-e2 et AC-e3.
- [ ] `tests/unit/tables-rows.test.ts` : AC-d4 ; AC-c1 par `table.rows`.
- [ ] `tests/unit/table-screen-service.test.ts` : AC-c3, un cas.
- [ ] `tests/unit/tables-evolution.test.ts` : AC-b5 ; AC-f1, publication de `proof: true` puis
  `false`, « proof required » et « proof optional » ; aucune ligne relue ni réécrite.
- [ ] `tests/unit/tables-check.test.ts` : AC-a6, AC-b6, AC-e4 ; AC-f6, un bloc nu sans `proof` (aucun
  problème de preuve) et le même avec `proof: true` (refus actuel).
- [ ] `tests/unit/tables-schema-write.test.ts` (lot g, service) : `writeNode` avec un `header` à un
  seul attribut et `publish: true` au niveau écriture, pour `proof`, `closed` et le cycle : publié
  en un temps, aucune ligne lue (AC-g4, AC-g8) ; au niveau lecture, `forbidden` et rien
  d'enregistré (AC-g8).

### MCP (`InMemoryTransport`)
- [ ] `tests/unit/mcp-tables.test.ts` : `call table.schema` (AC-d1, AC-b6, AC-e4 ; AC-f4 sur un
  tableau `proof: true` et sur un tableau sans : les deux lignes « Proof: », la ligne d'écriture,
  `proof` dans le contenu structuré) ; `call table.write` avec `create_only` (AC-a1) et nu sur un
  tableau sans `proof` (AC-f2) ; textes et `structuredContent` identiques ; six outils.
- [ ] `tests/unit/mcp-tables.test.ts` : `read` des fonctions `table.write` (AC-a7 ; description,
  cellule, `set` et refus d'AC-f5 mot pour mot, description sous 1 000 caractères), `table.rows`
  (AC-c5) et `table.release` (AC-e4). `catalog-contracts.test.ts` ne couvre que `write.procedure`.
- [ ] `tests/unit/mcp-table-schema.test.ts` : contrat `write.table`, les descriptions de `required`
  qu'il sert par son JSON Schema (AC-b1), sa règle 1 (AC-b6), les clés du JSON Schema avec `proof`,
  la description et la règle 3 d'AC-f5, mot pour mot.

### Composant
- [ ] `tests/integration/components/file-de-revue.test.tsx` : AC-f7, la même fiche sans « (sans
  preuve) » sur un en-tête sans `proof` ; le cas actuel (l. 140-162) sur `proof: true`.
- [ ] `tests/integration/components/options-du-tableau.test.tsx` (lot g) : AC-g2 (rôles `switch`,
  noms, descriptions, état publié ; interrupteur de revue présent avec `lifecycle.review`, absent
  sans) ; AC-g3 (corps envoyé mot pour mot pour chacun des trois, par une file simulée ; annonce ;
  interrupteurs désactivés pendant l'envoi ; focus gardé) ; AC-g5 (`stale_revision` et `forbidden`,
  interrupteur revenu) ; AC-g6 (en-tête en attente : désactivés, phrase, aucun envoi ; brouillon
  sans en-tête : actifs) ; AC-g7 (`Échap` rend le focus à « Réglages »).
- [ ] `tests/integration/components/ecran-de-noeud.test.tsx` (lot g) : AC-g1, le bouton au niveau
  écriture sur un tableau ; absent au niveau 1, en `?version=publiee`, et sur une page ; une
  branche vraie à la fois (`testing-strategy.md § Anti-patterns`, condition de droit).
- [ ] `tests/integration/components/e05s10d-partage-web.test.tsx` : rejoué sans changer une
  assertion après l'extraction (AC-g9).

### Démo
- [ ] `tests/unit/pilot-content.test.ts` : `HEADER` porte `proof: true` (AC-f8) ;
  `procedures-table-check.test.ts` inchangé.

### E2E tests
- [ ] `tests/e2e/tableau.spec.ts` (lot g) : sur le tableau de la Démo, au niveau écriture, ouvrir
  « Réglages », décocher puis recocher « Preuve exigée », recharger : l'état tient ; capture du
  panneau en thème clair et en thème sombre (AC-g7 ; `portage-ecrans.md § 3`).
- [ ] `tests/e2e/partage-public.spec.ts` : rejoué sans changement (AC-g9).
- Lots a à f : sans objet ; la grille est couverte par AC-c3, la mention « sans preuve » par le test
  de composant d'AC-f7, sans changement de classe (`text-mute` gardé).

## Post-implémentation

### Écarts avec la référence UI

Lots a à f : aucun (la file de revue ne montre « sans preuve » que sur un tableau `proof: true`, AC-f7). Lot g
non livré.

### Écarts avec l'architecture

Aucun invariant touché. ADR-002 § 1 amendé par le pilote : en 1.1.0, sans client (fiche D131), les
descriptions de `write` et des fonctions de tableau sont réécrites en place. AC-b3 et AC-b6 amendés en revue
(2026-09-29). `docs/architecture.md` (ligne `tables/`) et `docs/prd.md` (l. 38, § Tableau, FR-CONC-05, risques,
métriques) suivent.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `queryWords` | `packages/plateforme/schemas/tables.ts` | Mots de `q` (AC-c1) : une seule règle pour le refus du schéma, `table.rows`, la grille et les vues ; exporté par `./schemas` |

### Notes

- Lots a à f livrés dans le worktree `e11-s01`, revue approuvée, fusionnés sur `main` sans commit (commit
  commun à venir) ; lot g après E11-S02.
- Hypothèses d'implémentation HN-E11S01-22 à 26, reportées dans `docs/decisions/hypotheses.md` avec les
  amendements de P10, N9 (E07-S02), H92, H94, H96, HN-M53-5 et HN-M53-10.
- Tableaux existants : `proof: false` après la mise à jour ; le tableau de la Démo repose `proof: true` au
  prochain `pnpm demo:seed` (AC-f8).
- Golden queries T9 (`create_only`) et T10 (`q` par mots) ajoutées.
