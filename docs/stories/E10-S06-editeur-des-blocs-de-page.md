# Story E10-S06 — Éditeur des blocs de page : choix du « + » et de `/`, tableau simple, séparateur, repli, niveaux de liste, préfixes de titre

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E10 — Contenus riches |
| **Parcours** | 4.4 Concevoir et mettre à jour |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : menus et champs de l'éditeur existant (`ui/noeud/editeur/`), menu du design system (`DropdownMenu`, `ui/ds/react/overlays.tsx`), liste sous le champ de « @ » (`editeur/citer.tsx`) |
| **Conventions** | forms, portage, a11y, state, testing |
| **Estimation** | L : deux lots séquentiels dans un seul worktree (a choix, séparateur, préfixes, niveaux de liste M ; b tableau simple et repli M) |
| **Vague** | E10, après 1.0.0 ; après E10-S04 et E10-S01 (ordre : E10-S04, E10-S01, E10-S06, E10-S02, E10-S03, E10-S05) |
| **Dépend de** | E10-S04 (types `simple_table`, `divider`, `toggle`, listes `{text, children}`, niveaux 1 à 5, lecture sans perte d'AC-b2) ; E10-S01 AC-a1 (collage dans `champ-de-bloc.tsx`, qu'AC-b3 étend) |
| **Porteuse de migration** | Non |

## Contexte

E10-S04 apprend aux pages les formes du markdown ; l'éditeur ne sait pas encore les écrire. JB,
2026-09-28 (fiche D116) : le « + » d'un bloc ouvre un choix en deux groupes, et `/` ouvre le même
choix. Fiche D115 A et décision du pilote C5 : un seul « Titre » au menu, et des préfixes tapés
alignés sur le markdown collé. Cette story reprend l'ancien lot d d'E10-S04 (décision du pilote
C4).

Aujourd'hui (relevé du 2026-09-28) : le « + » d'une rangée insère un Texte
(`rangee-de-bloc.tsx` l. 172 → `actions.ts` l. 165 → `modele.ts`, `insererApres`, forme `"texte"`
par défaut) ; le menu du bloc liste `FORMES_ECRITES` sous « Style » (`rangee-de-bloc.tsx` l. 72) ;
les préfixes sont `# `, `- `, `* `, `1. ` (`modele.ts`, `PREFIXES`) ; `Tab` ne sert qu'à choisir
dans la liste de « @ » (`champ-de-bloc.tsx`).

**Refs :**
- PRD : FR-CONC-10
- ADR-011 § 2 ; fiche D115, D116 ; E05-S10 AC-a2 (menu du bloc) et AC-a5 (un seul « Titre » au
  menu) ; E05-S08 AC4 (focus sur la poignée d'un bloc sans champ)

## Périmètre

- Le choix du « + » et de `/`, et le « + » d'une page vide.
- Écrire un tableau simple, un séparateur et un repli.
- Monter et descendre d'un niveau dans une liste.
- Préfixes de titre de `# ` à `###### `.

## Hors périmètre

- Image et Fichier dans le groupe « Insérer » : E10-S02 (seulement si le stockage est configuré).
- HTML : jamais dans le choix ; un artefact est une page créée depuis le rail (E10-S03 AC4, D116).
- Collage de markdown et mode tolérant : E10-S01.
- Convertir un tableau simple en tableau de données : E10-S01 (C3).
- Plusieurs niveaux de « Titre » au menu : écarté par JB (D115 A).

## Critères d'acceptation

Les refus de cette story sont ceux du contrôle de l'éditeur (`operations.ts`, `controler`,
message sous le champ, rien ne part) ; un refus du service (`invalid_arguments`) suit le chemin
d'aujourd'hui (`resolution.ts`).

### Lot a — Choix, séparateur, préfixes, niveaux de liste

- [ ] **AC-a1 — Le « + » ouvre un choix.**
  - **Given** une personne qui écrit une page **When** elle clique le « + » d'un bloc (ou celui
    d'une page vide, `editeur-de-blocs.tsx`) **Then** un menu s'ouvre, en deux groupes :
    « Texte » (Texte, Titre, Liste à puces, Liste numérotée, Liste à cocher, Citation, Code, Repli)
    et « Insérer » (Tableau simple, Séparateur).
  - **When** elle choisit une entrée **Then** le bloc est inséré après le bloc courant (en tête
    pour une page vide) et le focus va à son premier champ, ou à sa poignée pour un séparateur.
  - Clavier : flèches, `Entrée` choisit, `Échap` ferme et rend le focus au « + ». « HTML » n'y
    figure jamais.
