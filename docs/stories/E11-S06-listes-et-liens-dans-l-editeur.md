# Story E11-S06 — Éditeur : une puce par élément de liste, modifier un lien dans un panneau

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 4.4 Concevoir et mettre à jour |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : primitives du design system (`Input`, `SegmentedControl`, `Button`, surface `oto-pop` de la liste de « @ ») |
| **Conventions** | portage, a11y, registry, forms, security, testing |
| **Estimation** | M : deux lots séquentiels dans un seul worktree (a puces S, b panneau de lien M) |
| **Vague** | E11, après E10-S06 ; avant E11-S07 (routes en anglais) |
| **Dépend de** | E10-S04 (listes `{text, children}`, trois niveaux, AC-b2 : le champ montre un élément par ligne, deux espaces par niveau et la marque écrite du sous-niveau ; lot c : `<https://…>`, `\[[`) ; E10-S06 (AC-a6 : `Tab` et `Maj+Tab`, fonction pure de niveau de ligne de `modele.ts` ; AC-a2 : liste de `/` sous le champ) |
| **Porteuse de migration** | Non |

## Contexte

Deux retours du responsable d'Oto sur l'éditeur de l'hôte de démo (2026-09-29, fiche D132) :

1. « Quand une phrase est longue et passe sur 2 lignes, au retour à la ligne on voit une puce. »
2. « L'éditeur d'un bloc change quand on veut éditer un lien ; il faut un popover qui permet de
   modifier le nom du lien et sa source. Là je vois `[[private/<handle>/taches|Mes tâches]]`, ce
   n'est pas compréhensible. »

Relevé du code (2026-09-29, avant E10-S04 et E10-S06) :
- Un bloc liste est un seul `<textarea>` (`ui/noeud/editeur/champ-de-bloc.tsx` l. 208-237), un
  élément par ligne (`modele.ts`, `texteDe` l. 98-103, `avecTexte` l. 120).
- La puce est une image de fond répétée à chaque boîte de ligne (`ui/ds/components/css/blocks.css`
  l. 59-67, `background-size: var(--space-4) 1lh`) ; le commentaire l. 59 l'assume. Même défaut
  pour les numéros (`Numeros`, `champ-de-bloc.tsx` l. 74-83 ; `blocks.css` l. 69-100) et les cases
  (`Cases`, l. 86-104 ; `editeur.css` l. 11-38).
- Au repos, un texte à liens est couvert par son rendu (`TexteAuRepos`, l. 111-117 et 238), qui
  replie le texte lu ; le champ dessous replie le texte brut, plus long : les puces suivent le
  mauvais repli. Au focus, la source paraît (`editeur.css` l. 135-142) ; seul « @ » aide à écrire
  un lien, rien n'aide à le modifier.

La vue de lecture est juste (`ui/noeud/rendu-des-blocs.tsx` l. 132-146, vrais `<ul>` et `<li>`).

**Refs :**
- PRD : FR-CONC-03 (éditeur, « @ »), FR-CONC-10 (listes imbriquées, E10-S04 et E10-S06)
- Architecture : § 3 Structure (face `ui/`, n'importe pas `server/`) ; ADR-008 (écrans portés)
- E05-S11 AC-26 (rendu au repos, liens dans la phrase) ; E05-S10 AC-a9 (« @ ») ; syntaxe des liens
  `schemas/link-syntax.ts` (`linksIn`, `LABEL_MAX` l. 12)

## Périmètre

- Listes à puces, numérotées et à cocher de l'éditeur : un repère par élément, sur sa première
  ligne, au focus comme au repos, niveaux d'E10-S06 compris.
- Un panneau « Lien » sous le champ : libellé, destination (page de la plateforme ou adresse web),
  « Appliquer », « Retirer le lien », « Ouvrir ».

## Hors périmètre

- Garder le lien rendu pendant la frappe (éditeur riche, `contenteditable`) : écarté par l'epic
  (E11, OUT), XL. Voir HN-E11S06-1.
- Retrait suspendu des lignes repliées d'un sous-élément (la suite d'une ligne repliée repart au
  bord du champ) : un `<textarea>` ne le sait pas ; même cause, même renvoi.
