# Story E10-S04 — Compatibilité markdown des pages : tableau simple, séparateur, repli, listes imbriquées, titres, texte en ligne

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E10 — Contenus riches |
| **Parcours** | 4.4 Concevoir et mettre à jour ; 4.2 Faire (ce qu'un assistant écrit s'affiche comme il l'a écrit) |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : style du paquet (`ui/noeud/rendu-des-blocs.tsx`, classes `oto-table`, `oto-linked`, `oto-separator` de `ui/ds/`) |
| **Conventions** | database, forms, security, portage, a11y, state, mcp, testing |
| **Estimation** | L : trois lots séquentiels dans un seul worktree (a nouveaux blocs M, b listes imbriquées et titres M, c texte en ligne S) |
| **Vague** | E10, après 1.0.0 ; première des stories E10 (ordre : E10-S04, E10-S01, E10-S06, E10-S02) |
| **Dépend de** | M67 (lecteur tolérant : un hôte en retard ne perd aucun bloc nouveau, `.method/sprint/status.md § Contenus riches`) ; E05-S11 (lots a à e et h fusionnés : `modele.ts`, `rendu-des-blocs.tsx`, `corps-du-noeud.tsx` ; son lot f, listes de choix, ne touche aucun fichier de cette story) |
| **Porteuse de migration** | **Oui** (Ⓜ) : `blocks_type_check` et `blocks_shape_check` élargis, `block_search_text` |

## Contexte

JB, 2026-09-28 : une page doit afficher le markdown qu'on lui donne, en particulier celui
qu'écrit Claude. Ce que `parseMarkdown` (`server/nodes/markdown-parse.ts`) et le rendu
(`ui/noeud/rendu-des-blocs.tsx`, `ui/noeud/en-ligne.ts`) ne savent pas faire aujourd'hui (relevé
du 2026-09-28) :

| Construction | Aujourd'hui |
|---|---|
| Tableau GFM `\| a \| b \|` | un paragraphe, montré en texte préformaté (`estUnTableau`, `en-ligne.ts`) |
| Séparateur `---` | un paragraphe « --- », ou avalé par le paragraphe qui le précède |
| Liste imbriquée | les sous-éléments restent du texte dans l'élément parent (`items: string[]`, `schemas/blocks.ts`, `list`), affichés sur une seule ligne |
| `<details><summary>` | un paragraphe de balises |
| `#####`, `######` | refusés par `write` (`markdown-parse.ts`, `headingAt`) ; trois niveaux de titre (`##` à `####`) |
| `~~barré~~`, `\*`, `<br>`, `**gras _italique_**`, `<https://…>` | affichés tels quels (`en-ligne.ts` : code, gras, italique, liens, adresses web seulement) |

JB a retenu tout cela (fiche D111 b, D114, D115). Il a écarté pour l'instant le dessin des
diagrammes Mermaid et les tons d'encart.

**Refs :**
- PRD : FR-CONC-10
- ADR-011 § 2 (types étendus par migration additive), § 5 (aller-retour markdown de `read` et
  `write`)
- E05-S10 AC-a5 : son rendu (« un `<h2>` quel que soit le niveau ») est **remplacé** par AC-b2 ;
  son menu (un seul « Titre ») reste (D115).

## Périmètre