- [ ] **AC-a2 — `/` ouvre le même choix.** **Given** un Texte vide **When** la personne tape `/`
  **Then** la même liste s'ouvre sous le champ, filtrée par ce qu'elle tape ensuite (`fuzzyScore`,
  sans casse ni accent) ; `Entrée` ou `Tab` choisit et remplace le Texte par le bloc choisi ;
  `Échap` ferme la liste et garde le texte tapé ; aucune entrée ne correspond : « Aucun bloc » et
  le texte reste. Un `/` tapé ailleurs qu'au début d'un Texte vide reste du texte.
- [ ] **AC-a3 — Menu du bloc.** **Given** le menu de la poignée d'un bloc écrivable **Then**
  « Style » garde un seul « Titre » et ajoute « Repli » ; les blocs « Insérer » n'y figurent pas
  (ils ne se convertissent pas depuis un texte). **When** un Texte devient Repli **Then** sa
  première ligne devient le résumé, coupée à 200 caractères (le reste de la ligne ouvre le corps),
  et les autres lignes le corps. **When** un Repli devient une autre forme **Then** son texte est le
  résumé, une ligne vide, puis le corps.
- [ ] **AC-a4 — Séparateur.** **Given** un Texte vide **When** la personne y tape exactement `---`,
  `***` ou `___` **Then** il devient un séparateur, un Texte neuf s'ouvre après lui et reçoit le
  focus. Un séparateur n'a pas de champ : il se déplace, se duplique et se supprime par sa poignée
  (E05-S08 AC4), et un séparateur neuf part à l'insertion (il n'est jamais « vide »).
