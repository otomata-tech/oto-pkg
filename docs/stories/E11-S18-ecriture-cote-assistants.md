# Story E11-S18 — L'écriture côté assistants : rien d'écrit sur un refus, déplacer, importer une page entière

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | Écrire et organiser le contenu par un assistant (MCP `write`, `call`) |
| **Statut** | 🟢 Ready |
| **Priorité** | Must — version 1.1.3 (non publiée), lot A « l'écriture côté assistants » |
| **Référence UI** | N/A (surface MCP et services ; aucun écran) |
| **Conventions** | coding-standards, supabase, security, forms, registry, testing, mcp, database (garde anti-récidive) |
| **Estimation** | L (neuf points, une seule face touchée : `server/nodes/` et ses schémas) |
| **Dépend de** | 1.1.2 publiée (530fc4c) ; le lot B de la 1.1.3 pose `acceptOwnContextWrite` dans `server/ctx.ts` (point 9) |
| **Porteuse de migration** | Oui, partie 2 de `20260930150000_v1_1_3.sql` (contrainte `teams_slug_reserved`, revue) |

## Contexte

Retours d'un assistant qui a migré une base de connaissances de 36 fiches markdown, 3 procédures et 2 tableaux dans
l'espace d'une équipe par le MCP (rapport de frictions du 2026-09-30, et FB-0015) : chaque page a coûté un appel et un
découpage à la main en `add_section` ; un titre changé a déplacé le chemin sans moyen de le choisir ; un refus de
publication laissait un brouillon qu'il fallait abandonner ; un `add_section` avec `after` sur un Contexte a rendu deux
« Internal error » ; le frontmatter YAML d'un `.md` devenait le résumé de la page ; l'auteur d'un Contexte perdait son
propre `ctx`. JB a décidé d'intégrer ces retours dans la 1.1.3 ; le pilote avance sans lui (hypothèses sourcées
ci-dessous).

**Refs :** ADR-002 (surface figée, ajout seulement), ADR-011 § 3 (brouillon et publication, amendé ici) et § 5,
ADR-018 (dépôt par lien), P12 (`docs/decisions/hypotheses.md`, amendée par HN-E11S18-5), D101 (le chemin suit le titre),
`docs/architecture.md` (services `server/nodes/`, catalogue `call`).

### Périmètre

Les neuf points du lot A : (1) écriture d'assistant atomique, (2) `node.move`, (3) coupe du segment de chemin,
(4) FB-0015, (5) frontmatter YAML, (6) `replace_text` sur la page et par bloc, (7) `set_markdown` et écriture par lot,
(8) unicité des titres de section dite, (9) l'auteur d'un Contexte garde son `ctx`.

### Hors périmètre

- Descriptions des six outils (`mcp/tools.ts`), `hypotheses.md`, `architecture.md`, golden queries, CHANGELOG du paquet,
  `docs/changelog.md`, sprint status, registry : textes remis au pilote, qui les écrit.
- `server/ctx.ts` et sa migration (lot B) : ce lot appelle `acceptOwnContextWrite`, il ne l'écrit pas.
- Ne plus déplacer le chemin sur un titre changé (P1 du rapport) : D101 gardée ; `node.move` choisit le chemin après.
- Réécriture des liens entrants d'un renommage, `create_parents`, propriétés de page, `route.test` : autres retours.
- `extra_float_digits` posé par la session (`server/sql.ts`, hors de ce lot) : remonté au pilote (§ Notes).

## Critères d'acceptation

- [ ] **AC-1 — Refus sans brouillon.** **Given** un assistant (porte MCP, `publish` absent ou vrai) **When** la
  publication de son `write` est refusée (procédure invalide, en-tête de tableau refusé, `needs_confirmation`, bornes des
  liens) **Then** rien n'est écrit : ni brouillon, ni nœud créé, ni bloc ; le refus garde son code et finit par
  « Nothing was written. », sans renvoi à `node.discard_draft` ; un brouillon qui existait avant l'appel reste tel quel.