- Trois types de bloc : `simple_table`, `divider`, `toggle` (lecture stricte, rendu markdown,
  rendu à l'écran, recherche, liens, contrôle des procédures).
- Listes imbriquées sur trois niveaux, et non-perte de leurs enfants dans l'éditeur existant.
- Titres sur cinq niveaux, en base, en markdown, à l'écran et dans `context`.
- Marques en ligne : barré, échappements, `<br>`, marque dans une marque, `<https://…>`.

## Hors périmètre

- Mode tolérant de `parseMarkdown` (collage, import, dépôt d'un `.md`) : E10-S01 AC-a2 et AC-a3,
  y compris sur les formes de cette story (décision du pilote C2).
- « Convertir en tableau de données » (ancien AC-a5) : E10-S01 (C3, `inferTable`).
- Choix du « + » et de `/`, édition d'un tableau simple, d'un séparateur et d'un repli, `Tab` dans
  une liste, préfixes de titre : E10-S06 (C4).
- Dessin des diagrammes Mermaid, tons d'encart : écartés par JB (D114), sans story.
- Un bloc dans un repli, et une marque de même caractère dans une autre (`**a *b* c**`) : V2, sans
  story (voir Refacto et HN-E10S04-7).

## Critères d'acceptation

Règle commune à toute forme nouvelle : `parseMarkdown(renderBlocks([b]))` redonne `b` (propriété
de `markdown-parse.ts`, en-tête) ; `write` l'accepte ; `find` en indexe le texte
(`block_search_text`) ; la base et le schéma Zod partagé admettent et refusent les mêmes formes
(test de parité `tests/integration/blocs-zod.test.ts`). Tout refus de lecture est un
`invalid_arguments` (`op-kit.ts`, `parseOpText`) dont le texte nomme la ligne.

### Lot a — Nouveaux blocs

- [ ] **AC-a1 — Tableau simple.**
  - **Given** un texte de `write` qui porte, précédé d'une ligne vide ou en tête du texte, une
    ligne d'en-tête commençant par `|`, une ligne de délimitation (`| --- | :---: |`, même nombre de
    cellules) puis des lignes commençant par `|` jusqu'à une ligne vide ou une ligne sans `|` en
    tête **When** l'opération est lue **Then** elle donne un bloc `simple_table` : `text` nul,
    `data = {columns: string[], rows: string[][], align?: ("left"|"center"|"right"|null)[]}`.
  - Forme canonique rendue par `renderBlocks` : `| a | b |`, puis `| --- | :---: |` (`---` pour
    `null`, `:---` gauche, `:---:` centre, `---:` droite), puis une ligne par rangée ; une cellule
    vide rend `|  |`. `align` absent quand toutes les colonnes sont `null`.
  - Une cellule est une ligne de texte en ligne, sans blanc de bord ni saut de ligne ; un `|` y
    est écrit `\|` (un `|` précédé d'un nombre pair de `\` est refusé) ; `<br>` y reste tel quel
    et s'affiche en saut de ligne (AC-c1). Les liens `[[…]]` des cellules sont extraits (AC-a4).
  - Bornes : 1 à 20 colonnes, 0 à 200 rangées, chaque rangée de la longueur de `columns`.
  - **Given** un tableau de 21 colonnes, de 201 rangées, ou dont une rangée n'a pas le nombre de
    cellules de l'en-tête **When** `write` le lit **Then** refus `invalid_arguments` :
    `line N: a table holds 20 columns at most (21).`, `line N: a table holds 200 rows at most (201).`,
    `line N: this row has 3 cells; the header has 2.`
  - **Given** une ligne `| a | b |` sans ligne de délimitation, ou collée sous un paragraphe
    **Then** elle reste dans le paragraphe (rien ne change pour ce texte).
  - **Given** la page à l'écran **Then** le tableau a un en-tête `<th scope="col">`, les
    alignements, un défilement horizontal dans le bloc et jamais dans la page, dans les deux
    thèmes.
- [ ] **AC-a2 — Séparateur.**
  - **Given** une ligne faite de trois signes ou plus, tous `-`, tous `*` ou tous `_` (0 à 3
    espaces avant, blancs de fin admis), précédée d'une ligne vide ou en tête du texte **When**
    elle est lue **Then** elle donne un bloc `divider` : `text` nul, `data` `{}`. Rendu canonique :
    `---`.
  - **Given** la même ligne collée sous une ligne de texte **Then** elle reste dans le paragraphe
    (pas de titre souligné). `* * *` n'est pas un séparateur.
  - **Given** la page à l'écran **Then** un `<hr class="oto-separator" data-orientation="horizontal">`,
    sans rôle ajouté.
- [ ] **AC-a3 — Repli.**
  - **Given** une ligne `<details>` (ou `<details open>`, `open` n'étant pas gardé), puis
    `<summary>Résumé</summary>` sur la même ligne ou la suivante, puis un corps, puis une ligne
    `</details>` **When** elle est lue **Then** elle donne un bloc `toggle` : `data.summary` (1 à
    200 caractères, une ligne, texte en ligne) et `text` (le corps, lignes vides de bord retirées,
    jamais relu en blocs).
  - Forme canonique : `<details>`, `<summary>Résumé</summary>`, une ligne vide, le corps et une
    ligne vide s'il n'est pas vide, `</details>`.
  - Le corps n'a ni ligne vide en tête ou en fin, ni aucune ligne qui, blancs de bord retirés,
    commence par `<details` ou vaut `</details>` (en base comme en Zod).
  - **Given** un `<details>` jamais fermé, un repli dans un repli, un résumé absent ou de plus de
    200 caractères **Then** refus `invalid_arguments` : `line N: <details> is never closed by </details>.`,
    `line N: a toggle cannot hold another toggle.`, `line N: a toggle starts with <summary>…</summary> on one line.`,
    `line N: a toggle summary holds 200 characters at most (201).`
  - **Given** la page à l'écran **Then** le repli est un `LinkedContent` (`ui/ds/react/linked-content.tsx`,
    `<details>` natif, fermé par défaut, clavier du navigateur), son résumé en titre ; le corps
    s'affiche comme un encart : texte en ligne, sauts de ligne gardés, chaque clôture de code en
    bloc préformaté.
- [ ] **AC-a4 — Liens et recherche.** **Given** un `[[chemin]]` dans une cellule, dans le résumé
  ou le corps d'un repli (hors d'une clôture du corps) **When** la page est publiée **Then**
  `links` l'extrait et la publication le vérifie comme celui d'un paragraphe ; l'écran le montre
  par son titre (`cheminsCites`). **Given** un mot d'une cellule, d'un résumé ou d'un corps
  **When** `find` le cherche **Then** la page est trouvée.
- [ ] **AC-a5 — Procédures (règle 6, N17).** **Given** une procédure dont une cellule, un résumé,
  un corps de repli ou un sous-élément de liste porte une ligne ` ```call ` **When** elle est
  publiée **Then** elle est refusée comme un paragraphe qui porte cette ligne aujourd'hui
  (`procedures-check.ts`, `renderedTexts`). Une étape reste un élément de **premier niveau** de la
  liste numérotée (`callLocation`, `stepBefore`).

### Lot b — Listes imbriquées et titres

- [ ] **AC-b1 — Listes imbriquées.**
  - Forme : un élément de `list` est une chaîne (forme actuelle, toujours admise) ou
    `{text: string, children: {items, ordered?: boolean, start?: number}}`, `children.items`
    non vide, de même forme ; trois niveaux au plus ; clés inconnues refusées dans un élément et
    dans `children`. `LIST_ITEMS_MAX` (500) compte tous les éléments, sous-éléments compris.
  - Lecture : l'élément est lu comme aujourd'hui (`readItem`, lignes suivantes indentées d'au moins
    deux espaces) ; pour une `list`, son texte est relu : la première ligne qui porte une marque
    (0 à 3 espaces avant) ouvre la sous-liste, dont l'indentation de cette ligne est retirée de
    chaque ligne ; le reste suit la même règle, trois niveaux au plus. Chaque ligne est lue au plus
    trois fois (lecture linéaire).
  - Forme canonique : les lignes suivantes d'un élément à deux espaces (inchangé) ; sa sous-liste
    indentée de la largeur de sa marque et d'un espace (2 sous `- `, 3 sous `1. `, 4 sous `10. `,
    comme CommonMark). `ordered` et `start` par niveau.
  - **Given** un sous-niveau qui mêle puces et numéros, un quatrième niveau, du texte après la
    sous-liste d'un élément, ou plus de 500 éléments en tout **Then** refus `invalid_arguments` :
    `line N: a sub-list mixes bullets and numbers.`, `line N: lists go three levels deep at most.`,
    `line N: text after a sub-list belongs to no item; indent it under an item.`,
    `line N: a list holds 500 items at most, sub-items included (501).`
  - Une `checklist` garde des éléments sans enfants : sous elle, les lignes à marque indentées
    restent du texte de l'élément (HN-E10S04-2).
  - **Given** la page à l'écran **Then** des `ul` et `ol` imbriqués, `start` respecté.
- [ ] **AC-b2 — Non-perte dans l'éditeur existant** (C4). **Given** une liste imbriquée écrite par
  `write` **When** une personne l'ouvre dans l'éditeur et y tape **Then** le champ la montre un
  élément par ligne, deux espaces par niveau, sa marque de sous-niveau comprise (`- `, `1. `), et
  la frappe garde les enfants, `ordered` et `start` : la liste renvoyée est égale à la liste servie
  plus la frappe (test pur sur `texteDe` et `avecTexte`, et test du composant). Un élément qui
  dépasse trois niveaux par la frappe est refusé par le contrôle de l'éditeur (`operations.ts`,
  `controler`, message « Trois niveaux de liste au plus. »).
- [ ] **AC-b3 — Cinq niveaux de titre** (C5).
  - `heading.data.level` va de 1 à 5 : `##` à `######` en markdown, `#` restant le titre de la page.
  - **Given** `#####` ou `######` dans un texte de `write` **Then** un titre de niveau 4 ou 5.
    **Given** `#######` **Then** c'est un paragraphe (CommonMark), comme toute ligne qui n'est pas
    un titre ; `#` reste refusé (`line N … is the level of the page title; headings start at ##.`).
  - Les sections de `read` et `write` suivent les cinq niveaux : une section s'arrête au titre
    suivant de même niveau ou plus haut ; le plan de `read` indente les cinq niveaux ; le refus de
    `replace_section` propose un sous-niveau jusqu'au niveau 5 (`section-ops.ts`, `checkHeadings`).
  - **Given** un Contexte ou une procédure servis par `context` (`headingBase` 3) **Then** le
    nombre de `#` est `Math.min(6, base + level − 1)` : les niveaux 4 et 5 y rendent `######`.
  - **Given** la page à l'écran **Then** un titre de niveau N est un `h(N+1)`, borné à `h6` ;
    sous `baliseDeTitre="h3"` (Contexte dans les réglages, E05-S11 AC-24), un `h(N+2)` borné à
    `h6` ; chaque balise a sa taille, distincte dans les deux thèmes.

### Lot c — Texte en ligne

- [ ] **AC-c1 — Nouvelles marques.** **Given** un texte de paragraphe, d'élément de liste, de
  cellule, d'encart, de résumé ou de corps de repli **When** il est affiché (`segmentsEnLigne`)
  **Then** :
  - `~~barré~~` est barré (`<s>`) ;
  - `\*` `\_` `\|` `` \` `` `\[` `\~` `\<` `\\` s'affichent sans la barre oblique inverse, hors du
    code en ligne ;
  - `<br>`, `<br/>` ou `<br />` est un saut de ligne ;
  - une marque dans une marque d'un autre caractère (`**gras _italique_**`, `_italique **gras**_`,
    `~~barré **gras**~~`) est lue, sur deux niveaux ;
  - `<https://…>` est une adresse web, comme une adresse nue (E05-S10 AC-a8).

  Tout autre HTML en ligne reste du texte échappé. `texteLu` retire ces marques (un saut de ligne
  y devient une espace).
- [ ] **AC-c2 — Lien échappé.** **Given** `\[[ventes/devis]]` dans un texte **When** la page est
  publiée et affichée **Then** ni `links` ni `cheminsCitesDans` n'y voient de lien : la règle vit
  dans `linksIn` (`schemas/link-syntax.ts`), commune à l'écran et à la publication (comme
  HN-E05S02-26). Test sur le couple.

## Implémentation

### Fichiers à créer
- `migrations/` : `packages/plateforme/migrations/<horodatage>_platform_page_markdown.sql`
- `tests/` : `tests/unit/nodes-parse-page-markdown.test.ts`, `tests/unit/ui-en-ligne-marques.test.ts`,
  `tests/integration/components/blocs-de-page.test.tsx`, `tests/e2e/e10s04-markdown.spec.ts`

### Fichiers à modifier, par face et par lot
- **Lot a**
  - `schemas/` : `blocks.ts` (`BLOCK_TYPES`, `simpleTable`, `divider`, `toggle`),
    `blocks-render.ts` (`renderBody`).
  - `server/` : `nodes/markdown-parse.ts` (`parseBlockAt`, `interrupts`), `nodes/links.ts`
    (`humanTexts`), `procedures-check.ts` (`renderedTexts`), `catalog/contracts.ts`
    (`write.procedure` : une ligne, « a call fence never stands in a table, a toggle or a
    sub-item »).
  - `ui/` : `noeud/rendu-des-blocs.tsx` (`RenduDUnBloc`), `noeud/corps-du-noeud.tsx` (`textesDe`).
  - `migrations/` : la migration ci-dessus, `migrations/README.md` ; `pnpm migrations:sync`
    (copie dans `supabase/migrations/`).
  - `tests/` : `helpers/block-cases.ts`, `unit/schemas/blocks.test.ts`, `unit/blocks-render.test.ts`,
    `unit/nodes-parse.test.ts`, `unit/nodes-links.test.ts`, `integration/procedures-check.test.ts`,
    `integration/search-content.test.ts`, `integration/mcp-read-write.test.ts`.
- **Lot b**
  - `schemas/` : `blocks.ts` (`list`, `heading.level`), `blocks-render.ts` (`listItem`,
    `renderBody`, `headingOf`).
  - `server/` : `nodes/markdown-parse.ts` (`HEADING_LEVELS`, `headingAt`, `readItem`, `listBlock`),
    `nodes/document.ts` (`headingLevel`), `nodes/section-ops.ts` (`Located`, `checkHeadings`),
    `nodes/links.ts` (enfants), `procedures-check.ts` (enfants).
  - `ui/` : `noeud/rendu-des-blocs.tsx` (`Liste`, `BALISE_DE_TITRE` remplacée par la balise du
    niveau), `noeud/corps-du-noeud.tsx` (enfants), `noeud/editeur/modele.ts` (`texteDe`,
    `avecTexte`), `noeud/editeur/operations.ts` (`controler`, `ELEMENTS_MAX`),
    `noeud/editeur/rangee-de-bloc.tsx` (balise du titre au repos), `ds/components/css/content.css`
    (`oto-reader-heading` par balise).
  - `tests/` : `unit/context-blocks.test.ts`, `unit/nodes-read.test.ts`, `unit/ui-editeur-modele.test.ts`,
    `unit/ui-editeur-operations.test.ts`, `integration/components/editeur-de-blocs.test.tsx`,
    `integration/components/ecran-de-noeud.test.tsx`.
- **Lot c**
  - `schemas/` : `link-syntax.ts` (`linksIn`).
  - `ui/` : `noeud/en-ligne.ts` (`Segment`, `segmentsEnLigne`, `texteDes`),
    `noeud/rendu-des-blocs.tsx` (`rendre`).
  - `tests/` : `unit/ui-en-ligne.test.ts`, `unit/schemas/link-syntax.test.ts`.

### Migrations prévues
Une migration additive, aucune table ni colonne :
- Une seule instruction, forme admise par `pnpm check:migrations` (`cli/migrations-check.mjs`,
  `REPLACED_CHECK`) : `alter table platform.blocks drop constraint blocks_type_check, add constraint
  blocks_type_check check (…), drop constraint blocks_shape_check, add constraint blocks_shape_check
  check (…)`. Les contraintes sont élargies, jamais resserrées : toute ligne existante reste
  valide, et `add constraint` la revalide sous verrou exclusif (table de quelques milliers de
  lignes par organisation).
- `blocks_type_check` : ajoute `simple_table`, `divider`, `toggle`.
- `blocks_shape_check` :
  - `heading` : niveau 1 à 5 ;
  - `list` : éléments chaîne ou `{text, children}` par `jsonb_path_exists`, aucun quatrième niveau
    (`strict $.items[*].children.items[*].children.items[*].children`), 500 chaînes au plus sous
    `strict $.items.**` ;
  - `simple_table` : `text` nul, 1 à 20 colonnes, 0 à 200 rangées de la longueur de `columns`,
    cellules sans saut de ligne, sans blanc de bord ni `|` non échappé (`like_regex`), `align`
    de même longueur ;
  - `divider` : `text` nul ;
  - `toggle` : `text` non nul, sans ligne vide de bord ni ligne `<details…`/`</details>` ;
    `summary` de 1 à 200 caractères, sans saut de ligne.
- `blocks_data_check` (seulement « objet ») : inchangée.
- `block_search_text` : `create or replace`, même signature, `immutable`. Pour `list`,
  `strict $.items.** ? (@.type() == "string")` (le mode `lax` de `.**` peut doubler des valeurs) ;
  pour `simple_table`, `columns` et `rows` ; pour `toggle`, `summary` en plus du texte. Pour toute
  ligne existante, le résultat est identique à l'ancien, puisque `search_tsv` (colonne STORED) n'est
  pas recalculé : test d'égalité sur les formes actuelles.

### Schémas Zod partagés
- `schemas/blocks.ts` : `simpleTable`, `divider`, `toggle`, `listItemSchema` (récursif, trois
  niveaux, `z.strictObject`), `heading.data.level` de 1 à 5 ; exportés par `blockInputSchema`.
  Mêmes bornes que la base, pas plus (en-tête du fichier).

### Points de départ
- Aucun dans la maquette du banc ni dans Oto (aucun ne lit ces formes).
- Design system d'oto-frontend, déjà porté : `LinkedContent` (repris tel quel pour le repli),
  classes `oto-table-wrap` et `oto-table` avec `data-responsive="scroll"` (reprises du balisage de
  `ui/equipes/tableau-fixe.tsx`), `oto-separator` (`ui/ds/components/css/misc.css`, sans le
  composant `Separator` d'oto-frontend, non porté).

### Patterns à suivre
- `security-patterns.md § Validation des inputs` : cellules, `<details>`, niveaux de liste et
  marques lus par parcours à la main ou par expressions ancrées, chaque caractère lu une fois
  (trois fois au plus pour les listes, deux pour les marques).
- `database-patterns.md` : migration additive ; contraintes élargies, jamais resserrées.
- `accessibility-patterns.md` : `<th scope="col">`, `<details>` natif, `<hr>` sans rôle ajouté.

### Canaux de sécurité
- **Fermé — HTML injecté** : `<details>`, `<summary>` et `<br>` sont reconnus comme des jetons et
  rendus par React ; tout autre HTML reste du texte échappé, aucun `dangerouslySetInnerHTML`
  (`security-patterns.md § XSS Prevention`). Test : `ui-en-ligne-marques.test.ts` (« HTML échappé »),
  `blocs-de-page.test.tsx` (un `<script>` dans une cellule et dans un corps s'affiche en texte).
- **Fermé — lecture quadratique** : textes hostiles (Tests attendus), `security-patterns.md § Validation des inputs`.
- **Fermé — appel caché dans une procédure** : AC-a5, `procedures-check.test.ts`.
- **Ouvert, comme aujourd'hui — lien vers un autre site** : `<https://…>` devient une adresse web,
  ouverte dans un nouvel onglet avec `noopener noreferrer nofollow` (E05-S10 AC-a8). Test :
  `ui-en-ligne-marques.test.ts` (chevrons), rendu par `AdresseWeb`.

## Rayon d'impact

### Appelants
- Types de bloc : `rg -n '"mermaid"' C:/apps/oto-platform/packages C:/apps/oto-platform/tests` →
  `schemas/blocks.ts`, `schemas/blocks-render.ts`, `server/nodes/markdown-parse.ts`,
  `ui/noeud/rendu-des-blocs.tsx`, et huit fichiers de tests (`helpers/block-cases.ts`,
  `unit/blocks-render.test.ts`, `unit/nodes-parse.test.ts`, `unit/nodes-links.test.ts`,
  `unit/ui-editeur-modele.test.ts`, `unit/schemas/blocks.test.ts`,
  `integration/components/editeur-de-blocs.test.tsx`, `integration/components/ecran-de-noeud.test.tsx`).
  Les lecteurs par type que cette recherche ne voit pas : `links.ts` (`humanTexts`),
  `procedures-check.ts` (`renderedTexts`), `corps-du-noeud.tsx` (`textesDe`), `block_search_text`.
  Chacun reçoit les trois types. `modele.ts` (`formeDe`) rend `null` pour eux : ils se lisent,
  se déplacent et se suppriment dans l'éditeur, sans s'écrire, jusqu'à E10-S06.
- Niveau de titre : `rg -n "1 \| 2 \| 3" C:/apps/oto-platform/packages/plateforme` →
  `schemas/blocks-render.ts` (`headingOf`), `server/nodes/document.ts` (`headingLevel`),
  `server/nodes/section-ops.ts` (`Located`) : élargis à 5. Sans rapport, inchangés :
  `schemas/nodes.ts` (`NodeView.level`, niveau d'accès, `read.ts` : `level as NodeView["level"]`),
  `ui/tableau/tableau-du-noeud.tsx`, `schemas/rules.ts`, `schemas/node-gestures.ts`.
  `rg -n "level < 3" …/server/nodes` → `section-ops.ts` (`checkHeadings`, `deeper`) : passe à 5.
- Rendu des titres : `rg -n "headingBase" C:/apps/oto-platform/packages/plateforme` →
  `blocks-render.ts` (`renderBody`), `server/nodes/document.ts`, `server/nodes/read-format.ts`
  (base 2) ; `server/context/blocks/contexts.ts` et `server/context/blocks/procedure.ts` (base 3,
  bornée à 6 `#`). `rg -n "BALISE_DE_TITRE|baliseDeTitre" …/ui` → `rendu-des-blocs.tsx`,
  `editeur/rangee-de-bloc.tsx` (titre au repos), `admin/organisation/contexte-de-l-entreprise.tsx`
  (`h3`).
- Éléments de liste : `rg -n "data\.items|\.items\b|elements\(" C:/apps/oto-platform/packages/plateforme --glob '*.ts*'`
  → `schemas/blocks-render.ts` (`renderBody`, `stepBefore`), `ui/noeud/rendu-des-blocs.tsx`
  (`elements`, `Liste`, `Cases`), `ui/noeud/corps-du-noeud.tsx` (`textesDe`),
  `ui/noeud/editeur/modele.ts` (`casesDe`, `texteDe`, `avecTexte`, `avecForme`),
  `ui/noeud/editeur/operations.ts` (`controler`), `server/nodes/links.ts` (`humanTexts`),
  `server/procedures-check.ts` (`renderedTexts`) ; en SQL, `block_search_text` et
  `blocks_shape_check`. Chacun lit la forme `{text, children}`. Sans rapport : `server/usage.ts`,
  `server/journal-model.ts`, `server/catalog/erp.ts`, `ui/ds/react/*`.
- `block_search_text` : `rg -n "block_search_text" …/migrations` → base l. 112 (définition), 646
  (lexique), 662 (déclencheur), 1772, 2139 (`search_tsv`), 3156-3157 (droits) : même signature,
  aucun appelant ne change.
- `en-ligne.ts` : `rg -n "segmentsEnLigne\(|texteLu\(|estUnTableau" …/packages/plateforme` →
  `rendu-des-blocs.tsx` (tout rendu de texte, écran, éditeur au repos, page publique
  `ui/public/page-publique.tsx`, Contexte de l'entreprise), `editeur/modele.ts`
  (`premiersMots`), `editeur/rangee-de-bloc.tsx` (nom d'un titre). `rg -n "linksIn\(" …` →
  `en-ligne.ts`, `server/nodes/links.ts` : la règle d'AC-c2 vaut des deux côtés.

### Doublons
- `rg -n "<table|<details|oto-separator" C:/apps/oto-platform/packages/plateforme/ui` et
  `component-registry.md` (ligne des primitives du design system) :
  - `ui/ds/react/table.tsx` (`Table`) : îlot client, colonnes en fonctions, tri. Verdict : ne pas
    l'utiliser pour un bloc rendu aussi par le serveur ; reprendre son balisage et ses classes,
    comme `ui/equipes/tableau-fixe.tsx`.
  - `ui/equipes/tableau-fixe.tsx` (`TableauFixe`) : clés par texte d'en-tête (un en-tête markdown
    peut se répéter), sans alignement, nom obligatoire. Verdict : laisser ; `Tableau` interne à
    `rendu-des-blocs.tsx` avec les mêmes classes.
  - `ui/ds/react/linked-content.tsx` (`LinkedContent`, `<details>`) : **réutilisé** pour le repli.
  - `oto-separator` (`misc.css`) : **réutilisé** pour le séparateur.
  - La grille d'E07-S03 (`ui/tableau/`) est un tableau de données (tri, filtres, revue) : sans
    rapport.
- `rg -n '`{3,}|~{3,}|`\{3,\}' packages/plateforme --glob '*.ts*'` (lecteurs de clôtures) :
  - `fencedParts` (`schemas/link-syntax.ts`) et `openingFence`/`closes` de `server/nodes/markdown-parse.ts`
    lisaient la même clôture chacun à sa façon. Verdict : **fusionner** ; `openingFence`, `closesFence`,
    `Fence` et `LINE_SEPARATORS` vivent dans `schemas/link-syntax.ts`, que `fencedParts` et l'analyse
    importent (une seule lecture linéaire, correction de revue).
  - `CALL_FENCE` (`server/procedures-check.ts`) : cherche une ligne ` ```call ` dans un texte rendu, sans
    fermeture. Verdict : laisser (autre question, expression ancrée et linéaire).
  - `beforeOpenFence` (`server/context/blocks/contexts.ts`) : recule une coupe avant une clôture d'accents
    graves restée ouverte, antérieure à cette story. Verdict : laisser ; candidat à `openingFence` (voir Refacto).
- `rg -n "\.items\b.*children|children.*\.items|data\.columns|data\.rows" packages/plateforme --glob '*.ts*'`
  (parcours des éléments d'une liste et des cellules d'un tableau) :
  - `listItemTexts` (`schemas/blocks.ts`) : remplace les parcours de `humanTexts` (`links.ts`),
    `renderedTexts` (`procedures-check.ts`) et `textesDe` (`corps-du-noeud.tsx`), qui liraient chacun
    les sous-éléments. Verdict : **créé, partagé**. `niveauxDe` (`editeur/operations.ts`) compte des
    niveaux, pas des textes, et `lignesDeListe` (`editeur/modele.ts`) et `Liste` (`rendu-des-blocs.tsx`)
    gardent la structure : laisser. `block_search_text` lit les mêmes textes en SQL (`strict $.items.**`) :
    laisser, la parité se teste (`blocs-zod.test.ts`).
  - `tableCells` (`schemas/blocks.ts`) : les cellules à plat pour les liens, les procédures et l'écran.
    Verdict : **créé, partagé**. `TableauSimple` (`rendu-des-blocs.tsx`) et `premiersMots`
    (`editeur/modele.ts`, colonnes seules) gardent l'en-tête et les rangées séparés : laisser.

### Effet produit
- **Écran, toutes les pages** : un titre de niveau 2 ou 3 déjà écrit passe de `<h2>` à `<h3>` ou
  `<h4>`, plus petit. Cela remplace le rendu d'E05-S10 AC-a5 (D115 : « s'affiche selon lui ») ; le
  menu garde un seul « Titre ».
- **Conversion au premier `write`** : rien n'est converti en base, mais le `read` suivi d'un
  `write` d'une section inchangée relit son markdown avec les règles nouvelles. Un paragraphe fait
  d'un tableau `|` (précédé d'une ligne vide), un paragraphe « --- » seul, un paragraphe
  `<details>` et un élément de liste qui porte `\n- sous-élément` deviennent un `simple_table`, un
  `divider`, un `toggle` ou une liste imbriquée, avec des blocs neufs (`section-ops.ts` : l'`id` est
  gardé pour une forme exacte). Pour ces seuls cas, la story le déclare au lieu de le garantir
  (HN-E10S04-6).
- **MCP** : `write` accepte plus de formes, et `#####` passe ; `read` et `context` rendent les
  formes nouvelles. La liste d'outils est inchangée (ADR-002).
- **Procédures** : le contrôle de publication lit cellules, replis et sous-éléments (AC-a5) ; le
  contrat `write.procedure` le dit en une ligne.
- **Partage public, aperçu de `context`, export `.md` (E10-S01)** : les blocs y paraissent comme
  dans la page.
- **Schéma** : Ⓜ, deux contraintes et une fonction. Elle s'applique et fusionne avant les autres
  (`.method/sprint/vagues.md § Base de test et migrations`).
- E10-S01, E10-S06 et E10-S02 touchent `markdown-parse.ts`, `blocks.ts`,
  `blocks-render.ts` ou `rendu-des-blocs.tsx` : elles passent après cette story.

### Refacto
- Écarté : un repli fait de vrais blocs enfants. Le modèle est plat (ADR-011 § 2) ; des blocs
  enfants changeraient l'ADR, la publication et les sections, pour un besoin que le corps en
  markdown couvre.
- Écarté : extraire `TableauFixe` d'`ui/equipes/` vers un composant commun avec alignement et clés
  par rang. Sans lui, deux tableaux statiques partagent les mêmes classes. Deux occurrences : à
  proposer au pilote à la fusion (`coding-standards.md § DRY`).
- Proposé au pilote, non fait : `beforeOpenFence` (`server/context/blocks/contexts.ts`) lirait ses
  clôtures par `openingFence` et `closesFence`. Sans lui, la coupe d'un Contexte ne reconnaît que les
  clôtures d'accents graves sans retrait (comportement d'avant cette story, inchangé) ; coût : un test de
  `context` sur une clôture `~~~` coupée.

## Hypothèses

- **HN-E10S04-1** : noms `simple_table` (« Tableau simple »), `divider` (« Séparateur »), `toggle`
  (« Repli »). Ils ne se confondent pas avec le nœud `table` ni avec la grille d'E07-S03 (source :
  simple).
- **HN-E10S04-2** : pas de cases à cocher imbriquées. Un sous-élément de `checklist` reste du texte
  (source : simple ; rare dans ce qu'écrit Claude).
- **HN-E10S04-3** : trois niveaux d'imbrication, 20 colonnes et 200 rangées pour un tableau
  simple. Au-delà, c'est un tableau de données (source : simple).
- **HN-E10S04-4** (C5, D115) : en base, titres 1 à 5 ; en markdown, `##` à `######` ; à l'écran,
  `h2` à `h6` bornés ; dans `context`, 6 `#` au plus. Les préfixes de l'éditeur sont dans E10-S06.
- **HN-E10S04-5** : un tableau ou un séparateur n'interrompt pas un paragraphe (précédé d'une
  ligne vide ou en tête) ; un tableau commence par `|`. Ainsi un texte existant ne change pas de
  sens (source : `estUnTableau`, GFM restreint).
- **HN-E10S04-6** : la conversion au premier `write` (Effet produit) est admise, sans migration
  des données (source : ADR-011 § 5, les blocs font foi et le markdown en est un rendu). De même, un
  élément de liste dont une ligne suivante commence par une marque de liste (`"c\n1. x"`, admis par Zod
  et par la base, écrit seulement par l'API des blocs) est relu en sous-liste aux niveaux 1 et 2, et sa
  section est refusée au niveau 3 (`line N: lists go three levels deep at most.`) (source : option la plus
  simple, décision du pilote ; aucune migration, cas que `write` ne produit pas).
- **HN-E10S04-7** : une marque dans une marque de même caractère (`**a *b* c**`) reste hors
  périmètre : l'expression actuelle exclut ce caractère de son contenu, ce qui la garde linéaire
  (source : `en-ligne.ts`, `MARQUES`).
- **HN-E10S04-8** : le corps d'un repli n'est pas relu en blocs ; un tableau ou une liste s'y lit
  en texte (source : le corps affiché comme un encart, D114).
- **HN-E10S04-9** (implémentation) : « précédée d'une ligne vide ou en tête du texte » (AC-a1, AC-a2) se
  lit « au début d'un bloc, jamais dans un paragraphe » : un tableau ou un séparateur qui suit un titre, une
  liste ou un encart sans ligne vide est reconnu (source : HN-E10S04-5, dont le but est qu'un paragraphe
  existant ne change pas de sens ; le rendu met toujours une ligne vide entre deux blocs). Une ligne
  `<details>` interrompt un paragraphe, comme une clôture ou un titre (source : AC-a3 ne l'exclut pas ;
  CommonMark, bloc HTML de type 6).
- **HN-E10S04-10** (implémentation) : la marque qui ouvre une sous-liste est admise de 0 à 3 espaces, ou
  jusqu'à la largeur de la marque de l'élément moins un quand elle est plus grande : sans cela, un élément
  numéroté à partir de 1000 (marque de 5 caractères) rendrait sa sous-liste à 6 espaces, que la lecture ne
  reconnaîtrait plus (source : propriété d'aller-retour de `markdown-parse.ts`).
- **HN-E10S04-11** (implémentation) : dans une sous-liste, des lignes vides entre deux sous-éléments sont
  admises et se relisent en liste serrée ; au premier niveau, une ligne vide suivie d'une marque ouvre
  toujours une seconde liste (comportement inchangé) (source : la plus simple, aucune liste perdue).
- **HN-E10S04-12** (implémentation) : le résumé d'un repli est lu sans ses blancs de bord et compté comme un
  titre (`btrim`, 1 à 200 caractères) ; un résumé vide (`<summary></summary>`) reçoit le refus « a toggle
  starts with <summary>…</summary> on one line. » (source : `heading`, même règle en base et en Zod).
- **HN-E10S04-13** (implémentation) : `` \` `` ne s'affiche sans sa barre oblique que hors d'un span de code :
  `codeSpans` (`schemas/link-syntax.ts`), commun à la publication, n'est pas changé, et une barre oblique
  devant un accent grave qui ferme un span reste dans le code. Un `\<` devant `<https://…>` empêche l'adresse
  entre chevrons, l'adresse nue qu'il contient restant un lien (source : la plus simple ; la règle des liens
  reste commune, HN-E05S02-26).
- **HN-E10S04-14** (implémentation) : dans l'éditeur existant (C4), un élément de liste dont le texte tient sur
  plusieurs lignes se relit toujours en autant d'éléments (comportement d'avant, inchangé), et les enfants d'un
  élément racine sur plusieurs lignes suivent sa dernière ligne ; un sous-élément sur plusieurs lignes montre
  chacune à sa profondeur, avec sa marque (numéros comptés par ligne), et se relit en autant de sous-éléments
  frères, ses enfants suivant sa dernière ligne : aucun enfant ne change de niveau ni de parent ; les numéros de
  gouttière d'une liste numérotée comptent les lignes de sous-éléments (`champ-de-bloc.tsx`, hors du
  périmètre de fichiers) ; une ligne de deux espaces ou plus dans un Texte changé en liste devient un
  sous-élément. Le rendu à l'écran et la non-perte des enfants (AC-b2) ne sont pas touchés (source : E10-S06
  porte `Tab` et l'édition des listes, C4). Numéros de gouttière corrigés par E10-S06 : seuls les éléments du premier
  niveau se comptent, à partir de `start` (`numerosDeGouttiere`).
- **HN-E10S04-15** (implémentation) : les clôtures d'un corps de repli se lisent par `fencedParts`
  (`schemas/link-syntax.ts`) : ``` ou ~~~, 0 à 3 espaces avant ; une clôture jamais fermée court jusqu'à la
  fin ; publication (`links`), écran (`cheminsCites`) et rendu la partagent (source : AC-a4, un seul lecteur,
  M15).
- **HN-E10S04-16** (implémentation) : un tableau, un repli et un séparateur se nomment dans l'éditeur par
  leurs colonnes, leur résumé, ou « bloc vide » (`premiersMots`) ; `h6` se distingue de `h5` par la mono
  capitales des intitulés (`content.css`) (source : la plus simple).

## Actions JB

Aucune : pas de secret, pas de service extérieur.

## Tests attendus

### Unit tests
- [ ] `nodes-parse-page-markdown.test.ts` : aller-retour de chaque forme canonique (tableau avec
  `\|`, `<br>`, cellule vide, chaque alignement ; séparateur `---`, `***`, `___`, en tête ; repli
  vide ou non, résumé sur sa ligne ou la suivante ; listes imbriquées à trois niveaux, `ordered`
  et `start` par niveau, sous `- ` et sous `10. ` ; titres 1 à 5). Ambiguïtés : `---` sous un
  paragraphe, `| a |` dans un paragraphe, `<details>` dans une clôture, `#######`, sous-élément de
  `checklist`. Chaque refus nommé, avec son texte.
- [ ] Textes hostiles, moins d'une seconde chacun, à la taille d'un appel : 100 000 `|`, une
  cellule de `\\\\…|`, 50 000 lignes `<details>` sans fin, 100 000 lignes de listes indentées,
  100 000 `~~`, `**_` alternés et `\` (`security-patterns.md § Validation des inputs`).
- [ ] `blocks-render.test.ts` : `headingBase` 3 et niveaux 4 et 5 → `######` ; formes canoniques.
- [ ] `nodes-read.test.ts` : plan et sections à cinq niveaux ; `replace_section` sur un titre de
  niveau 4 (`section-ops.ts`).
- [ ] `ui-en-ligne-marques.test.ts` : barré, échappements, `<br>`, imbrication sur deux niveaux,
  chevrons, HTML échappé, `texteLu`.
- [ ] `link-syntax.test.ts` et `nodes-links.test.ts` : `\[[` ignoré des deux côtés ; liens des
  cellules, du résumé, du corps hors clôture, des sous-éléments.
- [ ] `ui-editeur-modele.test.ts` : liste imbriquée lue en deux espaces par niveau, frappe sans
  perte d'enfants (AC-b2).
- [ ] Régression : chaque cas actuel de `nodes-parse.test.ts` et `blocks-render.test.ts` inchangé.

### Integration tests
- [ ] Migration : lignes existantes valides ; `blocs-zod.test.ts` (parité de chaque cas de
  `block-cases.ts`) ; `block_search_text` égal à l'ancien sur les formes actuelles.
- [ ] `search-content.test.ts` : `find` trouve un mot d'une cellule, d'un résumé, d'un corps, d'un
  sous-élément.
- [ ] `procedures-check.test.ts` : ` ```call ` dans une cellule, un corps, un résumé ou un
  sous-élément refusé ; étape comptée au premier niveau.
- [ ] `mcp-read-write.test.ts` (`InMemoryTransport`) : `write` d'un compte rendu type puis `read`
  qui le rend à l'identique ; refus nommés.
- [ ] `context-blocks.test.ts` : Contexte avec titres 4 et 5.
- [ ] `blocs-de-page.test.tsx` : tableau (en-têtes `scope`, alignements, défilement), séparateur,
  repli fermé puis ouvert au clavier, listes imbriquées, `h2` à `h6`, `baliseDeTitre="h3"`.
- [ ] Régression d'écran : `ecran-de-noeud.test.tsx`, un paragraphe `|` existant toujours en
  préformaté, un titre de niveau 2 en `h3`.

### E2E tests
- [ ] `e10s04-markdown.spec.ts` : une page écrite par `write` avec un compte rendu type de Claude
  (titres à cinq niveaux, tableau, séparateurs, listes imbriquées, repli, barré, `<br>`) s'affiche
  sans balisage visible. Contrôle visuel dans les deux thèmes, à 1280 px et 390 px (défilement du
  tableau dans le bloc).

## Post-implémentation

### Écarts avec l'architecture

Aucun invariant touché (types étendus par migration additive, ADR-011 § 2). À reporter dans
`docs/architecture.md` : la liste des types de `blocks` (§ 4, ligne `blocks`) prend `simple_table`, `divider`,
`toggle`.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `listItemTexts`, `tableCells`, `trimBlanks`, `listItemSchema`, `LIST_DEPTH_MAX`, `SIMPLE_TABLE_COLUMNS_MAX`, `SIMPLE_TABLE_ROWS_MAX`, `TOGGLE_SUMMARY_MAX` | `packages/plateforme/schemas/blocks.ts` | Textes d'une liste (sous-éléments compris) et d'un tableau simple, lus par la publication, le contrôle des procédures et l'écran ; bornes partagées avec l'analyse |
| `fencedParts`, type `TextPart` | `packages/plateforme/schemas/link-syntax.ts` | Parties d'un corps de repli (texte, clôtures), un seul lecteur pour les liens et le rendu |
| `openingFence`, `closesFence`, type `Fence`, `LINE_SEPARATORS` (déplacés), `escaped` (exporté) | `packages/plateforme/schemas/link-syntax.ts` | Lecture des clôtures partagée par l'analyse de `write` et `fencedParts` ; échappement lu par les liens et l'écran (`en-ligne.ts`) |
| `LIST_ITEMS_MAX`, `isBlankLine` (exportés) | `packages/plateforme/schemas/blocks.ts` | Borne de 500 éléments (réexportée par `server/nodes/limits.ts`, importée par `editeur/operations.ts`) ; ligne blanche du corps d'un repli (schéma et `markdown-rich.ts`) |
| `tableAt`, `isDivider`, `toggleOpening`, `parseToggle`, `ParseProblem`, `refuse` | `packages/plateforme/server/nodes/markdown-rich.ts` | Lecture des trois formes nouvelles ; `ParseProblem` et `refuse` déplacés de `markdown-parse.ts` |
| `baliseDuTitre` (remplace `BALISE_DE_TITRE`), `TableauSimple`, `Repli` (internes) | `packages/plateforme/ui/noeud/rendu-des-blocs.tsx` | Balise d'un titre par niveau ; tableau simple au balisage de `TableauFixe` ; repli sur `LinkedContent` |

### Notes

- Lots a, b et c livrés dans le worktree `e10`, sans commit. Migration `20260929170000_platform_page_markdown.sql`
  appliquée à la base locale seulement ; `mcp-read-write.test.ts` (Supabase Auth) et la spec E2E ne tournent
  pas en local : à jouer par le pilote après l'application au projet partagé.
- `markdown-rich.ts` créé hors de la liste de fichiers : `markdown-parse.ts` aurait dépassé `max-lines` (300).
- Deux attendus d'avant changés par la story : `nodes-parse.test.ts` (`#####` n'est plus refusé ; refus de 501
  éléments « sub-items included ») et le rendu d'un titre de niveau 2 ou 3 (`h3`, `h4`) dans
  `ecran-de-noeud.test.tsx` et `editeur-de-blocs.test.tsx` (AC-b3 remplace E05-S10 AC-a5).
- `m67-blocs-inconnus.test.ts` prenait pour « blocs inconnus » un élément de liste `{text, children}` et des
  titres de niveau 4 et 5, que cette story rend connus : ses exemples passent à un élément de forme inconnue et
  aux niveaux 6 et 7 (même règle M67, formes au-delà de cette version). `catalog-contracts.test.ts` compte la
  ligne de refus ajoutée à `write.procedure`.

### Corrections après revue

- **Lecture des clôtures** : `fencedParts` lisait l'ouverture par `/^ {0,3}(`{3,}|~{3,})(.*)$/`, quadratique
  sur une suite d'accents graves suivie de U+2028 ou `\r` (19 s pour 99 990 accents graves). La lecture de
  l'analyse (`openingFence`, `closesFence`) passe dans `schemas/link-syntax.ts` et sert aux deux ;
  `LINE_SEPARATORS` y prend `\r`, que `parseMarkdown` coupe avant (sans effet sur l'analyse), pour qu'une
  ligne du corps d'un repli qui en porte reste du texte comme avant. Textes hostiles ajoutés à
  `link-syntax.test.ts`.
- **Éditeur (AC-b2)** : `lignesDeListe` écrit chaque ligne d'un sous-élément sur plusieurs lignes à sa
  profondeur, avec sa marque (HN-E10S04-14).
- **Doublons retirés** : `enregistrement` (deux copies d'`isRecord`), `echappe` (copie d'`escaped`),
  `isBlankLine` de `markdown-rich.ts` (copie de celle du schéma), `ELEMENTS_MAX` et le 500 de `limits.ts`.

#### Rayon d'impact des corrections

- **Appelants** : `rg -n "\bopeningFence\b|\bclosesFence\b|\bLINE_SEPARATORS\b|\bescaped\(|\bisBlankLine\b|\bLIST_ITEMS_MAX\b" packages tests --glob '*.ts*' -l`
  → `schemas/blocks.ts`, `schemas/link-syntax.ts`, `server/nodes/limits.ts`, `server/nodes/markdown-parse.ts`,
  `server/nodes/markdown-rich.ts`, `ui/noeud/en-ligne.ts`, `ui/noeud/editeur/operations.ts` : les seuls
  modifiés ; `LIST_ITEMS_MAX` garde son nom et sa valeur pour les importeurs de `limits.ts`
  (`markdown-parse.ts`). `rg -n "\bisRecord\b" packages/plateforme/ui -l` → `procedure/refus-de-publication.tsx`
  l'importait déjà ; `noeud/rendu-des-blocs.tsx` et `noeud/editeur/modele.ts` le rejoignent.
- **Fonction SQL re-versionnée** (`testing-strategy.md § Non-régression`) : `rg -l "block_search_text" tests` →
  `tests/integration/blocs-zod.test.ts` : vert sur la base locale (2 tests : verdict de chaque cas, dont le
  nouveau `rows: ["x"]` refusé en 23514 ; texte cherchable égal à la ligne de base V1 sur les formes d'avant) ;
  `tests/integration/fixtures/search-content-avant.sql` : fixture lue par `tests/integration/recherche-fautes.test.ts`,
  qui compare l'ancienne `search_content` à celle du paquet, les deux appelant la même `block_search_text` :
  vert sur la base locale (14 tests).
- **Effet produit** : aucun parcours ne change ; le corps d'un repli se découpe comme avant, hors une ligne de
  clôture suivie d'un blanc Unicode autre qu'espace ou tabulation, qui ne ferme plus la clôture, comme dans
  l'analyse de `write`.
- **Refacto** : proposé, non fait (§ Refacto, `beforeOpenFence`).
