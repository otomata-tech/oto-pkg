# Story E11-S02 — Publication directe, brouillons refusés, corbeille et suppression de lignes depuis un assistant

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 5.4 Concevoir, organiser, partager (§ Brouillon et publication, `docs/prd.md` l. 330-333 ; niveaux l. 416-421) ; 4.2 Faire (`write` et `call` d'un assistant) ; 4.4 Concevoir et mettre à jour ; tableaux et file de travail |
| **Statut** | 🟢 Ready |
| **Priorité** | Must (FB-0007 bloque un tableau ; FB-0010 partie 3 ; décision D135) |
| **Référence UI** | N/A : aucun écran neuf, des phrases retirées, réécrites ou ajoutées dans des zones existantes, style du paquet : zone de publication (`ui/noeud/publication.tsx`, AC-g1 ; bandeau du brouillon retiré, AC-c3), infobulle de l'en-tête, liste des procédures, ligne du fil d'accueil (`ui/accueil/fil-activite.tsx`, AC-h3) ; le reste est du texte servi à l'assistant (`mcp-patterns.md`) |
| **Conventions** | database, supabase, security, forms, registry, mcp, a11y, portage, testing |
| **Estimation** | L, haut de fourchette (règle d'accès et défaut de `write`, textes servis, éditeur au niveau écriture, création publiée ; trois fonctions, une migration, la phrase d'écran et le nombre de lignes à revoir porté jusqu'au fil ; beaucoup de tests réécrits) |
| **Vague** | E11, après E11-S01 lots a à f et E11-S03 (mêmes fichiers), avant E11-S01 lot g (son panneau s'ouvre au niveau écriture, qui publie l'en-tête par AC-a2) et E11-S07 ; après la fusion d'E10 (E10-S01, E10-S02 écrivent par `writeNode`) ; version 1.0.1 (fiche D131) |
| **Dépend de** | E11-S01 lots a à f : `schemas/table-write.ts`, `server/catalog/contracts.ts` (`write.table`) ; E11-S03 : `write-result.ts`, `publish.ts`, `mcp/tools.ts`, `schemas/nodes.ts` ; relire les numéros de ligne après leur fusion. Amendements ci-dessous écrits par le pilote avant le code (fiche D135) |
| **Porteuse de migration** | **Oui** (Ⓜ) : fonction `platform.discard_draft`. La règle d'accès de la publication ne vit pas en SQL (vérifié, § Migrations prévues) |
| **Invariant touché** | ADR-011 § 3 (écrire publie ; troisième fonction atomique du brouillon), ADR-002 § 1 (sens du champ `publish` et description de `write`), H63 (qui publie). P10 non touchée (HN-E11S02-8) |

## Contexte

Chemins relatifs à `packages/plateforme/`.

**Publication directe (fiche D135).** Retour du responsable d'Oto, verbatim : « "Brouillon non
publié — cette page n'a jamais été publiée" => à supprimer et publié automatiquement (idem pour les
tableaux et tout contenu, c'est lourd et pas utile, on publie tout directement !) ». Décisions
(2026-09-29) : écran et assistant ; écrire = publier (le niveau écriture publie) ; un brouillon ne
reste que si l'assistant le demande (`publish: false`) ou si la publication est refusée. La gestion
garde le partage, les droits, le déplacement et la suppression.

Aujourd'hui :
- **Création à l'écran.** Le « + » du rail envoie `POST nodes` sans `publish`
  (`ui/coque/creation-dans-le-rail.tsx` l. 53-56) ; `create` ouvre un brouillon à la révision 0
  (`server/nodes/write.ts` l. 281-287) ; le rail montre `status: "draft"` (l. 151).
- **Publication à l'écran.** Seule, au niveau gestion : 3 s après la dernière frappe ou en quittant
  la page (`ui/noeud/publication.tsx` l. 81-169 ; frappe l. 136-140 ; titre et résumé,
  `en-tete-modifiable.tsx` l. 152). Au niveau écriture : la phrase « La publication revient à… »
  (`publication.tsx` l. 210-211, `ui/noeud/libelles.ts` l. 103-113) et le bandeau
  `BandeauDuBrouillon` (l. 52-65), rendu par `editeur/editeur-de-blocs.tsx` l. 126 et
  `corps-du-noeud.tsx` l. 103.
- **Service.** Publier exige la gestion : `NODE_ACTIONS.publish` (`server/access.ts` l. 46),
  `publishNode` (`server/nodes/publish.ts` l. 105), `publishAfter` (`write.ts` l. 203-213), `edit`
  (l. 353-355).
- **`write` (MCP).** `publish` vaut `false` par défaut (`schemas/nodes.ts` l. 152-155 ; description
  `mcp/tools.ts` l. 76 ; règle `server/context/blocks/code.ts` l. 27 et sa traduction
  `ui/contexte/libelles.ts` l. 135 ; résultat « Publish it with … », `write-result.ts` l. 144-145).
- **Tableau jamais publié.** Ni grille (`src/app/(dashboard)/n/[...chemin]/page.tsx` l. 218) ni
  `table.write` (« has no published header yet », `server/tables/meta.ts` l. 171-172, 180-181,
  236-237) : un assistant ne peut pas remplir un tableau créé par « + ».

Après cette story, un brouillon n'existe plus que sur `publish: false` d'un assistant ou sur une
publication refusée (contrôle d'une procédure `publish.ts` l. 116-119, en-tête de tableau, Contexte
vide non confirmé). Il faut alors pouvoir en sortir.

**FB-0007 — un brouillon de tableau refusé bloque tout.** Un en-tête refusé à la publication (type
changé sur une colonne remplie, clé changée, retrait non confirmé, plus de 5 000 lignes) reste dans
`node_drafts.meta`. Toute écriture d'en-tête suivante part du brouillon (`currentHeader`,
`server/tables/evolution.ts` l. 222-225, appelé par `server/nodes/write.ts` l. 124-130) ; toute
publication rejoue les contrôles sur l'en-tête en attente entier (`server/nodes/publish.ts` l. 120 →
`prepareTablePublication`, `evolution-publish.ts` l. 216-233). Le refus dit « The draft is kept;
nothing was published » (`evolution-checks.ts` l. 106-108 et 152-155, `evolution-publish.ts`
l. 52-57) sans dire comment en sortir. Le brouillon ne part qu'à une publication réussie
(`publish_node`, ligne de base l. 1460) ; aucune annulation n'existe, ni fonction, ni écran
(« Abandonner mon texte » ne résout qu'un conflit de bloc, `ui/noeud/editeur/conflit-de-bloc.tsx`
l. 26-36), ni droit en base (`node_drafts` sans policy ni privilège `DELETE`, l. 3034-3044 et
3444-3454). Les lignes, elles, s'écrivent (`loadTable` lit l'en-tête publié, `server/tables/meta.ts`
l. 236). Le patch ne sait pas retirer un attribut (`schemas/tables.ts` l. 272-298) : abandonner le
brouillon suffit à revenir à l'en-tête publié.

**FB-0010 partie 3 — rien ne se supprime depuis un assistant.** La corbeille n'existe qu'à l'écran
(`server/nodes/trash.ts`, `api/trash.ts`, 30 jours, FR-CONC-12). `table.write` n'efface que des
cellules ; aucun service ne supprime une ligne, bien que la RLS le permette (`blocks_delete_writer`,
l. 2946). Aucune ADR ne l'interdit (P12 ne vise que le déplacement).

Correction : écrire publie ; trois fonctions derrière `call`, sensibles, en deux temps (PRD
principe 5, l. 51 ; H86) : `node.discard_draft`, `node.trash`, `table.delete_rows`. Aucun outil
n'est ajouté (ADR-002 § 1).

**Refs :**
- PRD : principe 5 ; § 5.4 l. 330-333 et l. 416-421 ; FR-CONC-01 (l. 386), FR-CONC-03 (l. 388),
  FR-CONC-05, FR-CONC-12 ; § 3 `write` (l. 221) et « How this workspace works » (l. 230)
- ADR-011 § 3 et § 4, ADR-002 § 1, ADR-012 § 3 ; H63, H86, N28, N35, P10, P12
  (`docs/decisions/hypotheses.md`)
- Architecture § 4 (`node_drafts` l. 177, `publish_node` l. 220, Fonctions SQL), § 5 `nodes/`
  (l. 286), catalogue

### Amendement proposé d'ADR-011 § 3 (écrit par le pilote)

> 3. **Brouillon et publication** (page, procédure, Contexte, en-tête de tableau). **Écrire publie** :
> une écriture de l'écran ou de `write` est publiée dans la foulée, au niveau écriture ; l'écran
> regroupe les frappes et publie 3 s après la dernière et en quittant la page. Un brouillon ne reste
> que si un assistant le demande (`publish: false`) ou si la publication est refusée (contrôle d'une
> procédure, en-tête de tableau, Contexte vide non confirmé) ; il est partagé, et la publication
> suivante le publie entier. Modifier écrit l'état `draft` […inchangé…]. Publier remplace l'état
> `published` par le brouillon, incrémente `nodes.revision`, prend un instantané, réécrit les liens,
> puis efface le brouillon. L'en-tête d'un tableau suit la même règle, publié ou non. Abandonner un
> brouillon le supprime entier sans toucher l'état publié.
> Brouillon, publication et abandon passent par trois fonctions atomiques de la base, `open_draft`,
> `publish_node` et `discard_draft`. […suite inchangée…]

### Amendement proposé d'ADR-002 § 1 (écrit par le pilote)

> Exception assumée, sans client (fiche D135) : le défaut de `publish` de `write` passe de `false` à
> `true` ; `publish: false` garde le sens d'avant ; la description de `write` change en conséquence.