- [ ] **AC-2 — Retrait confirmé en un appel.** **Given** le refus `needs_confirmation` d'un retrait de colonne **Then**
  il donne l'appel à refaire : le même `header` avec `"confirm_remove": true` ; **When** l'assistant le fait **Then** la
  colonne part et la publication passe.
- [ ] **AC-3 — L'écran garde son brouillon.** **Given** l'écran (porte API) **When** sa publication est refusée **Then**
  le brouillon reste, comme avant ; **and** `publish: false` d'un assistant laisse un brouillon, comme avant.
- [ ] **AC-4 — Une ligne par écriture publiée.** **Given** un `write` qui publie **Then** sa réponse commence par
  « Published <path> revision N (<n> sections, <m> blocks): <ce qui a été fait>. Next write: base_revision N. », sans
  ligne « Draft … ».
- [ ] **AC-5 — `node.move`.** **Given** la gestion du nœud et l'écriture sous la destination **When**
  `call node.move {path, new_path}` **Then** le nœud et ses sous-pages vont à `new_path`, l'ancien chemin redirige ; les
  refus sont ceux de `moveNode` (introuvable, racine, espace, Contexte, dossier d'équipe, sous lui-même, parent absent,
  droits) ; `find` type function sort `node.move` sur « move rename node path » et « déplacer renommer dossier ».
- [ ] **AC-6 — `node.move` nommé.** La réponse d'un `write` dont le titre a déplacé le chemin, et le refus d'une création
  sous un chemin déplacé, nomment `node.move`.
- [ ] **AC-7 — Segment coupé à un mot.** **Given** un titre dont le segment dépasse 60 caractères **Then** le chemin est
  coupé au dernier `_` avant 60 ; un seul mot plus long reste coupé à 60.
- [ ] **AC-8 — FB-0015.** **Given** des positions de blocs relues arrondies par la base (`extra_float_digits = 0`)
  **When** `add_section` avec `after` insère deux blocs entre deux autres **Then** l'écriture passe ; **and** si les blocs
  relus ne correspondent pas à ceux envoyés, le refus est un `conflict` qui dit quoi faire, jamais « Internal error ».
