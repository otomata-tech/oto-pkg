# ADR-021 — Le texte des blocs s'écrit en visuel : un éditeur ProseMirror par bloc, et la sélection de blocs dans l'éditeur

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-30 |
| **Statut** | Reporté (JB, 2026-09-30 : trop long pour le besoin ; la source reste visible pendant la frappe, rendue au repos ; seule la sélection de blocs est retenue, story E11-S17 lot a) |
| **Décideur(s)** | Le responsable d'Oto (choix à rendre, question posée par la story E11-S17) ; mise en œuvre : story E11-S17 |

## Contexte

Chaque bloc écrivable de l'éditeur est un `<textarea>` natif toujours monté (fiche D21, option B ;
`ui/noeud/editeur/champ-de-bloc.tsx`). Au repos, le texte est rendu par-dessus le champ (liens par
leur titre, gras, italique, code, barré : E05-S11, E11-S15 AC-b6) ; au focus, le rendu s'efface et la
source paraît (`[[private/<handle>/procedures|Mes procédures]]`, `**gras**`, la marque `  - ` d'un
sous-élément de liste). C'est la règle de D107 (« au focus, le texte brut ») et d'HN-E05S11-17, qui
écartait l'éditeur riche parce qu'il « coûterait la réécriture du champ de bloc » ; l'epic E11 l'a
mis en OUT, E11-S06 (HN-E11S06-1) a gardé la source pendant la frappe, et E11-S15 AC-b8 l'a remis à
l'évaluation.

Deux demandes du responsable d'Oto (2026-09-30) :

1. **La source ne s'affiche jamais**, même pendant la frappe : un lien se montre par son titre, un
   gras en gras ; le reste (modèle de blocs, file d'opérations, `write`, markdown stocké, panneau
   « Lien », « @ », « / ») continue de marcher, et le stockage reste le markdown actuel.
2. **Sélectionner plusieurs blocs d'un coup** pour les supprimer, à la souris (sélection tirée à
   travers les blocs) comme au clavier (Ctrl+A sur toute la page). Un `<textarea>` ne le permet
   pas : Ctrl+A ne prend que le bloc courant (et ouvre le menu de sa poignée, E05-S11 AC-28), une
   sélection ne traverse pas deux champs.

Contraintes :

- **Stockage inchangé.** Le texte d'un bloc reste le markdown en ligne que lisent `read`, `write`,
  la publication (`schemas/link-syntax.ts`, seul lecteur des liens : un `[[…]]` est un lien à
  l'écran si et seulement si la publication l'extrait) et les assistants (ADR-011).
- **Le paquet est publié en sources** et monté par l'hôte (`transpilePackages`) : toute dépendance
  part chez chaque hôte ; `ui/` n'importe ni `next/*` ni un routeur (ESLint) ; une dépendance
  absente du premier rendu se charge à la demande (`performance-patterns.md § Code Splitting`).
- **Tests** : jsdom ne sait ni placer une sélection ni taper dans un `contenteditable` de façon
  fiable ; `pnpm verify` ne lance pas Playwright (projet de test, compte E2E).
- **La référence UI d'oto-frontend** écrit ses blocs dans un `<textarea>` et refuse
  `contentEditable` (`src/design-system/components/react/blocks.jsx`, `BlockField` : sélection,
  annulation, clavier mobile, contrastes forcés natifs) ; ses maquettes posent des pastilles dans
  la phrase (`wf-cite`) qu'elle n'a pas codées, faute de texte en segments
  (`src/design-system/components/css/blocks.css`, `.oto-block-refs`).

### Mesures (2026-09-30)

Versions et licences lues sur le registre npm ; poids mesuré par `esbuild --bundle --minify`
(conditions `production`, React externe) puis `gzip -9`, sur le jeu minimal de chaque option.

