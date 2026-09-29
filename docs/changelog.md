# Changelog

<!-- Ce fichier est mis à jour à chaque commit via /dev.
     Format de chaque entrée :

## [Date] — [Scope]
**Quoi :** Ce qui a été fait
**Pourquoi :** La raison / la story / le bug
**Problèmes :** Ce qui a bloqué et comment c'a été résolu (si applicable)
**Fichiers :** Liste des fichiers créés/modifiés
-->

## [2026-09-29] — Fusion du lot E11-S02, S05, S01 g, S14 b : deux corrections au verify

**Quoi :** le Texte local d'une page vide (E11-S05) n'entre plus dans les blocs que l'éditeur rend à la publication : un Contexte vide redemande confirmation (`use-editeur.ts`) ; « Réglages du tableau » bloqué par un brouillon d'en-tête ne publie plus rien même si un clic atteint l'interrupteur désactivé (`options-du-tableau.tsx`). Cinq attentes de test mises à jour pour le lot (îlot client, connecteur natif `node`, `node_aliases.old_path`, règle posée sur le nœud réel, assertions d'AC-c2 replacées).

**Pourquoi :** premier passage des tests écrits sans être lancés ; gardes écrites dans `portage-ecrans.md § 6` et `forms-patterns.md § Double soumission`.

**Fichiers :** `packages/plateforme/ui/noeud/editeur/use-editeur.ts`, `packages/plateforme/ui/tableau/options-du-tableau.tsx`, 5 fichiers de test, deux conventions et leurs fiches.

## [2026-09-29] — E11-S05 : écrans d'un contenu, encarts à droite, télécharger à côté de « Partager », page et tableau vides

**Quoi :** Encarts « Cité dans », « Cite », « Sous-pages » (et « À quoi sert cette page » d'un Contexte) repliés dans la colonne de droite, en ligne au-dessus de la grille d'un tableau ; « Télécharger en .csv/.md » à gauche de « Réglages » et « Partager », et sur la page publique ; repère de repli des cellules au survol, lignes à revoir marquées et cycle expliqué ; résumé montré pour les seules procédures, nouveau résumé par défaut d'une procédure ; page vide écrite dans un Texte avec invite et focus ; vide d'un tableau nommé par l'assistant ; glyphe `Table`. Lecture des cellules (`cellValue`, `keyValue`, `rowCells`) commune à l'export connecté et public, dans `schemas/csv.ts`.

**Pourquoi :** retours d'écran du responsable d'Oto (2026-09-29, fiche D136).

**Problèmes :** fichier public composé au rendu serveur à partir de la vue lue et passé à l'îlot (aucune requête au clic ; AC-d3 disait « dans le navigateur ») ; `language` ajouté à la vue publique (donnée de marque, ADR-013 § 3) ; le modèle d'une page vide dans `page-vide.ts` (borne `max-lines` de `modele.ts`). Hypothèses HN-E11S05-23 à 29 d'implémentation.

**Fichiers :** `packages/plateforme/ui/components/bouton-telecharger.tsx`, `ui/noeud/editeur/page-vide.ts` (nouveaux) ; `ui/noeud/{ecran-de-noeud,en-tete-du-noeud,en-tete-modifiable,sous-pages}.tsx`, `ui/noeud/libelles.ts`, `ui/noeud/editeur/{editeur-de-blocs,rangee-de-bloc,champ-de-bloc}.tsx`, `ui/noeud/editeur/{use-editeur,modele,actions,gestes}.ts`, `ui/tableau/{cellule,grille,file-de-revue,corps-tableau,tableau-du-noeud,carte-de-noeud}.tsx`, `ui/tableau/libelles.ts`, `ui/contexte/annexes-du-contexte.tsx`, `ui/coque/{arbre-du-rail,gestes-du-rail}.tsx`, `ui/coque/libelles.ts`, `ui/arbre/navigateur-d-arbre.tsx`, `ui/public/page-publique.tsx`, `ui/api/telecharger.ts`, `ui/ds/components/css/{table,editeur,product}.css`, `schemas/{csv,node-gestures,index}.ts`, `server/shares.ts`, `server/tables/meta.ts` ; hôte `src/app/(dashboard)/n/[...chemin]/page.tsx` ; tests (`e11s05-libelles`, `e11s05-ecrans.spec.ts`, écrans et pages adaptés) ; `packages/plateforme/CHANGELOG.md`, registre, `hypotheses.md`, `docs/prd.md`, `status.md`.

## [2026-09-29] — E11-S01 (lot g) : réglages du tableau à l'écran

**Quoi :** Bouton « Réglages » dans l'en-tête d'un tableau, dès le niveau écriture, entre « Télécharger » et « Partager » ; panneau « Réglages du tableau » à trois `Switch` (Preuve exigée, L'assistant peut décider la revue, Fermé), chacun publié en un geste par la file d'opérations de la page ; panneau bloqué quand un changement d'en-tête attend en brouillon. `Switch` extrait de `ui/public/partage-sur-le-web.tsx` dans `ui/ds/react/switch.tsx`, le partage sur le web inchangé.

**Pourquoi :** décision du responsable d'Oto (2026-09-29) : régler un tableau sans passer par un assistant ; ouvert au niveau écriture par HN-E11S02-17.

**Problèmes :** hypothèses d'implémentation HN-E11S01-27 à 32 (tampon du brouillon, refus sans relecture, `agents_may_decide: false` explicite, couleurs d'`oto-choice`).

**Fichiers :** `packages/plateforme/ui/ds/react/switch.tsx`, `ui/tableau/options-du-tableau.tsx` (nouveaux) ; `ui/public/partage-sur-le-web.tsx`, `ui/noeud/{ecran-de-noeud,en-tete-du-noeud}.tsx`, `ui/tableau/libelles.ts` ; tests `options-du-tableau.test.tsx`, `ecran-de-noeud.test.tsx`, `tests/e2e/tableau.spec.ts` ; registre, `hypotheses.md`, `docs/prd.md`, `status.md`.

## [2026-09-29] — E11-S02 : publication directe, brouillons refusés, corbeille et suppression de lignes depuis un assistant

**Quoi :**
- Écrire publie (fiche D135) : `write` et `POST nodes` publient par défaut, `publish: false` garde un brouillon ; la ligne de publication dit « Next write: base_revision N. » ; le niveau écriture publie, en-tête d'un tableau publié compris, et le chemin suit le titre à ce niveau (l'ancien chemin reste un alias).
- Écran : création publiée depuis le rail ; publication seule 3 s après la frappe dès le niveau écriture ; bandeau du brouillon, « Voir la version publiée » et « La publication revient… » retirés ; un en-tête de tableau refusé se dit sans « Réessayer » (`header_refused`).
- Trois fonctions sensibles derrière `call`, connecteur natif `node` : `node.discard_draft` (Ⓜ `20260929190000_discard_draft.sql`, `platform.discard_draft`), `node.trash`, `table.delete_rows` ; les refus de publication d'un en-tête et le contrat `write.table` disent comment abandonner le brouillon.
- Accueil : « a supprimé des lignes dans … », « , dont N à revoir » (clé `args._outcome` de la ligne de journal).
- `table.import` avec `create` n'exige plus que l'écriture sur le parent (fiche D150, amende D120).
- ADR-011 § 3 et ADR-002 § 1 amendés, H63 et N28 remplacées.

