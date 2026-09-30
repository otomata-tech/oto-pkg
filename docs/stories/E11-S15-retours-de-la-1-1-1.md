# Story E11-S15 — Retours sur la 1.1.1 : écrans d'un contenu, éditeur et blocs

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | Écrire et organiser le contenu ; voir ce que lit l'assistant ; brancher son assistant |
| **Statut** | 🟢 Ready |
| **Priorité** | Must — version corrective 1.1.2 |
| **Référence UI** | oto-frontend (`C:\apps\oto-frontend`, lecture seule) : blocs « Tableau », « Fichier » et autres de `src/components/editor/` et `src/components/noeud/` ; le reste : écrans actuels du paquet, dans leur style |
| **Conventions** | portage, a11y, state, forms, testing |
| **Estimation** | L (deux lots en parallèle sur des fichiers disjoints : A écrans d'un contenu, B éditeur et blocs) |
| **Dépend de** | 1.1.1 publiée (fbccf11) |
| **Porteuse de migration** | Non |

## Contexte

Retours de JB sur le SaaS déployé en 1.1.1 (`oto-steel.vercel.app`), 2026-09-30. L'erreur `NoSuchBucket` au dépôt
d'un fichier ou d'une image n'est pas un défaut du paquet : le bucket nommé dans les variables Vercel d'oto-saas
(`platform-files`) n'existe pas ; celui du projet est `oto-platform-files` (action JB). Tout le reste est un défaut ou un
manque des écrans du paquet.

**Version** : 1.1.2, corrective (aucune migration ; aucun export retiré ni changé : un ajout d'export ferait une 1.2.0,
à signaler).

## Critères d'acceptation

### Lot A — Écrans d'un contenu

- [ ] **AC-a1 — Vue « Contexte » (`/context`).** « Rangés sous ce contexte » et « Pages citées » s'affichent dans le même
  encart repliable bleu que sur l'écran d'un Contexte, même composant, sur toute la largeur, **déplié** par défaut.
- [ ] **AC-a2 — Encarts de droite d'une page** (« Sous-pages », « Cité dans », « Cite »…). Un titre long est coupé par une
  ellipse sur une ligne (titre complet au survol ou pour les lecteurs d'écran) ; la description (résumé) n'y est plus ;
  aucun contenu d'encart n'élargit la page.
- [ ] **AC-a3 — Zoom du navigateur.** À 125 % (et 110 %, 150 %), le contenu d'une page reste centré comme à 100 %, sans
  décalage vers la gauche ni défilement horizontal.
- [ ] **AC-a4 — « Partager sur le web ».** Le panneau s'ouvre ancré à son bouton, entièrement visible (haut compris), sans
  translation ni grand vide en bas ; sa hauteur suit son contenu, bornée à 70 % de la hauteur de la fenêtre, avec un
  défilement intérieur au-delà.
- [ ] **AC-a5 — `/connect`.** Un séparateur visible entre chaque étape du guide de branchement.
- [ ] **AC-a6 — Libellé.** Dans « À quoi sert cette page », « Ce que les assistants… » devient « Ce que votre
  Claude/ChatGPT/Mistral… » (partout où ce libellé apparaît).
- [ ] **AC-a7 — Tableau de données.** « Importer un fichier… » est dans la rangée des boutons de l'en-tête (« Réglages »,
  « Télécharger… »), plus au-dessus du tableau ; le dépôt d'un `.csv` sur le tableau reste possible.

- [ ] **AC-a8 — Vue « Contexte » expliquée.** Sous le titre « Contexte » de `/context`, une courte description dit ce
  qu'est le contexte (ce que l'assistant lit au début de chaque conversation), comment il fonctionne (relu à chaque
  conversation, servi par l'outil `context`, périmé quand un Contexte change) et comment il est construit (de quoi il est
  fait et dans quel ordre : Contextes de l'entreprise, de l'équipe, privé, procédures, contenus récents…), exacte au
  regard du service (`server/context/`, `docs/architecture.md`), sans jargon technique pour la personne.

- [ ] **AC-a9 — Nom d'un Contexte cité.** Un lien vers un Contexte (`[[sav/contexte|Contexte]]`) et sa ligne dans les
  encarts (« Cité dans », « Cite », « Sous-pages »…) montrent le nom du Contexte tel que l'écran le nomme ailleurs
  (« Contexte · SAV », « Contexte · Tout le monde », « Contexte · Privé »), pas son titre stocké « Contexte ». Un libellé
  écrit à la main différent du titre stocké reste celui de la personne.