| Bibliothèque | Version | Licence | Dernière publication | Poids min. / gzip | Remarques |
|---|---|---|---|---|---|
| ProseMirror (`prosemirror-model`, `-state`, `-view`, `-transform`, `-history`, `-keymap`, `-commands`, `-inputrules` ; `orderedmap`, `rope-sequence`, `w3c-keyname`) | 1.25.12 / 1.4.4 / 1.42.6 / 1.12.2 / 1.5.1 / 1.2.3 / 1.7.2 / 1.5.1 | MIT | 2026-09-25 (`-view`) | 210 Ko / 66 Ko | 1.x stable depuis 2017, un seul auteur-mainteneur ; aucun lien à React ; `EditorState` pur, testable sans DOM |
| Lexical (`lexical`, `@lexical/rich-text`, `-history`, `-react`) | 0.52.0 | MIT | 2026-09-30 | 239 Ko / 79 Ko | Meta ; toujours en 0.x, changements cassants annoncés à chaque mineure ; `@lexical/react` tire une vingtaine de paquets `@lexical/*` |
| TipTap 3 (`@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`) | 3.31.3 | MIT (cœur ; extensions « Pro » payantes à part) | 2026-09-04 | 401 Ko / 128 Ko | Surcouche de ProseMirror ; `immediatelyRender: false` exigé sous Next ; `@tiptap/markdown` officiel mais pour du CommonMark, pas notre `[[…]]` |
| Slate (`slate`, `slate-react`, `slate-history`, `slate-dom`) | 0.126.2 / 0.127.1 | MIT | 2026-09-24 | 219 Ko / 61 Ko | 0.x depuis 2016 ; saisie Android et IME historiquement fragiles ; tire `lodash` |
| BlockNote (`@blocknote/core`) | 0.55.0 | MPL-2.0 | 2026-09-22 | non mesuré | Éditeur de page entier sur son propre modèle de blocs ; licence à copyleft par fichier |

## Décision

1. **Portée.** Le texte en ligne de tout bloc qui en porte s'écrit en visuel : Texte, titre,
   citation (`callout`), listes à puces, numérotées et à cocher, cellules d'un tableau simple,
   résumé et corps d'un repli. Restent des `<textarea>` natifs, parce que leur texte *est* leur
   source : le code et un appel déjà écrit (M59), le titre et le résumé de l'en-tête (texte brut).
2. **Un éditeur ProseMirror par champ, toujours monté.** Chaque champ est un `EditorView` créé côté
   client une fois pour toutes (la règle « toujours monté » de D21 tient ; « natif » tombe). Le
   module de l'éditeur se charge par `import()` dynamique ; avant lui, le bloc montre son rendu de
   lecture (`EnLigne`, mêmes boîtes), rendu aussi au serveur : aucun saut de mise en page à
   l'hydratation. Dépendances ajoutées aux `dependencies` du paquet, versions exactes : celles du
   tableau ci-dessus, rien d'autre.