- [ ] **AC-a5 — Préfixes de titre** (C5, D115 A). **Given** un Texte **When** la personne tape
  au début `# ` ou `## ` **Then** un titre de niveau 1 ; `### ` → 2, `#### ` → 3, `##### ` → 4,
  `###### ` → 5 (le préfixe disparaît, comme aujourd'hui). Le menu dit « Titre » quel que soit le
  niveau ; « Style » → « Titre » donne le niveau 1 ; un titre garde son niveau en base et s'affiche
  selon lui (E10-S04 AC-b3).
- [ ] **AC-a6 — Niveaux de liste.** **Given** une ligne d'une liste à puces ou numérotée **When** la
  personne tape `Tab` **Then** la ligne descend d'un niveau sous l'élément qui la précède : deux
  espaces et la marque du sous-niveau (`- ` sous une liste à puces, `1. ` sous une liste numérotée,
  modifiable en la retapant) ; `Maj+Tab` la remonte. Au-delà de trois niveaux, ou sur la première
  ligne, rien ne change et une annonce le dit (« Trois niveaux de liste au plus. », « Rien au-dessus
  de cette ligne. »). La liste à cocher n'a pas de sous-niveaux (HN-E10S04-2) : `Tab` y garde son
  rôle. Quand la liste de « @ » est ouverte, `Tab` y choisit (inchangé). `Échap` rend le focus à la
  poignée, d'où `Tab` sort du bloc.

### Lot b — Tableau simple et repli

- [ ] **AC-b1 — Tableau simple inséré et écrit.**
  - **Given** « Tableau simple » choisi **Then** un tableau de 3 colonnes et 3 rangées vides
    (en-tête compris) est inséré, le focus dans la première cellule d'en-tête.
  - Une cellule est un champ d'une ligne : `Tab` et `Maj+Tab` passent à la cellule suivante ou
    précédente, `Tab` dans la dernière ajoute une rangée ; `Entrée` passe à la cellule de dessous ;
    un blanc de bord est retiré à l'envoi ; un `|` tapé part en `\|`.
  - Le tableau part en un seul `replace_block` (ou `insert_after` s'il est neuf) quand le focus
    quitte le tableau, sur ⌘S ou 1 200 ms après la dernière frappe, comme un Texte.
  - **Given** 20 colonnes ou 200 rangées **When** la personne en ajoute une **Then** rien n'est
    ajouté et le message dit la borne (« 20 colonnes au plus. », « 200 rangées au plus. »).
- [ ] **AC-b2 — Menu d'un tableau simple.** **Given** le menu de sa poignée **Then** il ajoute une
  rangée ou une colonne après la cellule courante, retire la rangée ou la colonne courante (jamais
  la dernière colonne ni l'en-tête) et règle l'alignement de la colonne courante (aucun, gauche,
  centre, droite).
- [ ] **AC-b3 — Collage d'un tableur.** **Given** un Texte vide **When** la personne colle un texte
  d'au moins deux lignes dont chacune porte le même nombre, au moins un, de tabulations **Then** il
  devient un tableau simple, première ligne en en-tête, cellules rognées, `|` échappés. Au-delà de
  20 colonnes ou de 200 rangées, le collage suit E10-S01 AC-a1 (texte).
- [ ] **AC-b4 — Repli.** **Given** un repli dans l'éditeur **Then** il est ouvert et s'écrit en
  deux champs : le résumé (une ligne, 200 caractères au plus, « Le résumé tient en 200
  caractères. ») puis le corps (plusieurs lignes). `Entrée` dans le résumé passe au corps ;
  Retour arrière au début du corps vide revient au résumé. Un résumé vide n'est pas envoyé : le
  message « Le repli a besoin d'un résumé. » reste sous le champ. Une ligne du corps qui commence
  par `<details` ou vaut `</details>` est refusée (« Un repli ne contient pas d'autre repli. »,
  E10-S04 AC-a3).

## Implémentation

### Fichiers à créer
- `ui/` : `packages/plateforme/ui/noeud/editeur/choix-de-bloc.tsx` (entrées communes au « + » et
  à `/`, liste sous le champ), `packages/plateforme/ui/noeud/editeur/tableau-edite.tsx`,
  `packages/plateforme/ui/noeud/editeur/repli-edite.tsx`
- `tests/` : `tests/unit/ui-editeur-blocs-de-page.test.ts`,
  `tests/integration/components/e10s06-editeur.test.tsx`, `tests/e2e/e10s06-editeur.spec.ts`

### Fichiers à modifier
- **Lot a**
  - `ui/noeud/editeur/modele.ts` : `FORMES_ECRITES` (+ `repli`), `Forme`, `PREFIXES` (avec
    niveau), `formeDe`, `avecForme`, `PROPRES_A_LA_FORME` (+ `summary`), `insererApres` et
    `insererEnTete` (forme choisie, séparateur), `ecrireTexte` (`---`), une fonction pure de
    niveau de ligne (`Tab`, `Maj+Tab`).
  - `ui/noeud/editeur/rangee-de-bloc.tsx` : l. 72 (`stylesDuMenu`, Repli), l. 172 (« + » ouvre le
    choix), rangée d'un séparateur.
  - `ui/noeud/editeur/actions.ts` : l. 165-166 (`inserer`, `insererEnTete` reçoivent la forme).
  - `ui/noeud/editeur/gestes.ts` : l. 19-20 (signatures d'`inserer` et `insererEnTete`).
  - `ui/noeud/editeur/editeur-de-blocs.tsx` : l. 104 (« + » d'une page vide).
  - `ui/noeud/editeur/champ-de-bloc.tsx` : `/`, `Tab` dans une liste.
  - `ui/noeud/editeur/clavier.ts` : `Tab`, `Maj+Tab`.
  - `ui/noeud/editeur/operations.ts` : `estVide` (un séparateur n'est pas vide), `controler`.
  - `ui/noeud/libelles.ts` : `FORMES`, `MENU_DU_BLOC`, libellés du choix et des messages.
  - `tests/unit/ui-editeur-modele.test.ts`, `tests/unit/ui-editeur-operations.test.ts`,
    `tests/integration/components/editeur-de-blocs.test.tsx`.
- **Lot b**
  - `ui/noeud/editeur/rangee-de-bloc.tsx` (rangée d'un tableau et d'un repli),
    `ui/noeud/editeur/actions.ts` (`envoyerLeTexte` : tableau et repli partent comme un bloc
    écrit), `ui/noeud/editeur/modele.ts` (`formeDe` : `tableau`, hors de `FORMES_ECRITES`),
    `ui/noeud/editeur/operations.ts` (`controler` : bornes, résumé), `ui/noeud/editeur/champ-de-bloc.tsx`
    (collage d'un tableur), `ui/noeud/libelles.ts`.

### Migrations prévues
Aucune : les formes existent en base depuis E10-S04.

### Schémas Zod partagés
Aucun nouveau : `blockInputSchema` (`schemas/blocks.ts`, formes d'E10-S04) contrôle chaque envoi
par `controler`.

### Points de départ
- Aucun dans la maquette du banc ni dans Oto (oto-frontend n'a ni `/` ni tableau éditable).
- Repris de l'existant : `DropdownMenu` et ses groupes (`ui/ds/react/overlays.tsx`, déjà employé
  par `stylesDuMenu`) pour le « + » ; la liste sous le champ, `aria-activedescendant` et les
  classes `oto-pop`, `oto-menu-item` de `ListeACiter` (`editeur/citer.tsx`) pour `/` ; `fuzzyScore`
  (`ui/ds/react/command-palette.tsx`) pour le filtre ; `Input` (`ui/ds/react/forms.tsx`) pour les
  cellules et le résumé ; classes `oto-table` du rendu d'E10-S04.

### Patterns à suivre
- `accessibility-patterns.md` : menu à rôles, focus rendu au déclencheur, cellules nommées par
  leur en-tête (`aria-label`), annonces par la région existante de l'éditeur.

### Canaux de sécurité
- **Fermé — HTML du presse-papiers** : le collage d'un tableur ne lit que `text/plain` ; une
  cellule est du texte, rendu par React. Test : `e10s06-editeur.test.tsx` (un collage `text/html`
  avec `<img onerror>` donne du texte).
- **Fermé — contournement des contrôles** : tout envoi passe `controler` puis le service
  (`blockInputSchema`, contraintes d'E10-S04). Test : un tableau de 21 colonnes forcé dans le
  modèle est refusé avant l'envoi.
- Aucun canal ouvert : aucune adresse, aucun appel réseau nouveau.
- `state-management.md` : modèle pur (`modele.ts`) testé sans rendu ; la rangée tient l'état du
  tableau.

## Rayon d'impact

### Appelants
- Insertion : `rg -n "insererApres|insererEnTete|gestes.inserer" C:/apps/oto-platform/packages/plateforme/ui`
  → `editeur/actions.ts` l. 165-166, `editeur/gestes.ts` l. 19-20, `editeur/editeur-de-blocs.tsx`
  l. 104, `editeur/rangee-de-bloc.tsx` l. 172, `editeur/modele.ts` (`insererApres`,
  `insererEnTete`). Chacun passe la forme choisie ; « texte » reste le défaut.
- Formes : `rg -n "formeDe\(|FORMES_ECRITES|FORMES\[|FORMES_EN_LIGNES|PREFIXES" C:/apps/oto-platform/packages/plateforme/ui`
  → `editeur/actions.ts` l. 63 (`aEnvoyer`), 128 (`envoyerLeTexte`), 146 (`retirerSiVide`),
  `editeur/gestes-du-menu.ts` l. 22, `editeur/clavier.ts` l. 26-27, 60, `editeur/rangee-de-bloc.tsx`
  l. 72, 101, 138, `editeur/modele.ts` (`avecForme`, `ecrireTexte`, `fusionner`). Ce qui change :
  un repli a une forme (`repli`) ; un tableau aussi (`tableau`), hors du menu « Style », et
  `fusionner` ne le fond jamais (focus sur sa rangée, comme un bloc sans forme) ; un séparateur
  reste sans forme (`null`), mais part à l'insertion.
- Vide : `rg -n "estVide\(" …/ui/noeud/editeur` → `actions.ts`, `gestes-du-menu.ts`,
  `operations.ts` : un séparateur n'est jamais vide.
- Tests : `rg -ln "insererApres|FORMES_ECRITES|formeDe|ecrireTexte" C:/apps/oto-platform/tests` →
  `tests/unit/ui-editeur-modele.test.ts`.

### Doublons
- `component-registry.md` (EditeurDeBlocs, primitives du design system) et
  `rg -n "DropdownMenu|CommandPalette|ListeACiter" …/ui` : le menu de création du rail
  (`MenuDeCreation`, `ui/coque/creation-dans-le-rail.tsx`) crée des nœuds, pas des blocs. Verdict :
  laisser. `DropdownMenu` et la liste de `citer.tsx` : **réutilisés**. `CommandPalette` (dialogue
  plein écran) : ne pas l'utiliser pour un choix sous le champ ; seul `fuzzyScore` est repris.
- Tableau éditable : aucun hors de la grille d'E07-S03 (`ui/tableau/grille.tsx`), qui écrit des
  lignes typées d'un nœud `table` par `table.write`. Verdict : laisser ; un bloc de page n'a ni
  schéma ni clé.

### Effet produit
- Éditeur de toutes les pages, procédures comprises : le « + » ouvre un menu au lieu d'insérer un
  Texte (un clic de plus pour un Texte, `Entrée` sur un bloc vide en ouvre toujours un).
- `write` et `read` : inchangés. Ce que l'écran écrit passe les mêmes contrôles que ce qu'écrit un
  assistant (`blockInputSchema`).
- Partage public et `context` : les blocs écrits à l'écran y paraissent comme ceux d'E10-S04.
- Aucun schéma, aucune route, aucun outil MCP touché.

### Refacto
- Écarté : fondre le menu « Style » et le choix du « + » en un seul composant. Ils diffèrent (le
  menu convertit le bloc courant, le « + » insère) ; seules les entrées sont communes, dans
  `choix-de-bloc.tsx`.

## Hypothèses

- **HN-E10S06-1** : le « + » ouvre un `DropdownMenu`, `/` une liste sous le champ ; les deux lisent
  les mêmes entrées (source : D116, composants existants).
- **HN-E10S06-2** : `Entrée` dans une cellule passe à la cellule de dessous ; un saut de ligne dans
  une cellule s'écrit `<br>` (source : E10-S04 AC-a1, une cellule est une ligne).
- **HN-E10S06-3** : un repli est ouvert dans l'éditeur, fermé en lecture (source : simple ; on
  écrit ce qu'on voit).
- **HN-E10S06-4** : le tableau part en un seul bloc à la sortie du tableau, pas à chaque cellule
  (source : un bloc, une opération, E05-S02).
- **HN-E10S06-5** : les préfixes `# ` et `## ` donnent tous deux le niveau 1 (C5 : le raccourci
  `# ` est gardé, `## ` s'aligne sur le markdown collé).

## Actions JB

Aucune.

## Tests attendus

### Unit tests
- [ ] `ui-editeur-blocs-de-page.test.ts` (modèle pur) : insertion de chaque forme ; préfixes `# ` à
  `###### ` → niveaux 1, 1, 2, 3, 4, 5 ; `---`, `***`, `___` → séparateur puis Texte ; Texte ↔
  Repli dans les deux sens ; `Tab` et `Maj+Tab` (trois niveaux, première ligne, marque du
  sous-niveau) ; tableau (ajout et retrait de rangée et de colonne, alignement, bornes) ; collage
  d'un tableur (colonnes inégales → texte) ; `fusionner` ne fond pas un tableau.
- [ ] `ui-editeur-operations.test.ts` : `estVide` d'un séparateur ; messages de `controler`.
- [ ] Régression : chaque cas de `ui-editeur-modele.test.ts` inchangé (préfixes `- `, `* `, `1. `,
  `# `).

### Integration tests
- [ ] `e10s06-editeur.test.tsx` : « + » (deux groupes, pas de HTML, flèches, `Entrée`, `Échap` qui
  rend le focus au « + ») ; `/` (filtre, « Aucun bloc », `Échap` qui garde le texte) ; tableau
  (`Tab`, dernière cellule, menu, envoi unique en `insert_after` puis `replace_block`) ;
  séparateur ; repli (deux champs, résumé vide refusé) ; niveaux de liste.
- [ ] `editeur-de-blocs.test.tsx` : le « + » d'une page vide ouvre le choix ; `Tab` dans la liste
  de « @ » choisit toujours.
- [ ] MCP : sans objet, aucun outil touché.

### E2E tests
- [ ] `e10s06-editeur.spec.ts` : écrire une page avec le « + » et `/` (titre de niveau 3 par
  `#### `, tableau 3 × 3 rempli au clavier, séparateur, repli, liste à deux niveaux), la relire
  publiée ; contrôle visuel dans les deux thèmes.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
