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
| **Vague** | E10, après 1.0.0 ; après E10-S04 et E10-S01 (ordre : E10-S04, E10-S01, E10-S06, E10-S02) |
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
- HTML : aucun bloc ; un `.html` se joint par « Fichier » (E10-S02, D116, D137).
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
Commandes relancées sur le dépôt courant, worktree `e10` (`R` = `C:/apps/oto-pkg/.claude/worktrees/e10`), après la
correction 1 ; les rangs sont ceux de l'arbre de travail.

- Insertion : `rg -n "insererApres|insererEnTete|gestes.inserer" R/packages/plateforme/ui`
  → `editeur/actions.ts` l. 178, 182, `editeur/gestes.ts` l. 31, `editeur/editeur-de-blocs.tsx`
  l. 104, `editeur/rangee-de-bloc.tsx` l. 254, `editeur/modele.ts` l. 389 (`insererApres`), 411
  (`insererEnTete`). Chacun passe la forme choisie ; « texte » reste le défaut.
- Formes : `rg -n "formeDe\(|FORMES_ECRITES|FORMES\[|FORMES_EN_LIGNES|PREFIXES" R/packages/plateforme/ui`
  → `editeur/actions.ts` l. 67 (`aEnvoyer`), 133 (`envoyerLeTexte`), 151 (`retirerSiVide`),
  `editeur/gestes-du-menu.ts` l. 120, `editeur/clavier.ts` l. 37-38, 55, 88, `editeur/rangee-de-bloc.tsx`
  l. 92, 163, 213, `editeur/choix-de-bloc.tsx` l. 22, 26, `editeur/modele.ts` (`avecForme`, `ecrireTexte`,
  `fusionner`). Ce qui change : un repli a une forme (`repli`) ; un tableau aussi (`tableau`), hors du menu
  « Style », et `fusionner` ne le fond jamais (focus sur sa rangée, comme un bloc sans forme) ; un séparateur
  reste sans forme (`null`), mais part à l'insertion.
- Vide : `rg -n "estVide\(" R/packages/plateforme/ui/noeud/editeur` → `actions.ts` l. 68, 135, 151, 153, 231,
  `gestes-du-menu.ts` l. 45, 120, `operations.ts` l. 75 : un séparateur n'est jamais vide.
- Tests : `rg -ln "insererApres|FORMES_ECRITES|formeDe|ecrireTexte" R/tests` →
  `tests/unit/ui-editeur-modele.test.ts`, `tests/unit/ui-editeur-blocs-de-page.test.ts`,
  `tests/integration/components/e10s06-editeur.test.tsx`.
- Correction 1, lecteur du tableau simple : `rg -n "tableauDe\(|matriceDe|simpleTableOf|tableCells\(" R/packages/plateforme R/tests`
  → `simpleTableOf` (`schemas/blocks.ts`) lu par `ui/noeud/rendu-des-blocs.tsx` (`TableauSimple`),
  `editeur/modele.ts` (`texteDe`, `premiersMots`), `editeur/operations.ts` (`telQuIlPart`, `messageDeLaForme`),
  `editeur/tableau-edite.tsx`, `editeur/gestes-du-menu.ts` (`convertirEnTableau`) ; `tableauDe` et `matriceDe`
  n'existent plus ; `tableCells` (liste plate des cellules, sautant ce qui n'est pas une chaîne) reste lu par
  `server/nodes/links.ts`, `server/procedures-check.ts` et `ui/noeud/corps-du-noeud.tsx`, inchangé.
- Correction 1, lignes de repli : `rg -n "isToggleFence|ligneDeRepli|startsWith\(\"<details" R/packages/plateforme R/tests`
  → `isToggleFence` (`schemas/blocks.ts`) lu par `isToggleBody`, `editeur/operations.ts` l. 90,
  `server/nodes/markdown-rich.ts` l. 168 (`parseToggle`) ; `ligneDeRepli` n'existe plus.