- Insérer un lien sans « @ » (sélectionner un mot puis « Lien ») : V2 si le besoin revient.
- Liens dans un tableau simple ou un repli (E10-S06, champs `Input`) : même panneau en V2.
- Vue de lecture, partage public, `read` et `write` : inchangés.

## Critères d'acceptation

### Lot a — Une puce par élément

- [ ] **AC-a1 — Puces.** **Given** une liste à puces dont un élément dépasse la largeur du champ
  **When** la page est ouverte dans l'éditeur, champ au repos ou au focus, à 390 px et à 1 280 px
  **Then** chaque élément a une seule puce, sur sa première ligne ; ses lignes repliées n'en ont
  aucune. **And** aucune image de fond ne dessine plus de puce (`blocks.css`).
- [ ] **AC-a2 — Numéros.** **Given** une liste numérotée (`start` = 3) dont le premier élément se
  replie **Then** chaque élément de premier niveau porte son numéro sur sa première ligne : 3, 4,
  5… dans l'ordre des éléments, jamais décalé par un repli.
- [ ] **AC-a3 — Cases.** **Given** une liste à cocher dont un élément se replie **Then** chaque case
  est à la hauteur de la première ligne de son élément ; elle garde son nom (`MENU_DU_BLOC.case`)
  et se coche comme aujourd'hui (`gestes.basculerLaCase`). **And** à tout instant, au repos comme
  au focus, il y a exactement une case accessible par élément.
- [ ] **AC-a4 — Niveaux.** **Given** une liste à deux niveaux écrite comme E10-S04 AC-b2 la montre
  (sous-élément : deux espaces par niveau, puis sa marque écrite `- ` ou `1. `) **Then** la puce ou
  le numéro dessiné ne va qu'aux éléments de premier niveau ; un sous-élément garde sa marque
  écrite, sans repère dessiné en plus ; la numérotation ne compte que le premier niveau. **When**
  `Tab` ou `Maj+Tab` change le niveau d'une ligne (E10-S06 AC-a6) **Then** les repères suivent
  sans recharger.
- [ ] **AC-a5 — Au repos, avec des liens.** **Given** une liste dont un élément porte un lien, champ
  au repos **Then** les repères suivent le texte qu'on voit (rendu, titres des pages) et non le
  texte brut dessous : une seule puce par élément, à sa première ligne rendue.
- [ ] **AC-a6 — Rien d'autre ne bouge.** Les autres blocs (texte, titre, citation, code) sont rendus
  comme avant ; en couleurs forcées, le champ reste lisible (`editeur.css` l. 144-153) ; les
  commentaires « écart cosmétique assumé » partent avec leur cause
  (`rg -n "écart cosmétique assumé" C:/apps/oto-pkg/packages` ne trouve rien).

### Lot b — Modifier un lien dans un panneau

« Un lien » : un `[[chemin]]`, `[[chemin|libellé]]`, `[[chemin#clé|libellé]]`, un
`[texte](https://…)`, une adresse nue ou `<https://…>`, lus comme l'écran les lit aujourd'hui
(`en-ligne.ts`, `atomesDe`). Le code, un bloc d'appel (`liens` nul, `rangee-de-bloc.tsx` l. 108) et
un champ en lecture seule (conflit) n'ouvrent jamais le panneau.

- [ ] **AC-b1 — Le curseur entre dans un lien.** **Given** un champ au focus **When** la sélection,
  vide, est strictement dans un lien (entre son premier et son dernier caractère) **Then** le
  panneau « Lien » s'affiche sous le champ, à la place de la liste de « @ » ; le focus reste dans
  le champ, et le champ le désigne (`aria-describedby` : « Lien vers « Mes tâches ». Alt+Entrée
  pour le modifier. »). **When** le curseur sort du lien **Then** le panneau se ferme. Quand la
  liste de « @ » ou celle de `/` (E10-S06 AC-a2) est ouverte, le panneau ne s'affiche pas.