**Pourquoi :** FB-0007, FB-0010 partie 3 (rapport de tests sur Démo) ; retour du responsable d'Oto sur les brouillons (fiche D135).

**Problèmes :** tâches de suite M90 (troisième copie du prédicat de bail dans `import.ts`) et M91 (commentaire et libellés morts). La migration attend son application au projet de test (action JB).

**Fichiers :** `packages/plateforme/migrations/20260929190000_discard_draft.sql` (et sa copie `supabase/migrations/`), `server/nodes/discard.ts`, `server/tables/delete-rows.ts` (nouveaux) ; `server/{access,activities,calls,database,procedures-check,tool-output}.ts`, `server/catalog/{contracts,define,registry}.ts`, `server/context/blocks/code.ts`, `server/nodes/{move,publish,read-body,read-format,rename,trash,write,write-result}.ts`, `server/tables/{evolution,evolution-checks,evolution-publish,import,row-store,write}.ts`, `schemas/{activity,node-gestures,nodes,table-write}.ts`, `mcp/{server,tools}.ts`, `ui/noeud/{publication,corps-du-noeud,en-tete-modifiable}.tsx`, `ui/noeud/libelles.ts`, `ui/noeud/editeur/{editeur-de-blocs,file-d-operations,lignes-d-etat}.tsx`, `ui/contexte/{contexte-servi,ecran-du-contexte}.tsx`, `ui/coque/{creation-dans-le-rail,import-de-fichier}.tsx`, `ui/coque/{envoi-d-import,libelles}.ts`, `ui/accueil/{fil-activite.tsx,libelles.ts}`, `ui/procedure/libelles.ts` ; hôte `src/app/(dashboard)/context/page.tsx` ; tests `e11s02-brouillons-et-suppression`, `e11s02-mcp` (nouveaux) et les doublures qui attendaient un brouillon par défaut ; `packages/plateforme/CHANGELOG.md`, ADR-002, ADR-011, `fiche-decisions.md` (D120, D150), `hypotheses.md` (H63, N28, HN-E10S01-21), registre, `docs/prd.md`, `docs/architecture.md`, `docs/mcp-golden-queries.md`, `status.md`.

## [2026-09-29] — E11-S14 (lot b) : cinq suites de plus sur Postgres nu

**Quoi :** `mcp-core`, `context-full`, `feedback-prompts`, `pilot-qualification` et le `describe` AC14 d'`org-transfer` passent sur Postgres nu, par `createLocalFixtures`, sans assertion changée ; leurs lignes sortent de `tests/unit/gardes-supabase.test.ts` (`org-transfer` y reste pour son `describe` principal). En base locale, 16 → 12 fichiers sautés en entier.

**Pourquoi :** E11-S14, lot b, après la fusion d'E11-S03 et E11-S10 (mêmes fichiers).

**Problèmes :** hypothèses HN-E11S14-8 (noms de `describe` « on a real database ») et 9 (`describe` principal d'`org-transfer` inchangé). Lot c (semis de l'isolation) après E10-S02.

**Fichiers :** `tests/integration/{mcp-core,context-full,feedback-prompts,pilot-qualification,org-transfer}.test.ts`, `tests/unit/gardes-supabase.test.ts` ; `hypotheses.md`, `status.md`.

## [2026-09-29] — E11-S06 : éditeur, un repère par élément de liste et le panneau « Lien »

**Quoi :** Une puce, un numéro ou une case par élément de liste, sur sa première ligne (plus de repère sur les lignes repliées) ; un lien se modifie dans le panneau « Lien » (libellé, page ou adresse web, Appliquer, Retirer, Ouvrir), ouvert par le curseur dans le lien, Alt+Entrée ou un clic au repos ; Ctrl/⌘-clic suit le lien. Le clavier d'une liste d'options est commun (`useOptionActive`) ; `choix-de-bloc.tsx` le reprendra (M84).

**Pourquoi :** retours d'écran du responsable d'Oto sur l'éditeur de l'hôte de démo (2026-09-29, fiche D132).

**Problèmes :** `e10s06-editeur.test.tsx` adapté d'une ligne ; e2e en deux passages (clair à 390 px, sombre à 1 280 px).

**Fichiers :** `packages/plateforme/ui/noeud/editeur/{elements-de-liste,lien-du-bloc}.tsx` (nouveaux), `ui/noeud/editeur/{citer,champ-de-bloc,choix-de-bloc}.tsx`, `ui/noeud/{en-ligne.ts,rendu-des-blocs.tsx,libelles.ts}`, `ui/ds/components/css/{blocks,editeur}.css`, `schemas/link-syntax.ts` (`LABEL_MAX` exporté) ; tests : `tests/unit/e11s06-editeur.test.ts`, `tests/integration/components/e11s06-editeur.test.tsx`, `tests/e2e/e11s06-editeur.spec.ts` (nouveaux), `tests/integration/components/e10s06-editeur.test.tsx` ; `packages/plateforme/CHANGELOG.md`, registre, `hypotheses.md`, `status.md`.

