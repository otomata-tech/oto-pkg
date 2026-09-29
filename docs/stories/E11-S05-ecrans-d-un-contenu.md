# Story E11-S05 — Écrans d'un contenu : encarts repliables à droite, cellules, lignes à revoir, télécharger, résumé, page et tableau vides

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 4.2 Faire ; 4.4 Concevoir et mettre à jour (tableaux et file de travail) ; partage public |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : style du paquet, tokens d'oto-frontend (`portage-ecrans.md`) ; repli du design system (`LinkedContent`, `ui/ds/react/linked-content.tsx` ; `.oto-linked`, `ui/ds/components/css/content.css` l. 215-275) pour les encarts et les cellules ; `[data-reveal]` (`ui/ds/app/islands.css` l. 87-105) ; colonne d'annexes (`TwoColumns`, `ui/ds/react/two-columns.tsx` ; `islands.css` l. 729-793) ; repère de ligne `data-state="review"` (`ui/ds/components/css/table.css` l. 173, 178-180, 187-188) |
| **Conventions** | portage, a11y, registry, forms, api, nextjs, state, performance, seo, supabase, security, testing |
| **Estimation** | L |
| **Vague** | E11, version 1.0.1 (fiche D131) ; après E10-S01, E10-S04, E10-S06, E11-S02 et E11-S10 ; avant E11-S07 |
| **Dépend de** | E10-S01 (routes `GET nodes/export` et `GET tables/export`, `schemas/csv.ts` `toCsv`, `ui/api/telecharger.ts`, libellés « Télécharger en .md/.csv » de `ui/coque/libelles.ts`) ; E10-S04 (`LinkedContent` sert aussi au bloc « Repli », son API ne change pas) ; E10-S06 (éditeur : `/` sur un Texte vide, « + » d'une rangée) ; E11-S02, ex-E11-S13 (publication directe : un nœud créé est publié) ; E11-S10 (vue « Contexte » sur `/context`, aperçu retiré des annexes) |
| **Porteuse de migration** | Non : rien ne change en base ; la langue de la page publique se lit dans `orgs.brand` par le service |

## Contexte

Retours du responsable d'Oto sur l'hôte de démo (fiche D132, 2e tour du 2026-09-29), repris mot pour mot
quand ils sont cités :

1. Dans un tableau, chaque cellule qui a une provenance montre le triangle natif d'un `<details>`
   (`ui/tableau/cellule.tsx` l. 101-104). La grille en est hérissée. Le détail ouvert est en `text-ink`
   (l. 60), aussi fort que la valeur.
2. Une ligne « à revoir » ressemble aux autres : `Grille` ne passe jamais `rowState` à la table du design
   system (`ui/tableau/grille.tsx` l. 73-84 ; `ui/ds/react/table.tsx` l. 44, 246). Le cycle des états n'est
   expliqué nulle part.
3. « Il faut pouvoir exporter un tableau en CSV, bouton en haut à droite, à gauche de "Partager" ; sur une
   page partagée en public, le visiteur peut télécharger le CSV, ou le MD pour une page. » E10-S01 place
   l'export dans le « ⋯ » du rail : invisible pour qui lit, absent de la page publique.
4. « "À quoi sert cette page" => collapse par défaut et collapsible, même design que "Contenus liés" » ;
   « mets-les à droite […], "Contenus liés" doit être subdivisé en 3 encarts collapsibles : "Cité dans",
   "Cite", "Sous-pages" ; si rien n'est "cité" ou "cité dans", l'encart n'apparaît pas du tout. » Décision 4
   du 2e tour : pour un tableau, en ligne au-dessus de la grille, qui garde toute la largeur.
5. « Cacher le résumé dans les pages (pas dans les procédures) ; renomme le résumé par défaut des procédures
   […] en expliquant succinctement les bonnes manières de l'écrire. »
6. « L'icône tableau n'est pas la bonne : chez Phosphor, utiliser "Table". »
7. « Dans un tableau vide : "Ce tableau est vide. C'est $1st_assistant_generic_name qui pourra les créer et
   modifier" (ex. = "Claude") ».
8. « Page vide : ne pas afficher "cette page n'a pas encore de contenu" + le bouton ; à la place un
   placeholder et le focus sur le premier bloc de type texte (autocréé). »

Aujourd'hui (chemins sous `packages/plateforme/`) : « Contenus liés » est un seul `LinkedContent` au-dessus
du document (`ui/noeud/ecran-de-noeud.tsx` l. 150, `ui/noeud/sous-pages.tsx` l. 216-250), liens par
`nodeLinks` (20 par sens et les totaux, `server/nodes/node-links.ts` l. 17) sous `<Suspense>`
(`src/app/(dashboard)/n/[...chemin]/page.tsx` l. 272). « À quoi sert cette page » est un `NotePanel`
toujours ouvert, Contexte seul (`page.tsx` l. 170-186), seul écran en deux colonnes (`ecran-de-noeud.tsx`
l. 155-175). Le résumé par défaut est stocké à la création (`ui/coque/creation-dans-le-rail.tsx` l. 55) ; le
service exige 1 à 200 caractères (`schemas/nodes.ts` l. 137-143, `server/nodes/write.ts` l. 252-254).

Cette story réunit l'ancienne E11-S05 (lots a, c, d) et l'ancienne E11-S12 (lots e à h) : moins de stories,
plus longues (décision du responsable d'Oto). Le lot b (vue « Contexte ») est passé à E11-S10 ; sa lettre
reste libre, d'autres stories citant les lots c et d.

**Refs :**
- PRD : FR-CONC-03 (éditeurs, titre et résumé en place), FR-CONC-05 (tableaux), FR-CONC-06 (liens servis à
  l'écran), FR-CONC-07 (export `.md` et CSV), FR-CONC-13 (partage public)
- Architecture : § 5 Services et portes (`GET public/<jeton>`) ; § 8 Invariants
- ADR-003 § 1 (le résumé d'une procédure dit comment on la demande), ADR-008 § 3 (tokens d'oto-frontend),
  ADR-012 § 3 (le service décide), ADR-013 § 3-5 (lecture publique), ADR-015 (écrans en français)

## Périmètre

### IN
- Repère du repli d'une cellule visible au survol, au focus et ouvert ; détail en gris.
- Ligne à l'état de revue marquée dans la grille ; une phrase qui explique le cycle.
- Bouton « Télécharger » à gauche de « Partager », par les routes d'E10-S01 ; téléchargement sur la page
  publique, à partir de ce que la page a chargé.
- Les encarts « À quoi sert cette page », « Cité dans », « Cite », « Sous-pages », en colonne de droite, ou en
  ligne au-dessus de la grille d'un tableau.
- Le résumé montré pour les seules procédures ; le nouveau résumé par défaut d'une procédure.
- La page vide en écriture : un Texte local, son invite, le focus.
- Le vide d'un tableau, nommé par l'assistant de la personne ; le glyphe `Table`.

### OUT
- Vue « Contexte » (`/context`), ligne « Organisation », « Nouveautés », ancre (ancien lot b), lien
  `hrefDuContexteServi`, encart « Voici ce que votre agent va lire » : E11-S10. Si E11-S10 passe avant, le
  Contexte ne garde ici que la note.
- Plus d'état brouillon à l'écran, publication à la création : E11-S02.
- Le choix du « + » et de `/`, les formes de bloc : E10-S06.
- Export du seul résultat filtré ou trié (HN-E11S05-8) ; export public au-delà des 500 lignes chargées
  (HN-E11S05-10) ; téléchargement d'un fichier joint : E10-S02.
- Décision de revue posée par l'agent : E11-S01 (FB-0009).
- Résumé par défaut d'une page ou d'un tableau, ou résumé écrit à l'écran ailleurs : écarté (HN-E11S05-15).
- Le texte de « À quoi sert cette page » : inchangé (`ui/contexte/libelles.ts` l. 35-50).

## Critères d'acceptation

### Lot a — Cellules et revue

- [ ] **AC-a1 — Repère au survol.** **Given** une cellule de la grille qui a une provenance **Then** son
  `<details>` porte la classe `oto-cell-detail` ; son `<summary>` n'a ni `::marker` ni
  `::-webkit-details-marker` ; un chevron (`aria-hidden`) suit la valeur, à opacité 0, sans changer la largeur
  de la cellule. **When** la souris survole la cellule (`td`), ou le `summary` a le focus clavier, ou le repli
  est ouvert **Then** le chevron est visible (opacité 1), tourné quand le repli est ouvert. **And** sous
  `@media (hover: none)`, il est toujours visible.
- [ ] **AC-a2 — Détail en gris.** **Given** un repli ouvert **Then** le détail (`DetailDeProvenance`) est en
  `text-mute`, liens compris sauf leur soulignement ; la valeur du `summary` reste en `text-ink`.
- [ ] **AC-a3 — Portée.** Seule la grille passe une provenance à `contenuDeCellule` (`grille.tsx` l. 37). La
  file de revue, la vue d'un bloc `reference` et la page publique n'ont pas de repli et ne changent pas.
- [ ] **AC-a4 — Ligne à revoir marquée.** **Given** un tableau dont l'en-tête déclare `lifecycle.review`
  **When** la grille rend une ligne dont la valeur de `lifecycle.column` égale `lifecycle.review.state`
  **Then** sa `<tr>` porte `data-state="review"` (fond et barre de `table.css`). **And** toute autre ligne, et
  toute ligne d'un tableau sans `review`, n'a pas d'attribut `data-state`.
- [ ] **AC-a5 — Le cycle expliqué.** **Given** l'îlot « À revoir » (`FileDeRevue`) **Then** il porte, sous son
  titre, une phrase visible composée des états déclarés, par exemple : « Une ligne entre à « à traiter »,
  passe à « en cours » quand un assistant la prend, puis à « à revoir ». Vous l'approuvez (« qualifié ») ou la
  refusez (« écarté »). Les lignes à revoir sont surlignées dans le tableau. » (HN-E11S05-4). **And** un
  lecteur la voit aussi.

### Lot b — libre

Passé à E11-S10 (AC-f1, AC-f5, AC-f6).

### Lot c — Télécharger à côté de « Partager »

- [ ] **AC-c1 — Le bouton.** **Given** une personne qui lit un nœud publié (`vue.status === "published"`,
  `schemas/nodes.ts` l. 189) **Then** l'en-tête montre « Télécharger en .csv » pour un tableau, « Télécharger
  en .md » pour une page, une procédure ou un Contexte, dans le créneau `access` de `ScreenHeader`, avant
  « Partager » dans le DOM et à l'écran. **And** sans panneau de partage (`partage` absent), le bouton est
  seul. **And** un nœud jamais publié n'a pas de bouton (HN-E11S05-9).
- [ ] **AC-c2 — Le fichier.** **When** elle clique **Then** l'écran appelle `GET
  /api/plateforme/tables/export?path=<chemin>` (tableau) ou `GET nodes/export?path=<chemin>` (sinon), puis
  `telecharger({filename, content})` d'E10-S01 : même fichier que depuis le rail, version publiée, tout le
  tableau (HN-E11S05-8). Le bouton est désactivé pendant l'appel.
- [ ] **AC-c3 — Refus.** **Given** un refus du service (`too_large` au-delà de 5 000 lignes, `not_found`,
  `invalid_arguments`) **Then** la phrase de `messageDErreur` (`ui/api/messages.ts`) s'affiche sous l'en-tête
  en `role="alert"`, et aucun fichier ne part.

### Lot d — Page publique

- [ ] **AC-d1 — Tableau.** **Given** la page publique d'un tableau **Then** l'en-tête (créneau `actions` de
  `ScreenHeader`) porte « Télécharger en .csv ». **When** le visiteur clique **Then** le fichier `<dernier
  segment>.csv` contient les lignes chargées par la page, colonnes dans l'ordre servi, écrites par `toCsv`
  (BOM, séparateur et décimales selon la langue de l'organisation, apostrophe devant `=`, `+`, `-`, `@`,
  tabulation, retour chariot, E10-S01 AC-b6). **And** quand `table.truncated` est vrai, le libellé dit
  « Télécharger en .csv (500 premières lignes) », la borne lue d'une constante (portage § 6).
- [ ] **AC-d2 — Page.** **Given** la page publique d'une page, d'une procédure ou d'un Contexte **Then**
  « Télécharger en .md » donne `<dernier segment>.md` : `# <titre>`, une ligne vide, puis `renderBlocks` des
  blocs publics, sans références de blocs, comme E10-S01 AC-a5.
- [ ] **AC-d3 — Rien de plus que la page.** Le fichier se construit dans le navigateur à partir de la vue
  déjà lue ; aucune requête n'est émise au clic (HN-E11S05-10). **And** `readPublicNode` rend `language`
  (`organisationLanguage`, `server/language.ts` l. 11-14), sans changer la fonction SQL.
- [ ] **AC-d4 — Canaux.** Chaque canal est nommé et testé :
  - *fermé* — formule exécutée à l'ouverture dans un tableur : `toCsv` (test d'AC-d1) ;
  - *fermé* — lignes au-delà de celles que la page montre : aucune route nouvelle, la vue de
    `public_node_by_token` borne à 500 (`migrations/20260928100000_platform_base_v1.sql` l. 1314-1316) ;
  - *ouvert, déjà ouvert* — le `.md` porte le texte brut des blocs, chemins des liens internes compris, que
    `GET public/<jeton>` sert déjà en JSON (`PublicBlock.text`) ; test : le fichier ne contient que des
    chaînes présentes dans la vue ;
  - *inchangé* — export connecté : droit de lecture décidé par le service d'E10-S01.

### Lot e — Encarts

- [ ] **AC-e1 — Colonne d'une page, d'une procédure.** **Given** une page ou une procédure lue ou écrite, à
  1 024 px ou plus **Then** le document est dans la colonne principale d'un `TwoColumns main="document"`, et
  la colonne de droite porte, dans cet ordre : « Cité dans » (`links_in`) ; « Cite » (`links_out`, un contenu
  cité par deux ancres compté une fois) ; « Sous-pages » (`children`, `childrenTotal`). Chaque encart est un
  `LinkedContent` fermé à l'arrivée, avec son glyphe, son titre et son total (`count`). Ouvert, il montre la
  liste d'aujourd'hui : glyphe de nature, lien, « sans cible », « déplacé vers … », puis « et N autres » au-delà
  des 20 servis. **And** un encart dont le total vaut 0 n'est pas rendu. **And** plus aucun « Contenus liés »
  ni « Mentionnés » à l'écran.
- [ ] **AC-e2 — Contexte.** **Given** un Contexte **Then** la colonne commence par « À quoi sert cette page » :
  un `LinkedContent` fermé à l'arrivée, glyphe `Info`, ses deux phrases dedans, sans compte ; puis les encarts
  d'AC-e1. **When** la personne l'ouvre (clic, Entrée ou Espace sur son `<summary>`) **Then** les deux phrases
  se lisent, et le navigateur annonce « développé ».
- [ ] **AC-e3 — Tableau.** **Given** un tableau **Then** « Cité dans », « Cite » et « Sous-pages » sont sur une
  ligne au-dessus de la grille (retour à la ligne s'ils ne tiennent pas), fermés ; ouvert, un encart pousse la
  grille vers le bas ; la grille garde toute la largeur (`oto-content-max` sans `data-width`).
- [ ] **AC-e4 — Lecture des liens.** **Given** les liens pas encore lus **Then** « Sous-pages », connu avec le
  nœud, se rend tout de suite, hors du `<Suspense>`, et n'est servi qu'une fois dans le flux ; à la place des
  deux autres, « Lecture des liens… » (`role="status"`). **Given** la lecture en échec **Then** l'erreur et
  « Réessayer » à leur place (`ErreurDeLecture`), même sans sous-page. **And** à 1 024 px ou plus, le document
  ne bouge pas quand les liens arrivent (la colonne de droite a sa piste, vide ou non).
- [ ] **AC-e5 — Écran étroit.** **Given** moins de 1 024 px **Then** une colonne : la carte du document, puis
  les encarts dans l'ordre d'AC-e2 ; aucun défilement horizontal à 375 px, dans les deux thèmes.

### Lot f — Résumé

- [ ] **AC-f1 — Résumé des seules procédures.** **Given** une page, un tableau ou un Contexte **Then** son
  résumé ne se montre pas sous le titre, ni lu ni en champ, à aucun niveau. **Given** une procédure **Then**
  rien ne change : lu au niveau lecture, en champ « Résumé » dès l'écriture.
- [ ] **AC-f2 — Ailleurs à l'écran.** La même règle vaut pour une ligne de « Sous-pages » (`Procédure ·
  <résumé>`, sinon la nature seule), la carte d'un nœud cité (`ui/tableau/carte-de-noeud.tsx` l. 26) et la
  page publique (`ui/public/page-publique.tsx` l. 210). Le résumé reste stocké et servi à l'assistant
  (`read`, `find`, `context`) : aucun changement hors de `ui/`.
- [ ] **AC-f3 — Résumé par défaut d'une procédure.** **Given** « Une procédure » créée depuis le rail **Then**
  son résumé est, à l'octet (158 caractères) : « Résumé à compléter : dites ce que fait la procédure et comment
  on la demande, avec les mots de l'équipe. L'assistant la choisit sur ce résumé et sur le titre. » Ceux d'une
  page et d'un tableau ne changent pas.

### Lot g — Page vide

- [ ] **AC-g1 — Page vide en écriture.** **Given** une page, une procédure ou un Contexte sans bloc, au niveau
  écriture **Then** ni « Cette page n'a pas encore de contenu. » ni « Commencer à écrire » ; l'éditeur montre
  un Texte vide, créé sur le poste, dont le champ porte l'invite, mot pour mot, sans mention de `/` :
  `Commencer à écrire... Utilisez '@' pour citer un autre contenu (page, tableau, procédure)`
  (HN-E11S05-22). **And** ce Texte ne part pas tant qu'il est vide ; tapé, il part comme un bloc neuf en
  tête (le chemin d'aujourd'hui). **And** retirer le dernier bloc d'une page laisse ce Texte vide à sa
  place ; l'éditeur n'est jamais sans rangée.
- [ ] **AC-g2 — Focus.** **Given** un nœud neuf (titre « Sans titre », aucun bloc) **Then** le focus va au
  titre, sélectionné (E05-S10 AC-b3) ; **When** Entrée dans le titre **Then** le titre s'enregistre et le focus
  va au Texte vide. **Given** une page vide qui a un titre **Then** le focus va au Texte vide à l'ouverture.
  **And** `/` sur ce Texte ouvre le choix d'E10-S06 (AC-a2), son « + » insère après lui (AC-a1).
- [ ] **AC-g3 — Page vide lue.** **Given** le niveau lecture, la version publiée ou la page publique **Then**
  « Cette page n'a pas encore de contenu. » reste (HN-E11S05-21).

### Lot h — Tableau vide, icône

- [ ] **AC-h1 — Tableau vide.** **Given** un tableau sans ligne **Then** « Ce tableau est vide » puis « C'est
  Claude qui pourra créer et modifier ses lignes. » quand l'assistant le plus récent de la personne est
  claude.ai ou Claude Code ; « C'est ChatGPT qui … » pour ChatGPT ; « C'est votre assistant qui … » sinon,
  sans connexion ou si leur lecture échoue (jamais d'alerte). **And** la page publique garde « Ce tableau est
  vide » seul.
- [ ] **AC-h2 — Icône.** **Given** un tableau **Then** son glyphe est `Table` de Phosphor partout où la table
  nature → glyphe sert : rail, menu de création, palette, en-tête d'écran, lignes de « Sous-pages » et des
  encarts, navigateur d'arbre (`ssr`).

## Implémentation

### Migrations prévues
Aucune : la langue vient de `readBrand(org)` en TypeScript ; `lastConnections` (`server/connect.ts` l. 67)
est réutilisée telle quelle. Aucun outil MCP touché.

### Schémas partagés
- `schemas/node-gestures.ts` : `PublicNodeView.language: string`.
- Composition `# <titre>` + `renderBlocks` du `.md` : dans `schemas/blocks-render.ts` (voir Refacto).

### Fichiers à modifier, par face (sous `packages/plateforme/`)
- `ui/tableau/cellule.tsx` : classe `oto-cell-detail`, chevron `CaretDown` (`aria-hidden`) dans le `summary`,
  `text-mute` au détail (l. 60). `ui/ds/components/css/table.css` : règles d'AC-a1.
- `ui/tableau/grille.tsx` : `rowState` d'AC-a4 depuis `entete.lifecycle`.
- `ui/tableau/file-de-revue.tsx`, `ui/tableau/libelles.ts` (`REVUE.cycle(…)`, l. 71-87) : AC-a5 ; même
  `libelles.ts` : `videTexte(nom)`, `nomDeLAssistant(famille)` (`claude.ai`, `Claude Code` → « Claude » ;
  `ChatGPT` → « ChatGPT » ; sinon « votre assistant »). `ui/tableau/corps-tableau.tsx` (l. 48),
  `ui/tableau/tableau-du-noeud.tsx` : prop `assistant?: string` (AC-h1).
- `ui/noeud/en-tete-du-noeud.tsx` : le bouton avant l'`AccessPanel`, créneau `access` (lot c) ;
  `ChapoDuNoeud` rend `null` hors d'une procédure (AC-f1).
- `ui/noeud/ecran-de-noeud.tsx` : `TwoColumns main="document"` pour page, procédure et Contexte ; `aside` =
  `props.annexes` puis `<ContenusLies>` ; la rangée `oto-node-lead` ne reste que si elle porte quelque chose
  (résumé d'une procédure, lecture en échec), pour que la colonne commence au haut de la carte (E05-S12
  AC-21) ; pour un tableau, la ligne d'encarts avant `CorpsDuNoeud`.
- `ui/noeud/sous-pages.tsx` : `Bandeau` devient trois encarts ; `<Suspense>` autour des seuls liens ;
  `SousPages` rendu hors de lui ; méta d'une ligne selon AC-f2 ; prop `disposition: "colonne" | "ligne"`.
- `ui/noeud/libelles.ts` : `CONTENUS_LIES` → `ENCARTS` (`citeDans`, `cite`, `sousPages`, `chargement`,
  `sansCible`, `deplace`, `autres`) ; retirés : `titre`, `mentionnes`, `mentionneDans`, `nMentionnes`,
  `nMentionneDans`, `EDITEUR.premierBloc` ; ajoutés : `EDITEUR.invite`, `resumeMontre(kind)`.
- `ui/noeud/en-tete-modifiable.tsx` : `neuf` sans condition de révision (HN-E11S05-20) ; Entrée dans le titre
  → focus au premier `[data-champ]` du document.
- `ui/noeud/editeur/editeur-de-blocs.tsx` : `PageVide` retiré ; l'invite passée à la rangée seule d'une page
  vide. `ui/noeud/editeur/rangee-de-bloc.tsx`, `ui/noeud/editeur/champ-de-bloc.tsx` : prop `invite`, en
  `placeholder` du `<textarea>` (l. 208).
- `ui/noeud/editeur/use-editeur.ts` (l. 42), `ui/noeud/editeur/modele.ts` : modèle initial et modèle après
  `retirer` jamais vides ; focus d'ouverture d'AC-g2. `ui/noeud/editeur/actions.ts` (l. 166),
  `ui/noeud/editeur/gestes.ts` (l. 20) : le geste `insererEnTete`, sans appelant après `PageVide`, part ;
  `modele.insererEnTete` reste (rangée initiale).
- `ui/ds/components/css/editeur.css` : `.oto-block-field::placeholder { color: var(--mute) }`.
- `ui/contexte/annexes-du-contexte.tsx` : `NotePanel` → `LinkedContent` fermé.
- `ui/coque/libelles.ts` (l. 50) : `resumeParDefaut.procedure`. `ui/coque/arbre-du-rail.tsx` (l. 15, 31) :
  `Table` (`dist/csr/Table`) ; `ui/arbre/navigateur-d-arbre.tsx` (l. 7, 37) : `Table` (`dist/ssr/Table`).
- `ui/tableau/carte-de-noeud.tsx` (l. 26) : AC-f2.
- `ui/public/page-publique.tsx` : bouton dans `Contenu` (l. 194-216), fichier bâti depuis `vue.table`
  (l. 154-190) ou `vue.blocks` (lot d) ; résumé hors procédure caché (l. 210, AC-f2).
- `server/shares.ts` : `readPublicNode` (l. 203-225) ajoute `language`.

### Fichiers à créer
- `ui/components/bouton-telecharger.tsx` (client) : reçoit soit `{route, path}` (lot c), soit `{filename,
  content}` déjà bâti (lot d) ; appelle `telecharger` d'E10-S01 ; dit le refus. Ce qui casse sans lui : un
  Server Component (en-tête, page publique) ne peut pas créer de `Blob`. Si E10-S01 écrit l'appel dans
  `ui/coque/gestes-du-rail.tsx`, il passe dans ce composant ou dans `ui/api/telecharger.ts` (deux
  occurrences, `coding-standards.md § DRY`).

### Hôte
- `src/app/(dashboard)/n/[...chemin]/page.tsx` : `lireLeTableau` (l. 194-204) lit `lastConnections`
  seulement quand `tableGridRows` rend 0 ligne, par `resultatDe` ; passe `assistant` (famille la plus
  récente). `annexes` et `liens` restent les mêmes props.
- `src/app/p/[jeton]/[[...chemin]]/page.tsx` : aucun changement (passe déjà la vue).

### Patterns à suivre
- `portage-ecrans.md § 2. Server Component, client au plus bas` : le bouton reçoit des données ; un
  `<Suspense>` n'entoure que ce qui attend sa promesse (« Sous-pages » hors de lui).
- `portage-ecrans.md § 3. Tokens du jeu Oto, sous CoquilleOto` : aucun token nouveau (`text-mute`,
  `ui/styles/oto.css` l. 34) ; invite en `--mute`, deux thèmes à l'œil.
- `portage-ecrans.md § 4. Quatre états` : lecture des liens en échec dite, jamais tue.
- `portage-ecrans.md § 6` : la composition du `.md` vit dans `schemas/`, lue par le service et la page
  publique.
- `accessibility-patterns.md § Couleurs & Contraste` : le chevron n'est pas le seul signal (le `summary` reste
  focalisable) ; la barre de 2 px de la ligne à revoir est une forme (`table.css` l. 186-187).
- `accessibility-patterns.md § États` : `<details>` natif, l'état et l'annonce viennent du navigateur.

## Rayon d'impact

### Appelants
- `contenuDeCellule` / `Cellule` : `rg -n "contenuDeCellule|<Cellule" C:/apps/oto-pkg/packages/plateforme/ui`
  → `grille.tsx` l. 37 (seul appel avec provenance), `file-de-revue.tsx` l. 61 et 84, `vue-de-tableau.tsx`
  l. 36 et 40, `page-publique.tsx` l. 168. Sans provenance, pas de `<details>` : rien ne change pour eux.
- `Grille` : `rg -n "<Grille" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/src` → un seul,
  `corps-tableau.tsx` l. 106. `rowState` : `rg -n "rowState=" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/src`
  → aucun usage.
- `EnTeteDuNoeud`, `ChapoDuNoeud` : `rg -n "EnTeteDuNoeud\b|ChapoDuNoeud|ResumeModifiable|AIDE_DU_RESUME" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `ecran-de-noeud.tsx` l. 130 et 147 (seuls appelants), `en-tete-du-noeud.tsx` l. 112-116,
  `en-tete-modifiable.test.tsx` l. 30. Le bouton ne demande pas de prop nouvelle (`vue` suffit).
- `PublicNodeView` : `rg -ln "PublicNodeView" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `schemas/node-gestures.ts`, `schemas/index.ts`, `server/shares.ts`, `ui/public/page-publique.tsx`,
  `tests/integration/pages/e05s10d-page-publique.test.tsx` (fixtures gagnent `language`). `readPublicNode` :
  `src/app/p/[jeton]/[[...chemin]]/page.tsx` l. 33, `api/public.ts` (JSON public gagne un champ),
  `tests/integration/e05s10e-partage-public.test.ts`, `retraits-v1.test.ts`.
- Encarts : `rg -n "ContenusLies|CONTENUS_LIES" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `ecran-de-noeud.tsx` l. 40 et 150 (seul rendu), `sous-pages.tsx`, `ui/noeud/libelles.ts` l. 195,
  `tests/e2e/e05s12-contexte.spec.ts` (nom de fonction).
- Annexes : `rg -n "AnnexesDuContexte|ANNEXES\." C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `page.tsx` l. 29 et 174, `ui/index.ts` l. 56, `contexte.test.tsx` l. 5-46, `e05s12-contexte.test.tsx`
  l. 11 et 112. Props inchangées.
- `summary` rendu à l'écran : `rg -n "summary" C:/apps/oto-pkg/packages/plateforme/ui --glob "*.tsx"` →
  `sous-pages.tsx` l. 131, `carte-de-noeud.tsx` l. 26, `page-publique.tsx` l. 210 (AC-f2).
- Page vide : `rg -n "PAGE_VIDE|premierBloc|insererEnTete" C:/apps/oto-pkg/packages/plateforme/ui` →
  `corps-du-noeud.tsx` l. 87 (lecture, gardé), `page-publique.tsx` l. 118 (gardé), `editeur-de-blocs.tsx`
  l. 102-105 (retiré), `actions.ts` l. 166, `gestes.ts` l. 20, `modele.ts` l. 254.
- Glyphes : `rg -n "ListBullets|GLYPHES" C:/apps/oto-pkg/packages/plateforme/ui` → `arbre-du-rail.tsx`
  l. 15, 31, 66 ; `creation-dans-le-rail.tsx` l. 164 ; `palette-de-recherche.tsx` l. 59 ; `noeud/glyphes.tsx`
  l. 22 ; `navigateur-d-arbre.tsx` l. 7, 35-37. Tous suivent la table.
- Vide d'un tableau : `rg -n "GRILLE\.vide|videTexte" C:/apps/oto-pkg/packages` → `corps-tableau.tsx` l. 48,
  `page-publique.tsx` l. 160 (titre seul, inchangé). `TableauDuNoeud` :
  `rg -n "TableauDuNoeud\b" C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` → `page.tsx` l. 188-208,
  `grille.test.tsx`, `file-de-revue.test.tsx` : prop facultative, rien à changer.
- Résumé par défaut : `rg -ln "resumeParDefaut|à compléter\." C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `creation-dans-le-rail.tsx` l. 55, `coque/libelles.ts` l. 50, `rail-application.test.tsx` l. 146.
- Tests à réécrire : `rg -ln "Contenus liés|Mentionné dans|À quoi sert cette page|Commencer à écrire|pas encore de contenu|Ses colonnes sont prêtes" C:/apps/oto-pkg/tests`
  → intégration `ecran-de-noeud.test.tsx` (l. 12, 173-234, 383-394, 415, 436), `editeur-de-blocs.test.tsx`
  l. 413-414, `contexte.test.tsx`, `flux-des-liens.test.tsx`, `pages/noeud-page.test.tsx` l. 159-204,
  `pages/noeud-tableau-page.test.tsx` l. 95 et 128, `grille.test.tsx` l. 377-378,
  `e05s10c-requetes-de-la-page.test.tsx` (commentaire) ; e2e `e05s10b.spec.ts`, `e05s11-page.spec.ts`,
  `e05s12-contexte.spec.ts`, `e05s13-retours.spec.ts`, `page.spec.ts`, `procedure-et-contexte.spec.ts`
  (rôle `note` → `group`).
- Fichiers touchés par deux lots de cette story, à coder d'une traite : `en-tete-du-noeud.tsx` (lots c, f),
  `page-publique.tsx` (lots d, f), `tableau/libelles.ts` (lots a, h), `grille.test.tsx` et
  `ecran-de-noeud.test.tsx`.

### Doublons
- Masquer le triangle d'un `summary` : `rg -n "webkit-details-marker" C:/apps/oto-pkg/packages/plateforme/ui`
  → `.oto-linked` (`content.css` l. 239), `.oto-accordion-trigger` (`misc.css` l. 213). Verdict : laisser ;
  sélecteurs propres à leur composant, la règle tient en trois lignes.
- Montrer au survol : `rg -n "data-reveal" C:/apps/oto-pkg/packages/plateforme/ui` → `[data-reveal]`
  (`islands.css` l. 87-105), attaché à `.oto-island-head`. Verdict : reprendre le principe, pas le sélecteur.
- Télécharger un fichier : `rg -n -i "télécharg|download|Blob\(" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/src`
  → rien aujourd'hui ; E10-S01 crée `ui/api/telecharger.ts`, E10-S02 un « Télécharger » de fichier joint, par sa route de lecture. Verdict :
  réutiliser `telecharger` ; un seul bouton client pour l'en-tête et la page publique.
- Repli d'encart : `rg -n "LinkedContent|NotePanel|<details" C:/apps/oto-pkg/packages/plateforme/ui --glob "!ds/**"`
  → `sous-pages.tsx`, notes du Contexte, `contexte-servi.tsx`, `cellule.tsx`, `conversation.tsx`. Verdict :
  réutiliser `LinkedContent` tel quel pour les quatre encarts (« même design ») ; `NotePanel` reste pour
  l'aperçu (E11-S10 décide de son sort).
- Nom d'un assistant : `rg -n "hostFamily|famille" C:/apps/oto-pkg/packages/plateforme` → `server/connect.ts`
  l. 50, `ui/accueil`. Verdict : réutiliser `lastConnections` ; le nom générique est un libellé d'écran.
- Aide au résumé d'une procédure : `ui/procedure/libelles.ts` l. 27 (`AIDE_DU_RESUME`), sans appelant.
  Verdict : laisser (le texte par défaut porte la consigne) ; signalé en Refacto.
- Registry : `rg -n -i "reveal|survol|télécharg|export|LinkedContent|NotePanel|AnnexesDuContexte|EcranDeNoeud|GLYPHES" C:/apps/oto-pkg/.method/conventions/component-registry.md`
  → aucune entrée de téléchargement ; `EcranDeNoeud` (l. 86) cite un précédent « à gauche de « Partager » »
  (« Déplacer », retiré), posé dans le même créneau ; `LinkedContent`, `NotePanel`, `AnnexesDuContexte`,
  `GLYPHES` réutilisés.

### Effet produit
- Toutes les pages de l'arbre : disposition en deux colonnes ; sous 1 410 px de contenu, le document perd la
  largeur de la colonne (280 px) même sans encart (HN-E11S05-13).
- Grille : toutes les pages de tableau, dans l'hôte et dans un ERP qui monte `TableauDuNoeud`. En-tête :
  toutes les pages de nœud.
- API publique : `GET public/<jeton>` gagne `language` (ADR-013 § 4 : la langue de l'organisation n'est pas
  une donnée d'un nœud). Page publique et cartes citées : résumé caché hors procédure.
- Journal : chaque clic connecté inscrit `GET tables/export` ou `GET nodes/export` (E10-S01).
- Page d'un tableau vide : une requête de plus (`lastConnections`), seulement sans ligne.
- `find`, `read`, routage, texte MCP et liste d'outils : inchangés ; le résumé par défaut d'une procédure,
  stocké, entre au routage comme celui d'aujourd'hui (HN-E11S05-16).
- Aucune policy RLS, aucun webhook, aucune migration, aucune route nouvelle.
- Docs, par le pilote : `docs/prd.md` l. 299, 377, 388, 391 (« Contenus liés », « titre et résumé en place »).

### Refacto
- Proposé, accepté le 2026-09-29 (à signaler à qui code E10-S01) : la composition du `.md` d'E10-S01 AC-a5
  vit dans `schemas/blocks-render.ts`, pas dans `server/nodes/export.ts`, pour que la page publique la
  reprenne. Coût : une fonction déplacée. Sans lui : deux copies qui divergeront.
- Écarté : unifier le repère de ligne `running` (la cellule clé dit déjà le bail).
- Écarté : une prop `defaultOpen` ou une variante de `LinkedContent` ; `<details>` fermé est déjà le défaut,
  et le composant sert aussi le bloc « Repli » (E10-S04).
- Écarté : retirer `AIDE_DU_RESUME` et la prop `aideDuResume` (`en-tete-modifiable.tsx` l. 222), code mort
  antérieur, hors de la demande.

### Accord avec E10-S06
Accord avec la session E10 (2026-09-29) : E10-S06 ne code plus le « + » d'une page vide. `PageVide`, son
message « Cette page n'a pas encore de contenu. » et son bouton restent en l'état jusqu'à cette story, qui
les retire (lot g). Ce qui reste d'E10-S06 s'applique au Texte vide du lot g : `/` y ouvre le choix (AC-a2),
son « + » insère après lui (AC-a1).

## Hypothèses

- **HN-E11S05-1** : chevron `CaretDown` dans le `summary`, règles dans `table.css` (source : motif
  `.oto-linked`, `content.css` l. 223-258).
- **HN-E11S05-2** : détail en `text-mute`, pas `--faint` : aucun token ajouté (source : portage § 3).
- **HN-E11S05-3** : seul l'état de revue marque une ligne ; `running` et `failed` restent inutilisés
  (source : simple ; le bail est déjà dans la cellule clé, `grille.tsx` l. 29-32).
- **HN-E11S05-4** (**validée, 2026-09-29**) : l'aide du cycle est une phrase visible dans l'îlot « À revoir »,
  composée des états déclarés.
- **HN-E11S05-5 à HN-E11S05-7** : passées à E11-S10 avec le lot b (HN-E11S10-14, -22, -21).
- **HN-E11S05-8** (**validée, 2026-09-29**) : le bouton exporte tout le tableau, comme le rail (E10-S01
  AC-b6), même sous un filtre ou une recherche.
- **HN-E11S05-9** : bouton pour toute personne qui lit un nœud publié ; version publiée, jamais le brouillon
  (source : E10-S01 AC-a5). Avec E11-S02, un nœud créé à l'écran est publié à la création : le bouton ne
  manque qu'à un nœud que l'assistant a gardé en brouillon (`publish: false`).
- **HN-E11S05-10** (**validée, 2026-09-29**) : le fichier public se bâtit dans le navigateur à partir de la vue
  chargée (500 lignes au plus, dit par le libellé).
- **HN-E11S05-11** : séparateur CSV public selon `organisationLanguage` servi par `readPublicNode` (source :
  E10-S01 AC-b6 ; la page publique n'a pas de session).
- **HN-E11S05-12** (ex-HN-E11S12-1) : ordre « Cité dans », « Cite », « Sous-pages » ; glyphes
  `ArrowSquareIn`, `ArrowSquareOut`, `TreeStructure` ; total seul (source : retour, `LinkedContent`).
- **HN-E11S05-13** (ex-HN-E11S12-2) : la colonne de droite a toujours sa piste pour page, procédure et
  Contexte ; sans lien ni sous-page, elle reste vide, sans phrase (source : `islands.css` l. 739-747).
- **HN-E11S05-14** (ex-HN-E11S12-3) : pour un tableau, « Lecture des liens… » tient la ligne pendant la
  lecture ; sans rien, la ligne part (source : `portage-ecrans.md § 4`).
- **HN-E11S05-15** (ex-HN-E11S12-4), validée (le responsable d'Oto, 2026-09-29) : le résumé est caché sur
  tous les écrans hors procédure (Contexte et tableau compris) et ne s'écrit plus à l'écran pour eux ;
  l'assistant l'écrit par `write`. Option écartée : le cacher sous le titre seulement, le garder dans les
  listes et les cartes.
- **HN-E11S05-16** (ex-HN-E11S12-5) : le résumé par défaut d'une procédure reste une vraie valeur stockée,
  sans exemple métier qui attirerait des demandes (source : ADR-003 § 1, `server/catalog/contracts.ts` l. 36).
- **HN-E11S05-17** (ex-HN-E11S12-6), validée (le responsable d'Oto, 2026-09-29) : « premier assistant » = la
  famille la plus récente de `lastConnections`. Option écartée : la plus ancienne connexion, requête
  nouvelle (`order by ts asc limit 1`).
- **HN-E11S05-18** (ex-HN-E11S12-7) : familles inconnues ou « Client non identifié » → « votre assistant »
  (source : simple).
- **HN-E11S05-19** (ex-HN-E11S12-8) : le Texte d'une page vide n'existe que sur le poste ; il ne part jamais
  vide (`aEnvoyer`, `actions.ts` l. 63 ; `retirerSiVide` l. 144-149) (source : E05-S10 AC-a4).
- **HN-E11S05-20** (ex-HN-E11S12-9) : « nœud neuf » = titre « Sans titre » et aucun bloc, sans condition de
  révision : E11-S02 publie à la création (source : décision 1 du 2e tour).
- **HN-E11S05-21** (ex-HN-E11S12-10), validée (le responsable d'Oto, 2026-09-29) : au niveau lecture et sur
  la page publique, « Cette page n'a pas encore de contenu. » reste (le retour vise l'écriture). Option
  écartée : rien.
- **HN-E11S05-22** (ex-HN-E11S12-11), tranchée (le responsable d'Oto, 2026-09-29) : l'invite ne se pose que
  sur le Texte seul d'une page vide, et vaut exactement
  `Commencer à écrire... Utilisez '@' pour citer un autre contenu (page, tableau, procédure)`, sans ajout
  sur `/`, même après E10-S06. Option écartée : ajouter « , « / » pour choisir un bloc ».
- **HN-E11S05-23** (implémentation) : la borne publique `PUBLIC_TABLE_ROWS_MAX = 500` vit dans
  `schemas/node-gestures.ts`, lue par la page publique et son libellé (source : AC-d1, « la borne lue d'une
  constante », portage § 6).
- **HN-E11S05-24** (implémentation) : `PublicNodeView.language` est typé `Language`, non `string` (source :
  `organisationLanguage`, AC-d3).
- **HN-E11S05-25** (implémentation) : un refus du téléchargement se dit par `messageDErreur(erreur,
  EXPORTS.refus)` (source : AC-c3).
- **HN-E11S05-26** (implémentation) : l'invite ne se pose que sur le Texte seul, local et vide d'une page vide
  (source : HN-E11S05-22).
- **HN-E11S05-27** (implémentation) : Entrée dans le titre mène au premier bloc ; à l'ouverture, le focus va au
  Texte d'une page vide seulement si le titre n'est pas « Sans titre » (source : AC-g2).
- **HN-E11S05-28** (implémentation) : l'aperçu d'un Contexte se place entre « À quoi sert cette page » et les
  encarts (source : AC-e2, E11-S10).
- **HN-E11S05-29** (implémentation) : la ligne d'encarts d'un tableau est masquée vide (`empty:hidden`)
  (source : HN-E11S05-14, la ligne part sans rien).

## Actions JB

- Aucune.

## Tests attendus

### Unit tests
- [ ] `tests/unit/ui-editeur-modele.test.ts` : modèle initial d'une page sans bloc (une rangée Texte) ;
  `retirer` du dernier bloc (une rangée neuve).
- [ ] `tests/unit/e11s05-libelles.test.ts` : `nomDeLAssistant` (claude.ai, Claude Code, ChatGPT, inconnu,
  absent) ; `resumeMontre` par genre ; résumé par défaut d'une procédure ≤ 200 caractères, à l'octet.

### Integration tests
- [ ] `grille.test.tsx` : `oto-cell-detail`, chevron `aria-hidden`, détail en `text-mute` (AC-a1, AC-a2) ;
  `data-state="review"` sur la seule ligne à revoir (AC-a4) ; vide nommé et son repli (AC-h1).
- [ ] `file-de-revue.test.tsx` : phrase du cycle composée des états d'un en-tête d'essai (AC-a5).
- [ ] `ecran-de-noeud.test.tsx` : bouton par genre, avant « Partager », absent d'un nœud jamais publié, clic
  → route et `telecharger` (espions), refus en `role="alert"` (lot c) ; trois encarts dans la colonne,
  fermés, total, absents à 0 (AC-e1) ; ligne avant la grille (AC-e3) ; résumé de la seule procédure
  (AC-f1) ; AC-g1, AC-g3.
- [ ] `flux-des-liens.test.tsx` : AC-e4, « Sous-pages » servi une fois pendant la lecture des liens.
- [ ] `contexte.test.tsx` : AC-e2, `group` « À quoi sert cette page » fermé, ouvert par Entrée.
- [ ] `editeur-de-blocs.test.tsx`, `en-tete-modifiable.test.tsx` : AC-g1 (`placeholder` comparé mot pour
  mot), AC-g2 (focus, Entrée).
- [ ] `pages/e05s10d-page-publique.test.tsx` : CSV d'un tableau (BOM, `;` en `fr`, apostrophe devant `=`),
  libellé tronqué, `.md` d'une page, aucune requête au clic, résumé caché hors procédure (lot d, AC-f2).
- [ ] `e05s10e-partage-public.test.ts` : `readPublicNode` rend `language` (AC-d3).
- [ ] `pages/noeud-tableau-page.test.tsx` : `lastConnections` lu sans ligne seulement (AC-h1).
- [ ] `e05s11-coque.test.tsx` : tracé de `Table` au rail, à la palette, à la création, au navigateur (AC-h2).
- [ ] `rail-application.test.tsx` : AC-f3.
- [ ] MCP : sans objet, aucun outil touché.

### E2E tests
- [ ] `tests/e2e/tableau.spec.ts` : chevron d'opacité 0, puis 1 au survol ; visible d'emblée sous le profil
  mobile (AC-a1) ; « Télécharger en .csv » à gauche de « Partager » rend un fichier (AC-c2).
- [ ] `tests/e2e/partage-public.spec.ts` : le visiteur télécharge le CSV d'un tableau partagé.
- [ ] `tests/e2e/e11s05-ecrans.spec.ts`, clair et sombre, 375 et 1 280 px : page avec liens (colonne,
  ouverture), Contexte, tableau vide, page vide (invite, focus) ; captures, avec cellule survolée et ouverte,
  ligne à revoir, bouton « Télécharger ». Les six specs listées au Rayon d'impact, adaptées.

## Post-implémentation

### Écarts avec l'architecture

- `ui/noeud/editeur/modele.ts` ne gagne qu'une ligne : le modèle d'une page vide vit dans `page-vide.ts`
  (borne `max-lines`).
- La composition du `.md` (« Refacto ») était déjà faite par E10-S01 (`pageMarkdown`) : rien à déplacer.
- AC-d3 dit « dans le navigateur » : le fichier public est composé au rendu serveur, à partir de la même vue,
  puis passé à l'îlot ; aucune requête au clic (HN-E11S05-10).
- `language` ajouté à la vue publique (`readPublicNode`, `GET public/<jeton>`) : une donnée de marque, au
  regard d'ADR-013 § 3.
- Les specs e2e mesurent l'opacité du chevron par `toHaveCSS`, comme la story l'exige.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `BoutonTelecharger` | `packages/plateforme/ui/components/bouton-telecharger.tsx` | Client ; `format`, `libelle`, puis `chemin` (fichier du service) ou `fichier` (déjà composé, page publique) ; refus en `role="alert"` |
| `modeleDeLaPage`, `estLaPageVide` | `packages/plateforme/ui/noeud/editeur/page-vide.ts` | Une page sans bloc s'ouvre sur un Texte local jamais vide, invite `EDITEUR.invite` ; retirer le dernier bloc le remet |

### Notes

- Approuvée en revue, fusionnée sur `main` sans commit (commit commun à venir). Hypothèses d'implémentation
  HN-E11S05-23 à 29 reportées avec les autres dans `docs/decisions/hypotheses.md`.
- Lecture des cellules (`cellValue`, `keyValue`, `rowCells`) commune à l'export connecté et public, dans
  `schemas/csv.ts` ; `rowCells` et `keyValue` exportés par `./schemas`.