- Correction 1, gestes : `rg -n "\.saisir\(|saisir:|choix\.suivre" R/packages/plateforme/ui/noeud R/tests` →
  `editeur/gestes.ts` l. 39, `editeur/champ-de-bloc.tsx` l. 283 (seul appelant ; aucune doublure de test) ;
  `rg -n "premiersMots\(" R/packages/plateforme/ui R/tests` → `editeur/rangee-de-bloc.tsx` l. 156, 214 (noms de la
  poignée, du « + » et des champs ; un séparateur n'a pas de champ) ; `rg -n "modifierLeBloc" R/packages/plateforme/ui R/tests`
  → `editeur/tableau-edite.tsx` l. 56, `editeur/repli-edite.tsx` l. 28 ; `rg -n "RefusDeNiveau" R/packages R/tests` →
  `editeur/blocs-de-page.ts` seul.
- Correction 2 : `rg -n "suivantHorsDe|tabulable|horsDeLaTabulationUnInstant|sortirDuBlocAuClavier" R/packages/plateforme R/tests`
  → `editeur/rangee-de-bloc.tsx` seul (l. 118, 134, 151, 261 ; `suivantHorsDe` n'existe plus, sa recherche est en ligne
  dans `sortirDuBlocAuClavier`) ; `rg -n "tableauSimple" R/packages/plateforme/ui R/tests` → `editeur/rangee-de-bloc.tsx`
  l. 80, 105, 240-241 seul ; `rg -n "attendreLeChoix|annulerLeDiffere\(" R/packages/plateforme/ui/noeud R/tests` →
  `editeur/actions.ts` (l. 251-262, `saisir`), `editeur/gestes.ts` l. 38-39 (signature inchangée) ;
  `rg -n "checkVisibility|getClientRects" R/packages/plateforme/ui R/src` → `editeur/rangee-de-bloc.tsx` seul.

### Doublons
- `component-registry.md` (EditeurDeBlocs, primitives du design system) et
  `rg -n "DropdownMenu|CommandPalette|ListeACiter" …/ui` : le menu de création du rail
  (`MenuDeCreation`, `ui/coque/creation-dans-le-rail.tsx`) crée des nœuds, pas des blocs. Verdict :
  laisser. `DropdownMenu` et la liste de `citer.tsx` : **réutilisés**. `CommandPalette` (dialogue
  plein écran) : ne pas l'utiliser pour un choix sous le champ ; seul `fuzzyScore` est repris.
- Tableau éditable : aucun hors de la grille d'E07-S03 (`ui/tableau/grille.tsx`), qui écrit des
  lignes typées d'un nœud `table` par `table.write`. Verdict : laisser ; un bloc de page n'a ni
  schéma ni clé.
- Correction 1, élément suivant dans la tabulation : `rg -n -i "focusable|focalisable|tabbable|compareDocumentPosition" R/packages/plateforme/ui`
  → `FOCALISABLES` de `ui/equipes/onglets.tsx` (non exporté : un panneau d'onglet a-t-il un élément focalisable ?).
  Verdict : laisser ; la sortie du bloc cherche le premier élément de la tabulation après la rangée, par `tabIndex`,
  sans sélecteur à partager.

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
- Fait en correction 1 (décision du pilote) : les trois lecteurs du `data` d'un tableau simple (`tableauDe`,
  `matriceDe`, `chaines` de `TableauSimple`) fondus en `simpleTableOf` ; le prédicat d'une ligne de repli, recopié
  par `ligneDeRepli`, exporté de `schemas/blocks.ts` (`isToggleFence`).

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
- **HN-E10S06-6** (implémentation) : le « + » d'une page vide n'est pas codé ; le message et le bouton de la page
  vide, `insererEnTete` et sa signature restent ceux d'aujourd'hui, et aucun test ne vise ce cas. AC-a1 s'applique au
  « + » d'un bloc, AC-a2 à tout Texte vide (source : consigne du pilote, décision JB 2026-09-29, E11-S12 remplace la
  page vide par un premier Texte créé et focalisé).
- **HN-E10S06-7** (implémentation) : les bornes d'un ajout (« 20 colonnes au plus. », « 200 rangées au plus. ») et
  les refus d'un niveau de liste se disent dans la ligne d'annonce de l'éditeur (`LigneDAnnonce`, `role="status"`),
  comme AC-a6 le dit d'un niveau : rien n'a changé, rien n'est refusé à l'envoi. Le message sous le champ reste celui
  du contrôle, qui retient un envoi (21 colonnes forcées dans le modèle) (source : AC-a6, la plus simple).
- **HN-E10S06-8** (implémentation) : `Tab` et `Maj+Tab` agissent sur la ligne du curseur ; les lignes qui la suivent
  gardent leur indentation et se relisent comme l'éditeur les lit (`elementsLus`). `Maj+Tab` sur une ligne du premier
  niveau ne change rien et l'annonce (« Cette ligne est déjà au premier niveau. ») ; `Tab` sur une ligne qui
  descendrait de deux niveaux sous celle d'avant dit « Rien au-dessus de cette ligne. » (source : AC-a6 parle de « la
  ligne » ; même annonce que la première ligne, la plus simple).