## [2026-09-29] — E11-S01 (lots a à f) : tableaux, créer sans écraser, colonne stricte, recherche par mots, révision et auteur, revue par l'assistant, preuve par tableau

**Quoi :**
- Lot a : `create_only` sur `table.write` : une clé qui existe déjà sort `refused (conflict)` avec la ligne telle qu'elle est, rien n'est écrit pour elle, course comprise ; `revision` refusée avec `create_only` ; contrôle des procédures sur un tableau fermé.
- Lot b : attribut de colonne `allow_verified_empty` (défaut `true`) : `required: true, allow_verified_empty: false` exige une vraie valeur ; description de `required` corrigée ; publication de l'attribut avertie (`missing_required`).
- Lot c : `q` par mots (`queryWords` dans `schemas/tables.ts`, même règle pour `table.rows`, la grille et les vues) ; refus des bornes `limit` et `rows` qui disent quoi faire.
- Lot d : `revision` dans `table.schema` ; `host` (client MCP du `ctx`) et `worker` (bail) rangés dans la provenance et servis par `table.rows`.
- Lot e : `lifecycle.review.agents_may_decide` : l'assistant pose l'approbation ou le refus par `table.release` ou `table.write`, provenance `agent` (amende P10 et N9).
- Lot f : `proof` dans l'en-tête (défaut `false`) : la preuve n'est exigée que sur un tableau `proof: true`, écriture, contrôle des procédures et mention « sans preuve » de la file de revue compris ; le tableau de la Démo repose `proof: true`.
- ADR-002 § 1 : en 1.1.0, sans client, les descriptions de `write` et des fonctions de tableau sont réécrites en place.

**Pourquoi :** FB-0001, FB-0002, FB-0003, FB-0009, FB-0010 parties 1 et 2 (rapport de tests d'un assistant sur la todo de Démo) ; fiches D132, D133.

**Problèmes :** revue : AC-b3 et AC-b6 amendés (« with its proof » ne se dit que sur un tableau `proof: true` ; la clé et la colonne d'état se disent `required` seul). Un tableau existant n'exige plus la preuve tant que `header: {"proof": true}` n'est pas publié (aucune reprise, stade R&D). Lot g (réglages à l'écran) après E11-S02.

**Fichiers :** `packages/plateforme/schemas/{tables,table-write,index}.ts` ; `packages/plateforme/server/tables/{write,write-row,row-rules,release,claim,filters,rows,screen,schema,check,header,evolution,evolution-checks,evolution-publish}.ts`, `server/catalog/{contracts,define}.ts`, `server/calls.ts`, `mcp/server.ts`, `ui/tableau/file-de-revue.tsx` ; `scripts/lib/pilot-qualification.mjs`, `tests/factories/table-fixture.ts` ; tests des tableaux (`tests/unit/tables-*.test.ts`, `mcp-tables`, `mcp-table-read`, `mcp-table-schema`, `table-screen-service`, `pilot-content`), `file-de-revue.test.tsx`, `grille.test.tsx`, `noeud-tableau-page.test.tsx` ; `packages/plateforme/CHANGELOG.md`, ADR-002 § 1, registre, `hypotheses.md` (P10, N9, H92, H94, H96, HN-M53-5, HN-M53-10), `docs/prd.md`, `docs/architecture.md`, `docs/mcp-golden-queries.md`, `status.md`.

## [2026-09-29] — E11-S14 (lot a) : harnais de test sans Supabase

**Quoi :** `createLocalFixtures` (`tests/helpers/session-locale.ts`) : les personnes de `createSqlFixtures`, un jeton signé localement (`sessionFor`, clé de `testIssuer`, champ `jwks` ajouté à `TestIssuer`) et le `verifyToken` à passer à `handlePlateforme` et `handleMcpPost`. Sept suites passent sur Postgres nu (`api-equipes`, `api-invitations`, `mcp-admin`, `mcp-connectors`, `mcp-http`, `mcp-procedures`, `portabilite-schema`), sans perdre une assertion ; la vérification d'un vrai jeton par la JWKS du projet devient un `it` explicite de `mcp-http`. `tests/unit/gardes-supabase.test.ts` ferme la liste des fichiers gardés par Supabase, dans les deux sens. En base locale, 23 → 16 fichiers sautés. `CLAUDE.md § Vérifier, commiter, pousser` et `testing-strategy.md § Base de test locale` : seules les suites de l'adaptateur Supabase se sautent ; une suite du paquet prend ses jetons dans `createLocalFixtures` et se garde par `sqlConfigured`. M24 : le signataire de jetons commun est livré.

**Pourquoi :** décision du responsable d'Oto (2026-09-29) : le paquet est portable (ADR-012), le harnais n'exige le projet Supabase que pour l'adaptateur Supabase.

**Problèmes :** AC-a5 : la session du projet s'ouvre par `sessionFor`, pas `signIn` (`testing-strategy.md § Anti-patterns`). Lots b (après E11-S03 et E11-S10) et c (semis de l'isolation, après E10-S02) à venir ; leurs fichiers restent listés « pending ».

**Fichiers :** `tests/helpers/session-locale.ts`, `tests/integration/session-locale.test.ts`, `tests/unit/gardes-supabase.test.ts` (nouveaux) ; `tests/helpers/oidc-issuer.ts` ; `tests/integration/{api-equipes,api-invitations,mcp-admin,mcp-connectors,mcp-http,mcp-procedures,portabilite-schema}.test.ts` ; `CLAUDE.md`, `.method/conventions/testing-strategy.md` et sa fiche, registre, `hypotheses.md`, `status.md`.

## [2026-09-29] — E11-S03 : ctx invalidé par les seuls Contextes servis, plafond de 35 000 et coupe dite, `move_block` vers une section, `append` qui prolonge une liste