### Lot B — Éditeur et blocs

- [ ] **AC-b1 — Tableau simple (markdown).** La rangée d'en-tête a un fond de la couleur primaire en faible opacité
  (tokens du paquet, deux thèmes) ; dans l'éditeur, la bordure d'un champ de cellule n'apparaît qu'au survol (ou au focus)
  de la cellule.
- [ ] **AC-b2 — Design des blocs « Tableau », « Fichier », image, etc.** Repris de la référence oto-frontend (ce qu'elle
  fait déjà pour ces blocs), dans les tokens du paquet ; écarts écrits.
- [ ] **AC-b3 — Image.** Une image garde ses proportions (jamais étirée) à toute largeur choisie.
- [ ] **AC-b4 — « @ ».** À l'ouverture de la liste de « @ », avant toute frappe, les contenus récents s'affichent
  directement.
- [ ] **AC-b5 — Menu de la poignée d'un tableau.** Le panneau du menu (icône de glisser) d'un bloc tableau s'affiche sans
  barre de défilement : sa hauteur suit son contenu, bornée à la fenêtre.
- [ ] **AC-b6 — Texte en ligne.** Dans un bloc texte au repos, `**gras**` s'affiche en gras, aussi quand seule une partie du
  texte est entre `**` ; les autres marques du markdown courant (`*italique*`, `_italique_`, `` `code` ``, `~~barré~~`)
  sont vérifiées au passage et rendues si elles ne le sont pas.

- [ ] **AC-b7 — Édition d'un lien sans surlignage rouge.** Quand on édite un lien dans un bloc texte, aucun surlignage
  rouge n'apparaît, jamais.
- [ ] **AC-b8 — Liens pendant l'édition (à évaluer avant de coder).** En éditant un texte qui contient un lien, la
  syntaxe brute (`[[chemin|Titre]]`) ne s'affiche plus : le lien reste montré par son titre. Remplace le « au focus, le
  texte brut » d'HN-E05S11-17 (D107) si JB le confirme, au vu du coût.

- [ ] **AC-b9 — Clic sur un lien.** Dans un bloc texte, un clic gauche sur un lien ouvre sa cible (la page citée, ou
  l'adresse web dans un nouvel onglet) ; le panneau « Lien » d'édition s'ouvre au clic droit (`contextmenu`), et au
  clavier par la touche Menu ou Maj+F10 sur le lien (même événement), jamais au clic gauche.

- [ ] **AC-b10 — Libellé d'une adresse web.** Une adresse web écrite telle quelle dans un texte ne s'affiche plus
  réduite à son domaine : elle garde son schéma, son domaine et la fin de son chemin, le milieu coupé par une ellipse
  (`https://oto-steel.vercel.app/n/private/jean_baptiste/test_ctx` →
  `https://oto-steel.vercel.app/…ste/test_ctx`) ; une adresse courte s'affiche entière ; l'adresse complète reste dans le
  lien (`href`), son infobulle et son nom accessible.

## Hors périmètre

- Le bucket des variables Vercel d'oto-saas (action JB).

## Tests attendus

Un test par AC au minimum vital (`testing-strategy.md § Budget de tests`) : composants (`tests/integration/components/`)
et unitaires ; AC-a3 et AC-a4 se prouvent au mieux en jsdom (classes et structure) et se contrôlent à l'œil dans les deux
thèmes à la campagne visuelle.

## Hypothèses

### Lot A

- **H-a1 (AC-a1).** Les deux listes passent dans l'encart partout où la vue « Contexte » les rend (`ListesServies`) : la
  carte d'une partie, sous l'éditeur ou en lecture, et l'encart « Contexte · Tout le monde » d'Organisation, qui les rend
  « comme dans la vue Contexte ». Dans la carte de la partie, sur sa largeur ; même glyphe que « Sous-pages » et « Cite » ;
  sans total : le nombre servi est borné par le service, un total dirait moins que ce qui est rangé.
- **H-a2 (AC-a2).** La nature d'un nœud dessous (« Page », « Procédure ») reste en méta : c'est un qualificatif, pas la
  description ; « déplacé vers … » et « sans cible » restent aussi (un état, pas un résumé).
- **H-a3 (AC-a3).** « Centré » se lit : sous 1 410 px de contenu, le document (borné à sa mesure, 830 px) et la colonne
  d'annexes forment une paire centrée, l'en-tête posé au bord gauche du document ; au-dessus, rien ne change (le document
  seul centré). Garder le document seul au centre sous ce palier ramènerait les annexes sous leur largeur lisible
  (E05-S12, lot C).
- **H-a4 (AC-a4).** La borne de 70 % vaut pour les deux panneaux larges (`data-size="lg"` : « Partager », « Réglages » d'un
  tableau), un seul geste pour le même défaut ; le panneau « Partager » est aligné sur le bord droit de son bouton, le
  dernier de l'en-tête.
- **H-a5 (AC-a5).** Le filet vaut aussi dans la fenêtre « Brancher » de l'accueil, qui monte le même guide (une seule
  source, E11-S09) ; `--island-bd` et non `--hair`, qui ne se voit pas dans l'îlot.