- [ ] **AC-9 — Frontmatter.** **Given** un `.md` qui commence par un frontmatter YAML (`---` … `---`) **When** il est
  lu pour devenir une page (import de l'écran, `upload.link`) **Then** le frontmatter n'est pas dans le corps ; le titre
  et le résumé en viennent quand il les porte, sinon le résumé est le premier vrai paragraphe ; **and** `set_markdown`
  ne l'écrit pas.
- [ ] **AC-10 — `replace_text` sur la page, par bloc, compté.** **Given** `replace_text` sans `section` **Then** il vaut
  pour toute la page ; avec `block`, pour ce bloc ; avec `count: N`, les N occurrences sont remplacées, et un autre
  nombre trouvé est refusé en le disant ; sans `count`, une seule occurrence attendue (comme avant).
- [ ] **AC-11 — `set_markdown`.** **Given** `{op: "set_markdown", text}` à la création ou en édition **Then** tout le
  corps est remplacé par ce markdown, découpé en sections par ses titres ; un texte vide est refusé ; 40 000 caractères
  au plus par opération (borne gardée).
- [ ] **AC-12 — Écriture par lot.** **Given** `call node.write_many {pages: [...]}` (50 au plus, chaque page un `write`
  sans `ctx`) **Then** chaque page s'écrit dans l'ordre, atomique, et le résultat donne une ligne par page (publiée,
  brouillon, ou refusée avec son code) ; un refus n'arrête pas les suivantes.
- [ ] **AC-13 — Unicité des sections dite.** Le contrat de `write` (texte remis) dit qu'un titre de section en double
  est refusé par `add_section` et qu'une section ambiguë se désigne par ses références de bloc.
- [ ] **AC-14 — L'auteur d'un Contexte garde son `ctx`.** **Given** un `write` qui publie un Contexte servi au `ctx` de
  l'appel **Then** ce `ctx` reste valide (sa ligne passe à la nouvelle révision) et la réponse dit que les autres
  conversations rappellent `context`, pas celle-ci.

## Implémentation

### Fichiers à créer
- `packages/plateforme/server/nodes/write-atomic.ts` — l'écriture d'assistant dans une transaction, ses refus réécrits,
  l'auteur d'un Contexte (points 1, 9).
- `packages/plateforme/server/nodes/write-many.ts` — `node.write_many` (point 7).
- `packages/plateforme/server/nodes/move-function.ts` — `node.move` (point 2).
- `packages/plateforme/server/nodes/replace-text.ts` — `replace_text` sur une section, un bloc ou la page (point 6),
  sorti de `section-ops.ts` (borne de 300 lignes).
- `packages/plateforme/schemas/frontmatter.ts` — `splitFrontmatter`, `frontmatterHead` (point 5), hors de
  `blocks-render.ts` (borne de 300 lignes).
- Tests : `tests/unit/e11s18-ecriture-assistants.test.ts` (base locale).

### Fichiers à modifier
- `schemas/` : `nodes.ts` (`slugOf`, `PAGE_OPS`, `count`, descriptions, `moveNodeSchema` décrit, `writeManyArgsSchema`),
  `blocks-render.ts` (`readPageMarkdown`). Aucun export du paquet ajouté.
- `server/` : `nodes/write.ts`, `nodes/write-result.ts`, `nodes/ops.ts`, `nodes/section-ops.ts`, `nodes/block-ops.ts`
  (`target` exporté), `nodes/store.ts`, `catalog/registry.ts`, `catalog/contracts.ts`, `tables/evolution-checks.ts`,
  `teams.ts` (slug réservé `functions`, demandé par le lot B).
- Tests dont le texte attendu change : listés en Post-implémentation.

### Migrations prévues
L'atomicité est une transaction du service, `node.move` réutilise `moveNode`. Revue : `functions` ajouté à la contrainte
`teams_slug_reserved` (partie 2 de `20260930150000_v1_1_3.sql`, remplacement `drop constraint, add constraint` d'une
instruction, admis par `check:migrations`), copie de l'hôte synchronisée, `migrations/README.md` mis à jour.

### Schémas Zod partagés
`writeOpSchema` (ajouts `set_markdown`, `count`), `moveNodeSchema` (décrit, partagé par l'API, l'écran et `node.move`),
`writeManyArgsSchema` (`schemas/nodes.ts`).

## Rayon d'impact

### Appelants
- `savedResult` — `rg -n "savedResult" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` →
  `server/nodes/write.ts:265` seul ; ses textes sont lus mot pour mot par `nodes-write`, `nodes-publish`,
  `tables-schema-write`, `mcp-read-write` (première ligne « Draft … » d'une écriture publiée → « Published … »).
- `writeNode` — `rg -n "writeNode\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` →
  `mcp/server.ts:97` (atomique), `api/nodes.ts:88` (écran, inchangé), `server/uploads-write.ts:109` (atomique :
  `upload.link` qui publie), `server/tables/import.ts:238` (atomique : la création du tableau d'un import) ; 20 fichiers de
  tests, rejoués.
- `publishNode` — `rg -n "publishNode\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` → `write.ts:251`,
  `mcp/admin/tools/node.ts:47` (publication d'un brouillon existant par l'administration : inchangée).
- Refus « The draft is kept » — `rg -n "draft is kept" C:/apps/oto-pkg/packages` → `procedures-check.ts:263`,
  `nodes/links.ts:115`, `tables/evolution-checks.ts:117`, `tables/evolution-publish.ts:195,207` : textes gardés pour
  l'écran, réécrits pour une écriture atomique ; tests : `procedures-*`, `tables-evolution`, `mcp-table-schema`,
  `mcp-procedures`, `e11s02-brouillons-et-suppression`.
- `applyOps` / `writeOpSchema` / `WRITE_OPS` — `rg -n "applyOps\(|WRITE_OPS|SECTION_OPS|BLOCK_OPS" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `write.ts:197,315`, `ops.ts:36`, `schemas/index.ts`, `tests/helpers/sql.ts`, `tests/helpers/spy-t1-c1a.ts` (listes lues,
  inchangées : l'ajout est en fin), `nodes-ops`, `nodes-parse*`, `m67-blocs-inconnus`.
- `slugOf` — `rg -n "slugOf\(|titleSegment\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/scripts` →
  `segments.ts:21` (chemin d'un titre), `teams.ts:40` (slug d'équipe, 40), `csv.ts:117,153` (nom de colonne et segment
  d'un import), `ui/noeud/editeur/gestes-du-menu.ts:93` : tous coupés au mot désormais (HN-E11S18-7).
- `readPageMarkdown` — `rg -n "readPageMarkdown" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` →
  `server/uploads-write.ts:234`, `ui/coque/envoi-d-import.ts:111`, `ui/coque/import-de-fichier.tsx:116` : sans frontmatter
  désormais ; `tests/unit/markdown-aller-retour.test.ts` (inchangé : aucun frontmatter).
- `moveNode` — `rg -n "moveNode\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` → `api/nodes.ts:103`,
  `mcp/admin/tools/node.ts:26`, `rename.ts:42`, et `node.move` (nouveau) ; aucun changement de sa signature.
- `insertBlocks` (interne à `store.ts`) — seul appelant `saveDraft` (`store.ts:341`).

### Doublons
- Registry (`rg -n "moveNode|slugOf|readPageMarkdown|node\.trash|parseMarkdown" C:/apps/oto-pkg/.method/conventions/component-registry.md`) :
  `moveNode` réutilisé tel quel par `node.move` (verdict : réutiliser) ; `nodeTrash` sert de modèle de fonction native.
- Remplacer tout le corps : `upload.link` en mode `replace` (`uploads-write.ts:237`, base vide puis `insert_after` des
  morceaux) — `rg -n "replace" C:/apps/oto-pkg/packages/plateforme/server/uploads-write.ts`. Verdict : laisser son chemin
  (un fichier de plus de 40 000 caractères, en morceaux, mode tolérant) ; `set_markdown` réutilise la même analyse
  (`parseOpText`) et l'appariement des blocs de `replace_section` (`matchByForm`), sans nouvelle analyse.
- Frontmatter : `rg -in "frontmatter|front matter" C:/apps/oto-pkg/packages` → aucun ; une seule fonction,
  `splitFrontmatter`, lue par `readPageMarkdown` et `set_markdown`.
- Lot : aucune écriture par lot (`rg -n "write_many|pages:" C:/apps/oto-pkg/packages/plateforme/server`) ; `node.write_many`
  appelle `writeNode` page par page (aucune logique d'écriture propre).

### Effet produit
- MCP : la liste des outils ne change que par des ajouts (valeur d'enum `set_markdown`, champ `count`, descriptions
  allongées) ; deux fonctions ajoutées au catalogue (`node.move`, `node.write_many`) ; les textes de `write` changent
  (golden queries à rejouer, remises au pilote).
- `upload.link` et `table.import` (qui écrivent par `writeNode`) : un refus de publication n'y laisse plus de brouillon.
- Chemins : slug au mot pour les nouveaux titres, les nouvelles équipes, les noms de colonne d'un CSV (un en-tête de plus
  de 60 caractères d'un tableau déjà importé ne retrouve plus sa colonne à l'identique : stade R&D, aucune donnée à
  reprendre).
- Import d'un `.md` à l'écran : le frontmatter n'est plus dans la page.
- Aucune policy, aucune migration, aucun écran.

### Refacto
- Écarté : passer un indicateur « atomique » aux constructeurs de refus (`procedures-check.ts`,
  `tables/evolution-publish.ts`, hors de ce lot) ; la réécriture en un seul point (`write-atomic.ts`) est testée. À
  reprendre si un troisième texte de refus apparaît.
- Écarté : `write.ts` dépasse 300 lignes avant ce lot (397) ; le lot n'y ajoute que l'appel de `write-atomic.ts`.
- Fait, imposé par la borne de 300 lignes (`coding-standards.md § Complexité`, ESLint `max-lines`) et non par un choix :
  `replace_text` sorti de `section-ops.ts` vers `replace-text.ts` (il vise aussi un bloc et la page), le frontmatter hors
  de `blocks-render.ts` ; les cas existants de `replace_text` passent inchangés (`nodes-ops.test.ts`), sauf la phrase
  ajoutée « To replace all N, give count: N. ».

## Tests attendus

### Unit tests (base locale, `PLATFORM_TEST_DB=local`) — `tests/unit/e11s18-ecriture-assistants.test.ts`
- [ ] AC-1, AC-3 : procédure refusée à la création → aucun nœud ; édition refusée → aucun brouillon ; la même par
  l'écran → brouillon gardé.
- [ ] AC-5 : `node.move` (déplacement avec sous-pages et alias ; refus d'un Contexte).
- [ ] AC-8 : `extra_float_digits = 0` posé dans la transaction, `add_section` avec `after` (vu en échec avant le correctif).
- [ ] AC-12 : trois pages dont une refusée, dans l'ordre.
- [ ] AC-14 : `write` d'un Contexte sous un `ctx` qui l'a reçu, puis `requireCtx` sur le même code accepté.

### Dans les suites existantes
- [ ] AC-2 : `mcp-table-schema.test.ts` (les deux canaux, l'appel refait avec tout l'en-tête), `tables-evolution.test.ts`.
- [ ] AC-4, AC-6 : textes mis à jour (`nodes-write`, `nodes-publish`, `tables-schema-write`, `nodes-move`, intégration).
- [ ] AC-5 (découverte) : `catalog.test.ts` (`searchFunctions` sur « move rename node path », « déplacer renommer
  dossier », « reorganize folder » ; schémas stricts).
- [ ] AC-7 : `e05s10e-segments.test.ts` (coupe au mot, un mot seul trop long).
- [ ] AC-9 : `markdown-aller-retour.test.ts` (frontmatter, vu en échec avant le correctif ; texte hostile).
- [ ] AC-10, AC-11 : `nodes-ops.test.ts` (page, bloc, compte, compte faux, à cheval, `set_markdown`, frontmatter, vide).
- [ ] Course d'un assistant rejouée une fois (HN-E11S18-2) : `nodes-publish.test.ts` (AC30).

### Integration / E2E
- Aucun nouveau : les suites existantes de `write` sont rejouées.

## Hypothèses

- **HN-E11S18-1 (AC-1).** « Assistant » = toute écriture de porte `agent` : `write` du MCP, `upload.link`, la création du
  tableau de `table.import`, `node.write_many`. Toute l'écriture (création du nœud, brouillon, publication, adresse qui
  suit le titre, ligne du `ctx` de l'auteur) tient dans une transaction ; tout refus l'annule. Source : décision de JB
  (amende ADR-011 § 3). L'écran garde son brouillon (il sauve la frappe d'une personne) ; `admin_node publish` publie un
  brouillon qui existe déjà : inchangé.
- **HN-E11S18-2 (AC-1).** Les transactions des services appelés reprennent celle de l'écriture (`db.tx` sous la même
  session), sans point de sauvegarde : une erreur de la base (une course) interrompt la transaction, et le refus qui la
  relirait y devient une panne (`internal`) ; l'écriture, annulée entière, se rejoue alors une fois et dit l'état d'après
  la course (`stale_revision` avec l'état courant). Écarté : des points de sauvegarde par `sql.savepoint`, dont les
  requêtes échappent aux espions des tests (`spyDb`, `watchDb`), ou posés à la main (deux allers-retours de plus par
  transaction de service) ; les poser dans `server/sql.ts` pour tout le paquet (hors du lot). Rejouée après une course
  sur le tampon du brouillon, une publication sans opérations publie le brouillon partagé tel qu'un autre l'a laissé
  (ADR-011 § 3). Un service qui, pour l'écran, rattrape une erreur de base (purge d'après publication, `followTitle`)
  perd sous elle toute l'écriture : exception écrite de `supabase-patterns.md § Couplage à Supabase (ADR-012)` ; la
  purge n'est pas déplacée après la transaction (`finishTablePublication` est dans `publishNode`, partagé avec l'écran).
- **HN-E11S18-3 (AC-1, AC-2).** Les textes de refus des services (« The draft is kept; nothing was published. » et le
  renvoi à `node.discard_draft`) sont réécrits par `write-atomic.ts`, seul point : « Nothing was written. » ; quand un
  brouillon écrit avant l'appel (par `publish: false` ou l'écran) reste, relu après l'annulation, « Nothing was written;
  the draft saved before this call stays. » et le renvoi gardé. `needs_confirmation` y reçoit l'appel à refaire (le même
  appel, `header` augmenté de `"confirm_remove": true`). Écarté : un indicateur passé aux constructeurs de refus, dans des
  fichiers hors du lot (`procedures-check.ts`, `tables/evolution-publish.ts`).
