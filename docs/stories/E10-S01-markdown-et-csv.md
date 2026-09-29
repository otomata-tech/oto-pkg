# Story E10-S01 — Markdown et CSV : coller, importer, exporter ; `table.import`

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E10 — Contenus riches |
| **Parcours** | 4.4 Concevoir et mettre à jour ; 4.2 Faire (l'assistant range un CSV) |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Vague** | E10, après 1.0.0 ; deuxième story d'E10, après E10-S04 (ordre : S04, S01, S06, S02, S03, S05) |
| **Référence UI** | N/A : style du paquet. Dialogue d'import sur la primitive `Dialog` (`ui/ds/react/dialog.tsx`) ; aperçu du CSV dans la primitive `Table` (`ui/ds/react/table.tsx`) ; entrée « Importer un fichier… » dans le menu du « + » du rail (`ui/coque/creation-dans-le-rail.tsx`, qui n'a plus de dialogue depuis E05-S10 partie b, l. 9) |
| **Conventions** | api, forms, uploads, security, supabase, portage, a11y, state, mcp, testing, datetime |
| **Estimation** | L (trois lots : a markdown M, b CSV à l'écran M, c `table.import` S) |
| **Dépend de** | E10-S04 (mode strict des formes nouvelles, bloc `simple_table`, titres à cinq niveaux ; même fichier `server/nodes/markdown-parse.ts`) ; E05-S11 (éditeur et rail) ; E07-S04 (tableau créé par `write`) |
| **Porteuse de migration** | Non |

## Contexte

Demande de JB du 2026-09-28 (fiche D111 a) : un fichier `.md` ne devient pas un nouveau type de
contenu. La page sait l'afficher en le convertissant. Même idée pour un CSV : il devient un
tableau typé, à l'écran comme par un assistant.

Ce qui existe au 2026-09-28 :

- `parseMarkdown` (`packages/plateforme/server/nodes/markdown-parse.ts` l. 322) convertit le
  markdown en blocs pour `write`. Il est **strict** : une construction qu'il ne sait pas lire est
  refusée avec son numéro de ligne (refus l. 94 à 266). C'est voulu pour un assistant, trop dur
  pour un fichier écrit par une personne.
- `renderBlocks` (`packages/plateforme/schemas/blocks-render.ts` l. 155) fait l'inverse, pour
  `read`.
- `write` accepte déjà du markdown dans une opération (`schemas/nodes.ts`, `writeOpSchema.text`).
  L'éditeur, lui, n'envoie que des blocs structurés (`input`, `schemas/node-body.ts`) et ne relit
  de la réponse que des identifiants (`ui/noeud/editeur/file-d-operations.tsx` l. 24-29), 20 au
  plus (`TOUCHED_BLOCKS_MAX`, `server/nodes/limits.ts` l. 49).
- Un tableau se crée par `write` avec `header` (E07-S04). Ses lignes s'écrivent par `table.write`,
  50 par appel (`MAX_WRITE_ROWS`, `schemas/table-write.ts` l. 37). Chaque valeur nouvelle y exige sa
  preuve, un commentaire ou un lien (fiche D100 ; `server/tables/write.ts` l. 44-45). Les lignes
  ne s'écrivent que dans un tableau dont l'en-tête est publié (`server/tables/meta.ts` l. 237,
  `conflict`), et publier exige la gestion (`server/nodes/publish.ts` l. 105).
- Un nom de colonne suit `^[a-z][a-z0-9_]{0,59}$` (`schemas/tables.ts` l. 22). Une date se range
  `YYYY-MM-DD`, une date et heure avec son fuseau (`server/tables/write-values.ts` l. 30-31). Les
  types sont `text`, `number`, `date`, `datetime`, `bool`, `enum`, `email`, `url`
  (`schemas/tables.ts` l. 13).
- La provenance `import` existe déjà en lecture (`schemas/tables.ts` l. 246 ; affichée par
  `ui/tableau/cellule.tsx` l. 48). Aucune écriture ne la pose : `ProvenanceExtra`
  (`server/tables/write-row.ts` l. 131) ne l'admet pas.

**Refs :**
- PRD : FR-CONC-01 (« un document long s'envoie par morceaux »), FR-CONC-05, FR-CONC-07
- Architecture : § 4 (`blocks`, `row`, provenance par cellule), § 5 (`nodes/`, `tables/`)
- ADR-002 § 1 (une fonction derrière `call` est un ajout ; la description d'un des six outils ne
  change pas), ADR-011 § 2 et § 5 (aller-retour markdown)
- Fiches D100 (preuve d'une valeur), D111 a, D117 (`table.import` gardé pour les petits contenus),
  D120 (import en tableau nouveau réservé à la gestion, ouverte)
- Décisions communes du pilote du 2026-09-28 : C2 (le mode tolérant appartient à cette story), C3
  (`inferTable` et « Convertir en tableau de données »), C5 (titres), C7 (codes d'erreur)

## Périmètre

### IN
- Mode tolérant de `parseMarkdown`, défini et testé ici, formes d'E10-S04 comprises (C2).
- Coller du markdown dans l'éditeur ; importer un `.md` en page ; déposer un `.md` dans une page.
- Exporter une page, une procédure ou un Contexte en `.md`.
- Importer un CSV en tableau nouveau ou dans un tableau existant ; exporter un tableau en CSV.
- `inferTable` (`schemas/csv.ts`) et « Convertir en tableau de données » d'un tableau simple (C3).
- `table.import` derrière `call`.

### OUT
- Joindre un `.md` ou un `.csv` au lieu de l'importer : E10-S02 (AC-b5, choix au dépôt).
- Import d'un fichier volumineux par un assistant sans le réécrire : E10-S02 lot f (`upload.link`).
- Import de fichiers Excel (`.xlsx`) : hors V1 (epic E10, OUT).
- Export en flux de plus de 5 000 lignes : plus tard (HN-E10S01-7).
- Déduction du type `enum` : jamais (HN-E10S01-3), il se choisit dans le dialogue.
- Choix du « + » et de `/` dans l'éditeur, édition des tableaux simples : E10-S06.
- Mode strict des formes nouvelles (tableau simple, séparateur, repli, titres profonds) : E10-S04.

## Critères d'acceptation

Codes d'erreur : liste fermée de `server/errors.ts` (H04, C7). Un refus servi au modèle se teste mot
pour mot ; un refus d'écran se teste par son code.

### Lot a — Markdown

- [ ] **AC-a1 — Coller.** **Given** un rédacteur dans un bloc de texte **When** il colle un texte de
  plusieurs lignes (`text/plain` du presse-papiers ; `text/html` n'est jamais lu) **Then** l'éditeur
  envoie une opération `insert_after` du bloc courant, avec ce `text`, en mode tolérant, à la suite
  des écritures en attente de sa file. À la réponse, il relit le brouillon et remplace son modèle
  par ce qu'il lit. Le bloc courant garde son texte s'il n'était pas vide, sinon il est remplacé.
  Le collage s'insère après le bloc entier, pas au curseur.
  - **Given** un collage d'une seule ligne **Then** il reste du texte dans le bloc, au curseur.
  - **Given** `Ctrl+Maj+V` **Then** le collage reste du texte brut, quelle que soit sa longueur.
  - **Given** un collage de plus de 40 000 caractères **Then** rien n'est envoyé, et le bloc dit
    « Ce texte dépasse 40 000 caractères : importez-le comme fichier .md » (`too_large` côté
    service, `OP_TEXT_MAX`, `server/nodes/ops.ts` l. 65).
- [ ] **AC-a2 — Mode tolérant.** **Given** un markdown qui contient une construction que le mode
  strict refuse **When** il arrive en mode tolérant (collage, import par l'écran, dépôt par lien d'E10-S02)
  **Then** rien n'est refusé, et chaque construction suit ce tableau :

  | Refus du mode strict | En mode tolérant |
  |---|---|
  | Clôture `call` ou `reference` mal formée | Bloc `code`, texte d'origine |
  | Clôture `mermaid` vide | Retirée |
  | Clôture jamais fermée | Bloc `code` jusqu'à la fin du texte |
  | `#` dans le corps | Titre de niveau 1 (C5) |
  | Titre de sept `#` ou plus, ou de plus de 200 caractères | Paragraphe |
  | Source d'image de plus de 2 000 caractères | Paragraphe |
  | Liste de plus de 500 éléments | Plusieurs listes de 500 au plus, à la suite |
  | Tableau simple hors des bornes d'E10-S04 (20 colonnes, 200 lignes) | Bloc `code` |
  | Liste imbriquée au-delà de trois niveaux | Éléments ramenés au troisième niveau |
  | Repli dans un repli | Reste dans le corps du repli qui l'entoure |
  | `---` collé sous une ligne de texte | Séparateur |

  La réponse compte ces constructions (`kept_as_text`), et l'écran affiche un encart « N éléments
  conservés en texte » quand N > 0.
  - **Given** la même entrée sans le mode tolérant **Then** le refus strict est identique à
    aujourd'hui (tests existants de `tests/unit/nodes-parse.test.ts` inchangés).
  - **Given** un appel MCP `write` qui porte `tolerant: true` **Then** le champ est ignoré et
    l'analyse reste stricte (`writeNodeSchema` est un `z.object`, qui retire les clés inconnues ;
    seul `writeNodeBodySchema`, corps de l'API, porte le champ).
- [ ] **AC-a3 — Importer un `.md` en page.** **Given** une personne qui peut écrire sous un nœud du
  rail **When** elle choisit « Importer un fichier… » dans son « + », ou y glisse un `.md`, puis
  confirme **Then** une page est créée en **brouillon** sous ce nœud :
  - titre : le premier titre `#` du fichier, retiré du corps ; sinon le nom du fichier sans
    extension ; coupé à 200 caractères ;
  - résumé : le texte brut du premier paragraphe (marques retirées), coupé à 200 caractères ;
    sinon « Importé de <nom du fichier> », coupé à 200 caractères ;
  - adresse : le premier chemin libre sous ce nœud, dérivé du nom du fichier par `segmentOf`
    (`schemas/csv.ts`), puis `<segment>_2`, `<segment>_3`… comme `adressesAEssayer`
    (`ui/coque/creation-dans-le-rail.tsx` l. 47) ;
  - corps : des opérations `append` de 40 000 caractères au plus, coupées à une ligne vide hors
    d'une clôture, en mode tolérant, dans une seule requête ;
  - la page s'ouvre, avec l'encart d'AC-a2.

  Refus :
  - **Given** un fichier de plus de 300 000 caractères **Then** rien n'est envoyé et le dialogue dit
    la limite (`PAGE_MAX`) ;
  - **Given** un refus du service (`too_large` : `PAGE_MAX`, `SECTION_MAX`, `BLOCKS_MAX` ;
    `forbidden` : pas d'écriture sous ce nœud) **Then** rien n'est créé et le dialogue affiche le
    message traduit (`messageDErreur`, `ui/api/messages.ts` l. 66) ;
  - **Given** un fichier vide **Then** « Ce fichier est vide » et rien n'est envoyé.
- [ ] **AC-a4 — Déposer un `.md` dans une page.** **Given** un rédacteur dans l'éditeur **When** il
  lâche un `.md` entre deux blocs **Then** ses blocs sont insérés à cet endroit par une opération
  `insert_after` en mode tolérant, puis l'éditeur relit le brouillon (règles et refus d'AC-a1 et
  AC-a2). Un fichier de plus de 40 000 caractères est refusé comme en AC-a1.
- [ ] **AC-a5 — Exporter en `.md`.** **Given** une personne qui lit une page, une procédure ou un
  Contexte **When** elle choisit « Télécharger en .md » dans le « ⋯ » de sa ligne du rail **Then**
  l'écran appelle `GET /api/plateforme/nodes/export?path=<chemin>`. Le service exige la lecture
  avant toute requête sur les blocs, et rend `{filename, content}` :
  - `filename` : `<dernier segment du chemin>.md` ;
  - `content` : `# <titre>`, une ligne vide, puis `renderBlocks` des blocs **publiés**, sans
    références de blocs.

  L'écran en fait un fichier (`Blob`, `text/markdown;charset=utf-8`). Refus :
  - nœud illisible ou inconnu : `not_found` ;
  - jamais publié : `invalid_arguments` (« <chemin> has no published version ») ;
  - tableau : `invalid_arguments` (« <chemin> is a table: use tables/export »).
- [ ] **AC-a6 — Aller-retour.** **Given** chaque cas valide de `DOCUMENT_CASES`
  (`tests/helpers/block-cases.ts`) dont `parseMarkdown` produit le type (tous sauf `reference`, que
  l'analyse ignore, `server/nodes/references.ts` l. 4, et `row`), sans `key` ni donnée libre, plus
  les cas d'E10-S04 **When** on exporte la page qui le porte (AC-a5), puis on réimporte le fichier
  (AC-a3) **Then** on retrouve le titre et les mêmes blocs, sans aucun élément conservé en texte.

### Lot b — CSV à l'écran

- [ ] **AC-b1 — Lire un CSV.** **Given** une personne qui peut écrire sous un nœud du rail **When**
  elle choisit un `.csv` par « Importer un fichier… » ou le glisse sur le nœud **Then** le
  navigateur lit le fichier (`arrayBuffer()`, jamais téléversé) et un dialogue affiche :
  - l'encodage : UTF-8 (`TextDecoder` avec `fatal: true`), sinon Windows-1252 ; modifiable ;
  - le séparateur : celui de `;`, tabulation, `,` qui revient le plus souvent hors guillemets sur
    la première ligne, dans cet ordre en cas d'égalité ; modifiable ;
  - la ligne d'en-tête et le nom de colonne tiré de chaque en-tête (`columnNameOf`, AC-b2) ;
  - le type déduit de chaque colonne (`inferTable`, AC-b2), modifiable, `enum` compris ;
  - la colonne clé proposée (AC-b2), modifiable ;
  - un aperçu des 20 premières lignes (primitive `Table`).

  Les limites s'affichent avant la sélection : « .csv ou .md ; 5 000 lignes, 100 colonnes, 5 Mo ».
- [ ] **AC-b2 — Règles de lecture et de déduction** (`schemas/csv.ts`, fonctions pures, partagées
  par le dialogue, `table.import` et la conversion d'AC-b7). **Given** un texte CSV **When** il est
  lu **Then** :
  - **Lecture** (RFC 4180) : BOM retiré ; guillemets doubles, `""` pour un guillemet, sauts de
    ligne dans une cellule ; fins de ligne CRLF ou LF. Une apostrophe `'` suivie de `=`, `+`, `-`
    ou `@` en tête de cellule est retirée (réimport d'un export, AC-b6).
  - **Noms de colonne** (`columnNameOf`) : minuscules, accents retirés, chaque suite de caractères
    hors `[a-z0-9]` devient `_`, `_` retirés aux bords, `c_` devant un chiffre initial, 60
    caractères au plus ; un en-tête vide devient `colonne_<rang>` ; une collision prend `_2`,
    `_3`…
  - **Types** (`inferTable(matrix)`) : une colonne prend le premier type, dans cet ordre, auquel
    toutes ses cellules non vides répondent ; une colonne vide est `text`.

    | Type | Formes admises | Valeur rangée |
    |---|---|---|
    | `bool` | `true`/`false`, `vrai`/`faux`, `oui`/`non`, `yes`/`no`, sans casse | booléen |
    | `number` | `1234`, `-12.5`, `12,5`, `1 234,5` (groupes de trois séparés par une espace, une espace insécable ou une fine insécable, avec la virgule décimale) ; une colonne qui mêle `.` et `,` décimaux reste `text` | nombre |
    | `date` | `YYYY-MM-DD` ou `JJ/MM/AAAA` (jamais mois d'abord), date réelle | `YYYY-MM-DD` |
    | `datetime` | ISO 8601 avec fuseau (`Z` ou `±hh:mm`) ; sans fuseau, `text` | tel quel |
    | `email` | `[^@\s]+@[^@\s]+` (`security-patterns.md § Validation des inputs`) | tel quel |
    | `url` | `https?://` puis des caractères sans espace (`LINK_PATTERN`, `schemas/table-write.ts` l. 34) | tel quel |
    | `text` | tout le reste ; `max_length` = la plus longue cellule si elle dépasse 2 000 | tel quel |

  - **Clé** : la première colonne, dans l'ordre, de type `text`, `number` ou `email`, dont toutes
    les valeurs sont présentes et distinctes. À défaut, une colonne `ligne` générée (`0001`,
    `0002`…, sur quatre chiffres ; `ligne_2` si le nom est pris), à l'écran seulement.
  - Toute lecture est linéaire : expressions ancrées dont chaque caractère n'a qu'une lecture, ou
    parcours à la main.
- [ ] **AC-b3 — Créer le tableau** (fiche D120, option A, HN-E10S01-2). **Given** le dialogue validé
  **When** la personne a la gestion du nœud parent **Then** :
  - le dialogue a déjà contrôlé tout le fichier par `checkImport` (`schemas/csv.ts`), la fonction
    que le service rejoue ;
  - `POST /api/plateforme/tables/import` crée le tableau et **publie** son en-tête, puis écrit le
    premier lot de 500 lignes ; les lots suivants suivent, un par requête ;
  - titre : le nom du fichier sans extension ; résumé : « Importé de <nom> (<n> lignes) », coupé à
    200 caractères ; adresse : comme AC-a3 ;
  - chaque valeur écrite porte la provenance `{origin: "import", by, ctx, at, comment: "Importé de
    <nom du fichier>"}`, qui tient lieu de preuve (D100) ;
  - une barre `<progress>` suit les lots, puis l'écran s'ouvre sur la grille du tableau.

  **Given** une personne qui peut écrire sous le nœud, sans en avoir la gestion **When** elle valide
  **Then** le service refuse avant toute requête d'écriture : `forbidden`, avec à qui s'adresser
  (`reservedTo`, action `publish`, `server/access.ts` l. 243). Rien n'est créé.
- [ ] **AC-b4 — Refus nommés.** **Given** un fichier dont une cellule ne respecte pas le type choisi,
  une clé vide ou en double, plus de 5 000 lignes, plus de 100 colonnes, une cellule de plus de
  10 000 caractères, une ligne dont le nombre de cellules diffère de l'en-tête ou un guillemet
  jamais fermé **When** l'import est lancé **Then** rien n'est envoyé. Le dialogue liste les 10
  premiers problèmes (ligne, colonne, valeur coupée à 50 caractères, attendu), puis « et N autres ».
  Codes du service, qui rejoue le contrôle sur chaque lot avant d'en écrire une ligne :
  `invalid_arguments` pour une cellule, une clé ou une forme ; `too_large` pour les bornes.
  - **Given** un lot refusé après le contrôle (droit retiré, écriture concurrente) **When** il
    revient **Then** l'import s'arrête. Le dialogue dit « N lignes écrites sur M » et propose de
    reprendre au lot refusé. La fusion sur la clé rend la reprise sans doublon.
- [ ] **AC-b5 — Importer dans un tableau existant.** **Given** un rédacteur du tableau qui glisse un
  `.csv` sur sa grille **When** le dialogue s'ouvre **Then** :
  - les colonnes sont rapprochées par `columnNameOf` de l'en-tête et du nom de colonne ;
  - la colonne clé du tableau doit être présente, sinon refus `invalid_arguments` avant tout envoi ;
  - les colonnes inconnues, et la colonne d'état d'un tableau à file de travail, sont ignorées et
    listées avant confirmation (HN-E10S01-5) ;
  - les valeurs sont lues selon le type de la colonne du tableau (règles d'AC-b2), sans déduction ;
  - chaque lot est une transaction, tout ou rien, fusionnée sur la clé comme `table.write` : une
    valeur égale à la valeur rangée est ignorée, une valeur nouvelle prend la provenance d'AC-b3,
    une clé nouvelle dans un tableau fermé ou une colonne `required` manquante à la création
    refusent le lot.
- [ ] **AC-b6 — Exporter en CSV.** **Given** une personne qui lit un tableau **When** elle choisit
  « Télécharger en .csv » dans le « ⋯ » de sa ligne du rail **Then** l'écran appelle
  `GET /api/plateforme/tables/export?path=<chemin>`. Le service exige la lecture et rend
  `{filename, content}` :
  - `filename` : `<dernier segment>.csv` ;
  - `content` : BOM UTF-8, colonnes dans l'ordre du schéma, noms en en-tête ;
  - langue de l'organisation `fr` : séparateur `;` et virgule décimale ; sinon `,` et point ;
  - dates en `YYYY-MM-DD`, booléens `true`/`false`, cellule vide pour une valeur absente ;
  - une cellule texte qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est
    précédée d'une apostrophe `'` (injection de formule) ; une cellule `number` ne l'est jamais.

  Refus : plus de 5 000 lignes (`FILTERED_ROWS_MAX`, `schemas/tables.ts` l. 80) → `too_large` ;
  tableau illisible → `not_found` ; nœud qui n'est pas un tableau → `invalid_arguments`.
- [ ] **AC-b7 — Convertir en tableau de données** (C3 ; ancien AC-a5 d'E10-S04). **Given** un bloc
  `simple_table` dans le brouillon d'une page, et une personne qui a la gestion de la page **When**
  elle choisit « Convertir en tableau de données » dans le menu du bloc **Then** :
  - l'écran construit la matrice depuis `data.columns` et `data.rows` et appelle
    `POST tables/import` : tableau créé sous la page, types et clé par `inferTable` ;
  - titre : le texte du titre qui précède le bloc, sinon « Tableau de <titre de la page> » ;
    résumé : « Converti depuis <titre de la page> (<n> lignes) » ;
  - les valeurs portent `comment: "Converti depuis <chemin de la page>"` ;
  - puis la file d'opérations remplace le bloc par une `reference` vers le tableau, et l'éditeur
    relit le brouillon.

  Si le remplacement échoue, le tableau reste créé, le bloc reste en place, et l'écran le dit.
  Sans la gestion : `forbidden`, comme AC-b3. L'inverse n'existe pas.

### Lot c — Côté assistant

- [ ] **AC-c1 — `table.import`.** **Given** un assistant **When** il appelle
  `call table.import` avec :
  - `table` : le tableau existant, ou le chemin du tableau à créer ;
  - `csv` : le texte, 40 000 caractères au plus, **ligne d'en-tête comprise dans chaque morceau** ;
  - `key`, facultative : le nom d'une colonne ;
  - `create`, facultatif, `{title, summary}` : crée le tableau avec le schéma d'`inferTable` ;
  - `file_name`, facultatif : le nom cité par la provenance (défaut « table.import »)

  **Then** le service décide les droits avant toute requête sur les lignes (écriture du tableau ;
  gestion du parent avec `create`), contrôle tout le morceau, puis l'écrit en une transaction,
  tout ou rien, avec les règles d'AC-b2, AC-b3 et AC-b5. Il rend le nombre de lignes créées,
  mises à jour et inchangées, en texte et en contenu structuré identiques, et `next` :
  `table.rows`, `table.write`, `table.import`.

  Refus, textes servis au modèle :
  - cellule, clé ou forme : `invalid_arguments`, « line <n>, column <nom>: <valeur> is not <attendu> »,
    dix au plus puis « and <n> more » ; rien n'est écrit ;
  - sans `key` ni colonne clé déductible : `invalid_arguments`, « no column has a value on every line,
    all distinct: pass key, the column that identifies a row » (pas de clé générée par `call`) ;
  - `create` sur un chemin pris : `conflict` ; tableau inconnu sans `create` : `not_found`, avec les
    tableaux lisibles ;
  - `create` sans la gestion du parent : `forbidden`, avec à qui s'adresser (D120) ;
  - plus de 40 000 caractères ou de 5 000 lignes : `too_large`, « send it in pieces of about 20,000
    characters, each starting with the header line ».
- [ ] **AC-c2 — L'assistant y pense.** **Given** le catalogue de `call` **When** un assistant lit
  la description de `table.import` ou le contrat `write.table` (`server/catalog/contracts.ts`
  l. 93) **Then** il y lit : « A CSV or a spreadsheet the user gives you becomes a table: use
  table.import, in pieces of 40,000 characters, each starting with the header line. » Le contrat
  `write.table` dit aussi : « A markdown file the user gives you becomes a page with write: its
  first # heading is the title, the rest goes in the text. » La description de l'outil `write`
  (`mcp/tools.ts`) ne change pas (ADR-002 § 1).
- [ ] **AC-c3 — Requêtes de référence.** **Given** `docs/mcp-golden-queries.md` **When** le pilote
  fusionne **Then** deux requêtes s'y ajoutent :
  - « Voici l'export CSV de nos clients, range-le dans l'espace ventes » → `table.import` avec
    `create` ;
  - « Mets ce compte rendu (markdown) dans les réunions » → `write` d'une page, titre tiré du `#`.

## Implémentation

### Migrations prévues
Aucune. Les types de bloc viennent d'E10-S04. La provenance est un `jsonb` sans contrainte sur
`origin` (`rg -n "'import'" packages/plateforme/migrations` ne trouve rien), et `import` est déjà
lu par `schemas/tables.ts` l. 246.

### Schémas Zod partagés
- `schemas/table-write.ts` : `tableImportArgsSchema` (entrée de `table.import`) et
  `tableImportBodySchema` (corps de `POST tables/import` : chemin, nom du fichier, `create` avec
  titre, résumé et en-tête, noms de colonnes, lot de 500 lignes de chaînes au plus).
- `schemas/node-body.ts` : `writeNodeBodySchema` gagne `tolerant: z.literal(true).optional()`.
- `schemas/nodes.ts` : `nodeExportQuerySchema` (`path`), réutilisé par `tables/export`.
- `schemas/csv.ts` : fonctions pures, pas de Zod (précédent : `blocks-render.ts`,
  `link-syntax.ts`) : `parseCsv`, `columnNameOf`, `segmentOf`, `inferTable`, `readCell`,
  `checkImport`, `toCsv`. Exportées par `schemas/index.ts`.

### Fichiers à créer
- `schemas/` : `csv.ts`.
- `server/` : `tables/import.ts` (fonction `table.import`, et `importRows`, le service que
  partagent l'API, la conversion et le dépôt par lien d'E10-S02 ; la borne de 40 000 caractères est dans le schéma
  d'arguments, pas dans le service) ; `nodes/export.ts` et `tables/export.ts`.
- `ui/` : `coque/import-de-fichier.tsx` (dialogue `.md` et `.csv`, zone de dépôt doublée d'un
  `<input type="file">`), `api/telecharger.ts` (fichier depuis `{filename, content}`).
- Tests : `tests/unit/schemas/csv.test.ts`, `tests/unit/nodes-parse-tolerant.test.ts`,
  `tests/unit/markdown-aller-retour.test.ts`, `tests/integration/table-import.test.ts`,
  `tests/integration/exports.test.ts`, `tests/integration/components/import-de-fichier.test.tsx`,
  `tests/e2e/import-de-fichiers.spec.ts`.

### Fichiers à modifier
- `schemas/` : `table-write.ts`, `node-body.ts`, `nodes.ts`, `index.ts` (fichier d'ajout).
- `server/nodes/` : `markdown-parse.ts` (option `{ tolerant: true }` et compte), `op-kit.ts`
  (`parseOpText(text, options)`), `block-ops.ts` et `section-ops.ts` (leurs sept appels passent
  l'option de l'état de l'opération), `ops.ts` et `write.ts` (option lue du corps de l'API
  seulement), `write-result.ts` (`kept_as_text`).
- `server/tables/` : `write-row.ts` (`ProvenanceExtra.origin` admet `import`), `rows.ts` si
  l'export a besoin d'une lecture sans filtre.
- `server/catalog/` : `registry.ts` (`tableImport` dans `catalogFunctions()`, l. 27),
  `contracts.ts` (phrases d'AC-c2) ; `server/index.ts` (fichier d'ajout).
- `api/` : `nodes.ts` (`GET nodes/export`), `tables.ts` (`GET tables/export`, `POST tables/import` ;
  `POST` devient une liste de routes départagées par `fixed`). `api/handler.ts` ne change pas : la
  ressource `tables` y est déjà.
- `ui/` : `noeud/editeur/champ-de-bloc.tsx` (collage, dépôt), `noeud/editeur/file-d-operations.tsx`
  (relecture du brouillon, `kept_as_text`), `noeud/editeur/gestes-du-menu.ts` (AC-b7),
  `coque/creation-dans-le-rail.tsx` (entrée « Importer un fichier… » ; `adressesAEssayer` prend
  un segment), `coque/arbre-du-rail.tsx` (dépôt d'un fichier sur une ligne, distingué d'un
  déplacement par `dataTransfer.types` qui contient `Files`), `coque/gestes-du-rail.tsx` et
  `coque/libelles.ts` (« Télécharger en .md », « Télécharger en .csv »), `tableau/grille.tsx`
  (dépôt d'AC-b5).

### Points de départ
- Oto, `oto_mcp/api/datastore_export.py` (export CSV d'un tableau, l. 1-30, 58, 77-132). Repris :
  colonnes dans l'ordre du schéma, lecture par lots, tableau introuvable refusé avant d'écrire la
  réponse. Retiré : le flux Starlette et `run_in_threadpool` (la face API rend du JSON), les
  colonnes découvertes hors du schéma, le plafond de 200 000 lignes (5 000 ici, HN-E10S01-7).
- Banc `C:\apps\mcp-test\src\proto\` : aucun import CSV ni markdown.

### Patterns à suivre
- `uploads-patterns.md § Côté composant` : dépôt doublé d'un `<input type="file">` accessible au
  clavier ; limites affichées avant la sélection ; progression. Le fichier est lu dans le
  navigateur : aucun stockage.
- `security-patterns.md § Droits dans le service` : droit décidé avant la requête sur les lignes
  ou les blocs.
- `security-patterns.md § Validation des inputs` : `csv.ts` et le mode tolérant ne lisent qu'en
  temps linéaire, avec un test de textes hostiles.
- `mcp-patterns.md § 1` : un service, deux portes (`table.import` et `POST tables/import`
  appellent `importRows`). Le mode tolérant est propre à l'écran : écart écrit ici, `write` reste
  strict.
- `mcp-patterns.md § 4` : texte et contenu structuré identiques ; refus bornés à dix.

## Sécurité : canaux

| Canal | État | Test |
|---|---|---|
| Écriture sans droit (import, conversion) | Fermé : droit décidé par le service avant toute requête sur les lignes | `table-import.test.ts` : espion, aucune requête d'écriture après un refus |
| Tableau nouveau créé sans la gestion | Fermé : `forbidden` (D120) | `table-import.test.ts` |
| Mode tolérant par le MCP | Fermé : `tolerant` retiré par `writeNodeSchema` | `nodes-parse-tolerant.test.ts` et test MCP |
| Temps quadratique sur un CSV ou un markdown hostile | Fermé : lectures linéaires | tests hostiles à 1 000 000 caractères (`MAX_ARGS_CHARS`), moins d'une seconde chacun |
| Formule exécutée à l'ouverture d'un export dans un tableur | Fermé : apostrophe devant `=`, `+`, `-`, `@`, tabulation, retour chariot | `exports.test.ts` |
| HTML d'un markdown importé | Fermé : il reste du texte échappé (`ui/noeud/en-ligne.ts`) | `nodes-parse-tolerant.test.ts` (rendu) |
| Stockage du fichier importé | Fermé : lu dans le navigateur, jamais envoyé tel quel | `import-de-fichier.test.tsx` : seules les requêtes JSON partent |
| Export de tout ce qu'une personne lit | Ouvert, voulu : 5 000 lignes au plus, journalisé comme toute route (`GET tables/export`) | `exports.test.ts` : ligne de journal |

## Rayon d'impact

### Appelants
- `parseMarkdown` : `rg -n "parseMarkdown" C:/apps/oto-platform/packages C:/apps/oto-platform/tests`
  → production : `server/nodes/op-kit.ts` l. 9 (import) et 64 (seul appel) ; export
  `server/index.ts` l. 58 ; commentaires `markdown-parse.ts` l. 4, `schemas/blocks-render.ts` l. 9,
  `server/nodes/references.ts` l. 4 et 120 ; tests `tests/unit/nodes-parse.test.ts` (l. 8, 39,
  114) et `tests/unit/catalog-contracts.test.ts` (l. 8, 48). L'option est facultative : aucun ne
  change.
- `parseOpText` : `rg -n "parseOpText" C:/apps/oto-platform/packages C:/apps/oto-platform/tests`
  → `server/nodes/block-ops.ts` l. 56, `server/nodes/section-ops.ts` l. 93, 107, 125, 160, 196.
  Chacun passe l'option de l'état de l'opération ; sans elle, rien ne change.
- `writeNodeBodySchema` : `rg -n "writeNodeBodySchema" C:/apps/oto-platform/packages C:/apps/oto-platform/tests`
  → `api/nodes.ts` l. 74, `server/nodes/write.ts` l. 41, `schemas/index.ts` l. 66,
  `tests/unit/ui-editeur-operations.test.ts` l. 22, commentaires ailleurs. Le champ est facultatif.
- `cellProvenance` et `ProvenanceExtra` : `rg -n "cellProvenance|ProvenanceExtra" C:/apps/oto-platform/packages`
  → `write-row.ts` l. 131-259, `review.ts` l. 53, `release.ts` l. 57, `claim.ts` l. 102. Le type
  s'élargit : aucun appelant ne change.
- `table.write` : `rg -c "table\.write" C:/apps/oto-platform/packages/plateforme/server` → 33 lignes
  dans 19 fichiers. Messages servis qui disent où écrire des lignes : `catalog/contracts.ts` l. 93
  (reçoit la phrase d'AC-c2), `nodes/write.ts` l. 73, `tables/schema.ts` l. 79-81,
  `tables/evolution-publish.ts` l. 298 (inchangés : `table.write` y reste juste).
- Routes : `rg -n "params:|fixed:" C:/apps/oto-platform/packages/plateforme/api/tables.ts C:/apps/oto-platform/packages/plateforme/api/nodes.ts`
  → `tables.ts` l. 12-13 (seule route `POST tables/review`), `nodes.ts` l. 40-119. Routes à
  segment fixe ajoutées ; le chemin passe en paramètre `?path=`, comme `GET nodes?path=`.
- `adressesAEssayer` : `rg -n "adressesAEssayer" C:/apps/oto-platform/packages C:/apps/oto-platform/tests`
  → `creation-dans-le-rail.tsx` l. 47 et 66. Le segment devient un paramètre, `sans_titre` par
  défaut.

### Doublons
- Dépôt de fichier : `rg -n "onDrop|dataTransfer" C:/apps/oto-platform/packages/plateforme/ui` →
  `ui/coque/arbre-du-rail.tsx` l. 103-116 seulement, glisser d'un nœud. Verdict : créer
  `import-de-fichier.tsx`, que réutilisera E10-S02.
- CSV et déduction : `rg -n -w -i "csv" C:/apps/oto-platform/packages/plateforme` et
  `rg -n "inferTable|inferColumn|guessType|detectType" C:/apps/oto-platform/packages/plateforme`
  → aucun résultat. Verdict : créer `schemas/csv.ts`.
- Dialogue : `component-registry.md` cite `Dialog`, `useNativeDialog` (`ui/ds/react/dialog.tsx`
  l. 20, 79) et `Table` (`ui/ds/react/table.tsx` l. 168). Verdict : réutiliser. Aucune barre de
  progression dans `ui/ds/react/` : `<progress>` natif.
- Écriture de lignes : `write-row.ts` (fusion) et `row-store.ts` réutilisés par `import.ts`,
  jamais recopiés.
- Téléchargement : `rg -n "Blob\(|download" C:/apps/oto-platform/packages/plateforme/ui` → aucun
  résultat. Verdict : créer `ui/api/telecharger.ts`.

### Effet produit
- Liste d'outils MCP : inchangée. Le catalogue de `call` gagne `table.import` (ADR-002).
  Description de `write` inchangée ; contrat `write.table` allongé.
- `find` et `context` : pages et tableaux importés sont des nœuds ordinaires, routés par titre et
  résumé.
- Journal : `table.import` s'inscrit comme toute fonction ; `GET nodes/export`, `GET tables/export`
  et `POST tables/import` comme toute route (`api/handler.ts`). Les arguments y sont coupés à 2 048
  caractères (`loggedArgs`, `server/journal.ts` l. 112).
- Partage public, corbeille, transfert d'organisation, suite d'isolation : aucune table ni colonne
  nouvelle, donc rien à ajouter à `TABLES` ni à `donnees.ts`. Une adresse tenue par un nœud de la
  corbeille est traitée comme par le « + » du rail.
- `write` reste strict. Le dépôt par lien d'E10-S02 appelle `importRows` et le mode tolérant.

### Refacto
- Écarté : déplacer `parseMarkdown` dans `schemas/` pour convertir dans le navigateur. Il importe
  `server/journal` et `server/nodes/limits` (l. 16-18). Relire le brouillon après un collage suffit
  (décision du pilote, C10).

## Hypothèses

- **HN-E10S01-1** : le fichier se lit dans le navigateur, sans stockage. Un import ne garde donc
  pas le fichier d'origine (source : simple ; E10-S02 propose de joindre le fichier au lieu de l'importer, AC-b5).
- **HN-E10S01-2** : un CSV importé en tableau **nouveau**, et la conversion d'AC-b7, exigent la
  gestion du parent : l'en-tête est publié, puis les lignes sont écrites. Sinon `forbidden`
  (source : `meta.ts` l. 237, `publish.ts` l. 105 ; option recommandée → fiche D120, ouverte).
- **HN-E10S01-3** : la colonne `enum` n'est jamais déduite (trop d'erreurs sur un échantillon) ; on
  la choisit dans le dialogue (source : simple).
- **HN-E10S01-4** : `table.import` prend 40 000 caractères par appel ; un gros CSV s'envoie en
  morceaux qui reprennent chacun la ligne d'en-tête et fusionnent sur la clé ; pas de clé générée
  par `call` (source : FR-CONC-01, « un document long s'envoie par morceaux » ; D117).
- **HN-E10S01-5** : à l'import dans un tableau existant, la colonne d'état d'une file de travail
  est ignorée : elle ne change que par `table.claim`, `table.release` et la revue (source : simple ;
  E07-S02).
- **HN-E10S01-6** : chaque valeur importée porte `{origin: "import", comment: "Importé de
  <fichier>"}`, qui vaut preuve (source : décision du pilote C10, D100).
- **HN-E10S01-7** : 5 000 lignes au plus par import et par export, la borne des lectures filtrées
  (`FILTERED_ROWS_MAX`) ; l'export en flux vient plus tard (source : simple ; Oto streame).
- **HN-E10S01-8** : lots de 500 lignes par requête à l'écran, sous la coupure de 4,5 Mo de Vercel
  (`uploads-patterns.md § La limite de 1 Mo décide de l'architecture`) ; 5 Mo au plus par fichier
  lu (source : simple).
- **HN-E10S01-9** : dates `JJ/MM/AAAA` lues jour d'abord, jamais mois d'abord (source : langue des
  organisations de la V1, `languageSchema`, `schemas/brand.ts` l. 33).
- **HN-E10S01-10** : l'éditeur relit le brouillon après un collage ou un dépôt, plutôt que de
  convertir dans le navigateur (source : décision du pilote C10).

## Actions JB

Aucune (D120 est posée par le pilote).

## Tests attendus

### Unit tests
- [ ] `csv.ts` : séparateurs, guillemets et sauts de ligne dans une cellule, BOM, CRLF, apostrophe
  retirée, noms de colonne (accents, chiffre initial, vide, collision), chaque type et ses formes
  refusées, colonne mêlant `.` et `,`, clé proposée ou générée, chaque refus d'AC-b4.
- [ ] `parseMarkdown` tolérant : chaque ligne du tableau d'AC-a2, compte `kept_as_text`. Mode strict
  inchangé (tests existants).
- [ ] Textes hostiles de 1 000 000 caractères pour `parseCsv`, `inferTable` et le mode tolérant :
  moins d'une seconde chacun.
- [ ] Aller-retour d'AC-a6 ; export CSV puis `parseCsv` redonne les valeurs (apostrophe comprise).

### Integration tests
- [ ] `table.import` et `POST tables/import` : création avec schéma déduit, en-tête publié,
  provenance `import`, fusion sur la clé, lot tout ou rien, refus nommés et codes d'AC-c1,
  `forbidden` sans la gestion (aucune requête d'écriture), journal.
- [ ] Mode tolérant par `POST nodes` ; `tolerant` ignoré par `write`.
- [ ] Exports : `.md` d'une page publiée, refus d'une page jamais publiée et d'un tableau ; `.csv`
  en `fr` et en `en`, formules neutralisées, `too_large` au-delà de 5 000 lignes, lecture exigée.
- [ ] Composants (`import-de-fichier.test.tsx`) : encodage, séparateur, changement de type, refus
  listés, progression, reprise d'un lot, zone de dépôt au clavier.
- [ ] Éditeur : collage de plusieurs lignes (relecture du brouillon, encart), d'une ligne, et en
  `Ctrl+Maj+V`.

### MCP (`InMemoryTransport`)
- [ ] `call table.import` avec `create`, puis un second morceau fusionné ; refus mot pour mot ;
  `next`.
- [ ] `read table.import` rend son contrat ; `read write.table` contient les phrases d'AC-c2.
- [ ] `write` avec `tolerant: true` reste strict.

### Golden queries
- [ ] Les deux requêtes d'AC-c3, par le pilote.

### E2E et contrôle visuel
- [ ] Glisser un `.md` sur le rail crée la page ; glisser un `.csv` crée le tableau et ouvre sa
  grille ; « Télécharger en .csv » rend le fichier.
- [ ] Contrôle visuel dans les deux thèmes : dialogue d'import (aperçu, refus, progression), encart
  « N éléments conservés en texte », conversion d'un tableau simple.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