- **HN-E10S06-9** (implémentation) : un repli ne se fond pas plus qu'un tableau (Retour arrière au début d'un bloc,
  Suppr à la fin du précédent) : le focus va à sa rangée (source : résumé et corps se perdraient dans un texte ;
  « `fusionner` ne fond jamais un tableau », Rayon d'impact).
- **HN-E10S06-10** (implémentation, revue en correction 1) : tant que la liste de « / » est ouverte, le Texte attend le
  choix d'un bloc : le différé de 1 200 ms ne l'écrit pas, et la frappe qui ouvre la liste désarme celui qu'une frappe
  d'avant avait armé (taper « a », l'effacer, taper « / » en moins de 1 200 ms) ; la sortie du champ ou ⌘S, si. Liste
  fermée (Échap, ou un texte qui ne commence plus par `/`), un texte comme « /etc » part au différé comme tout texte, dès
  la frappe suivante. Sans cela, un Texte neuf « / » partait, puis le bloc choisi, laissé vide, le retirait avec « Bloc
  supprimé. » (source : la plus simple, HN-E05S08-1 ; l'attente suit l'état de la liste, `useChoixParBarre`, pas la forme
  du texte).
- **HN-E10S06-11** (implémentation) : la liste de « / » garde l'ordre du menu tant que rien ne suit `/`, puis met les
  meilleures entrées d'abord (`fuzzyScore`, comme la palette ⌘K) ; la casse et les accents sont retirés par
  `normalizeTitle` (`schemas/blocks-render.ts`), déjà partagé (source : `command-palette.tsx`, `retenues`).
- **HN-E10S06-12** (implémentation) : « Séparateur » choisi par « / » suit AC-a1 (focus à sa poignée) ; le Texte neuf
  d'AC-a4 suit `---` tapé seulement (source : AC-a1, « ou à sa poignée pour un séparateur »).
- **HN-E10S06-13** (implémentation) : dans un tableau, `Entrée` sur la dernière rangée ne fait rien (`Tab` dans la
  dernière cellule ajoute la rangée) ; `Maj+Tab` dans la première cellule sort du tableau ; la cellule courante du menu
  est la dernière qui a eu le focus, la première cellule d'en-tête avant tout focus (source : AC-b1 ne nomme que
  `Tab` pour ajouter ; la plus simple).
- **HN-E10S06-14** (implémentation) : une cellule montre son markdown tel qu'il est gardé (`\|`), comme un Texte le
  sien ; à l'envoi, seul un `|` qui n'est pas déjà précédé d'un `\` devient `\|` (source : `isCell`, E10-S04 AC-a1 ;
  l'échappement reste le même d'un envoi à l'autre).
- **HN-E10S06-15** (implémentation) : un Texte devenu repli perd les lignes blanches de bord de son corps ; à l'envoi,
  le résumé perd ses blancs de bord et le corps ses lignes blanches de bord (source : le schéma les refuse,
  `isToggleBody` ; comme « un blanc de bord est retiré à l'envoi » d'une cellule).
- **HN-E10S06-16** (implémentation) : un tableau aux cellules vides est un bloc vide (`estVide`) : neuf, il ne part
  qu'avec sa première frappe ; servi puis vidé, il part en `delete_block` avec « Annuler » quand le focus quitte sa
  rangée, comme un Texte vidé. Un geste du menu d'un tableau part comme une frappe (différé, ⌘S, sortie) ; en conflit,
  un tableau se compose en texte, une rangée par ligne, une tabulation par cellule, le format d'un tableur (source :
  E05-S10 AC-a4, HN-E05S08-7 ; un seul panneau de conflit).
- **HN-E10S06-17** (implémentation) : le collage d'un tableur ignore sa fin de ligne finale et lit `\r\n` (source : un
  tableur copie avec un saut de ligne final).