- **HN-E11S18-4 (AC-4).** Ce qu'a fait l'écriture suit « Published … (<n> sections, <m> blocks) » après deux-points ; pour
  un tableau, ses fragments précèdent le résumé de l'en-tête publié. La réponse de `publish: false` est inchangée.
- **HN-E11S18-5 (AC-5).** Amende P12 : « Le déplacement d'un nœud passe par la route `POST /api/platform/nodes/move`,
  l'action « Déplacer… » de l'écran et `node.move` derrière `call`, au niveau gestion ; aucun des six outils ne déplace
  lui-même. » `node.move` est de classe `write`, pas `sensitive` : un déplacement se défait (l'ancien chemin redirige,
  on redéplace), rien n'est effacé.
- **HN-E11S18-6 (AC-5).** Les arguments de `node.move` sont `moveNodeSchema`, décrit (une source pour l'API, l'écran et
  le catalogue). Un `new_path` pris va au premier chemin libre, comme à l'écran (fiche D125).
- **HN-E11S18-7 (AC-7).** La coupe au mot vaut dans `slugOf`, sa seule définition : segment d'un titre, slug d'équipe,
  nom de colonne et segment d'un import ; et dans `cutAtWord`, partagée avec un nom de colonne préfixé (`c_`) ou numéroté
  (`_2`). Un premier mot plus long que la borne reste coupé à la borne. Aucune compatibilité due (stade R&D, aucun
  client) ; les slugs d'équipe stockés font foi (`checkName` les compare, jamais un slug recalculé d'un nom).