- **H-a6 (AC-a6).** Textes : « Ce que votre Claude/ChatGPT/Mistral, comme celui de chaque membre de l'organisation, lit à
  chaque conversation. » et « …, comme celui de chaque membre de l'équipe X, lit… ». Le Privé (« Ce que votre assistant
  lit… ») et le Privé d'autrui ne commencent pas par « Ce que les assistants » : inchangés. Le résumé que la base pose sur
  un Contexte d'équipe ou de Tout le monde (déclencheur de `20260928100000_platform_base_v1.sql`,
  `20260929090000_platform_e05s13.sql`, script de démo `scripts/demo/30-arbre.mjs`) garde l'ancien texte : le changer
  demande une migration, exclue de la 1.1.2. Pour une personne qui lit le Contexte d'une équipe dont elle n'est pas, « votre
  Claude » est inexact : c'est le texte demandé.
- **H-a7 (AC-a7).** « Importer un fichier… » suit la condition de « Réglages » (niveau écriture, hors de
  `?version=published`), avant lui, après « Télécharger… » ; le dépôt d'un `.csv` sur le tableau garde la sienne (niveau
  écriture). Bouton `secondary`, comme ses voisins de la rangée.
- **H-a9 (AC-a9).** Le nom est celui de `titreDuContexte` (`ui/noeud/fil.ts`), le `<h1>` d'un Contexte ; un lien le montre
  quand son libellé est le titre enregistré du Contexte ou absent ; le genre vient de l'arbre visible que le service sert déjà (aucun champ ajouté au service) ; arbre illisible ou coupé sans le Contexte, ou Contexte déplacé : son titre enregistré. Le nom vaut aussi pour ce que le panneau « Lien » montre d'un lien (page choisie, description, texte laissé par « Retirer le lien »).
- **H-a8 (AC-a8).** La description est l'encart « À quoi sert cette page » d'un Contexte, ouvert, sous le titre ; elle ne
  donne aucune borne chiffrée (35 000 caractères, 10 nouveautés, 60 procédures, 20 contenus récents, 14 et 90 jours) : ces
  valeurs vivent dans `server/`, que l'écran ne lit pas, et un chiffre recopié dériverait. « Règles Oto » et la procédure
  servie sont nommées « non montrées ici ». L'outil est nommé entre guillemets (« son outil « context » »), sans autre
  terme technique ; la procédure est dite servie « quand Oto en reconnaît clairement une » : c'est le routage d'Oto qui la
  reconnaît dans la demande, au seuil et à l'écart réglés (`decide`, `server/routing.ts`), pas l'assistant.

### Lot B

- **H-b1 (AC-b7).** Le correcteur du navigateur est coupé (`spellCheck={false}`) sur le champ d'un bloc dont le texte porte
  un lien, et sur « Libellé » et « Chercher une page » du panneau « Lien » ; il reste actif sur un texte sans lien. Source :
  l'AC vise l'édition d'un lien. Écartée : le couper sur tout champ (lecture littérale de « toujours »), qui retirerait
  toute aide à l'orthographe de l'éditeur. Reste : un `[[` tapé à la main souligne sa source jusqu'à ce que le lien se
  ferme (« @ » l'écrit d'un coup).