### Remplacement proposé de H63

> Écrire et publier exigent le niveau écriture, en-tête d'un tableau compris ; la gestion garde le
> partage, les règles, le déplacement, la corbeille et le propriétaire. Le chemin qui suit un titre
> publié change au niveau écriture ; l'ancien chemin reste un alias qui mène au nœud.

## Périmètre

- Service : publier au niveau écriture, en-tête d'un tableau publié compris ; le chemin suit le
  titre au niveau écriture, l'ancien chemin menant toujours au nœud.
- `write` : publication par défaut, `publish: false` pour un brouillon ; textes servis.
- Écran : création publiée ; publication seule au niveau écriture ; bandeau, phrases et étiquettes
  de brouillon retirés ou réécrits ; aucun avis d'un brouillon trouvé à l'ouverture.
- `node.discard_draft` : abandon du brouillon entier d'un nœud publié, par une fonction SQL atomique.
- `node.trash` : la corbeille de l'écran, depuis un assistant.
- `table.delete_rows` : suppression définitive de lignes par clé.
- Refus de publication d'un en-tête et contrat `write.table` qui disent comment abandonner ; à
  l'écran, la phrase qui renvoie à l'assistant, sans « Réessayer ».
- Journal et fil d'activité de l'accueil, qui dit combien de lignes supprimées étaient à revoir.

## Hors périmètre

- Regrouper plusieurs pauses de frappe en une révision, ou purger `node_versions` : V2 si la
  croissance gêne (HN-E11S02-20).
- « Abandonner le brouillon » à l'écran (bouton, route `POST nodes/discard`) :
  plus tard ; seul un assistant abandonne un brouillon (HN-E11S02-12).
- Nœuds créés par la base (Contextes, espaces personnels) : inchangés, publiés à leur première
  écriture (HN-E11S02-23).
- Filtrer des nouveautés, des prompts ou du routage une procédure « Sans titre » vide : aucun filtre
  (HN-E11S02-26).
- Restaurer depuis un assistant : l'écran Corbeille le fait (FR-CONC-12) ; V2 si le besoin apparaît.
- Retirer un attribut d'une colonne par patch (`lifecycle`, `max_length`, `options`) : l'abandon rend
  l'en-tête publié ; un retrait publié reste à cadrer par le pilote s'il est demandé.
- Historique des valeurs, restauration d'une ligne supprimée : epic E11, OUT.
- Indications d'abandon dans les refus d'une procédure ou d'une page (`procedures-check.ts` l. 257,
  `links.ts` l. 107) : l'assistant corrige les blocs par `ops`.
- Renommer `?version=publiee` et l'adresse de l'écran Corbeille : E11-S07.
- Dépôt par lien, imports `.md` et `.csv` : E10-S02 et E10-S01 suivent le nouveau défaut par
  `writeNode` ; E10-S02 renvoie déjà à D135, les textes « exige la gestion » d'E10-S01 sont à
  aligner par le pilote (recouvrement listé dans § Effet produit).

## Critères d'acceptation

### Lot a — Écrire = publier (service)

- [ ] **AC-a1 — Le niveau écriture publie.** **Given** Léa au niveau écriture sur `ventes/faq`
  **When** `write` avec `ops` et `publish: true`, ou `POST nodes` `{publish: true}` sur un brouillon
  **Then** la page est publiée (révision + 1). **And** `admin_node publish` suit la même règle.
  **And** partager, déplacer, mettre à la corbeille, restaurer et changer le propriétaire exigent
  toujours la gestion (`access.ts` l. 44-53), refus inchangés.