- **HN-E11S18-8 (AC-8).** La cause établie : `insertBlocks` retrouvait chaque bloc inséré par l'égalité de sa position
  flottante relue ; une session où `extra_float_digits` est sous 1 relit un `double precision` à 15 chiffres (1365.3333…
  d'une insertion entre 1024 et 2048 revient 1365.33333333333), d'où « Internal error » sur `add_section` avec `after`, et
  jamais sans lui (positions entières à la fin). Les lignes rendues par `insert … returning` se lisent dans l'ordre des
  valeurs insérées ; un nombre ou un type qui ne correspond pas est un `conflict` journalisé (un `internal` est masqué
  par la porte MCP).
- **HN-E11S18-9 (AC-9).** Un frontmatter est une première ligne `---`, des lignes YAML simples (`clé: valeur`, élément de
  liste, ligne indentée, commentaire, ligne vide), puis `---` ou `...`, dans les 100 premières lignes ; sinon rien n'est
  retiré (un séparateur en tête reste un séparateur). Clés lues sans casse : `title`, `titre` ; `summary`, `resume`,
  `résumé`, `description` ; une valeur entre guillemets est ce qu'ils entourent, une valeur nue s'arrête à ` #` ; un bloc
  littéral ou replié (`title: |`, `>`) n'est pas lu (titre du premier `#` ou du fichier). Avec un titre de frontmatter, un premier
  titre `#` identique (sans casse ni accent) est retiré du corps ; différent, il reste.
- **HN-E11S18-10 (AC-10).** Sans `section` ni `block`, `replace_text` cherche dans le rendu de toute la page ; une
  occurrence à cheval sur deux blocs n'y est remplacée que dans une section (réécriture de son corps, comme avant), sinon
  refusée en nommant `set_markdown`. `count` : 1 à 1 000. Un remplacement dans un titre doit laisser un titre du même
  niveau ; dans un autre bloc, aucun titre au niveau de sa section ou au-dessus ; avant le premier titre, aucune borne. La
  taille projetée (taille + `count` × (texte − `find`)) est refusée en `too_large` au-delà de la borne de la portée
  (section ou bloc : `SECTION_MAX` ; page : `PAGE_MAX`) avant toute construction ; le texte s'assemble en une passe.
- **HN-E11S18-11 (AC-11, AC-12).** `set_markdown` écrit le corps seul (titre et résumé restent des champs de `write`) ; un
  premier titre `#` du texte reste un titre de section. Les blocs identiques gardent leur id. Le lot passe par une
  fonction du catalogue, `node.write_many`, et non par un champ `pages` de `write` : `path` est requis dans le JSON Schema
  de `write`, et le rendre facultatif serait une rupture (ADR-002 § 1). Classe `write` ; les pages s'écrivent dans l'ordre
  (un parent avant ses enfants) ; chaque ligne de résultat, et le refus d'une page dans les données, est coupée à 400
  caractères, sauf l'appel à refaire d'un `needs_confirmation` ; une panne hors refus arrête le lot et la réponse dit les
  pages déjà écrites (`stopped`).
- **HN-E11S18-12 (AC-14).** `acceptOwnContextWrite(db, identity, { ctx, path, revision })` du lot B (E11-S19) suit une
  écriture d'assistant qui a changé un Contexte (`rules_changed`), après sa transaction : une panne (migration de la
  1.1.3 absente, course) ne défait jamais l'écriture ; elle est journalisée, et la réponse garde alors la consigne de
  rappeler `context`. Sans `ctx` (écran, ticket sans `ctx`), rien.