- **H-b2 (AC-b1).** L'en-tête teinté vaut à la lecture comme dans l'éditeur (l'AC ne les distingue pas ; seule la bordure
  est « dans l'éditeur »). La teinte est le jeton existant `--oto-bg` (primary à 11 % de jour, 12 % de nuit, mêlé à
  l'îlot), opaque parce que l'en-tête colle en défilant ; aucun jeton ajouté.
- **H-b3 (AC-b5).** La hauteur libérée vaut pour le menu de la poignée de tout bloc : même menu, les autres sont plus
  courts que l'ancienne borne ; une condition par type serait une surface de plus pour le même rendu.
- **H-b4 (AC-b2).** « etc. » est lu : tableau, fichier, image. Le bloc local d'un envoi (`DepotEnCours`) et les autres
  blocs restent tels quels.
- **H-b5 (AC-b6).** Le rendu au repos d'un texte marqué vaut pour tout bloc à texte en ligne de l'éditeur (Texte, titre,
  liste, cases, citation) : c'est le même champ. Un code et un appel restent lus tels quels (M59).
- **H-b6 (AC-b9).** Un clic sur une page citée navigue par un `<a href>` dans l'onglet (l'éditeur ne reçoit pas le lien
  de l'hôte, `Lien="a"`) ; Ctrl, ⌘ ou le bouton du milieu ouvrent un nouvel onglet, comme tout lien ; une adresse web
  s'ouvre dans un nouvel onglet (`noopener noreferrer nofollow`).
- **H-b7 (AC-b4).** « Contenus récents » se lit comme le bloc « Recent content » de `context` (`recentDocuments`, une
  seule définition) : pages et tableaux que la personne lit, lus, écrits ou publiés par elle sur 90 jours, 20 au plus ;
  ni procédure ni Contexte (ils restent cités par la recherche). Une lecture à l'écran ne passe pas au journal (seules les
  mutations de la porte y vont) : ce qui est seulement ouvert à l'écran n'en fait pas partie. Les récents s'affichent
  tant que rien n'est tapé après « @ » ; une lettre les retire (l'invite à taper deux lettres revient), deux lancent la
  recherche. Sans récent, la liste garde l'invite d'avant ; une lecture en échec se dit comme une recherche en échec. Le
  panneau « Lien » (« Chercher une page ») reste sans récents : l'AC vise la liste de « @ ». Route :
  `GET /api/platform/search/recent`, sous la ressource de la recherche de « @ », à la forme de ses trouvés ; écartée,
  `search` sans `q` : une route de moins, mais une requête vide cesserait d'être une erreur de saisie et la même adresse
  rendrait deux listes différentes. La page qu'on édite ne s'y propose pas : l'écran passe son chemin
  (`?exclude=`, chemin validé), la liste en garde alors 19 au plus.
- **H-b8 (AC-b10).** Bornes : 40 caractères au plus montrés entiers ; au-delà, les 12 derniers caractères du chemin.
  Coupée, une adresse perd sa requête et son fragment (la fin du chemin nomme la ressource, une requête est le plus
  souvent un suivi) ; un chemin de 13 caractères ou moins se garde entier, suivi de l'ellipse. L'identifiant et le mot de
  passe écrits avant le domaine ne sont jamais montrés (comme avant), ni dans le libellé, ni dans l'infobulle, ni dans le
  nom accessible. `www.` n'est plus retiré. L'hôte montré est celui que le navigateur ouvre (`new URL` : schéma et hôte en
  minuscules, port par défaut retiré, domaine international en punycode), jamais un hôte lu à la main, qu'une barre oblique
  inverse déguiserait (revue, `security-patterns.md § XSS Prevention`) ; le chemin se lit décodé, sauf un caractère de
  contrôle ou de sens d'écriture. Le nom accessible d'une adresse nue coupée est l'adresse entière ainsi lue
  (`aria-label`, `title`) ; un libellé écrit (`[texte](https://…)`) reste le nom du lien.

## Post-implémentation

### Écarts avec la référence UI

**Lot B.** oto-frontend n'a ni tableau, ni fichier, ni image dans son modèle de blocs (son éditeur écrit Texte, titre et
liste ; une table markdown s'y lit préformatée, `components/noeud/corps-du-noeud.tsx`) : ce qui est repris vient de son
design system.