- [ ] **AC-a2 — En-tête d'un tableau publié : le niveau écriture publie.** **Given** Léa au niveau
  écriture sur `ventes/salons` (publié, révision 3) **When** `write` avec `header` (colonnes, clé,
  `proof`, `lifecycle` avec `review.agents_may_decide`, ou `closed`), sans `publish` **Then** l'en-tête
  est publié (révision 4) après les contrôles d'aujourd'hui (`prepareTablePublication` : type ou clé
  en `conflict`, `too_large`, retrait en `needs_confirmation`, refus d'AC-d5), et la ligne de
  publication nomme chaque changement comme au niveau gestion (`publishedChanges`,
  `tables/evolution-publish.ts` l. 239-256 : « added … », « lifecycle replaced », « closed »,
  « proof required » ou « proof optional » d'E11-S01). **And** une publication qui trouve un en-tête
  en attente (`node_drafts.meta` non nul), par l'écran ou par `write`, le publie de même au niveau
  écriture. **And** la ligne de journal de l'appel (`write`, ou la route `POST nodes`) porte le chemin
  du tableau et `header` dans ses arguments. **Given** un tableau créé par Léa (révision 0) **Then**
  sa première publication passe de même. Aucun refus propre à l'en-tête au niveau écriture
  (HN-E11S02-17, tranchée).
- [ ] **AC-a3 — Le chemin suit le titre au niveau écriture ; l'ancien chemin mène toujours au
  nœud.** **Given** Léa, niveau écriture sur `ventes/sans_titre` et sur `ventes` **When** elle publie
  le titre « Tarifs 2026 » **Then** le chemin devient `ventes/tarifs_2026`, le résultat porte
  `Renamed: now at ventes/tarifs_2026; the old path ventes/sans_titre still leads here.`
  (`renamedLine`, `server/nodes/rename.ts` l. 17-19), et `ventes/sans_titre` est inscrit dans
  `node_aliases` par le déclencheur `nodes_aliases_on_move` (`security definer`, ligne de base
  l. 917-935 et 2756 : le même qu'un déplacement, quel que soit le niveau de qui renomme). **And**
  l'ancien chemin fonctionne toujours, comme après un renommage par la gestion aujourd'hui :
  - MCP : `read {"path": "ventes/sans_titre"}` sert le nœud, précédé de
    `ventes/sans_titre moved to ventes/tarifs_2026 on <date>: use the new path.` (`movedNotice`,
    `server/nodes/lookup.ts` l. 148-150), `moved_from` dans les données ; un tableau renommé se lit
    et s'écrit de même par `table.*` (`loadTable` → `findNode`, `server/tables/output.ts` l. 20-24) ;
  - écriture : `write` sur l'ancien chemin modifie le nœud, et le publie, avec la même ligne en tête
    (`writeNode` → `lookupAlias`, `server/nodes/write.ts` l. 318-334) ;
  - écran : `/n/ventes/sans_titre` ouvre le nœud (lu par `findNode`, alias compris) et le rail marque
    sa ligne (`NoeudOuvert`, E05-S10 AC-b12) ; la page ouverte pendant le renommage garde son adresse
    et sa file écrit encore par l'ancien chemin ;
  - les descendants suivent, chaque ancien chemin en alias.
  **Given** Léa sans l'écriture sur le parent **Then** la publication passe, le chemin reste, le log
  dit `[platform] followTitle: path kept` (HN-E11S02-18).
- [ ] **AC-a4 — Aucune règle en base.** **Given** la session de Léa (niveau écriture) **When**
  `platform.publish_node` **Then** la base publie : aucune policy ni fonction ne lit le niveau
  (§ Migrations prévues). La décision reste au service (ADR-012 § 3).

### Lot b — `write` publie par défaut

- [ ] **AC-b1 — Défaut.** **Given** `write` sans `publish` (création ou modification) **Then**
  l'écriture est publiée : `Published ventes/faq revision 4 (2 sections, 7 blocks). Next write: base_revision 4.`
  (tableau : `Published ventes/salons revision 1: <résumé>. Next write: base_revision 1.`),
  `data.status: "published"`. **Given** `publish: false` **Then** brouillon, textes actuels :
  `Draft of ventes/faq saved on revision 3: …` puis
  `Publish it with acme_write {"path": "ventes/faq", "base_revision": 3, "publish": true}.`, à tout
  niveau d'écriture (HN-E11S02-21, HN-E11S02-27).
- [ ] **AC-b2 — Refus : brouillon gardé, dit.** **Given** une procédure dont un bloc `call` est
  refusé **When** `write` sans `publish` **Then** le brouillon est gardé, `isError`, code
  `invalid_arguments`, texte actuel de `procedurePublicationError`
  (`server/procedures-check.ts` l. 249-262) suivi de la ligne
  `Writing it in several calls? Pass publish: false until the last one.` (N28, HN-E11S02-22).
  Autres refus (en-tête refusé d'AC-d5, `stale_revision`) : brouillon gardé, texte d'AC-d5, les
  autres inchangés.
- [ ] **AC-b3 — Rien à écrire.** **Given** une modification sans `ops`, `title`, `summary` ni
  `header` **When** `publish: false` **Then** `invalid_arguments`
  `Nothing to write: give ops, title, summary or header.` **When** `publish` absent ou `true`
  **Then** le brouillon en attente est publié, sinon `Nothing to publish: ventes/faq has no pending draft.`
- [ ] **AC-b4 — Textes servis.** Mot pour mot :
  - `schemas/nodes.ts`, `publish` : `false: save a draft without publishing it (default true: the write is published at once).`
  - `mcp/tools.ts` l. 76 : `saved as a draft; publish: true makes it live.` devient
    `published at once (publish: false keeps an unpublished draft).` ; description sous 1 000
    caractères, texte d'E11-S03 AC-c6 compris (`tests/unit/mcp-tools.test.ts` l. 55, 126).
  - `code.ts` l. 27 : `- <p>_write publishes at once; publish: false keeps an unpublished draft. To edit, pass base_revision = the revision you read, or the one your last write returned.` ;
    `REGLES_OTO` l. 135 : « L'écriture publie aussitôt ; l'assistant ne garde un brouillon que s'il
    le demande. Pour modifier, il repart de la version qu'il a lue, ou de celle que sa dernière
    écriture a rendue. » (le test qui compte les deux listes passe).
  - `catalog/contracts.ts` l. 38 (`write.procedure`) : `publish it with publish: true (manage level)`
    devient `each write publishes it`, et la phrase finit par
    `Writing it in several calls: pass publish: false until the last one.` ; l. 94 (`write.table`) :
    `publish: true (manage level) applies it` devient
    `publishing (the default) applies it` (règle 10 et refus d'AC-d5 en plus).
  - `read`, ligne d'accès (`read-format.ts` l. 53-57) : gestion
    `access: manage (write and publish, share, move, delete)` ; écriture, tableau compris
    `access: write (write and publish; sharing, moving and deleting are reserved to <who>)`.
  - `read` en brouillon (`read-body.ts` l. 43-44) : « Publish it with … » dès le niveau écriture.

### Lot c — Écran : publication directe

- [ ] **AC-c1 — Création publiée.** **Given** Léa au niveau écriture sous `ventes` **When** « + »
  → Page, Tableau ou Procédure **Then** le nœud est publié à la révision 1 (`POST nodes` sans
  `publish`), le rail le montre `status: "published"` ; un tableau montre sa grille (colonne clé)
  et `table.write` y écrit sans refus.
- [ ] **AC-c2 — Le niveau écriture publie à l'écran.** **Given** Léa au niveau écriture sur une page,
  une procédure, un Contexte ou un tableau **When** elle tape **Then** chaque écriture de la file
  part avec `publish: false`, puis la publication part 3 s après la dernière frappe et en quittant
  la page, comme au niveau gestion aujourd'hui ; l'indication dit « Enregistré. » ; aucune phrase
  « La publication revient… ». Refus d'une procédure listés, Contexte vide confirmé, « Réessayer » :
  inchangés, aux deux niveaux.
- [ ] **AC-c3 — Ni bandeau ni avis de brouillon.** **Given** un nœud publié, sans brouillon ou avec
  un brouillon (écrit par la personne, laissé par un assistant avec `publish: false`, ou refusé)
  **When** il s'ouvre, à tout niveau d'écriture **Then** aucun bandeau ni avis ne parle du brouillon,
  et aucun lien « Voir la version publiée » n'est rendu (la route `?version=publiee` reste,
  HN-E11S02-25). **When** la personne tape **Then** la publication qui suit publie le brouillon
  partagé entier, sans le dire (HN-E11S02-19, tranchée).
- [ ] **AC-c4 — Phrases.** « Brouillon non publié — … » (deux variantes), « Brouillon enregistré. »
  et « La publication revient … » n'existent plus. Réécrites : infobulle « État » « Publié·e » ou
  « Non publié·e », « Révision » le nombre ou « aucune » (`libelles.ts` l. 150-158) ; liste des
  procédures « Non publiée », « Publiée · rév. 4 · modifications en attente »
  (`ui/procedure/libelles.ts` l. 66-69) ; « Revenir au brouillon » → « Revenir aux modifications en
  attente » (l. 32) ; « Ce bloc a été supprimé pendant que vous écriviez. » (l. 78) ;
  `PUBLICATION.refusee` → « Vous n'avez pas le droit de publier cette modification. » (l. 86).
- [ ] **AC-c5 — Titre prêt à écrire.** **Given** un nœud créé par « + » (révision 1, « Sans titre »)
  **When** il s'ouvre **Then** le titre est sélectionné (`TitreModifiable`, `en-tete-modifiable.tsx`
  l. 216-219, reconnu au titre seul, HN-E11S02-29).

### Lot d — Abandonner un brouillon refusé ou demandé

- [ ] **AC-d1 — Récapitulatif.** **Given** un nœud publié (révision ≥ 1) avec un brouillon, et une
  personne au niveau écriture **When** `call node.discard_draft {"path"}` sans `confirm` **Then** rien
  ne change et le résultat (`status: "needs_confirmation"`) dit : le chemin, le genre et le titre ; la
  révision d'ouverture et « last saved » (`draftSavedAt`) ; pour un tableau, la ligne
  `pendingHeaderChanges` ; titre et résumé en attente ; pour une page, le nombre de blocs ajoutés,
  changés, déplacés et supprimés (`diffBlocks`) ; « The published revision N stays as it is. This
  cannot be undone. » ; puis la phrase commune `NOTHING_SENT` (`server/calls.ts` l. 64).
- [ ] **AC-d2 — Abandon.** **Given** le même état **When** l'appel avec `confirm: true` **Then**
  `platform.discard_draft` supprime les blocs `draft` puis la ligne `node_drafts`, dans une seule
  transaction ; `nodes` (révision, statut, méta) et les blocs publiés ne bougent pas ; la réponse dit
  « Draft of <path> discarded: <path> is back to its published revision N. » ; un `read` suivant
  sert la version publiée, et une écriture d'en-tête repart de l'en-tête publié.
- [ ] **AC-d3 — Refus.** Décidés par le service avant toute requête d'écriture :
  - chemin inconnu ou illisible : `not_found`, texte de `unknownNode` ;
  - niveau lecture seule : `forbidden`, `reservedTo("write", …)` avec à qui demander (H68) ;
  - aucun brouillon : `invalid_arguments`, « Nothing to discard: <path> has no pending draft. » ;
  - jamais publié (révision 0 : création par un assistant avec `publish: false`, création refusée,
    ou nœud créé par la base, HN-E11S02-23) : `invalid_arguments`, « <path> has never been published:
    discarding its draft would leave it empty. To remove it, call <p>_call node.trash {"path":
    "<path>"} (manage level). » ;
  - brouillon enregistré ou publication en cours entre la lecture et l'abandon (`PT409`) :
    `stale_revision`, « stale revision: <path> changed while discarding (its draft was saved
    meanwhile). Nothing was discarded. Read it again with draft: true, then retry. », précédé de son
    `console.error("[platform] nodes: …")`.
- [ ] **AC-d4 — La fonction SQL.** `platform.discard_draft(p_node uuid, p_draft_stamp timestamptz)` :
  refuse un nœud hors des organisations de l'appelant (`42501`), prend le verrou consultatif
  exclusif 7401 de `publish_node`, rend `55000` sans brouillon, `PT409` si `updated_at` diffère du
  tampon non nul, supprime les blocs `draft` puis `node_drafts`, rend la révision du nœud. Une
  écriture de brouillon concurrente échoue (`blocks_lock_draft` : `PT409`) ou passe avant ; jamais
  entre les deux suppressions.
- [ ] **AC-d5 — Refus qui disent comment sortir.** **Given** une publication d'en-tête refusée
  (`conflict` de type ou de clé, `too_large` des 2 000 lignes à purger ou des 5 000 lignes,
  `needs_confirmation` d'un retrait), par `write` sans `publish` ou par l'écran **Then** « The draft is
  kept; nothing was published. » est suivi de « To go back to the published header, discard the
  draft: <p>_call node.discard_draft {"path": "<path>"}. », écrit une fois (`evolution-checks.ts`) et
  utilisé par les trois sites. **And** le contrat `write.table` gagne une règle 10 qui dit la même
  chose, et ses quatre refus « On publish » finissent par « the draft is kept (discard it with
  node.discard_draft) ». **And** les quatre `PlatformError` de ces refus portent
  `details: { reason: "header_refused" }`, que l'API rend déjà (`api/handler.ts` l. 132) et que
  l'écran lit en `raison` (`ui/api/client.ts` l. 76-78) ; le texte servi à l'assistant ne change pas
  pour autant (HN-E11S02-15).

### Lot e — Mettre à la corbeille

- [ ] **AC-e1 — Récapitulatif.** **Given** une personne au niveau gestion **When** `call node.trash
  {"path"}` sans `confirm` **Then** les contrôles de `trashNode` courent sans rien écrire (structure,
  gestion, contenus invisibles dessous) et le résultat dit : « About to move <path> (<genre> « titre »)
  to the trash, with N pages under it: … » (20 chemins au plus, `boundedList`), « A manager can
  restore it for 30 days from the Trash screen (<origin>/corbeille); after that it is erased. »
- [ ] **AC-e2 — Exécution.** **When** `confirm: true` **Then** `trashNode` s'exécute tel quel et la
  réponse dit « <path> moved to the trash with N pages under it. » et le lien de la corbeille ;
  `read` du chemin rend `not_found` ; l'écran Corbeille liste l'élément.
- [ ] **AC-e3 — Refus.** Ceux de `trashNode`, servis tels quels, au récapitulatif comme à
  l'exécution : racine, espaces personnels, Contexte, dossier d'équipe (`invalid_arguments`) ;
  gestion manquante (`forbidden`, à qui demander) ; pages invisibles dessous (`forbidden`) ; course
  (`conflict`).

### Lot f — Supprimer des lignes

- [ ] **AC-f1 — Arguments.** `{"table", "keys"}` : `keys` de 1 à 50 clés (`rowKeyArgSchema`,
  borne `MAX_WRITE_ROWS`), schéma strict `tableDeleteRowsArgsSchema`.
- [ ] **AC-f2 — Récapitulatif.** **Given** une personne au niveau écriture **When** sans `confirm`
  **Then** `loadTable`, puis `requireWrite`, puis la lecture des lignes (`rowsByKey`) ; le résultat
  dit « About to delete N rows of <table> for good: » puis chaque clé avec ses trois premières
  colonnes renseignées, « Not found: … », « Refused: <clé> — <raison> » (listes bornées à 20),
  « Their values and proofs cannot be restored. To empty cells instead, use table.write with clear. »
  **And** si des lignes à supprimer sont à l'état de revue (`lifecycle.review.state`), la phrase
  « N of these rows are waiting for review: <clés>. Deleting them removes them from the review
  queue. » suit la liste (clés bornées à 20) (HN-E11S02-8).
- [ ] **AC-f3 — Exécution.** **When** `confirm: true` **Then** les lignes sont relues et supprimées
  en une transaction, chacune gardée par la révision relue (`delete … where key = … and revision = …
  returning key`) ; la réponse dit « Deleted N rows of <table>: … », puis « N of these rows were
  waiting for review. » si des lignes supprimées l'étaient, puis les clés absentes et refusées ;
  zéro ligne supprimée n'est pas une erreur (`isError` faux, le texte le dit).
- [ ] **AC-f4 — Lignes refusées, une à une.** Rien n'est supprimé pour elles :
  - réservée par une autre personne, bail actif : « claimed by <nom> (worker w) until hh:mm UTC; wait
    for its release or the end of the lease. » (règle de `table.write`, `server/tables/write.ts`
    l. 163-166) ; un bail expiré ou tenu par l'appelant ne bloque pas ;
  - changée entre la lecture et la suppression : « changed meanwhile; read it again. », précédé de
    son `console.error("[platform] tables: delete_rows …")`.
  Une ligne à l'état de revue n'est pas refusée : elle se supprime comme les autres, quel que soit
  `review.agents_may_decide` (AC-f2, AC-f3).
- [ ] **AC-f5 — Tableau fermé.** **Given** `header.closed: true` **When** `table.delete_rows`, sans
  puis avec `confirm` **Then** récapitulatif et suppression se déroulent comme sur un tableau ouvert :
  `closed` n'interdit que la création de lignes (HN-E11S02-7).
- [ ] **AC-f6 — Refus de la table.** Tableau inconnu, nœud qui n'en est pas un, en-tête absent
  (`loadTable`) ; écriture refusée (`requireWrite`, à qui demander), comme `table.write`.

### Lot g — Écran : le refus d'un en-tête renvoie à l'assistant

- [ ] **AC-g1 — Phrase d'aide.** **Given** une personne au niveau écriture ou gestion sur un
  tableau publié, dont la publication de la file (`POST nodes`, `publish: true`, 3 s après la frappe) est refusée avec la
  raison `header_refused` **Then** la zone de publication dit en `role="alert"` « Ce changement
  d'en-tête est refusé : demandez à votre assistant d'abandonner le brouillon. » et n'affiche pas
  « Réessayer » ; aucun bandeau (AC-c3). **And** les autres échecs (réseau, `stale_revision`,
  `forbidden` avec la phrase d'AC-c4, un `conflict` sans cette raison, refus d'une procédure)
  gardent leur message et « Réessayer » ; une frappe suivante republie comme aujourd'hui, et une
  publication réussie retire la phrase. Deux thèmes : la phrase reprend le style de l'alerte
  existante (`text-sm text-ink`).

### Lot h — Trace, catalogue, accueil, isolation

- [ ] **AC-h1 — Catalogue.** `find` trouve les trois fonctions (« delete », « trash », « discard »,
  « draft ») ; `read` sert leur contrat (`class sensitive: two-step confirmation`) ; `call` les exclut
  des suites proposées et des exemples (H87) ; `admin_connector` liste le connecteur natif `node` ;
  la liste des outils reste de six.
- [ ] **AC-h2 — Journal.** Chaque appel s'écrit comme tout `call` : cible = nom de la fonction,
  `args` avec `confirm`. **And** la ligne d'une exécution de `table.delete_rows` porte dans `args`
  la clé réservée `_outcome: {"deleted": N, "review": M}` (M : lignes supprimées qui étaient à
  revoir), posée après le masquage et la coupe de `loggedArgs` ; aucune autre fonction n'en pose.
- [ ] **AC-h3 — Accueil, « dont N à revoir ».** Une ligne `call` **confirmée** (`args.confirm =
  true`) de `node.trash` devient `trashed` sur `args.arguments.path` ; de `table.delete_rows`, le
  verbe nouveau `deleted_rows` sur `args.arguments.table` (« a supprimé des lignes dans » / « avez
  supprimé des lignes dans », suivis de la nature et du titre comme « a écrit dans le tableau … »).
  Un récapitulatif sans `confirm` et `node.discard_draft` n'y paraissent pas. **And** quand des
  lignes à revoir étaient parmi les supprimées, la ligne finit par « , dont N à revoir » (N sommé sur
  les gestes regroupés, AC-14 d'E05-S12) : « Vous avez supprimé des lignes dans le tableau Suivi des
  prospects, dont 2 à revoir ». Le nombre vient de la ligne de journal de l'exécution
  (`args._outcome.review`, HN-E11S02-16) ; absent ou nul, rien n'est ajouté.
- [ ] **AC-h4 — Isolation.** `discard_draft` sur un nœud de l'organisation B, appelé par un membre
  de A : `42501`, rien de supprimé. `node.trash` et `table.delete_rows` sur un chemin de B : `not_found`.

## Sécurité : canaux

- *ouvert, voulu* — un rédacteur publie l'en-tête d'un tableau, qu'il le crée ou le change
  (colonnes, clé, `proof`, `lifecycle.review.agents_may_decide`, `closed`) : il peut retirer la
  preuve exigée, laisser les assistants décider la revue, fermer ou rouvrir le tableau (HN-E11S02-17,
  décision du 2026-09-29). Borné par le niveau écriture, les contrôles de publication d'un en-tête
  (types, clé, retrait confirmé, 5 000 lignes), et tracé : la ligne de publication nomme chaque
  changement, la ligne de journal porte le chemin et `header`, chaque décision d'un assistant porte
  `origin: "agent"` (E11-S01 lot e) ; test AC-a2 au niveau écriture, par `write` et par la route.
- *ouvert, voulu* — un rédacteur publie une page, une procédure ou un Contexte d'équipe, servis
  aussitôt aux lecteurs et aux assistants (décision D135). Borné par le niveau écriture, le journal,
  la provenance et `node_versions` ; test AC-a1.
- *ouvert, voulu* — un brouillon laissé par un assistant (`publish: false`) est publié sans avis par
  la frappe suivante d'une personne au niveau écriture (HN-E11S02-19, brouillon partagé d'ADR-011
  § 3). Borné par le niveau écriture, `node_versions` et le journal ; test AC-c3.
- *ouvert, voulu* — le chemin d'un nœud change au niveau écriture quand son titre change ; l'ancien
  reste un alias qui mène au nœud (AC-a3, HN-E11S02-18) ; aucun autre déplacement ; test que `move`
  reste refusé au niveau écriture.
- *ouvert, voulu* — un rédacteur abandonne le brouillon partagé (HN-E11S02-2) et supprime des lignes
  (AC-f2) ; la corbeille reste à la gestion (AC-e3). Bornés par les deux temps, le journal et le
  refus décidé avant la requête ; tests AC-d3, AC-e3, AC-f6.
- *fermé* — autre organisation : `42501` en base, `not_found` au service (AC-h4).

## Implémentation

### Migrations prévues

`packages/plateforme/migrations/<horodatage>_discard_draft.sql`, additive (réunie dans
`_v1_0_1.sql` par le pilote, D124) : `create function platform.discard_draft(p_node uuid,
p_draft_stamp timestamptz)` `returns integer`, `security definer`, `set search_path to ''`, corps
d'AC-d4 calqué sur `publish_node` (ligne de base l. 1360-1462) ; `revoke all … from public`,
`grant execute … to authenticated`. Ni table, ni colonne, ni policy, ni privilège sur `node_drafts`.

Rien pour la publication au niveau écriture. Vérifié dans
`migrations/20260928100000_platform_base_v1.sql` : `publish_node` (l. 1360-1463) ne lit aucun niveau
(« Le droit de publier est décidé par le service avant l'appel », l. 1370) ;
`node_drafts_update_writer` (l. 3040), `blocks_*_writer` (l. 2946-2958) et `nodes_update_writer`
(l. 3070) ne filtrent que l'organisation ; `nodes_guard` (`20260928120000_platform_private.sql`
l. 195) ne lit aucun niveau.

### Schémas Zod

- `schemas/nodes.ts` : `writeNodeSchema.publish` (l. 152-155), description seule, reste
  `.optional()` ; le défaut se lit dans le service (`publish !== false`), pour que `CorpsDEnvoi`
  (type de sortie) ne l'exige pas (HN-E11S02-21).
- `schemas/table-write.ts` : `tableDeleteRowsArgsSchema`.
- `schemas/node-gestures.ts` : `nodeDiscardArgsSchema` (`{path}`, entrée de la fonction).
- `schemas/activity.ts` : `deleted_rows` dans `ACTIVITY_VERBS` ; `Activity.inReview?: number`
  (lignes à revoir supprimées, sommées sur le groupe), facultatif : les doublures existantes restent
  valides.

### Fichiers à créer

- `migrations/` : le fichier ci-dessus.
- `server/nodes/discard.ts` : `discardDraft` (le service, appelé par `run` ; aucune route à
  l'écran, HN-E11S02-12), `nodeDiscardDraft` (`defineFunction`, connecteur `node`, classe
  `sensitive`, `summarize`) ; à part de `store.ts`, déjà à 352 lignes.
- `server/tables/delete-rows.ts` : `tableDeleteRows` (`defineFunction`, `summarize`, `run` qui rend
  `outcome: { deleted, review }`).
- Tests : ceux de la section Tests attendus.

### Fichiers à modifier, par face

- `server/` :
  - `access.ts` : `publish: ACCESS_LEVELS.write` ; `rename` (écriture, « Renaming », « Ask them to
    rename it. »).
  - `nodes/publish.ts` : aucune règle neuve ; `requireNodeLevel(…, "publish")` (l. 105) suit
    `access.ts`, en-tête d'un tableau compris (AC-a2).
  - `nodes/write.ts` : `finish` publie si `publish !== false` ; `publishAfter` (l. 203-213) sans
    garde de niveau, le refus « Draft of … not published: » retiré ; `edit` l. 350 et 353 (AC-b3,
    écriture).
  - `nodes/write-result.ts` : `Next write: base_revision N.` ; « Publish it with » dès l'écriture.
  - `nodes/rename.ts`, `nodes/move.ts` l. 135 : `moveNode` reçoit l'action (`move` ou `rename`).
  - `nodes/trash.ts` : extraire de `trashNode` la décision (`trashPlan` : nœud, structure, gestion,
    descendants, invisibles) ; `trashNode` l'appelle puis écrit ; `nodeTrash` (`defineFunction`,
    `summarize` sur `trashPlan`, `run` sur `trashNode`) s'y ajoute (220 lignes aujourd'hui).
    Réorganisation : les tests existants d'`e05s10e-gestes.test.ts` passent inchangés.
  - `nodes/read-format.ts`, `nodes/read-body.ts`, `procedures-check.ts`, `context/blocks/code.ts` :
    textes d'AC-b2 et AC-b4.
  - `catalog/contracts.ts` : `write.procedure` et `write.table` (AC-b4), règle 10 et refus d'AC-d5.
  - `catalog/registry.ts` : les trois fonctions dans `catalogFunctions()`.
  - `tables/evolution-checks.ts` : `keptDraft(prefix, path)`, utilisé par `refused` et le refus
    `needs_confirmation`, et `{ reason: "header_refused" }` sur leurs `PlatformError` ;
    `tables/evolution-publish.ts` : `tooManyRows` reçoit le préfixe et la même raison.
  - `catalog/define.ts` : `FunctionOutput.outcome?: Record<string, number>` ; `tool-output.ts` :
    `ToolOutput.outcome?` (pour le journal) ; `calls.ts` l. 169-176 : `outcome` de la fonction passé
    à la sortie.
  - `activities.ts` : `verbAndPath` et `scanRows` (colonnes `confirmed`, `path` des arguments,
    `review` lu de `args._outcome` sous garde de type) ; `groupGestures` somme `inReview`.
  - `database.ts` : régénéré (`pnpm db:types`) ; `index.ts` : export de ce que les tests appellent.
- `schemas/nodes.ts`, `mcp/tools.ts` : AC-b4. `mcp/server.ts` l. 175-182 : `outcome` posé en
  `args._outcome` de la ligne (HN-E11S02-16).
- `ui/` :
  - `noeud/editeur/file-d-operations.tsx` l. 195 : `publish: false` avant `...corps` (une ligne ; la
    publication, et le panneau d'E11-S01 lot g livré ensuite, posent `publish: true`).
  - `noeud/publication.tsx` : `Publication` sans `niveau` ni `phrase` ; `BandeauDuBrouillon` (l. 52-65)
    retiré (AC-c3) ; commentaire d'en-tête l. 3-16 ; `usePublicationSeule` retient qu'un refus porte
    la raison `header_refused`, `PublicationSeule` rend alors la phrase d'AC-g1 sans « Réessayer ».
  - `noeud/editeur/lignes-d-etat.tsx` (`IndicationDEnregistrement` sans `niveau`),
    `noeud/editeur/editeur-de-blocs.tsx` (l. 54, 113, 126), `noeud/corps-du-noeud.tsx` (l. 97-145,
    `BrouillonDuTableau` et `lienVersionPubliee`), `contexte/contexte-servi.tsx` (l. 100-104) : props
    `niveau`, `phrase`, `phraseDePublication` et `lienVersionPubliee` retirées.
  - `noeud/libelles.ts` (AC-c4 ; `phraseDePublication`, `EDITEUR.enregistre` et
    `ECRAN.voirLaVersionPubliee` (l. 30) retirés ; phrase d'AC-g1 dans `PUBLICATION_SEULE`, l. 220),
    `procedure/libelles.ts`, `contexte/libelles.ts`
    l. 135, `noeud/en-tete-modifiable.tsx` l. 217, `coque/creation-dans-le-rail.tsx` l. 151.
  - `accueil/libelles.ts` : libellé de `deleted_rows` et `dontARevoir(n)` ; `accueil/fil-activite.tsx` :
    `phraseDe` (l. 77-80) ajoute « , dont N à revoir ».
- `api/`, hôte (`src/`) : aucun changement (route `[...route]` et `POST` déjà montés).
- Docs (pilote) : ADR-011 § 3, ADR-002 § 1 (textes ci-dessus) ; `hypotheses.md` H63, N28 ; `prd.md`
  l. 221, 230, 330-333, 342, 386, 388, FR-CONC-05 (l. 390), 420-421, une ligne FR-CONC-14 pour les
  trois fonctions ; `architecture.md` § 4 Fonctions SQL (`discard_draft`), § 5 `nodes/` (l. 286) ;
  `docs/mcp-golden-queries.md` RG1 (l. 71), RW4, RW5, RW8 (l. 93-97, 126-130), PR1 à PR3
  (l. 137-139), TB1, TB3 (l. 162-164), et les nouvelles ; fiche D135 ; `CHANGELOG.md` du paquet
  (`### Hosts` : défaut de `publish` changé, migration) ; component registry.

### Patterns à suivre

- `security-patterns.md § Droits dans le service` (niveau et en-tête décidés avant `publish_node` ;
  récapitulatif et exécution décident avant leur requête) et `§ Idempotence et mutations
  concurrentes` (révision, tampon, `console.error` d'abord).
- `database-patterns.md § Règles SECURITY DEFINER`.
- `mcp-patterns.md § 3` et `§ 4` : anglais, refus bornés qui disent quoi faire ; textes figés testés
  mot pour mot.
- `portage-ecrans.md § 6` et `accessibility-patterns.md` : `role="alert"` existant pour AC-g1 ;
  tokens Oto, deux thèmes.

## Rayon d'impact

### Appelants
- `rg -n "publish" C:/apps/oto-pkg/packages/plateforme/schemas/nodes.ts` → l. 152-155 (le champ),
  l. 103 (`read draft`, inchangé), l. 189, 196, 216 (`status`, inchangés).
- `rg -n "writeNode\(|publishNode\(|\"publish\"\)" C:/apps/oto-pkg/packages/plateforme -g '!*.test.ts'`
  → `api/nodes.ts` l. 78 (écran : les écritures de la file passent `publish: false`), `mcp/server.ts`
  l. 95 (défaut neuf), `mcp/admin/tools/node.ts` l. 47 (suit AC-a1), `write.ts` l. 212 et 354.
- `rg -n "reservedTo\(\"publish\"|ACCESS_LEVELS.manage" C:/apps/oto-pkg/packages/plateforme/server/nodes`
  → `write.ts` l. 205-206, 225, 353, `write-result.ts` l. 144-145, `read-format.ts` l. 54,
  `read-body.ts` l. 43, `move.ts` l. 135, `trash.ts` l. 82 et 147 (corbeille : gestion, inchangée).
- `rg -n "BandeauDuBrouillon" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `publication.tsx` l. 52, `editeur-de-blocs.tsx` l. 126, `corps-du-noeud.tsx` l. 103 ; aucun test
  ne l'importe, les tests lisent son texte.
- Lien vers la version publiée, rendu par le bandeau seul :
  `rg -n "voirLaVersionPubliee|lienVersionPubliee" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src`
  → `libelles.ts` l. 30, `corps-du-noeud.tsx` l. 111-145, `editeur-de-blocs.tsx` l. 54, 113, 126,
  `contexte-servi.tsx` l. 100-102 : retirés avec le bandeau. Doublures :
  `rg -l "Voir la version publiée|lienVersionPubliee" C:/apps/oto-pkg/tests` → `blocs-de-reference`,
  `contexte`, `e05s11-editeur`, `ecran-de-noeud`, `editeur-de-blocs`, `en-tete-modifiable`,
  `procedure` (`.test.tsx`) : prop retirée, une doublure qui la passe encore échoue au type-check.
- Anciens chemins (AC-a3) : `rg -n "lookupAlias|movedNotice|renamedLine" C:/apps/oto-pkg/packages/plateforme/server --glob '!**/*.test.ts'`
  → `nodes/lookup.ts` l. 111, 142, 149, `nodes/write.ts` l. 232, 318, 334, `nodes/read.ts` l. 160,
  `nodes/rename.ts` l. 17, `tables/output.ts` l. 27, `index.ts` l. 81 : réutilisés tels quels ; seul
  le niveau du renommage change (`move.ts` l. 135).
- `rg -n "jamais publi" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src` → écran : `libelles.ts`
  l. 156, `procedure/libelles.ts` l. 67 ; les autres sont des commentaires du service, inchangés.
- `rg -n "version=publiee" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `corps-du-noeud.tsx` l. 112, `contexte-servi.tsx` l. 101, `ecran-de-noeud.tsx` l. 213, hôte
  `page.tsx` l. 274 ; e2e `page.spec.ts` l. 200, `procedure-et-contexte.spec.ts` l. 98 et 145,
  `e05s10a-edition.spec.ts` l. 139 : la route reste (HN-E11S02-25).
- `rg -n "draft" C:/apps/oto-pkg/packages/plateforme/server/nodes -g '!*.test.ts' -c` → 12 fichiers ;
  seuls `write.ts`, `write-result.ts`, `publish.ts`, `read-format.ts`, `read-body.ts` changent :
  `store.ts`, `read.ts`, `view.ts` (brouillon partagé, `draft: true`, N35) restent.
- `rg -n "phraseDePublication|La publication revient" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests -l`
  → 3 fichiers de l'écran et 8 de tests (`blocs-de-reference`, `contexte`, `e05s11-contexte-servi`,
  `e05s11-editeur`, `ecran-de-noeud`, `editeur-de-blocs`, `en-tete-modifiable`, `procedure`) : prop
  retirée ; une doublure qui la passe encore échoue au type-check.
- Tests qui attendent un brouillon par défaut :
  `rg -lF "Draft of " C:/apps/oto-pkg/tests` → `api-handler`, `mcp-read-write`,
  `nodes-personal-tree`, `nodes-publish`, `nodes-store`, `nodes-write`, `tables-header-patch`,
  `tables-schema-write` ; `rg -lF "Publish it with" C:/apps/oto-pkg/tests` → `nodes-personal-tree`,
  `nodes-read`, `nodes-write` ; `rg -l "drafts and publishing|publishing is reserved" C:/apps/oto-pkg/tests`
  → `mcp-table-read`, `nodes-read` ; `rg -n "Brouillon non publié|Brouillon enregistré|Brouillon · jamais" C:/apps/oto-pkg/tests`
  → `ecran-de-noeud.test.tsx` l. 155, 433, 462, 477, `editeur-de-blocs.test.tsx` l. 143, 408, 613-632,
  `procedure.test.tsx` l. 407 ; e2e `page.spec.ts` l. 197 et `procedure-et-contexte.spec.ts` l. 175
  (absence du bandeau : valides). Chaque `write` de test qui veut un brouillon passe `publish: false`.
- Fil d'accueil : `rg -n "row.publish" C:/apps/oto-pkg/packages/plateforme/server/activities.ts` →
  l. 68 : classement inchangé (HN-E11S02-24).
- `currentHeader`, `prepareTablePublication`, `pendingHeaderChanges` :
  `rg -n "currentHeader\(|prepareTablePublication\(|pendingHeaderChanges\(" C:/apps/oto-pkg/packages/plateforme --glob '!**/*.test.ts'`
  → `nodes/write.ts` l. 127, `nodes/publish.ts` l. 120, `tables/schema.ts` l. 152 ; inchangés
  (l'abandon retire le brouillon qu'ils lisent).
- Textes de refus : `rg -n "tooManyRows\(|refused\(check" C:/apps/oto-pkg/packages/plateforme/server/tables`
  → `evolution-publish.ts` l. 65, 67 ; `evolution-checks.ts` l. 143, 237 (le `tooManyRows` de
  `rows.ts` est une autre fonction, non touchée). Doublures qui figent le texte :
  `rg -ln "The draft is kept; nothing was published" C:/apps/oto-pkg/tests` → `tables-evolution.test.ts`
  et `mcp-table-schema.test.ts` à mettre à jour ; les autres visent procédures, liens et ERP, inchangés.
- `trashNode` : `rg -n "trashNode\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `api/trash.ts` l. 26 et 14 appels de test ; signature inchangée.
- Catalogue : `rg -n "catalogFunctions\(\)" C:/apps/oto-pkg/packages/plateforme --glob '!**/*.test.ts'`
  → `mcp/server.ts` l. 90 et 262 (`find`, `read`, `call`), `mcp/admin/tools/connector.ts` l. 57,
  `server/catalog/erp.ts` l. 192 (l'espace `node` devient réservé aux fonctions de l'ERP),
  `server/calls.ts` l. 143. Liste figée : `tests/unit/catalog.test.ts` l. 90-100,
  `tests/unit/mcp-admin-connectors.test.ts`.
- Activités : `rg -n "ACTIVITY_VERBS|verbAndPath" C:/apps/oto-pkg/packages/plateforme` →
  `schemas/activity.ts` l. 11, `server/activities.ts` l. 73 et 94 ; libellés par verbe dans
  `ui/accueil/libelles.ts` l. 41-43 ; tests `e05s12-activites.test.ts`, `e05s12-activites-sql.test.ts`.
  Type `Activity` : `rg -ln "Activity\b|ActivityPage" C:/apps/oto-pkg/packages/plateforme C:/apps/oto-pkg/tests C:/apps/oto-pkg/src`
  → `server/activities.ts`, `schemas/activity.ts`, `schemas/index.ts`, `ui/accueil/fil-activite.tsx`,
  `ui/accueil/types.ts`, et les doublures `e05s12-activites-sql.test.ts`, `ecran-accueil.test.tsx`,
  `e05s12-accueil.test.tsx` ; `inReview` facultatif, aucune à changer.
- Publication à l'écran : `rg -n "refusDeLaPublication|PublicationSeule|<Publication " C:/apps/oto-pkg/packages/plateforme/ui`
  → `publication.tsx` seul, rendu par `corps-du-noeud.tsx` l. 104 (tableau) et
  `editeur/editeur-de-blocs.tsx` l. 127 (page, procédure, Contexte) ; la raison `header_refused` ne
  vient que d'un en-tête de tableau. Doublures : `rg -ln "Réessayer" C:/apps/oto-pkg/tests/integration/components`
  → 23 fichiers, dont `editeur-de-blocs.test.tsx` (l. 574, 810, 830 : périmé, réseau) ; aucun ne rend
  `header_refused`. Test de la publication d'un en-tête : `en-tete-modifiable.test.tsx` l. 130.
- Sortie d'une fonction et journal : `rg -n "output\.(target|teamId|accountId|ctx|host)" C:/apps/oto-pkg/packages/plateforme/mcp C:/apps/oto-pkg/packages/plateforme/server --glob '!**/*.test.ts'`
  → `mcp/server.ts` l. 176-180, `mcp/admin/server.ts` l. 149 (console d'admin, sans `call`, non
  touché), `server/calls.ts` l. 175. `rg -ln "FunctionOutput\b" C:/apps/oto-pkg/packages/plateforme --glob '!**/*.test.ts'`
  → 10 fichiers (`catalog/define.ts`, `erp.ts`, `tables/*`) ; champ facultatif, aucun à changer.
  Lecteurs d'`args` du journal : `rg -n "_truncated" C:/apps/oto-pkg/packages/plateforme --glob '!**/*.test.ts'`
  → `journal.ts` l. 115, `journal-rows.ts` l. 107-121, `activities.ts` l. 168 ; une clé de plus
  n'en change aucun.

### Doublons
- Publication à l'écran : `rg -n "DELAI_DE_PUBLICATION_MS|ecouterLesFrappes" C:/apps/oto-pkg/packages/plateforme/ui`
  → `publication.tsx`, `file-d-operations.tsx` seuls. Verdict : réutiliser `PublicationSeule` au
  niveau écriture ; aucun moteur neuf.
- Décision de niveau : `rg -n "NODE_ACTIONS" C:/apps/oto-pkg/packages/plateforme/server` →
  `access.ts` seul. Verdict : une action de plus (`rename`) dans la table existante, pas de garde à
  part.
- Ancien chemin après un renommage : `rg -n "node_aliases" C:/apps/oto-pkg/packages/plateforme/server --glob '!**/*.test.ts'`
  → `nodes/lookup.ts` l. 117 (`lookupAlias`), `link-lines.ts` l. 69, `link-resolution.ts` l. 47,
  `segments.ts` l. 67 (et les types de `database.ts`). Verdict : réutiliser `node_aliases` et son déclencheur ; aucune redirection
  nouvelle.
- Registre : `rg -n -i "publication|brouillon" C:/apps/oto-pkg/.method/conventions/component-registry.md`
  → aucune autre surface qui publie ou dit un brouillon. Verdict : rien à fusionner.
- Suppression de brouillon : `rg -n "delete from platform\.(blocks|node_drafts)" C:/apps/oto-pkg/packages/plateforme/server C:/apps/oto-pkg/packages/plateforme/migrations`
  → `open_draft`, `publish_node` (base l. 1134, 1403, 1410, 1460), `saveDraft` (`store.ts` l. 315,
  blocs retirés d'une écriture). Verdict : `discard_draft` calque `publish_node` ; aucun ne l'abandonne.
- Suppression de lignes : même commande, aucune sur `state = 'published' and type = 'row'`. Verdict :
  créer ; `table.write` `clear` reste l'effacement de cellules.
- Corbeille : `trashNode` réutilisé tel quel.
- Raison d'un refus lue par l'écran : `rg -ln "header_refused|raison ===|\.raison" C:/apps/oto-pkg/packages/plateforme/ui`
  → `api/messages.ts` (`PAR_RAISON`, clés `code/raison`), `api/client.ts`, `tableau/decision-de-revue.tsx`,
  `equipes/libelles.ts`, `invitations/inviter-quelqu-un.tsx`. Verdict : réutiliser `details.reason`
  (comme `already_member`, `server/invitations.ts` l. 109) ; pas d'entrée dans `PAR_RAISON`, qui
  ne sait pas retirer « Réessayer » et vise un couple `code/raison` quand la raison couvre trois codes.
- Résultat d'un appel au journal : `rg -n "outcome" C:/apps/oto-pkg/packages/plateforme --glob '!**/*.test.ts'`
  → aucun champ de sortie ni colonne qui porte un résultat (seulement `decideReview` et le texte
  `ok`/`error` de la console d'admin). Verdict : créer `outcome`, le plus petit porteur (HN-E11S02-16).

### Effet produit
- Schéma : Ⓜ, une fonction. MCP : liste d'outils inchangée ; défaut de `publish`, descriptions,
  règles de « How this workspace works », contrats `write.procedure` et `write.table` (allongé),
  ligne d'accès de `read`, ligne de publication ; trois fonctions ; nouveau connecteur natif `node`
  dans `admin_connector`. Golden queries RG1, RW4, RW5, RW8, PR1 à PR3, TB1, TB3 à réécrire ; des
  nouvelles (procédure en plusieurs appels, les trois fonctions).
- Contexte : un membre d'équipe publie le Contexte de son équipe ; chaque pause de frappe périme les
  conversations qui l'ont reçu (E11-S03 AC-a2, AC-a4 limite aux contenus changés).
- `node_versions` et `links` : une révision et une réécriture des liens par pause de frappe et par
  `write` (HN-E11S02-20). Recherche, nouveautés, prompts, routage : un contenu créé paraît aussitôt,
  « Sans titre » compris (HN-E11S02-26).
- Accueil : deux gestes d'assistant de plus dans le fil, la suppression avec « dont N à revoir ».
  Écran Corbeille : des éléments mis par un assistant. Journal : les récapitulatifs y figurent comme
  appels réussis ; la ligne d'une suppression montre `_outcome` parmi ses arguments, à l'écran du
  journal comme dans `admin_journal` (`mcp/admin/tools/journal.ts` l. 75).
- Un bloc `reference` vers une ligne supprimée se lit comme une clé absente (`keyFound`,
  `link-resolution.ts`). Un fichier (E10-S02) cité par un bloc de brouillon abandonné reste lié à son
  nœud jusqu'à sa purge, comme après un `delete_block`.
- File de revue : une ligne à revoir supprimée par un assistant en sort sans décision humaine ; le
  texte servi à l'assistant le dit (AC-f2, AC-f3), et le fil d'accueil (AC-h3). Tableau fermé : ses
  lignes se suppriment ; `closed` garde son sens (« only existing rows can be written »,
  `tables/schema.ts` l. 84).
- Écran d'un tableau dont l'en-tête en attente est refusé : ni bandeau ni avis ; la phrase d'AC-g1
  sans « Réessayer » quand la publication de la personne (écriture ou gestion) est refusée. Aucun
  geste d'écran ne débloque : la personne passe par un assistant (`node.discard_draft`).
- Écran d'un nœud avec un brouillon laissé par un assistant : rien ne le signale ; la première
  frappe le publie entier (AC-c3). « Voir la version publiée » disparaît ; l'adresse
  `?version=publiee` reste.
- Accès : un rédacteur change les colonnes, la clé, la preuve exigée, la revue par l'assistant et la
  fermeture d'un tableau publié ; la ligne d'accès de `read` ne réserve plus l'en-tête (AC-b4). Un
  renommage par un rédacteur inscrit un alias comme un déplacement (AC-a3).
- Stories : E11-S03 — la ligne « L'éditeur publie 3 s après la dernière frappe » (Contexte FB-0005)
  vaut au niveau écriture. E11-S01 lot g (ex-E11-S08), livré après cette story — le panneau s'ouvre
  au niveau écriture (AC-g1, HN-E11S01-21) et AC-g8 n'a plus de refus au niveau écriture ; AC-g6
  (panneau bloqué par un en-tête en attente) devient rare, et `node.discard_draft` en est la sortie ;
  HN-E11S01-18 vaut à tout niveau d'écriture. E10-S01 AC-a3 (création « en brouillon »),
  HN-E10S01-2 et fiche D120 (gestion pour un tableau neuf, reprise par E10-S02 AC-f1) :
  contredits, à aligner par le pilote.
- RLS, routes, déclencheurs : aucun changement.

### Refacto
- Fait, requis : `niveau`, `phrase`, `phraseDePublication`, `BandeauDuBrouillon`,
  `lienVersionPubliee` et `ECRAN.voirLaVersionPubliee` retirés (plus rien ne les lit) ; tests
  réécrits.
- Fait, requis par AC-e1 : extraction de `trashPlan` dans `trash.ts`, tests identiques avant et après.
- Écarté : `publish` `.default(true)` dans Zod (type de sortie exigé partout, `CorpsDEnvoi` cassé).
- Écarté : une route `publish` à part pour l'écran ; la file sert.
- Écarté : déplacer `loadDraft` et consorts hors de `store.ts` (352 lignes) ; le service neuf va dans
  `discard.ts`.
- Code mort repéré, non touché : `EN_TETE.enregistre` et `EN_TETE.aRenvoyer` (`libelles.ts` l. 93,
  95), lus par aucun fichier (`rg -n "EN_TETE\b" C:/apps/oto-pkg/packages/plateforme/ui`).

## Hypothèses

- **HN-E11S02-1** : noms `node.discard_draft`, `node.trash`, `table.delete_rows`, connecteur natif
  `node` (source : forme `<espace>.<verbe>` de `mail.create_draft`, `mail.send_draft`, `table.*`).
- **HN-E11S02-2** : l'abandon exige le niveau écriture, action `write` d'`access.ts` (source :
  ADR-011 § 3, brouillon partagé ; écrire permet déjà de tout retirer du brouillon par `ops`, et
  publie désormais).
- **HN-E11S02-3** : on abandonne le brouillon entier, sans option « en-tête seul » ; titre et résumé
  en attente d'un tableau partent aussi, le récapitulatif les nomme (source : simple).
- **HN-E11S02-4** : abandon d'un nœud jamais publié refusé, renvoi à `node.trash` (source :
  `nodes_published_check`, aucune version à laquelle revenir).
- **HN-E11S02-5** : une fonction SQL plutôt qu'un privilège et une policy `DELETE` sur `node_drafts`
  (source : ADR-011 § 3, le brouillon passe par des fonctions atomiques ; verrou 7401 de
  `publish_node`).
- **HN-E11S02-6** : les trois fonctions sont `sensitive` (source : principe 5, H86, `define.ts` l. 12 ;
  un brouillon abandonné ne se récupère pas).
- **HN-E11S02-7** (tranchée : le responsable d'Oto, 2026-09-29) : un tableau fermé n'empêche pas la
  suppression de lignes ; `closed` n'interdit que la création (`tables/write.ts` l. 180-181).
- **HN-E11S02-8** (tranchée : le responsable d'Oto, 2026-09-29) : une ligne à l'état de revue se
  supprime comme les autres, sans dépendre de `review.agents_may_decide` ; le récapitulatif et le
  résultat le signalent. P10 n'est pas touchée : supprimer ne pose aucun état de décision.
- **HN-E11S02-9** : une ligne réservée par autrui, bail actif, est refusée ; bail expiré ou propre,
  supprimée (source : règle de `table.write`, l. 163-166).
- **HN-E11S02-10** : suppression définitive, sans corbeille de lignes (source : epic E11, OUT
  « historique des valeurs » ; `node_versions` exclut les lignes).
- **HN-E11S02-11** : fil d'activité : `trashed` réutilisé, `deleted_rows` ajouté (réutiliser
  `wrote_rows` écarté : il dirait « a écrit dans » ; « dans » et non « de », que la nature suit :
  « de le tableau »), abandon absent (source : E05-S12, « ce qui est arrivé aux contenus » ;
  l'abandon ne change pas la version publiée).
- **HN-E11S02-12** (tranchée : le responsable d'Oto, 2026-09-29) : aucun bouton « Abandonner le
  brouillon » à l'écran ni route `POST nodes/discard` ; seul un assistant abandonne un brouillon, par
  `node.discard_draft`. Le bouton reste pour plus tard (Hors périmètre).
- **HN-E11S02-13** : l'assistant ne passe pas de tampon ; le service passe celui qu'il lit (garde entre
  sa lecture et la suppression) (source : `publishNode` l. 107-109).
- **HN-E11S02-14** : ni `checkArgs` ni refus dans un bloc `call` de procédure : les trois fonctions y
  restent en deux temps (source : `mail.send_draft` fait de même).
- **HN-E11S02-15** (tranchée : le responsable d'Oto, 2026-09-29, pour la phrase et le retrait de
  « Réessayer ») : l'écran reconnaît le refus d'un en-tête à la raison `header_refused` posée par le
  service. Le code seul ne suffit pas : `conflict` (409), `too_large` (413) et `needs_confirmation`
  (409) servent aussi à d'autres refus (`server/errors.ts` l. 7-27) ; la raison est le mécanisme
  existant, lu sans nouvelle surface par le client (`ui/api/client.ts` l. 76-78, `already_member`).
  La phrase va dans la zone de publication, là où « Réessayer » s'affiche aujourd'hui : ni bandeau
  ni avis ne restent (AC-c3).
- **HN-E11S02-16** (tranchée : le responsable d'Oto, 2026-09-29, pour « dont N à revoir » dans le
  fil) : le nombre voyage de la fonction au journal par un champ facultatif `outcome` de
  `FunctionOutput` et `ToolOutput`, écrit en clé réservée `args._outcome` de la ligne, comme
  `_truncated` (`journal.ts` l. 115) ; sans migration. Le journal ne garde que les arguments, pas le
  résultat, et les lignes supprimées ne se relisent plus (source : `platform.journal`, ligne de base
  l. 2248-2267). Écartée : une colonne `outcome` du journal, plus propre mais une migration de table
  de plus pour un seul nombre.
- **HN-E11S02-17** (ex-HN-E11S13-1), tranchée (le responsable d'Oto, 2026-09-29) : qui peut écrire
  (niveau 2) publie aussi un en-tête changé d'un tableau déjà publié (colonnes, clé, `proof`,
  `agents_may_decide`, `closed`) ; la gestion n'est plus exigée pour l'en-tête. Canal ouvert voulu,
  tracé (§ Sécurité). Conséquence : le panneau d'E11-S01 lot g s'ouvre au niveau écriture
  (HN-E11S01-21). Option écartée : l'en-tête d'un tableau publié réservé à la gestion.
- **HN-E11S02-18** (ex-HN-E11S13-2), validée (2026-09-29) : le chemin suit le titre au niveau
  écriture (action `rename`), ADR-011 § 1 ; l'ancien chemin fonctionne toujours, par le mécanisme
  existant du renommage : alias `node_aliases` inscrit par la base, lu par `findNode` et `writeNode`
  (MCP, écriture, écran ; AC-a3). Ce mécanisme de données est distinct des anciens noms de routes et
  de paramètres, qu'E11-S07 ne redirige pas (décision 1 du préambule).
- **HN-E11S02-19** (ex-HN-E11S13-3), tranchée (le responsable d'Oto, 2026-09-29) : aucun avis à
  l'ouverture ; un brouillon laissé par un assistant est publié en silence par la frappe suivante
  (brouillon partagé, ADR-011 § 3). Option écartée : un avis jusqu'à la première écriture.
- **HN-E11S02-20** (ex-HN-E11S13-4) : cadence de 3 s gardée, aucune fusion de révisions (source :
  décision du 2026-09-27, E05-S10 AC-a6 ; D131, pas de client).
- **HN-E11S02-21** (ex-HN-E11S13-5) : défaut lu par le service ; l'écran passe `publish: false` par
  la file (source : un schéma Zod, une source de vérité).
- **HN-E11S02-22** (ex-HN-E11S13-6) : refus de publication = brouillon gardé, `isError` avec son code
  (source : N28).
- **HN-E11S02-23** (ex-HN-E11S13-7) : Contextes et espaces créés par la base restent à la révision 0
  jusqu'à leur première écriture (source : ADR-011 § 1, créés par la base).
- **HN-E11S02-24** (ex-HN-E11S13-8) : fil d'accueil inchangé pour l'écriture : `publish: true`
  explicite → « publié », sinon « créé » ou « modifié » (source : `activities.ts` l. 65-70).
- **HN-E11S02-25** (ex-HN-E11S13-9) : `?version=publiee`, `read draft: true` et
  `node.discard_draft` restent pour les brouillons rares ; le lien « Voir la version publiée », qui ne
  vivait que dans le bandeau, part avec lui (source : décision D135 ; HN-E11S02-19, aucun avis).
- **HN-E11S02-26** (ex-HN-E11S13-10) : aucun filtre des contenus « Sans titre » vides (source :
  décision 1 de D135).
- **HN-E11S02-27** (ex-HN-E11S13-11) : la ligne de publication donne la révision de la prochaine
  écriture : sans elle, RW5 (création puis `append`) prend un `stale_revision` (source : simple).
- **HN-E11S02-28** (ex-HN-E11S13-12) : le Contexte suit la règle (source : D135, « tout contenu »).
- **HN-E11S02-29** (ex-HN-E11S13-13) : « Sans titre » s'ouvre titre sélectionné quelle que soit la
  révision (source : simple).
- **HN-E11S02-30** : sans objet depuis HN-E11S02-17 (2026-09-29) : le refus d'en-tête au niveau
  écriture, dont elle fixait le texte, n'existe plus ; la sortie d'un en-tête refusé reste AC-d5.

## Actions JB

- Aucune action externe. La migration s'applique au projet de test par le pilote
  (`.method/sprint/status.md`, § Migrations) ; les amendements d'ADR-011 § 3, d'ADR-002 § 1 et de
  H63 sont écrits par le pilote.
- Aucun arbitrage ouvert (HN-E11S02-17, -18 et -19 tranchées le 2026-09-29).

## Tests attendus

### Unit tests
- [ ] `tests/unit/access.test.ts` : `publish` et `rename` au niveau écriture.
- [ ] `tests/unit/nodes-write.test.ts` : AC-b1 (défaut, `publish: false`, ligne `Next write`),
  AC-b3, AC-a2 par `write` (en-tête publié au niveau écriture, ligne de publication mot pour mot) ;
  doublures passées à `publish: false`.
- [ ] `tests/unit/nodes-publish.test.ts` : AC-a1 au niveau écriture ; AC-a2 (en-tête en attente
  publié par un rédacteur, création) ; AC-b2 (ligne ajoutée).
- [ ] `tests/unit/nodes-read.test.ts` : trois lignes d'accès, pied « Publish it with ».
- [ ] `tests/unit/mcp-tools.test.ts` : description de `write` sous 1 000 caractères, instantané.
- [ ] `tests/unit/tables-evolution.test.ts` : les quatre refus de publication d'en-tête finissent par
  l'indication d'abandon (AC-d5), textes comparés, et portent la raison `header_refused`.
- [ ] `tests/unit/catalog.test.ts` : liste du catalogue ; les trois fonctions `sensitive`, `paquet`,
  avec `summarize`, schémas stricts.
- [ ] `tests/unit/e05s12-activites.test.ts` : `trashed` et `deleted_rows` confirmés, récapitulatif
  omis, abandon omis ; deux suppressions regroupées somment `inReview` (AC-h3).

### Integration tests (données jetables)
- [ ] `tests/integration/brouillon-publication.test.ts` : `publish_node` sous la session de Léa
  (écriture) publie (AC-a4).
- [ ] `tests/integration/e05s10e-gestes.test.ts` : AC-a3 (titre publié par Léa, chemin suivi,
  alias inscrit ; `read` et `write` par l'ancien chemin servent et modifient le nœud, ligne
  « moved to » en tête ; sans écriture sur le parent, chemin gardé) ; `move` refusé au niveau
  écriture ; tests de la corbeille inchangés après l'extraction de `trashPlan`.
- [ ] `tests/integration/e11s02-brouillons-et-suppression.test.ts` (base réelle) : abandon d'une page
  (blocs `draft` et `node_drafts` partis, publiés intacts) et d'un tableau au type refusé (AC-d2,
  puis écriture d'en-tête repartie du publié) ; refus d'AC-d3 (lecture seule, sans brouillon, jamais
  publié ; tampon changé, `spyDb`, log espionné) ; `discard_draft` pendant une publication (verrou
  tenu) : `PT409` ; `node.trash` : récapitulatif sans écriture, exécution, refus de structure et de
  gestion ; `table.delete_rows` : suppression, clé absente, ligne réservée par autrui, bail expiré,
  ligne à revoir supprimée et signalée aux deux temps (AC-f2, AC-f3), tableau fermé (AC-f5), course
  (révision changée, log espionné).
- [ ] `tests/integration/isolation/contenu.test.ts` : `discard_draft` sur un nœud de B (AC-h4).
- [ ] `tests/integration/e05s12-activites-sql.test.ts` : colonnes `confirmed`, `path` et `review`
  (`args._outcome`) lues ; un `_outcome` qui n'est pas un entier est ignoré.

### MCP (`InMemoryTransport`)
- [ ] `tests/integration/mcp-read-write.test.ts` : `write` sans `publish` → publié ; `publish: false`
  → brouillon ; en-tête d'un tableau publié changé au niveau écriture (AC-a2) ; six outils.
- [ ] `tests/integration/e11s02-mcp.test.ts` : `find`, `read` et les deux temps de chaque fonction,
  textes et `structuredContent` identiques ; `admin_connector`. La ligne de journal d'une exécution
  de `table.delete_rows` avec une ligne à revoir porte `_outcome: {"deleted": 2, "review": 1}`
  (AC-h2) ; celle du récapitulatif n'en porte pas.

### Composants
- [ ] `ecran-de-noeud.test.tsx` : AC-c3 (brouillon laissé par un assistant : ni bandeau, ni avis, ni
  lien « Voir la version publiée »), AC-c4 (infobulle) ; niveau écriture sans phrase « La
  publication revient ».
- [ ] `e05s10b2-adresse.test.tsx` : le cas du renommage rejoué au niveau écriture (AC-a3 : adresse
  gardée, rail qui marque la ligne, file qui écrit par l'ancien chemin).
- [ ] `editeur-de-blocs.test.tsx` : AC-c2 au niveau écriture (écritures `publish: false`, publication
  3 s après, « Enregistré. », horloge simulée).
- [ ] `rail-application.test.tsx` : AC-c1 (corps sans `publish`, `status: "published"`).
- [ ] `procedure.test.tsx` l. 407, `e05s10b2-adresse.test.tsx` : AC-c4, AC-c5.
- [ ] `en-tete-modifiable.test.tsx` : au niveau écriture, publication refusée avec
  `reason: "header_refused"` → la phrase
  d'AC-g1 en `role="alert"`, aucun bouton « Réessayer » ; refus `conflict` sans raison → message et
  « Réessayer » inchangés ; publication suivante réussie → phrase retirée.
- [ ] `e05s12-accueil.test.tsx` : ligne `deleted_rows` avec `inReview: 2` → « …, dont 2 à revoir » ;
  sans `inReview` → rien d'ajouté.

### Golden queries (pilote, `docs/mcp-golden-queries.md`)
- [ ] RW4, RW5, PR2, TB1 : un `write` sans `publish`, aucune demande de publication.
- [ ] « Écris la procédure d'accueil en trois parties » → `publish: false` puis dernier appel publié.
- [ ] « Supprime la page ventes/essai » → `node.trash`, récapitulatif, accord, `confirm`.
- [ ] « Enlève Atelier 2 et Atelier 10 du suivi des prospects » → `table.delete_rows`.
- [ ] « La publication de l'en-tête est refusée, reviens à la version publiée » → `node.discard_draft`.
- [ ] Cas négatif : « Vide la colonne notes d'Atelier 2 » → `table.write` avec `clear`.

### E2E tests
- [ ] `tests/e2e/page.spec.ts` : un rédacteur crée une page par « + », tape, recharge ; un lecteur la
  lit. Contrôle visuel de la phrase d'AC-g1, thèmes clair et sombre.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