- [ ] **AC-b2 — Clic sur un lien au repos.** **Given** un bloc au repos dont le rendu montre un lien
  **When** la personne le clique, ou le focalise et tape `Entrée` **Then** rien n'est suivi ; le
  panneau s'ouvre sur ce lien, focus dans « Libellé », et le rendu reste : la source `[[…]]` ne
  paraît pas. **When** elle le clique avec Ctrl ou ⌘, ou du bouton du milieu **Then** le lien est
  suivi comme aujourd'hui. Un bloc qu'on n'écrit pas (`RenduDUnBloc`, `rangee-de-bloc.tsx` l. 146)
  garde ses liens tels quels.
- [ ] **AC-b3 — Ce que montre le panneau.**
  - « Libellé » : le libellé écrit ; sinon, pour une page, son titre (`titreDuLien`) ; pour une
    adresse nue, vide.
  - « Destination », en `SegmentedControl` : « Page de la plateforme » ou « Adresse web », réglé
    sur le genre du lien.
  - Page : la page actuelle (titre, chemin en légende), puis un champ « Chercher une page » qui
    cherche par `useRechercheDeContenus` dès deux lettres et montre ses résultats comme la liste de
    « @ » (mêmes classes, même phrase d'attente, flèches et `Entrée`).
  - Adresse web : un champ « Adresse », prérempli.
  - Boutons « Appliquer », « Retirer le lien » (absent pour une adresse nue ou `<https://…>`, qui
    reste un lien sans balisage), « Ouvrir ».
- [ ] **AC-b4 — Appliquer.** **When** la personne applique **Then** seul le lien est réécrit, le
  reste du texte à l'octet près :
  - page : `[[chemin|libellé]]` ; la clé `#…` est gardée si la page n'a pas changé ; libellé vide :
    `[[chemin]]` ;
  - adresse web : `[libellé](adresse)` ; libellé vide : l'adresse nue ;
  - dans le libellé, `[`, `]` et les sauts de ligne deviennent des espaces, les blancs de bord
    partent (comme `lienVers`, `citer.tsx` l. 34-37).

  L'écriture passe par `gestes.citer` (`gestes-du-menu.ts` l. 46) : une frappe, qui part comme
  toute frappe (1 200 ms, sortie, ⌘S). Le focus revient au champ, le curseur après le lien.
- [ ] **AC-b5 — Refus sans écriture.** Rien n'est écrit et un message `role="alert"` reste sous le
  champ concerné quand :
  - le libellé dépasse `LABEL_MAX` : « Le libellé tient en 200 caractères. » (la borne lue de
    `schemas/link-syntax.ts`, jamais écrite en chiffres dans `libelles.ts`) ;
  - l'adresse ne commence pas par `https://` ou n'est pas relue comme une seule adresse web :
    « Une adresse web commence par https:// et ne contient pas d'espace. » ;
  - destination page sans page choisie : « Choisissez une page. » ;
  - le lien n'est plus à sa place (texte changé depuis l'ouverture) : « Ce lien a changé ;
    rouvrez-le. », et le panneau se ferme.

  Règle commune : le lien construit est relu par la fonction de l'écran (AC-b8) ; s'il n'est pas
  lu comme le lien voulu (chemin, clé, adresse, libellé), il n'est pas écrit.
- [ ] **AC-b6 — Retirer le lien.** **When** « Retirer le lien » **Then** le lien est remplacé par le
  texte qu'il montre (libellé, sinon titre de la page), par `gestes.citer` ; focus au champ, curseur
  après ce texte.
- [ ] **AC-b7 — Ouvrir.** **When** « Ouvrir » **Then** une page s'ouvre à `prefixe + chemin` (plus
  `#clé`), une adresse web à son adresse, dans un nouvel onglet, `noopener noreferrer` ; le panneau
  reste ouvert.