3. **Un modèle en ligne propre, le markdown en base.** Le document d'un champ n'a que : du texte ;
   les marques gras, italique (avec le caractère qui l'écrit, `*` ou `_`), barré, code ; des
   atomes indivisibles — lien de page, adresse web (avec sa forme écrite), saut `<br>`, caractère
   échappé — et, pour une liste, des lignes à niveau. Il se lit depuis `segmentsEnLigne`
   (`ui/noeud/en-ligne.ts`, qui lit les liens par `schemas/link-syntax.ts`) enrichi des formes
   écrites, et s'écrit par un sérialiseur inverse. Deux invariants, testés : **stabilité** (lire
   puis écrire un texte sans le toucher le rend à l'octet près) et **fidélité** (ce qu'écrit
   l'éditeur, relu par `segmentsEnLigne`, redonne le même document ; un `*` littéral est échappé
   s'il serait relu en marque). Les deux passes sont linéaires (`security-patterns.md § Validation
   des inputs`).
4. **Les gestes gardent leur forme.** Chaque transaction qui change le document rend le markdown
   du champ à `gestes.saisir` ; la file d'opérations, le contrôle des bornes (sur la source), le
   différé de 1 200 ms, ⌘S et la sortie du champ ne changent pas. Ce qui opérait sur un rang de la
   source opère sur le document : scinder (Entrée) écrit les deux moitiés du document, marques
   refermées de part et d'autre ; fusionner réunit deux documents ; `Tab` change le niveau d'une
   ligne ; « @ » et le panneau « Lien » remplacent un atome. Un rang de la source et une position
   du document se convertissent l'un en l'autre (`Focus.curseur`).
5. **Un lien est un atome.** Il se montre par son titre (règles de D107 : libellé écrit, titre de la
   cible, dernier segment ; texte ou domaine d'une adresse web), dans le style d'un lien de lecture ;
   le curseur le saute, Retour arrière le retire en entier, la frappe n'y entre jamais. Clic gauche :
   il est suivi (E11-S15 AC-b9) ; menu contextuel (clic droit, touche Menu, Maj+F10) ou Alt+Entrée :
   le panneau « Lien » d'E11-S06 s'ouvre sur lui.
6. **Collage et dépôt : `text/plain` seul.** Aucun `text/html` n'est lu (collage, dépôt, glisser),
   aucun nœud ne naît d'un HTML (aucune règle `parseDOM`), aucun `innerHTML` n'est écrit ; une
   adresse n'est rendue en lien que relue `http(s)` par les lecteurs actuels
   (`security-patterns.md § XSS Prevention`). Une ligne collée est lue en markdown en ligne ;
   Ctrl+Maj+V la garde littérale ; plusieurs lignes gardent l'insertion tolérante d'E10-S01. La
   copie d'une sélection met sa source markdown en `text/plain`.
7. **Annuler, refaire.** Dans un champ, l'historique de ProseMirror (frappe groupée, marque, lien,
   niveau, collage) remplace l'annulation native du `<textarea>` — que chaque réécriture du champ
   par le programme (« @ », `Tab`) cassait. Un geste sur des blocs entiers (supprimer, déplacer, en
   groupe ou non) s'annule par l'« Annuler » de son annonce, en une fois.
8. **Sélection de blocs, dans l'éditeur, indépendante du champ.** L'éditeur tient une sélection de
   blocs entiers (le modèle de Notion) : un glissé commencé dans un bloc qui entre dans un autre
   devient une sélection des blocs traversés ; Ctrl+A une seconde fois (tout le texte du bloc déjà
   sélectionné) prend tous les blocs ; Échap dans un champ sélectionne son bloc, Maj+↑↓ étend ;
   Maj+clic et Ctrl+clic sur les poignées ; rectangle tiré depuis la marge. Suppr, copier (source
   markdown par `renderBlocks`), couper et déplacer agissent sur le groupe, en **une** écriture
   (plusieurs opérations dans un corps, refusées en entier si l'une l'est) et **un** « Annuler ».
   Il n'y a pas de sélection de texte *partielle* à travers deux blocs (voir alternative F).
9. **Accessibilité.** Le champ est un `role="textbox"` nommé (`aria-label` actuel),
   `aria-multiline` sauf un titre, `aria-readonly` en conflit ; « @ », « / » et le panneau gardent
   `aria-describedby`, `aria-controls`, `aria-activedescendant` ; un atome de lien est un `<a>`
   non éditable, annoncé comme lien ; la sélection de blocs s'annonce dans une région vivante. Le
   contour en contrastes forcés reste (`accessibility-patterns.md § Keyboard Navigation`, exception
   du champ d'un bloc, à réécrire pour le nouveau champ).

## Conséquences

### Positives
- La source ne paraît plus, ni au repos ni au focus : les calques posés sur le champ disparaissent
  (`TexteAuRepos`, la copie `ElementsDeListe`, `.oto-block-pile`, `data-rendu`), et avec eux les
  écarts qu'ils portaient (hauteur du texte brut sous le rendu, repères de liste recalés sur une
  copie, correcteur orthographique coupé pour taire le rouge d'une source, E11-S15 AC-b7).
- Un lien s'édite là où il se lit ; une marque s'applique au raccourci ; un sous-élément de liste
  se voit en retrait, sans `  - `.
- Annuler couvre enfin les gestes qui réécrivaient le champ (« @ », panneau, `Tab`).
- Supprimer, copier, déplacer plusieurs blocs en un geste, avec un seul « Annuler ».
- Le document d'un champ est un `EditorState` pur : commandes, scission, sérialisation se testent
  en Node, sans DOM.
- Réversible : rien ne change en base ni dans les outils ; revenir au `<textarea>` ne touche que
  l'éditeur. Et l'ouverture vers un document unique (alternative F) garde la même bibliothèque, le
  même schéma et le même sérialiseur.

### Négatives
- Huit dépendances directes ajoutées aux `dependencies` du paquet (onze paquets avec les leurs),
  environ 66 Ko gzip chargés à la demande sur un écran qui édite ; chaque montée passe par Renovate
  chez l'hôte.
- Du code à nous sur une API de bas niveau : schéma, sérialiseur, vues des atomes, raccourcis,
  règles de saisie, pont avec les gestes (de l'ordre de 1 000 à 1 500 lignes).
- `contenteditable` n'est pas un contrôle natif : lecteurs d'écran (mode formulaire de NVDA,
  VoiceOver), IME, touches mortes du clavier français et saisie Android deviennent des cas à
  prouver, en Playwright et à la main — plus seulement acquis.
- Les tests d'intégration qui tapent dans le champ (`toHaveValue`, `fireEvent.change`,
  `setSelectionRange`) sont réécrits ; la frappe, la sélection et l'IME se prouvent en e2e, hors de
  `pnpm verify`.
- Écart avec oto-frontend (`BlockField` : « ni `contentEditable` ») : écrit dans la story.
- Deux historiques : le texte par champ (⌘Z), la structure par l'« Annuler » de l'annonce.

### Neutres
- Rien ne change pour `read`, `write`, la publication, `context`, l'export `.md`, la page publique :
  la lecture garde `EnLigne`.
- Code et appel restent des champs de source ; le titre de la page aussi.
- La version qui l'apporte est une mineure (1.2.0) : aucun export retiré, aucune migration.

### Ce que cette décision remplace
- **D21, option B** : « champ natif toujours monté » devient « champ ProseMirror toujours monté » ;
  l'envoi (sortie du champ, ⌘S, 1 200 ms) et le conflit au bloc restent.
- **D107**, pour l'éditeur : « au focus, le texte brut » devient « jamais le texte brut » ; le reste
  de D107 (liens lus par leur titre, `private`, `all`) tient.
- **HN-E05S11-17** (éditeur riche écarté), **HN-E05S11-b6** (rendu posé sur le champ),
  **HN-E11S06-1** (source gardée pendant la frappe), le lot a d'E11-S06 pour sa copie des
  éléments, et l'OUT de l'epic E11 « Garder le lien rendu pendant l'édition d'un bloc ».
- **E11-S15 AC-b8** : livré par E11-S17.
- À l'acceptation : une ligne de `fiche-decisions.md` (décision et amendement de D107), la ligne
  « Code » de `docs/architecture.md § 2`, `tech-stack.md`, l'exception de
  `accessibility-patterns.md § Keyboard Navigation`.

## Alternatives considérées

Chaque option est jugée sur la demande entière : source jamais visible, et sélection de plusieurs
blocs. La sélection de blocs (point 8) se construit dans l'éditeur, au-dessus des champs : elle
vaut pour toute option « par bloc » (A à E) au même coût (M à L), et se livre même avant l'éditeur
visuel, sur le `<textarea>` actuel. Seule l'option F donne une sélection de texte partielle à
travers les blocs.

### A. ProseMirror, un éditeur par bloc — retenue
Décrite ci-dessus. Coût : XL au total, en lots de S à L (story E11-S17). Sélection de texte à
travers les blocs : non, un glissé qui quitte son bloc passe en sélection de blocs entiers ;
sélection de blocs et gestes groupés à un seul « Annuler » : oui (point 8).

### B. `contenteditable` écrit à la main, modèle en ligne à nous — écartée
Aucune dépendance : c'est l'option d'un cran plus simple (la même livraison, une dépendance en
moins). Mais tout ce que ProseMirror règle serait à écrire : `beforeinput` et ses écarts entre
navigateurs, composition IME et touches mortes, saisie Android (Gboard réécrit le DOM), mise en
correspondance sélection DOM ↔ modèle, historique, presse-papiers, atomes au curseur. XL+, pour un
résultat moins sûr ; le risque porte sur la frappe elle-même, pas sur une fonction de plus. Sélection
de blocs : comme A.

### C. Garder le `<textarea>`, liens montrés par leur titre — écartée
Le champ montre le titre de chaque lien à la place de sa source et garde une table des liens à côté
(un lien devient une plage indivisible du texte). Sans dépendance, M, contrôle natif gardé. Mais un
`<textarea>` ne sait ni gras ni italique : `**gras**` reste visible, comme la marque des
sous-éléments de liste. Livraison partielle de la demande. Sélection de blocs : comme A.

### D. Lexical, un éditeur par bloc — écartée
Techniquement proche de A (nœuds décorés pour les liens, historique, IME soigné, tests sans DOM par
`@lexical/headless`), et un peu plus lourde (79 Ko gzip). Écartée pour sa version 0.x : chaque
mineure peut casser, et une bibliothèque publiée dans les sources d'un paquet que chaque hôte
construit ne doit pas imposer une relecture de l'éditeur à chaque montée ; `@lexical/react` tire une
vingtaine de paquets. Sélection de blocs : comme A.

### E. TipTap 3, un éditeur par bloc — écartée
ProseMirror plus une surcouche : utilitaire de suggestion (« @ », « / ») et extensions prêtes. Mais
notre besoin est un schéma et un sérialiseur propres (le `[[…]]`, les formes écrites) que TipTap ne
fournit pas ; on paierait la surcouche (128 Ko gzip avec `starter-kit`, plusieurs dizaines de
paquets `@tiptap/*`, une instance lourde par bloc, `immediatelyRender: false`) pour peu de code
évité. C'est A avec une surface de plus. Sélection de blocs : comme A.

### F. Un seul document ProseMirror pour toute la page — écartée pour cette version
Chaque bloc devient un nœud de premier niveau du document de la page. Seule option qui donne une
sélection de texte partielle à travers les blocs (glissé, Maj+clic, Ctrl+A), une suppression à
cheval qui fusionne les bouts, et un seul historique pour le texte et la structure. Mais il faut
réécrire l'éditeur de blocs entier : rangées, poignées, « + », menus, glisser-déposer et blocs sans
texte (image, fichier, tableau de données, séparateur) en vues de nœuds ; le verrou d'un bloc en
conflit dans un document commun ; la file d'opérations nourrie par une différence du document
(transaction → `replace_block`, `insert_block`, `delete_block`, `move_block` par bloc). Environ deux
fois A, et une régression possible sur tous les AC d'éditeur d'E05 à E11. Pas exclue plus tard : A
en garde le schéma, le sérialiseur et les atomes.

### G. Slate, BlockNote — écartées
Slate : 0.x depuis 2016, saisie Android et IME fragiles de longue date. BlockNote : un éditeur de
page complet sur son propre modèle de blocs (celui d'ADR-011 serait à traduire dans les deux sens),
sous MPL-2.0, que le paquet MIT n'emploie nulle part.