- **HN-E11S18-13.** `functions` est un chemin réservé comme `journal` (demande du lot B, E11-S19 : `read` y liste les
  fonctions) : `write` le refuse, et une équipe ne peut pas prendre ce slug (`RESERVED_SLUGS` ; contrainte
  `teams_slug_reserved`, partie 2 de `20260930150000_v1_1_3.sql` : une équipe déjà au slug `functions` la fait échouer).
- **HN-E11S18-14.** Activités : un `node.move` paraît « déplacé » à son ancien chemin, que la relecture suit par l'alias ;
  un `node.write_many` ne paraît pas (ses arguments sont coupés au journal au-delà de 2 048 caractères, et le résultat
  d'une fonction n'y inscrit que des nombres) : remonté.

## Actions JB

Aucune (pas de service extérieur). La migration de la 1.1.3 gagne une partie 2 (contrainte `teams_slug_reserved`).

## Post-implémentation

### Écarts avec l'architecture
ADR-011 § 3 amendé (écriture d'assistant atomique). P12 amendée par HN-E11S18-5 (texte remis au pilote).

### Composants créés

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `writesAtomically`, `writeAtomically`, `unwrittenRefusal`, `keepAuthorCtx` | `packages/plateforme/server/nodes/write-atomic.ts` | Interne au paquet |
| `replaceText` | `packages/plateforme/server/nodes/replace-text.ts` | Sorti de `section-ops.ts` |
| `nodeMove` | `packages/plateforme/server/nodes/move-function.ts` | Fonction native `node.move` |
| `nodeWriteMany` | `packages/plateforme/server/nodes/write-many.ts` | Fonction native `node.write_many` |
| `splitFrontmatter`, `frontmatterHead` | `packages/plateforme/schemas/frontmatter.ts` | Frontmatter YAML de tête, non exporté du paquet |
| `writeManyArgsSchema`, `PAGE_OPS`, `REPLACE_COUNT_MAX`, `WRITE_MANY_MAX` | `packages/plateforme/schemas/nodes.ts` | Non exportés par `schemas/index.ts` |

### Notes
- **FB-0015, la cause** (reproduite, vue en échec puis verte sur la base locale) : `insertBlocks` retrouvait chaque bloc
  inséré par l'égalité de sa position relue ; sous `extra_float_digits = 0`, une insertion de deux blocs entre 1024 et 2048
  (1365.333…, 1706.666…) revenait arrondie, d'où `internal` masqué en « Internal error ». Garde anti-récidive :
  `supabase-patterns.md § Couplage à Supabase (ADR-012)`.
- **Frontmatter, la cause** (vue en échec puis verte) : `readPageMarkdown` lisait `titre: …` comme le premier paragraphe.
  Garde anti-récidive : `security-patterns.md § Validation des inputs`.
- **Tests lancés** avant la consigne « plus aucun Vitest » : `markdown-aller-retour`, `e05s10e-segments`, `team-slug`,
  `schemas/csv`, `nodes-ops`, `nodes-parse*`, `m67-blocs-inconnus`, `nodes-write`, `nodes-publish`, `nodes-store`,
  `tables-schema-write`, `tables-header-patch`, `tables-evolution`, `mcp-table-schema`, `procedures-service`,
  `procedures-table-check`, `nodes-links`, `nodes-move`, `nodes-personal-tree`, `references`, `links-resolve`, `catalog`,
  `catalog-contracts`, `connectors-context`, `mcp-admin-connectors`, et le cas AC-8 d'`e11s18-ecriture-assistants`.
  **Non lancés depuis leur dernière retouche** : les cas AC-1/3, AC-5, AC-12, AC-14 d'`e11s18-ecriture-assistants` ;
  les textes « the draft saved before this call stays » (`nodes-links`, `procedures-service`, `procedures-table-check`,
  `erp-functions`, `mcp-procedures`, `e11s02-brouillons-et-suppression`) ; `e05s10e-gestes`, `pilot-qualification`,
  `e11s02-mcp`, `mcp-read-write` (intégration) ; `mcp-tools` (instantané, régénéré par le pilote).
- **Revue (corrections), tests écrits non lancés** : `nodes-ops` (taille projetée `too_large`, 1 000 occurrences en temps
  linéaire, chaque branche de la garde des titres et un bloc avant le premier titre), `e11s18-ecriture-assistants`
  (branche `unmatchedInsert` : `conflict`, `console.error` espionné, rien d'écrit), `markdown-aller-retour` (commentaire,
  bloc littéral), `e05s10e-segments` (noms de colonne `c_` et `_2` coupés au mot), `e05s12-activites` (`node.move`,
  `node.write_many`). Enveloppe unique `writeNodeLazily` (`server/nodes/write-lazy.ts`) pour `upload.link`,
  `table.import` et `node.write_many`.
- Remonté : `server/sql.ts` pourrait poser `extra_float_digits = 3` avec les autres réglages de session, pour que toute
  position relue soit exacte (`order.ts`, rangement des frères, lit aussi des positions).
- Le message `conflict` d'une insertion non appariée (`store.ts`, `unmatchedInsert`) n'a pas de test : la base ne rend
  jamais d'elle-même moins de lignes qu'elle n'en insère.