- **Tableau simple.** Repris : `.oto-table` (déjà porté). Écarts : l'en-tête sur `--oto-bg` au lieu de `--island`
  (AC-b1) ; ses intitulés à l'encre au lieu de `--faint`, seule paire à 4,5:1 sur ce fond dans les huit teintes de nuit
  (`--faint` de 2,5 à 3,9:1, `--mute` de 4,16 à 4,46:1, `--ink` au-dessus de 9:1, calculés depuis les jetons d'`oto.css`) ;
  dans l'éditeur, le champ d'une cellule sans bordure ni fond au repos (AC-b1), le champ en lecture seule gardant son fond.
- **Fichier.** Repris : la ligne d'un fichier de `FileDrop` (`.oto-file` : filet `--island-bd`, rayon de carte, surface
  `--card`, nom coupé d'une ellipse). Non repris : la taille en mono `--faint` (`.oto-file-size`), de 3,0 à 3,7:1 sur
  `--card`, gardée en `text-mute` (4,78:1 au moins) ; `EmbedCard`, dont toute la carte est un lien étiré porté par le
  nom, alors qu'une carte de fichier a deux gestes (« Voir », « Télécharger ») et qu'une carte réagissant au survol sans
  lien promettrait un clic. Gardés d'E10-S02 : l'icône du type, « Voir », « Télécharger ».
- **Image.** Rien à reprendre ; seule la garde de proportions (AC-b3).
- **Menu de la poignée.** Le `DropdownMenu` du design system borne tout menu à `min(420px, 60vh)` ; celui de la poignée
  suit ses entrées, borné à la fenêtre (AC-b5).

### Composants créés

**Lot A.** `ImportDansLeTableau` (`ui/coque/import-de-fichier.tsx`, interne au paquet) : le bouton de l'en-tête, qui ne
peut plus vivre dans `DepotSurLeTableau` (sous le tableau) ; internes : `ImportDansCeTableau` (le dialogue ouvert sur un
tableau, partagé par le bouton et le dépôt), `NomCoupe` et `nomsDesContextes` (AC-a9, `ui/noeud/sous-pages.tsx`), `Explication`
(`ui/contexte/ecran-du-contexte.tsx`). Classe `oto-etapes` (`ds/components/css/misc.css`).

**Lot B.** Aucun composant. Fonctions (`ui/noeud/en-ligne.ts`) : `aDuBalisage`, le rendu d'un texte diffère de sa source ;
`libelleDUneAdresse`, le libellé d'une adresse nue ; `adresseSansIdentifiants` (revue), l'adresse entière de l'infobulle
et du nom accessible, sans identifiants. Schéma `recentQuerySchema` (`schemas/search.ts`, interne au paquet).

### Notes

**Lot A.**

- **AC-a3, la cause.** Deux mécanismes, établis dans le CSS (aucun navigateur pendant la vague : à confirmer à la
  campagne visuelle, à 110, 125 et 150 %). (1) Le décalage : le zoom réduit la largeur en pixels CSS ; à 125 % d'un écran
  de 1 920 px, le contenu (fenêtre − rail 232 − bords et écart 34) tombe à 1 270 px, sous le palier `@container
  (max-width: 1409px)` d'`islands.css`, qui passait le document en piste `minmax(0, 1fr)` collée à gauche (élargi au-delà
  de sa mesure) et l'en-tête en `margin-inline: 0 auto`. Corrigé : paire document-annexes centrée (`justify-content:
  center`), document borné à `--content-max-doc`, en-tête aligné sur le document. (2) Le défilement horizontal : les
  colonnes `.oto-two-columns-main` et `-aside` sont des grilles sans piste déclarée ; leur piste implicite `auto` prenait
  la largeur min-content de leurs enfants — un nom d'encart en `nowrap`, un bloc de code — et débordait. Corrigé :
  `grid-template-columns: minmax(0, 1fr)` ; c'est aussi ce qui laisse l'ellipse d'AC-a2 opérer, que `text-overflow` sur
  `.oto-object-link-name` (un conteneur flex) ne pouvait produire.
- **AC-a4, la cause probable.** Le panneau était placé une fois, à l'ouverture, sur sa première hauteur ; « Partager sur
  le web » lit son lien après, et le panneau grandi restait calé sur l'ancienne mesure (hors de la fenêtre, ou remonté
  loin de son bouton) ; aligné à gauche de « Partager », le dernier bouton de l'en-tête, il débordait à droite et la fenêtre
  le repoussait. Corrigé : `useAnchor` replace le flottant quand sa taille change (`ResizeObserver`), le panneau est
  aligné à droite, sa hauteur bornée à `70vh`. Non observé dans un navigateur : à confirmer à la campagne visuelle.
- **Effet produit hors des écrans visés.** Les colonnes de `TwoColumns` d'Organisation et de Connecteurs gagnent la même
  piste bornée ; tout flottant (menu, liste d'un `Select`, infobulle) se replace quand sa taille change.

**Lot B.**

- **AC-b7, la cause.** Le correcteur orthographique du navigateur : un `<textarea>` est relu par défaut, et au focus la
  source d'un lien paraît (chemin, `_`, mots sans accent), soulignée d'un trait rouge ondulé. Aucune règle du paquet ne
  peint en rouge un champ de bloc ou du panneau : la seule, `[aria-invalid="true"]`, n'est posée que sur un champ du
  panneau après un refus, et aucun `:invalid` n'est stylé. Établi par élimination dans le code, non observé dans un
  navigateur (aucun Playwright pendant la vague) : à confirmer à la campagne visuelle.
- **AC-b4, livré.** `recentDocuments` (`server/context/blocks/recent.ts`), qui ne garde que ce que la personne lit
  (`nodeLevels`), est exportée de son module et servie par `GET /api/platform/search/recent` (`api/search.ts`,
  `{ data: { matches } }`, extrait `null`) ; `useRechercheDeContenus` gagne `recents()` et l'état `recents`, que
  `useCitation` demande quand rien n'est tapé après « @ », et que `ListeACiter` nomme (`CITER.recents`). Aucun export
  du paquet ajouté. La page qu'on édite ne s'y propose pas (`?exclude=<chemin>`, revue).
- **AC-b10, livré.** `libelleDUneAdresse` (`ui/noeud/en-ligne.ts`), seule source du libellé d'une adresse nue (rendu au
  repos, page lue, page publique, nom du champ de l'éditeur) ; `AdresseWeb` (`ui/noeud/rendu-des-blocs.tsx`) nomme une
  adresse coupée par l'adresse entière.
- **AC-b9, deux états.** Au repos, le lien est un `<a>` du rendu posé sur le champ : un clic le suit, le menu contextuel
  (clic droit, touche Menu ou Maj+F10 sur le lien atteint au clavier) ouvre le panneau, focus dans « Libellé », Échap le
  referme et rend le focus au champ, curseur après le lien. En édition (champ au focus), le rendu s'efface et la source
  paraît : il n'y a plus d'`<a>`, le curseur posé dans la source ouvre le panneau comme avant (E11-S06, AC-b1), Alt+Entrée
  y mène, et le clic droit dans le champ garde le menu du navigateur (copier, coller). Au clavier, un lien au repos
  s'atteint par Maj+Tab depuis le bloc suivant ; Tab depuis le champ le saute, le rendu étant masqué pendant que le champ
  a le focus.
- **AC-b8, écarté par JB** (D152) : la source reste visible pendant la frappe, rendue au repos (D107 tient ; éditeur
  visuel reporté, ADR-021).

### Revue

- **HAUTE, corrigée** (`security-patterns.md § XSS Prevention`) : l'hôte du libellé d'une adresse se cherchait par
  `/[/?#]/`, alors que le navigateur coupe aussi sur la barre oblique inverse pour `http(s)` : l'adresse s'affichait
  sous un autre hôte que celui qu'elle ouvre. Origine tirée de `new URL` (repli à la main s'il lève), infobulle et nom
  accessible par la même lecture, sans identifiants (`tests/unit/ui-en-ligne.test.ts`, `e11s15-editeur.test.tsx`).
- **MOYENNE, corrigée** : l'explication de la vue « Contexte » nomme l'outil « context » sans jargon et dit que c'est le
  routage d'Oto qui reconnaît une procédure (`decide`) ; la phrase des récents passe dans `CITER.recents`.
- **BASSE, corrigée** : la page qu'on édite ne se propose plus dans les récents de « @ » (`?exclude=`, `api-rail.test.ts`).