**Quoi :**
- Lot a (Ⓜ `20260929180000_ctx_contexts.sql`, renommée à la fusion depuis `20260929150000` pour suivre celle d'E10-S04) : colonne `platform.ctx.contexts` ; un ctx ne périme plus que si l'un des Contextes servis à la conversation (Tout le monde, Privé, équipes) change de contenu : refus « context has changed (<chemins>): call <p>_context again… » ; une republication à l'identique ne périme rien et ne dit rien (H28 tenue) ; `feedback` accepte un code connu périmé ; `rules_version` compté, plus lu ; un code émis avant 1.1.0 est périmé une fois.
- Lot b : plus de taille par bloc (`CONTEXT_SIZES`, `NEWS_SIZE`, `RECENT_SIZE`, `PROCEDURES_SIZE`, `withinSize` retirés) ; plafond unique de 35 000 caractères ; au-delà, coupe dite (« This context is cut: everything served together exceeds 35,000 characters. Read the rest: … ») ; listes d'un Contexte arrêtées à 20, dites.
- Lot c : `move_block` accepte `section` (« moved block <ref> to the end of « <titre> » », sans destination « to the start of the page, outside any section ») ; `append` prolonge la liste précédente de même genre (« ; the list continues with N more items »), au-delà de 500 éléments « ; a new list starts: a list holds 500 items at most » ; plan de `read` et `staleState` : ligne « - (start of page, N characters) ».
- ADR-002 § 2 et § 7 amendés ; fiche D145 : la version qui réunit E10 et E11 est la 1.1.0 (`_v1_1_0.sql`).

**Pourquoi :** FB-0005, FB-0006, FB-0008 (rapport de tests d'un assistant sur Démo) ; fiches D132, D134.

**Problèmes :** hypothèses du lot c renumérotées HN-E11S03-22 à 26 à la fusion. Toutes les conversations ouvertes au déploiement rappellent `context` une fois. La migration attend son application au projet Supabase de test (action JB).

**Fichiers :** `packages/plateforme/migrations/20260929180000_ctx_contexts.sql` (et sa copie `supabase/migrations/`), `server/{ctx,database}.ts`, `server/context/{engine.ts,blocks/contexts.ts,blocks/news.ts,blocks/recent.ts,blocks/procedures.ts}`, `server/nodes/{diff,publish,write-result,ops,block-ops,section-ops,read-format,read-body}.ts`, `schemas/{context-index,nodes}.ts`, `mcp/{server,tools}.ts`, `mcp/admin/tools/node.ts`, `ui/contexte/parties-du-contexte.ts`, `scripts/lib/org-transfer.mjs` ; doublures `tests/helpers/{plateforme,reference-org-sql}.ts` ; tests `server-ctx` (unit, intégration), `nodes-publish`, `nodes-read`, `nodes-ops`, `context-engine`, `context-blocks`, `e05s11-parties-du-contexte`, `e05s12-texte-servi`, `mcp-admin-nodes`, `mcp-tools`, `mcp-core`, `m71-listes-du-contexte` ; ADR-002, `packages/plateforme/CHANGELOG.md`, registre, `hypotheses.md` (H27, H28, H30, N6), `fiche-decisions.md` (D131, D145), `docs/prd.md`, `docs/architecture.md`, `docs/mcp-golden-queries.md`, `status.md`, épics E10 et E11.

## [2026-09-29] — E10-S04, E10-S01, E10-S06 : pages compatibles markdown, import et export (markdown, CSV, `table.import`), éditeur des blocs de page

**Quoi :**
- E10-S04 (Ⓜ `20260929170000_platform_page_markdown.sql`, renommée à la fusion depuis `20260929120000` pour suivre les migrations d'E11 déjà sur `main`) : trois types de bloc, `simple_table`, `divider` et `toggle` (lecture stricte par `write`, rendu markdown et écran, recherche, liens, contrôle des procédures) ; listes imbriquées sur trois niveaux ; titres de niveau 1 à 5 (`##` à `######`), rendus à l'écran un cran plus bas (`h(N+1)`, borné à `h6` ; remplace E05-S10 AC-a5) ; marques en ligne : barré, échappements, `<br>`, marque dans une marque d'un autre caractère, `<https://…>` ; `\[[…]]` n'est plus un lien, ni à l'écran ni à la publication.
- E10-S01 : mode tolérant de l'analyse, propre à l'écran (`tolerant` du corps de `POST nodes`, `kept_as_text`) : collage de plusieurs lignes, `.md` importé en page par « Importer un fichier… » ou déposé dans une page, encart « N éléments conservés en texte » ; « Télécharger en .md » (page, procédure, Contexte) et « Télécharger en .csv » (tableau) dans le « ⋯ » du rail (`GET nodes/export`, `GET tables/export`, non journalisés) ; CSV lu dans le navigateur et importé en tableau nouveau (gestion du parent, D120) ou existant, par lots de 500 lignes (`POST tables/import`) ; « Convertir en tableau de données » d'un tableau simple ; `table.import` au catalogue de `call`, le contrat `write.table` allongé de deux phrases ; règles partagées passées dans `schemas/` (`csv.ts`, `csv-cells.ts`, `slugOf`, `isEmail`, `instantOf`…).
- E10-S06 : le « + » d'un bloc et `/` dans un Texte vide ouvrent un choix en deux groupes (« Texte », « Insérer ») ; écriture d'un tableau simple (cellules, menu, collage d'un tableur), d'un séparateur (`---` tapé) et d'un repli (résumé et corps) ; `Tab` et `Maj+Tab` dans une liste, trois niveaux ; préfixes `# ` à `###### ` ; « + » d'une page vide inchangé (HN-E10S06-6).
- `CLAUDE.md § Modifications documentaires`, règle 4 : un échappement de code s'écrit par un script qui compose la barre oblique inverse, puis se relit (contrôle `rg` des caractères invisibles et combinants) ; `scripts/check-framework.mjs` écrit son intervalle de marques combinantes en échappements.

**Pourquoi :** fiches D111, D114, D115, D116 et D120 (epic E10, contenus riches) ; décisions de JB du 2026-09-29 : exports non journalisés, « Télécharger en .md » dans le « ⋯ » d'un Contexte (D138, D139).

**Problèmes :** revues corrigées : E10-S04 (lecture quadratique des clôtures d'un repli : `openingFence` et `closesFence` partagés par `schemas/link-syntax.ts`) ; E10-S01, deux corrections (reprise d'un import sans recréer le tableau, `details.created` ; exports non journalisés ; dialogue d'import qu'on ne ferme pas pendant un envoi) ; E10-S06, deux corrections (sortie au clavier d'une liste ou d'un tableau, dernier bloc compris ; lecteur unique `simpleTableOf` et prédicat `isToggleFence`). Restes en tâches de suite M77, M78 et M80 à M83. `tests/integration/mcp-read-write.test.ts` et les specs e2e `e10s04-markdown`, `import-de-fichiers` et `e10s06-editeur` attendent la migration sur le projet Supabase de test (action JB).

**Fichiers :** `packages/plateforme/migrations/{20260929170000_platform_page_markdown.sql,README.md}` (et la copie `supabase/migrations/`) ; `packages/plateforme/schemas/{blocks,blocks-render,link-syntax,csv,csv-cells,nodes,node-body,tables,table-write,index}.ts` ; `packages/plateforme/server/nodes/{markdown-parse,markdown-rich,markdown-lists,export,op-kit,ops,block-ops,section-ops,document,links,limits,segments,write,write-result}.ts`, `server/tables/{import,export,meta,row-rules,write-row}.ts`, `server/procedures-check.ts`, `server/catalog/{contracts,registry}.ts` ; `packages/plateforme/api/{nodes,tables}.ts` ; `packages/plateforme/ui/coque/{import-de-fichier,import-csv}.tsx`, `ui/coque/{envoi-d-import,libelles}.ts`, `ui/coque/{arbre-du-rail,creation-dans-le-rail,gestes-du-rail,sections-du-rail}.tsx`, `ui/api/telecharger.ts`, `ui/noeud/{rendu-des-blocs,corps-du-noeud}.tsx`, `ui/noeud/{en-ligne,libelles}.ts`, `ui/noeud/editeur/{choix-de-bloc,tableau-edite,repli-edite,champ-de-bloc,rangee-de-bloc,file-d-operations}.tsx`, `ui/noeud/editeur/{blocs-de-page,modele,operations,actions,gestes,gestes-du-menu,clavier,use-envois}.ts`, `ui/tableau/tableau-du-noeud.tsx`, `ui/ds/components/css/content.css` ; `scripts/check-framework.mjs`, `CLAUDE.md` ; tests : `tests/unit/{nodes-parse-page-markdown,nodes-parse-tolerant,markdown-aller-retour,ui-en-ligne-marques,ui-editeur-blocs-de-page}.test.ts`, `tests/unit/schemas/csv.test.ts`, `tests/integration/{table-import,exports}.test.ts`, `tests/integration/components/{blocs-de-page,e10s06-editeur,import-de-fichier}.test.tsx`, `tests/e2e/{e10s04-markdown,e10s06-editeur,import-de-fichiers}.spec.ts` (nouveaux) et les suites des blocs, de l'analyse, du rendu, des liens, des procédures, du catalogue, de l'éditeur, du rail et des specs e2e dont le « + » ouvre désormais un choix ; `packages/plateforme/CHANGELOG.md`, registre, `hypotheses.md`, `fiche-decisions.md`, `docs/architecture.md`, `docs/mcp-golden-queries.md`, `status.md`.

## [2026-09-29] — E11-S10 : espace Privé dès la première connexion, rail d'un admin, créateur d'une équipe, vue « Contexte » à `/context`

**Quoi :** E11-S10 : l'espace « Privé » de chaque membre dès sa première connexion : handle posé par la base à l'insertion et réparation des espaces manquants (`ensure_private_space`, migration `20260929160000_private_spaces.sql`) ; le rail d'un administrateur ne montre que ses équipes (arbre de membre) ; le créateur d'une équipe en est le responsable (`createTeam`, texte d'`admin_team create`) ; vue « Contexte » à `/context`, ouverte par le menu du compte, l'accueil sans onglets ; vue et encart sans tête servie, sans « Règles Oto » ni lien vers Profil, « Nouveautés » toujours présente, l'ancre suivie ; publication d'un Contexte sans phrase de recharge.

**Pourquoi :** retours d'écran du responsable d'Oto sur l'hôte de démo, du 2026-09-29 (invitée sans section « Privé », admin qui voit toutes les équipes, onglet « Contexte » de l'accueil à déplacer et à alléger).

**Problèmes :** AC-a0 (relevé de diagnostic sur l'organisation Démo) en attente, par le responsable d'Oto.

**Fichiers :** `packages/plateforme/migrations/20260929160000_private_spaces.sql` (et sa copie `supabase/migrations/`), `packages/plateforme/server/{nodes/tree.ts,teams.ts}`, `packages/plateforme/mcp/admin/tools/team.ts`, `packages/plateforme/ui/contexte/{ecran-du-contexte.tsx,contexte-servi.tsx,vers-la-partie.tsx,apercu-du-contexte.tsx,annexes-du-contexte.tsx,listes-servies.tsx,parties-du-contexte.ts,libelles.ts}`, `packages/plateforme/ui/{accueil/*,coque/{ecrans,types,libelles}.ts,noeud/publication.tsx,index.ts}`, `src/app/(dashboard)/{context/page.tsx,page.tsx,layout.tsx,n/[...chemin]/page.tsx}` ; tests : `tests/integration/pages/contexte-page.test.tsx` (nouveau), les suites de l'accueil, du rail, de la vue et de la page d'un Contexte, `espace-prive`, `invitations`, `equipes-services`, `nodes-personal-tree`, `mcp-admin-ops`, `e05s13-lignes-servies`, e2e de l'accueil et du Contexte ; `packages/plateforme/{CHANGELOG.md,migrations/README.md}`, registre, `portage-ecrans.md § 0`, `database-patterns.md § Règles SECURITY DEFINER`, `hypotheses.md`, `status.md`.

## [2026-09-29] — E11 : cadrage des retours de la démo (dix stories, D131 à D136)

**Quoi :** Nouvelle epic E11 « Retours de la démo » : dix stories longues (S01 tableaux, S02 publication directe et brouillons, S03 contexte et ctx, S04 routage, S05 écrans d'un contenu, S06 éditeur, S07 adresses en anglais, S09 branchement, S10 rail et espaces, S14 harnais de test sans Supabase), ordre en vagues selon les fichiers communs. E10 et E11 sortent ensemble en 1.0.1 (D131, remplace D123) ; arbitrages des retours (D132), preuve par tableau (D133), plafond unique de `context` (D134), publication directe (D135), écrans (D136).

**Pourquoi :** rapport de tests d'un assistant sur l'organisation Démo (FB-0001 à FB-0010) et retours d'écran du responsable d'Oto, du 2026-09-29.

**Fichiers :** `docs/epics/E11-retours-de-la-demo.md`, `docs/epics/_index.md`, `docs/epics/E10-contenus-riches.md`, `docs/stories/E11-*.md`, `docs/decisions/fiche-decisions.md`, `.method/sprint/status.md`.

## [2026-09-29] — Fichiers : le HTML devient un fichier joint, E10-S03 et E10-S05 fusionnées dans E10-S02 (D137)

**Quoi :** Un fichier HTML est un fichier joint à une page, sans rendu dans la page ; « Voir » (icône œil) ouvre dans un nouvel onglet un `html` isolé (ADR-017, déplacé du bloc vers la visionneuse), un `.md` en blocs, un PDF, un `txt` ou un `csv`. Plus de bloc `html`, de page artefact, de clôture ` ```html-artifact ` ni de `read {block}` : `read {file}` sert le texte d'un fichier texte joint (D119). Un `.md` ou un `.csv` lâché dans une page propose d'insérer ou de joindre. `upload.link` prend `file` (joindre) au lieu de `html`. Une seule story, E10-S02, XL en six lots.

**Pourquoi :** décision de JB du 2026-09-29 sur le modèle des fichiers.

**Fichiers :** `docs/stories/E10-S02-fichiers-et-images.md` (réécrite), `docs/stories/{E10-S03,E10-S05}-*.md` (supprimées), ADR-016 § 5, ADR-017, ADR-018, `fiche-decisions.md` (D111, D112, D116, D119, D130, D137), `docs/prd.md` (FR-CONC-07 à 09, 11), `docs/architecture.md`, `docs/epics/E10-contenus-riches.md`, `.method/sprint/status.md`, `uploads-patterns.md § Validation`, `security-patterns.md`, renvois d'E10-S01, S04, S06 et d'E11-S02, S03, S05, S07.

## [2026-09-29] — E11-S04 : routage des procédures (formulations, mots rares, fautes de frappe, questions « comment », M58)

**Quoi :** `route_candidates` cherche chaque formulation du résumé (`s_phrase`), pèse les mots de la demande par leur rareté parmi les candidates lisibles, compte le titre à part (`lexical_title`), corrige les fautes par le lexique et exclut la corbeille avant la coupe. La correction s'écrit une fois, dans `platform.lexicon_fix`, que `search_content` appelle aussi ; `search_content` exclut la corbeille avant sa coupe (M58), seul effet sur `find`. Le service mélange trois parts (`WEIGHTS` 0,25 / 0,30 / 0,45) et distingue le genre de la demande (`requestKind` : `how`, `request`, `data`, `action`) : sans étapes servies, une question, une question « comment » ou une demande polie propose en choix toutes les candidates montrées, jamais la première seule. Jeu « todo » rejoué sans host ; Acme : paraphrases servies 29 → 30 sur 53, formulations 20/20, précision 100 % ; pilote : paraphrases 4 sur 13, inchangé.

**Pourquoi :** FB-0004, rapport de tests d'un assistant sur la todo de Démo (égalités, « crée le projet X » et fautes de frappe non servis) ; retour du responsable d'Oto sur E03-S02 : toujours proposer les candidates (ADR-003 § 2 amendé).

**Problèmes :** « Prospects. » (QP-I5) n'est plus servie sur Démo (0,635, 0,805 avant) : mesure sans attente de test, dite dans les golden queries. Suites propres à Supabase sautées en local, à rejouer sur le projet (org-transfer, portabilite-schema, pilot-qualification, mcp-core, isolation, feedback-prompts).

**Fichiers :** `packages/plateforme/migrations/20260929140000_route_candidates_formulations.sql` (et sa copie `supabase/migrations/`), `packages/plateforme/server/{routing.ts,context/index.ts,context/blocks/code.ts,database.ts}`, `tests/integration/{route-candidates-index,routing,search-content}.test.ts`, `tests/integration/fixtures/todo-routing.cases.ts`, `tests/unit/{routing,context-blocks,e05s13-lignes-servies}.test.ts`, `tests/sql/route-candidates-plan.sql` ; ADR-003, `docs/prd.md`, `docs/architecture.md`, `docs/mcp-golden-queries.md`, `packages/plateforme/migrations/README.md`, registre, `status.md` (M58 soldée).

## [2026-09-29] — E11-S09 : « Brancher mon Claude, ChatGPT ou Mistral »

**Quoi :** un guide de branchement à quatre onglets (claude.ai, ChatGPT, Mistral, Claude Code), étapes réécrites, lien vers la page des connecteurs de chaque assistant, trois demandes à essayer tirées des procédures les plus utilisées ; monté dans une fenêtre `lg` de l'accueil (la carte ne montre plus l'adresse) et sur `/connect`, qui ne garde que le guide et « Vos connexions ». Nouveau nom au menu du compte, dans la palette et au premier jour. Primitive `Tabs` portée d'oto-frontend ; `adresseDe` partagée par les deux pages de l'hôte.

**Pourquoi :** retour du responsable d'Oto sur l'hôte de démo : « Brancher un assistant » à revoir sur l'ergonomie.

**Problèmes :** AC-15 (famille « Mistral » au journal) en attente de la signature `initialize` de Le Chat, relevée au banc ; lien direct de ChatGPT non vérifié.

**Fichiers :** `packages/plateforme/ui/{ds/react/tabs.tsx,connexion/guide-de-branchement.tsx,connexion/libelles.ts,connexion/ecran-connexion.tsx,accueil/*,coque/libelles.ts}`, `packages/plateforme/server/prompts.ts`, `src/lib/plateforme/connexion.ts`, `src/app/(dashboard)/{page.tsx,connect/page.tsx}`, `tests/integration/components/guide-de-branchement.test.tsx` et les suites de l'accueil, de `/connect` et du rail, `tests/e2e/{accueil,connect}.spec.ts` ; `docs/prd.md` (FR-CONN-04), `docs/architecture.md`, `docs/pilote/guide-installation.md`, `portage-ecrans.md § 0`, registre.

## [2026-09-29] — Méthode après la coupe ; dépôt pour les hosts sans shell (D130)

**Quoi :** Les documents de méthode citent l'hôte sous la forme « oto-saas : `<chemin>` » ; les deux renvois à `src/hooks/**` retirés ; `CLAUDE.md § Projet` nomme les connecteurs du paquet (ADR-019). D130 : E10-S05 s'étend aux hosts sans shell (téléchargement d'une adresse publique, sinon formulaire de dépôt), ADR-018 § 7 et § 8 proposés.

**Pourquoi :** un chemin de l'autre dépôt cité comme local ne se trouve pas ; décision de JB pour claude.ai et ChatGPT en ligne.

**Fichiers :** `CLAUDE.md`, `.method/**`, `docs/architecture.md`, `docs/prd.md`, `docs/decisions/{ADR-018-ticket-d-envoi.md,fiche-decisions.md,hypotheses.md}`, `docs/stories/{E05-S11,E10-S05}-*.md`, `packages/plateforme/migrations/README.md`.

## [2026-09-29] — Connecteurs dans le paquet (ADR-019)

**Quoi :** ADR-019 : les connecteurs réels s'écrivent en TypeScript dans le paquet (`server/connectors/`), sans service connecteurs séparé ; ADR-007 § 1, § 2 et § 4 remplacés ; fiche D129 ; architecture, PRD (NFR-ADMIN-01 comprise) et stories E04-S02, E04-S03, E04-S05 alignés.

**Pourquoi :** décision de JB à la reprise des connecteurs.

**Fichiers :** `docs/decisions/ADR-019-connecteurs-dans-le-paquet.md`, `docs/decisions/ADR-007-*.md`, `docs/decisions/fiche-decisions.md`, `docs/architecture.md`, `docs/prd.md`, `docs/stories/E04-S0{2,3,5}-*.md`.

## [2026-09-28] — E05-S13 : retours du soir de JB

**Quoi :** A : l'encart du Contexte de Tout le monde dans Organisation liste ses contenus liés ; vue Contexte et encart sans tailles ni états ; parties en lecture seule en cartes et en français ; « À quoi sert cette page » en deux phrases par portée. B : un seul nom d'organisation, plus de domaines (écran et texte servi) ; Usage caché, Retours réservés à l'équipe plateforme, Journal dans les réglages ; « Suppr. définitivement le » ; le titre d'une section du rail la plie ; « Déplacer » retiré de l'en-tête ; « Commencer à écrire ». M (migration `20260929090000`) : Équipes & accès sans « Règles d'accès » ni « Accès plateforme » ; plusieurs responsables par équipe ; équipe par défaut retirée des écrans et des services (colonne vidée, retirée en 1.1) ; résumés des Contextes au modèle de JB. E : les campagnes Playwright tournent sur une organisation jetable, plus sur Démo.

**Pourquoi :** retours de JB du 2026-09-28 au soir (fiches D127, D128).

**Fichiers :** `packages/plateforme/{migrations,server,schemas,mcp,api,ui}/`, `supabase/migrations/`, `src/app/(dashboard)/`, `scripts/`, `tests/`, `playwright.config.ts` ; pilote : registre, `testing-strategy.md`, hypothèses, golden queries, `status.md` (M73), CHANGELOG du paquet.

## [2026-09-28] — Outillage de la coupe : reçu sans commit, licence et liste de refus

**Quoi :** `verify-receipt` compte les fichiers indexés dans un dépôt sans commit (le commit initial d'oto-pkg et d'oto-saas était refusé après `git add -A`) ; `check-public` n'applique pas la liste de refus au contenu d'un fichier `LICENSE` (clôture E01-S12 e, ADR-010 § 4), les règles de secrets toujours. Décision D126 : oto-saas déployé chez Scaleway par le responsable du déploiement.

**Pourquoi :** coupe à blanc du 2026-09-28.

**Fichiers :** `scripts/verify-receipt.mjs`, `scripts/check-public.mjs`, `tests/unit/{hooks,check-public}.test.ts`, `docs/decisions/fiche-decisions.md`.

## [2026-09-28] — M71 et version 1.0.0 du paquet

**Quoi :** M71 (bug JB) : dans l'onglet Contexte de l'accueil, les pages, tableaux et procédures rangés sous un Contexte, et ses pages liées, s'affichent sous l'éditeur quand on peut l'écrire, chacun en lien (titres partagés par `CONTEXT_INDEX`). Le paquet passe en version 1.0.0 (note de version datée du jour).

**Pourquoi :** retour de JB du 2026-09-28 ; publication de la V1 (D96, D98).

**Fichiers :** `packages/plateforme/{schemas/context-index.ts,schemas/index.ts,server/context/blocks/contexts.ts,ui/contexte/}`, `packages/plateforme/package.json`, `packages/plateforme/CHANGELOG.md`, `tests/` ; registre, `status.md` (M72).

## [2026-09-28] — V1 (paquet 1.0.0)

**Quoi :** la plateforme MCP d'entreprise en V1 : le paquet `@otomata_tech/oto_platform` 1.0.0 et l'application
de base qui le monte. État livré, par fonctionnalité :

- **Identité et connexion** : l'organisation est celle de l'adresse appelée ; on n'entre que sur invitation (lien
  magique, ou email envoyé par la plateforme avec un émetteur OIDC), par email et mot de passe, Google ou Microsoft.
  Écrans d'authentification à la marque de l'organisation ; une personne sans organisation voit qui contacter.
- **Assistants et OAuth** : Claude, ChatGPT et Claude Code se branchent par OAuth 2.1 (métadonnées de ressource
  protégée, enregistrement dynamique, consentement habillé). La page « Brancher un assistant » donne l'adresse du
  serveur, les dernières connexions et des exemples de prompts ; un script fait le ménage des clients OAuth.
- **Les six outils et `ctx`** : `context`, `find`, `read`, `write`, `call`, `feedback`, préfixés par l'organisation,
  liste figée (ajout seulement). `context` émet le `ctx` que les autres exigent, périmé quand les règles changent ;
  chaque appel est journalisé par conversation, secrets masqués ; `feedback` ouvre un ticket numéroté par
  organisation ; les procédures publiées lisibles sont offertes en prompts.
- **Routage et recherche** : `context(phrase)` sert les étapes de la procédure qui correspond nettement, sinon des
  candidats, par plein texte français et trigrammes, sans IA côté serveur. `find` cherche titres, résumés, contenu
  et lignes de tableau, dit où, et corrige une faute de frappe en dernier recours ; seul ce qui est lisible compte.
- **Arbre, pages, procédures, liens** : contenus en nœuds typés et en blocs, brouillon partagé, publication
  atomique gardée par la révision ; `read` par page, section, plan ou révision, `write` par section ou par bloc.
  Liens `[[chemin]]` suivis dans les deux sens, blocs de référence ; l'adresse d'un contenu suit son titre publié,
  l'ancienne reste un alias, et un chemin pris donne le premier libre, jamais un refus. `context` sert d'abord les
  règles de l'espace, puis une partie par Contexte (tout le monde, Privé, équipes) ouverte par sa ligne de faits et
  les contenus rangés dessous, avec nouveautés, procédures utiles et contenus récents, et dit la langue de réponse ;
  les espaces personnels vivent sous `private`. Un bloc d'une version plus récente est gardé, servi en ligne de
  commentaire. Une procédure porte des blocs `call`, contrôlés à la publication.
- **Tableaux et revue** : tableaux typés (clé, colonnes, file de travail, clôture) derrière `call` : `table.schema`,
  `rows`, `aggregate`, `write` (une valeur nouvelle porte sa preuve, provenance par cellule), `claim` et `release`.
  Schéma créé et modifié par `write` ; à l'écran, grille triée et filtrée et file de revue humaine.
- **Équipes et droits** : niveaux hérités par l'arbre (aucun, lecture, écriture, gestion) sur les nœuds et les
  comptes, pour une personne, une équipe ou toute l'organisation ; un espace Privé par personne ; responsables
  d'équipe. Les services décident chaque droit avant la requête, la base isole les organisations ; l'isolation de
  deux organisations est prouvée de bout en bout.
- **Écrans** : repris d'oto-frontend (design system, huit thèmes, jour et nuit) sous une seule coque, le rail
  (espaces, arbre, recherche ⌘K, glisser-déposer pour ranger ou rendre enfant, ordre des frères, aperçu des accès
  avant un déplacement). Accueil, page, Contexte et tableau s'éditent en place et se publient seuls, 3 s après la
  frappe et en quittant ; « @ » cite un contenu ; une procédure s'édite et se lit comme une page. « Partager » à la
  manière de Notion, accès général de toute l'organisation en lecture ou en modification, lien public en lecture
  seule jamais indexé, qui ne sert que ce que son auteur lit (lignes d'un tableau comprises) ; « Contenus liés »,
  duplication, corbeille de 30 jours ; liens lus dans la phrase ; page Profil (prénom, nom, langue de réponse,
  couleur) et menu du compte ; accueil en onglets : Activités (le fil des gestes de chacun dans la portée du
  journal, « Procédures les plus utilisées ») et Contexte (une partie par Contexte ouverte par ses faits, « Règles
  Oto » repliée) ; listes de choix en popover, au clavier ; Équipes et accès ; journal des conversations.
- **Administration** : tableau de bord de l'organisation (réglages, marque et langue, activation des connecteurs et comptes
  simulés, drapeaux, accès de l'équipe plateforme, usage et retours des assistants). MCP admin à huit outils pour
  l'équipe plateforme, sous un accès daté et révocable, avec son journal ; état de la cellule (version, migrations,
  santé).
- **Cellule, marque, sous-domaines** : l'application de base sert plusieurs organisations en cellule partagée ;
  chacune a sa marque (thème, logo, nom affiché, icône d'onglet) et reçoit un sous-domaine à sa création, geste
  coupé sans ses variables ; ses fonctions tournent à Paris, à côté de la base.
- **Portabilité** : le paquet parle à Postgres par sa propre connexion, sous l'appelant vérifié, sur Supabase comme
  sur un Postgres nu ; `platform` hors du Data API. Émetteur d'identité configurable : Supabase Auth, Logto ou
  Keycloak. Le schéma sort en une seule ligne de base V1, sans colonne ni contrôle de base que plus rien ne lit ;
  elle s'installe sur tout Postgres, vérifiée en CI sur un Postgres nu ; sur le poste, les tests tournent sur un
  Postgres natif (`pnpm db:local`).
- **Installation et publication** : paquet npm public en sources TypeScript, licence MIT, publié avec provenance
  sur un tag ; commande `oto-platform` (`migrations sync|check`, `db prepare`) ; preset Renovate (mineures
  fusionnées si la CI passe, majeures en revue) ; fonctions métier d'un ERP au catalogue ; export-import d'une
  organisation ; organisation « Démo » rejouable ; scripts des réglages d'Auth, du Data API et de l'équipe
  plateforme.

**Reporté en V2 :** service connecteurs et connecteurs tiers réels, comptes tiers et coffre, écran Connecteurs,
sondes et alertes des comptes, registre central des versions, jetons de service, relance des devis réelle,
traduction des écrans (ADR-015).

**Après la V1 :** epic E10, contenus riches (markdown et CSV importés et exportés, fichiers et images derrière un
port S3, bloc HTML isolé, dépôt par lien à usage unique) : six stories prêtes, livrées ensemble en 1.1.0
(ADR-016 à ADR-018).

**Pourquoi :** clôture de la V1 : les dépôts neufs partent d'un changelog propre, une entrée par version ;
l'historique du chantier reste dans l'archive privée.