- [ ] **AC-b8 — Clavier et focus.**
  - Le panneau est dans le flux, juste après le champ, dans la rangée (`role="group"`, nommé
    « Modifier le lien ») : `Tab` y entre depuis un Texte ; `Alt+Entrée` y porte le focus depuis
    tout champ, liste comprise (intercepté avant `Entrée`, `clavier.ts` l. 66).
  - `Entrée` dans « Libellé » ou « Adresse » applique ; dans la recherche, elle choisit.
  - `Échap` dans le panneau le ferme et rend le focus au champ, curseur là où il était (après le
    lien si le panneau s'est ouvert au clic).
  - `Échap` dans le champ, panneau affiché : ferme le panneau, le focus reste ; un second `Échap`
    va à la poignée (inchangé). Fermé par `Échap`, le panneau ne revient qu'après que le curseur
    est sorti du lien.
  - Le focus qui quitte la rangée ferme le panneau sans rien écrire ; le passage du champ au
    panneau ne retire pas un bloc neuf (`quitterLaRangee`, `actions.ts` l. 277-286).

## Implémentation

### Migrations prévues
Aucune : l'éditeur change, pas les données.

### Schémas Zod partagés
Aucun nouveau. `schemas/link-syntax.ts` exporte `LABEL_MAX` (aujourd'hui privé, l. 12) pour le
message d'AC-b5 (`portage-ecrans.md § 6`). Le texte écrit passe `controler` puis
`blockInputSchema` comme toute frappe.

### Fichiers à créer (face `ui/`)
- `packages/plateforme/ui/noeud/editeur/elements-de-liste.tsx` : `ElementsDeListe`, la copie
  `aria-hidden` du texte, posée dans `.oto-block-pile` sous le champ, même classe de champ (police,
  corps, rembourrage, bordure, largeur, `pre-wrap`) : une `<div>` par élément, le repère (puce,
  numéro ou case) sur sa première ligne, texte transparent. Au repos avec des liens, la même copie
  rend chaque élément par `EnLigne`, visible, liens cliquables, et tient lieu de `TexteAuRepos`
  pour une liste. Les cases y restent de vrais `input` nommés, hors de la partie `aria-hidden`.
- `packages/plateforme/ui/noeud/editeur/lien-du-bloc.tsx` : `useLienAuCurseur` (lien sous le curseur,
  ouverture, fermeture, `Échap`) et `PanneauDuLien` (AC-b3 à AC-b8).
- Tests : `tests/unit/e11s06-editeur.test.ts`, `tests/integration/components/e11s06-editeur.test.tsx`,
  `tests/e2e/e11s06-editeur.spec.ts`.

### Fichiers à modifier
- **Lot a**
  - `ui/noeud/editeur/champ-de-bloc.tsx` : `Numeros` et `Cases` retirés (l. 74-104, 205, 240),
    `ElementsDeListe` monté dans la pile ; un état de focus du champ choisit texte brut ou rendu.
  - `ui/ds/components/css/blocks.css` : l. 59-100 (fond des puces, `data-ordered`, colonne de
    numéros) remplacées par les règles de la copie.
  - `ui/ds/components/css/editeur.css` : l. 11-38 (colonne de cases) remplacées ; l. 111-153
    étendues à la copie (repos, focus, couleurs forcées).
  - `ui/noeud/editeur/modele.ts` : aucune fonction nouvelle ; la copie lit `texteDe`, `debutDe` et
    la fonction de niveau de ligne d'E10-S06.
- **Lot b**
  - `ui/noeud/en-ligne.ts` : exporte `liensDuTexte(texte)`, les liens et leurs bornes dans le texte
    source, lus par `atomesDe` (l. 131), avec la forme écrite (`page`, `web-libelle`, `web-nu`) ;
    `segmentsEnLigne` et `Segment` inchangés.
  - `ui/noeud/rendu-des-blocs.tsx` : `rendre` (l. 105-116) numérote les liens quand l'appelant le
    demande (`data-lien`, rang dans `liensDuTexte`), pour le seul calque de l'éditeur.
  - `ui/noeud/editeur/champ-de-bloc.tsx` : `useLienAuCurseur` branché sur `onSelect` (l. 229) et
    `onKeyDown` (l. 228), avant `citation.toucher` ; clic lu sur le calque par délégation
    (`onClickCapture`, cible `closest("a[data-lien]")`), sans rôle ni `tabIndex` ajouté au
    conteneur ; `PanneauDuLien` monté après le champ, exclusif de `ListeACiter` (l. 241).
  - `ui/noeud/editeur/citer.tsx` : aucun changement ; `lienVers` est réutilisé.
  - `ui/noeud/libelles.ts` : `LIEN_DU_BLOC` (libellés et messages d'AC-b1 à AC-b5).
  - `schemas/link-syntax.ts` : `export const LABEL_MAX`.
  - Tests existants : `tests/integration/components/editeur-de-blocs.test.tsx` (l. 115-116,
    `data-ordered` : l'attribut reste ou l'assertion suit la copie ; cases l. 426-428),
    `tests/integration/components/e05s11-editeur.test.tsx` (l. 142-151, lien au repos).

### Points de départ
- Aucun dans oto-frontend ni la maquette du banc (ni panneau de lien ni liste à copie).
- Repris : la surface `oto-pop oto-citer` et les options de `ListeACiter` (`citer.tsx`) pour la
  recherche ; `lienVers` ; `SegmentedControl` (`ui/ds/react/segmented-control.tsx`), `Input` et
  `Button` du design system.

### Patterns à suivre
- `accessibility-patterns.md § Formulaires` (`label`, erreur en `role="alert"` liée),
  `§ Keyboard Navigation`, `§ Focus Management`, `§ ARIA` (copie `aria-hidden`).
- `portage-ecrans.md § 2` (aucun `.map(` dans un composant exporté), `§ 3` (jetons Oto, deux
  thèmes), `§ 6` (borne du libellé lue de `schemas/`).
- `coding-standards.md § Complexité` : `champ-de-bloc.tsx` reste sous 300 lignes, d'où les deux
  fichiers nouveaux.

### Canaux de sécurité
- **Fermé — adresse dangereuse** : le panneau n'écrit qu'une adresse `https://` relue comme adresse
  web par `LIEN_WEB` (`en-ligne.ts` l. 153), qui n'admet que `http(s)` ; `javascript:` ou `data:`
  n'est jamais écrit ni rendu en lien (`security-patterns.md § XSS Prevention`). Test : unitaire,
  `javascript:alert(1)` et `https://a.fr" onmouseover=` refusés.
- **Fermé — libellé qui casse le lien** : `]`, `[`, saut de ligne neutralisés, puis relecture
  (AC-b5). Test : libellé `a]](x` → le texte relu a un seul lien.
- **Fermé — ouverture** : « Ouvrir » et le lien web en `noopener noreferrer`. Test d'intégration.
- Aucun canal ouvert : aucun appel réseau nouveau (la recherche est celle de « @ »).

## Rayon d'impact

### Appelants
- `ChampDeBloc` : `rg -n "ChampDeBloc|champ-de-bloc" C:/apps/oto-pkg/packages/plateforme/ui` →
  `editeur/rangee-de-bloc.tsx` l. 39 et 98 (seul rendu) ; `editeur/editeur-de-blocs.tsx` l. 39
  (type `LiensDesBlocs`). Props inchangées.
- Repères actuels : `rg -n "oto-block-numbers|oto-block-checks|oto-block-check\b|Numeros|data-ordered|oto-block-rendu|TexteAuRepos" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `champ-de-bloc.tsx`, `blocks.css`, `editeur.css` ; tests `editeur-de-blocs.test.tsx` l. 116 et
  643-658, `e05s11-editeur.test.tsx` l. 142, `procedure.test.tsx` l. 253, e2e
  `e05s10a-edition.spec.ts` l. 113, `e05s11-page.spec.ts` l. 108. `.oto-block-rendu` reste le
  calque des blocs sans éléments (tous ces tests visent un Texte) ; une liste passe à la copie.
- `atomesDe`, `segmentsEnLigne` : `rg -n "atomesDe|aDesLiens|segmentsEnLigne\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `rendu-des-blocs.tsx` l. 123, `en-ligne.ts`, `champ-de-bloc.tsx` l. 185, tests
  `ui-en-ligne.test.ts`, `e05s10a-liens.test.ts`. `Segment` ne change pas : aucun `toEqual` ne bouge.
- `rendre` : appelé par `EnLigne` pour toute page (lecture, page publique, Contexte) ; la
  numérotation est optionnelle, absente hors du calque de l'éditeur.
- `gestes.citer` : `rg -n "\.citer\(|citer\(cle" C:/apps/oto-pkg/packages/plateforme/ui` →
  `champ-de-bloc.tsx` l. 145, `gestes-du-menu.ts` l. 46. Réutilisé tel quel ; aucun geste nouveau,
  aucune doublure de `Gestes` à changer (`rg -ln "ContexteDesGestes" C:/apps/oto-pkg/tests` : aucune).
- `LABEL_MAX` : `rg -n "LABEL_MAX" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` →
  `schemas/link-syntax.ts` l. 12 et 116 seulement ; l'export n'en change pas la valeur.

### Doublons
- `component-registry.md` (ligne `EditeurDeBlocs` : `ListeACiter`, `useRechercheDeContenus` ; ligne
  des primitives : `Popover`, `SegmentedControl`, `useAnchor`, `useDismiss`).
- `rg -ln "<Popover|SegmentedControl" C:/apps/oto-pkg/packages/plateforme/ui` → `Popover` dans
  `access-panel.tsx`, `SegmentedControl` dans cinq écrans. Verdict : **`SegmentedControl` réutilisé** ;
  `Popover` écarté : il s'ancre à un déclencheur (`popover.tsx` l. 58), pas à une place dans un
  texte, et son portail sort le focus de la rangée, ce qui retirerait un bloc neuf
  (`quitterLaRangee`). Le panneau vit dans le flux, comme `.oto-citer`.
- `rg -n "type=\"url\"|new URL\(|protocol === \"https:\"" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/packages/plateforme/schemas`
  → `schemas/brand.ts` l. 38-44 (`isHttpsUrl`, privé, logo). Verdict : laisser ; le panneau doit
  écrire ce que l'écran relira en lien, donc il relit par `liensDuTexte`, pas par `URL`, qui admet
  ce que `LIEN_WEB` refuse.
- `lienVers` (`citer.tsx` l. 34) : **réutilisé** pour un lien de page.

### Effet produit
- Éditeur de toutes les pages, procédures et Contextes : repères de liste redessinés ; un clic
  simple sur un lien au repos ouvre le panneau au lieu de le suivre (remplace la phrase « un clic
  sur un lien le suit » d'E05-S11, `champ-de-bloc.tsx` l. 23-24 ; Ctrl ou ⌘ le suit).
- Contexte de l'entreprise dans les réglages et Contexte privé : même éditeur, même effet.
- Lecture, page publique, `read`, `write`, `context`, recherche : inchangés ; le texte écrit est le
  même markdown qu'avec « @ ».
- Aucune route, aucune table, aucune policy, aucun outil MCP.

### Refacto
- Écarté : un panneau flottant ancré à la position du lien (mesure du caret, `Popover` à ancre
  virtuelle) : L, pour un gain de placement ; sous le champ, comme « @ », suffit.
- Écarté : l'éditeur riche (`contenteditable`) qui garde le lien rendu pendant la frappe : XL, OUT.
- Écarté : mesurer le repli en JavaScript à chaque frappe ; la copie laisse le navigateur replier.
- Option d'un cran plus simple, écartée : ne corriger que les puces et garder `Numeros` et `Cases`
  en colonnes ; numéros et cases resteraient décalés.

## Hypothèses

- **HN-E11S06-1** (**validée, 2026-09-29**) : le champ garde la source `[[…]]` pendant la frappe. Le curseur
  dans un lien ouvre le panneau, source visible ; un clic sur un lien au repos ouvre le panneau
  focus dedans, source cachée ; à la fermeture, le curseur revient au champ et la source paraît.
  Alternative : un éditeur riche qui montre le lien rendu en toutes circonstances (XL, OUT de
  l'epic). Source : epic E11 § OUT.
- **HN-E11S06-2** (**validée, 2026-09-29**) : un clic simple sur un lien au repos ouvre le panneau et ne suit
  plus le lien ; Ctrl, ⌘ ou le bouton du milieu le suivent, et « Ouvrir » aussi. Alternative :
  garder le clic qui suit et n'ouvrir le panneau qu'au curseur (la personne continue de voir la
  source, ce que le retour reproche). Source : retour 2.
- **HN-E11S06-3** : `Alt+Entrée` ouvre le panneau au clavier ; ⌘K est pris par la palette
  (`ui/ds/react/rail.tsx` l. 101). Source : simple.
- **HN-E11S06-4** : le panneau n'écrit que `https://` ; un lien `http://` existant se lit, et se
  corrige s'il est réappliqué. Source : `security-patterns.md § XSS Prevention`.
- **HN-E11S06-5** : « Ouvrir » ouvre un nouvel onglet, l'édition reste. Source : simple.
- **HN-E11S06-6** : la clé `#…` d'un lien de page est gardée si la page ne change pas, perdue sinon
  (une clé est propre à son tableau). Source : `link-syntax.ts`.
- **HN-E11S06-7** : repères dessinés au seul premier niveau ; un sous-élément garde sa marque écrite
  (E10-S04 AC-b2). Source : E10-S04, E10-S06.

## Actions JB

Aucune : pas de secret, pas de service extérieur. Confirmer HN-E11S06-1 et HN-E11S06-2.

## Tests attendus

### Unit tests (`tests/unit/e11s06-editeur.test.ts`)
- [ ] `liensDuTexte` : bornes et forme de `[[a/b]]`, `[[a/b#k|L]]`, `[t](https://x.fr)`, adresse nue,
  `<https://x.fr>`, lien en gras ; rien dans un span de code ni pour `\[[` (la linéarité est déjà
  prouvée sur `segmentsEnLigne`, `ui-en-ligne.test.ts`).
- [ ] Lien écrit (AC-b4, AC-b5) : page avec et sans libellé, clé gardée ou perdue, web avec et sans
  libellé, libellé à `]`, `[` et saut de ligne, libellé de 201 caractères, `http://`,
  `javascript:`, adresse avec espace ou guillemet ; relecture d'un seul lien ; reste du texte égal.
- [ ] Retirer (AC-b6) : libellé, titre connu, dernier segment.
- [ ] Éléments de la copie (AC-a2, AC-a4) : niveau, repère et numéro par ligne, `start`, sous-niveaux
  sans numéro.

### Integration tests (`tests/integration/components/e11s06-editeur.test.tsx`)
- [ ] Copie : une puce ou un numéro par élément de premier niveau, `aria-hidden` ; une case
  accessible par élément, au repos et au focus, qui se coche (AC-a3).
- [ ] Panneau au curseur (AC-b1) : ouvert, focus au champ, `aria-describedby` ; fermé hors du lien ;
  absent avec « @ » ouvert, dans un code, en lecture seule.
- [ ] Clic (AC-b2) : clic simple sans navigation, focus dans « Libellé » ; Ctrl-clic non intercepté.
- [ ] Appliquer, refus, Retirer, Ouvrir (`window.open` espionné, `noopener`) ; `Alt+Entrée` ; `Échap`
  dans le panneau et dans le champ ; focus rendu, curseur au bon rang ; un bloc neuf pas retiré.
- [ ] Régression : `editeur-de-blocs.test.tsx`, `e05s11-editeur.test.tsx` adaptés, cas inchangés.
- [ ] MCP : sans objet, aucun outil touché.

### E2E tests (`tests/e2e/e11s06-editeur.spec.ts`)
- [ ] À 390 px et 1 280 px, deux thèmes : liste à puces, numérotée et à cocher avec un élément
  replié, et une liste à deux niveaux ; le nombre de repères égale le nombre d'éléments, chaque
  repère au haut de la première ligne de son élément (boîtes mesurées : le rendu en page est le seul
  témoin du repli, `testing-strategy.md § Budget de tests`). Même contrôle au repos avec un lien.
- [ ] Clic sur « Mes tâches » au repos, libellé changé, « Appliquer », puis lecture publiée : le
  nouveau libellé, jamais `[[`. Contrôle visuel du panneau dans les deux thèmes.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