- **HN-E10S06-18** (implémentation) : le menu d'un séparateur n'a pas de groupe « Style » ni « Ce bloc se modifie par
  votre assistant. » (source : un séparateur n'a rien à écrire).
- **HN-E10S06-19** (correction 1) : `Tab` sans Maj sur la poignée d'une liste à puces, d'une liste numérotée ou d'un
  tableau simple (les blocs dont le champ garde `Tab`) porte le focus au premier élément de la tabulation qui suit la
  rangée : `tabIndex` positif ou nul, ni désactivé, ni sous `[hidden]` ou `[inert]`, ni rendu nulle part (contenu d'un
  `<details>` fermé, par le sélecteur `details:not([open]) > :not(summary)` ; `display: none`, par `checkVisibility()`
  là où le navigateur l'a, jsdom ne calculant pas le rendu) ; c'est le « + » du bloc suivant, ou ce qui suit l'éditeur.
  Rien après la rangée (le dernier bloc d'une page : dans l'hôte de référence, rien ne suit `<Content>`) : la touche reste
  au navigateur, qui sort de la page, et les éléments de la tabulation de la rangée qui suivent la poignée (le champ, les
  cellules) passent à `tabIndex = -1` le temps de son geste ; au `setTimeout(0)` suivant, que le focus ait bougé ou non,
  chacun retrouve son attribut `tabindex` tel qu'il était (retiré s'il n'en avait pas). Les autres blocs gardent l'ordre
  du DOM (poignée, puis champ, d'où `Tab` sort) ; `Maj+Tab` et l'ouverture du menu (Entrée, Espace, flèche) sont
  inchangés (source : décision du pilote, option a ; AC-a6 « d'où `Tab` sort du bloc » ; la plus simple sans régression
  des autres blocs ; `tabIndex` sauvegardé plutôt qu'`inert`, que jsdom n'applique pas au focus et qui retirerait aussi le
  champ de l'arbre d'accessibilité).
- **HN-E10S06-20** (correction 1) : `---`, `***` ou `___` ne fait un séparateur que si le Texte valait juste avant un
  début de la marque (vide, `-`, `--`…) : la marque se tape ; « ---x » raccourci en `---` reste un Texte (source : AC-a4,
  « un Texte vide » ; même règle que les préfixes, qui ne comptent que tapés).
- **HN-E10S06-21** (correction 1) : le seul lecteur du `data` d'un tableau simple est `simpleTableOf`
  (`schemas/blocks.ts`, à côté de `tableCells`, importable par le rendu sans l'éditeur) : ce qui n'est pas un tableau se
  lit vide, une cellule qui n'est pas une chaîne `""`, un alignement inconnu `null` (la conversion `String(x)` de
  `matriceDe` disparaît : le schéma n'écrit que des chaînes). « Convertir en tableau de données » n'est au menu que d'un
  tableau simple qui a au moins une colonne (le schéma en veut une), et ne fait rien pour un autre bloc (source : décision du pilote ;
  `portage-ecrans.md § 6`, lecteur partagé par l'écran et lisible du serveur ; la forme défensive la plus simple).

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

Aucun invariant touché : ni schéma, ni route, ni outil MCP ; l'écran écrit les formes d'E10-S04 et chaque envoi passe
`controler` puis `blockInputSchema`.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `itemsDuChoix`, `choixRetenus`, `useChoixParBarre`, `ListeDesChoix` | `packages/plateforme/ui/noeud/editeur/choix-de-bloc.tsx` | Entrées du « + » et de « / », en deux groupes ; liste sous le champ (`oto-pop oto-citer`, option désignée par le champ) |
| `TableauEdite`, `itemsDuTableau` | `packages/plateforme/ui/noeud/editeur/tableau-edite.tsx` | Grille d'`Input` nommés par leur en-tête ; menu de la poignée d'un tableau simple |
| `RepliEdite` | `packages/plateforme/ui/noeud/editeur/repli-edite.tsx` | Résumé (`Input`) et corps (`oto-input`) d'un repli |
| `avecTableau`, `TABLEAU_NEUF`, `ecrireCellule`, `ajouterRangee`, `ajouterColonne`, `retirerRangee`, `retirerColonne`, `aligner`, `celluleVoisine`, `echapperLesBarres`, `celluleEnvoyee`, `texteDuTableau`, `tableauDuTexte`, `tableauColle`, `sansLignesBlanchesDeBord`, `texteDuRepli`, `repliDuTexte`, `niveauDeLigne`, `positionDansLaLigne`, `numerosDeGouttiere` ; types `Tableau`, `Alignement` (alias de `SimpleTable`, `SimpleTableAlign`) | `packages/plateforme/ui/noeud/editeur/blocs-de-page.ts` | Modèle pur du tableau, du repli, des niveaux de liste et de la gouttière |
| `simpleTableOf`, types `SimpleTable`, `SimpleTableAlign` ; `isToggleFence` (correction 1) | `packages/plateforme/schemas/blocks.ts` | Seul lecteur du `data` d'un tableau simple (rendu, éditeur, conversion) ; ligne qui ouvre ou ferme un repli, lue par `isToggleBody`, l'analyse (`markdown-rich.ts`) et le contrôle de l'éditeur |
| `Choix`, `remplacerParChoix`, `remplacerLeBloc` ; `insererApres` prend un choix | `packages/plateforme/ui/noeud/editeur/modele.ts` | Bloc choisi au « + » et à « / », bloc écrit par ses propres champs |
| Gestes `remplacerParChoix`, `modifierLeBloc`, `annoncer` ; `inserer(cle, choix)` | `packages/plateforme/ui/noeud/editeur/gestes.ts`, `actions.ts` | Servis aux rangées par le contexte de l'éditeur |
| `CHOIX_DE_BLOC`, `TABLEAU_EDITE`, `REPLI_EDITE`, `NIVEAUX_DE_LISTE` ; `FORMES.repli`, `FORMES.tableau` | `packages/plateforme/ui/noeud/libelles.ts` | Libellés du choix, des cellules, du repli, des annonces de niveau |

### Notes

- Lots a et b livrés dans le worktree `e10`, sans commit ni `git add` (l'index porte E10-S04 et E10-S01). Aucune
  migration. Le « + » d'une page vide n'est pas codé (HN-E10S06-6).
- HN-E10S04-14 corrigée : la gouttière d'une liste numérotée ne numérote que les éléments du premier niveau, à partir
  de `start` (`numerosDeGouttiere`, `champ-de-bloc.tsx`) ; tests `ui-editeur-blocs-de-page.test.ts` et
  `e10s06-editeur.test.tsx`.
- Fichiers hors de la liste de la story, avec leur raison : `ui/noeud/editeur/blocs-de-page.ts` (`modele.ts` aurait
  dépassé `max-lines`, 300) ; `tests/integration/components/procedure.test.tsx`, `tests/e2e/e05s10a-edition.spec.ts`,
  `tests/e2e/page.spec.ts`, `tests/e2e/procedure-et-contexte.spec.ts` (le « + » ouvre désormais un choix : chacun
  choisit « Texte » après son clic, AC-a1 ; la liste des styles de `procedure.test.tsx` gagne « Repli », AC-a3).
- Attendus d'avant changés par la story : `FORMES_ECRITES` et la liste des styles du menu gagnent « Repli »
  (`ui-editeur-modele.test.ts`, `editeur-de-blocs.test.tsx`, `procedure.test.tsx`) ; les clics sur le « + » de
  `editeur-de-blocs.test.tsx` passent par `ajouterUnTexteApres`.
- Spec E2E écrite (`tests/e2e/e10s06-editeur.spec.ts`), non lancée : elle demande le projet Supabase et un serveur.
  Contrôle visuel des deux thèmes : par ses captures, au passage du pilote.
- Refacto repéré à la livraison (trois lecteurs du `data` d'un tableau simple) : fait en correction 1.

### Correction 1 (revue d'E10-S06)

Reprise après l'arrêt d'un premier agent de correction : aucune de ses éditions n'était restée (type-check vert,
aucun point appliqué) ; tout est repris depuis la livraison.

- **HAUTE, sortie vers l'avant au clavier** (AC-a6, `accessibility-patterns.md § Keyboard Navigation`) : `Tab` sur la
  poignée d'une liste à puces, d'une liste numérotée ou d'un tableau simple va au premier élément de la tabulation après
  la rangée (`rangee-de-bloc.tsx`, `sortirDuBlocAuClavier`, posé sur la poignée et chaîné par `Anchor` avant
  l'ouverture du menu) ; HN-E10S06-19. Tests : `e10s06-editeur.test.tsx` (liste puis tableau : Échap, poignée, `Tab`
  hors du bloc ; `Maj+Tab` non pris) ; la spec E2E presse `Tab` après Échap sur la liste.
- **MOYENNE, trois lecteurs du tableau simple** (`coding-standards.md § DRY`) : `simpleTableOf` (`schemas/blocks.ts`),
  lu par `TableauSimple`, `convertirEnTableau`, le modèle, le contrôle et la grille ; `premiersMots` le lit aussi (un
  quatrième lecteur, des colonnes). HN-E10S06-21. Tests existants inchangés.
- **MOYENNE, prédicat du corps de repli recopié** (`portage-ecrans.md § 6`) : `isToggleFence` exporté de
  `schemas/blocks.ts`, lu par `isToggleBody`, `operations.ts` et `parseToggle` (`server/nodes/markdown-rich.ts`) ;
  `ligneDeRepli` retiré.
- **MOYENNE, assertions `as` nues** (`coding-standards.md § TypeScript`) : `zone()` dans `e10s06-editeur.test.tsx`,
  garde `instanceof`, reprise par `texteNeuf`.
- **BASSE** : Retour arrière ne revient au résumé que depuis un corps vide (`repli-edite.tsx`, test adapté) ;
  `modifierLeBloc` ne fait rien pendant un conflit (`verrouille`, `actions.ts`) ; séparateur tapé seulement depuis un
  début de la marque (HN-E10S06-20, test unitaire) ; l'attente du différé suit la liste de « / » ouverte
  (`useChoixParBarre.suivre` rend son état, `saisir(cle, texte, attendreLeChoix)`, HN-E10S06-10, test d'intégration) ;
  un séparateur se nomme « Séparateur » dans sa poignée et son « + » (`premiersMots`, tests et spec E2E adaptés) ;
  `RefusDeNiveau` non exporté ; rayon d'impact recalculé sur le dépôt courant.
- Fichiers touchés hors de la liste de la story, avec leur raison : `schemas/blocks.ts` (lecteur et prédicat
  partagés), `ui/noeud/rendu-des-blocs.tsx` et `ui/noeud/editeur/gestes-du-menu.ts` (décision du pilote),
  `server/nodes/markdown-rich.ts` (prédicat du repli), `ui/noeud/editeur/choix-de-bloc.tsx` (état de la liste rendu à la
  frappe).

### Correction 2 (seconde revue d'E10-S06)

- **HAUTE, sortie vers l'avant depuis le dernier bloc** (AC-a6, `accessibility-patterns.md § Keyboard Navigation`) :
  rien ne suivait la rangée (fin de page ; rien ne suit `<Content>` dans l'hôte de référence), la touche restait au
  navigateur, qui entrait dans le champ de la même rangée, lequel garde `Tab` : aucune sortie. Désormais, dans ce cas, les
  éléments de la tabulation de la rangée qui suivent la poignée passent à `tabIndex = -1` le temps de l'action par défaut,
  puis retrouvent leur attribut au `setTimeout(0)` suivant, que le focus ait bougé ou non
  (`rangee-de-bloc.tsx`, `horsDeLaTabulationUnInstant` l. 134, appelée par `sortirDuBlocAuClavier` l. 159) ;
  HN-E10S06-19 réécrite. Test : `e10s06-editeur.test.tsx`, `it.each` liste puis tableau en dernier bloc, rien après
  l'éditeur : le défaut n'est pas annulé, aucun élément tabulable ne suit la poignée au moment de l'événement, puis
  chaque champ revient à `tabIndex` 0 sans attribut `tabindex`, le focus resté sur la poignée.
- **BASSE, différé d'une frappe antérieure** (HN-E10S06-10) : la frappe qui ouvre la liste de « / » désarme le différé
  (`actions.ts`, `saisir`, l. 262). Test : « a », effacé, « / » en moins de 1 200 ms, choix par Entrée, sortie de la
  rangée : aucun envoi, aucune annonce « Bloc supprimé. ».
- **BASSE, éléments non rendus** : `tabulable` (`rangee-de-bloc.tsx` l. 118) écarte le contenu d'un `<details>` fermé
  (sélecteur, valable en jsdom) et ce que `checkVisibility()` dit non rendu, là où le navigateur l'a (variante retenue :
  `getClientRects()` est vide pour tout élément en jsdom et aurait demandé un repli propre au test). Test : un bouton dont
  `checkVisibility` répond non (le navigateur le dirait d'un `display: none`) et un bouton dans un `<details>` fermé, après
  l'éditeur, sont sautés jusqu'à « Ailleurs ».
- **BASSE, « Convertir en tableau de données »** : absent du menu d'un tableau simple sans colonne
  (`rangee-de-bloc.tsx` l. 240) ; le garde de `convertirEnTableau` reste. HN-E10S06-21 ajustée. Test : menu d'un tableau
  sans colonne sans l'entrée, menu d'un tableau à une colonne avec.
- Fichiers touchés : `ui/noeud/editeur/rangee-de-bloc.tsx`, `ui/noeud/editeur/actions.ts`,
  `tests/integration/components/e10s06-editeur.test.tsx` (`monter` reçoit ce qui suit l'éditeur, « Ailleurs » par défaut),
  cette story.
