# Story E11-S20 — Le rail à jour : son arbre relu à la navigation, au retour sur l'onglet et après chaque geste

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | Coque (rail) ; 4.4 Concevoir et mettre à jour (un contenu créé, renommé, déplacé ou mis à la corbeille, à l'écran ou par un assistant) |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | N/A : aucun écran nouveau ; le rail (`ui/coque/rail-application.tsx`) garde son rendu, seul son arbre change en place. Une ligne discrète sous les sections après trois relectures en échec, dans la classe de la phrase de l'arbre vide (`oto-rail-group`) |
| **Conventions** | coding-standards, api, security, portage, a11y, registry, testing |
| **Estimation** | M |
| **Version** | 1.1.5 |
| **Dépend de** | E05-S09 (✅, rail), E05-S10 (✅, gestes du rail), E05-S03 (✅, `useRafraichir`) |
| **Porteuse de migration** | Non |

## Contexte

Le rail (arbre des contenus, sections Tout le monde, équipes, Privé) est lu par le layout de l'hôte
(`src/app/(dashboard)/layout.tsx`, `lireLArbre` de `src/lib/plateforme/lectures.ts`, service `visibleTree`) et passé
en props à `RailApplication`. Next ne rejoue pas un layout à la navigation client : une page créée, renommée,
déplacée ou mise à la corbeille par un assistant (MCP) ou dans un autre onglet n'apparaît qu'au rechargement du
document. Décision de JB (2026-09-30) : le rail relit **son arbre seul**, pas toute la page, à chaque changement de
page, au retour sur l'onglet ou la fenêtre (délai minimal entre deux relectures), et après chaque geste de l'écran qui
change l'arbre ; l'arbre se met à jour en place, sans clignoter ; une relecture en échec garde l'ancien arbre ; une
relecture en cours n'est pas doublée.

État constaté :
- `ui/` ne lit pas `server/` (ADR-008 § 4) : ses lectures passent par l'API du paquet (`appelerPlateforme`,
  `ui/api/client.ts`), montée par l'hôte sous `/api/platform/*` par la route attrape-tout
  `src/app/api/platform/[...route]/route.ts` (GET compris) : aucune route d'hôte à ajouter.
- Aucune route ne rend l'arbre visible : `rg -n "visibleTree" C:/apps/oto-pkg/packages/plateforme/api` ne trouve rien.
- L'hôte donne déjà au paquet l'adresse courante (`useHote().chemin`, `usePathname()` dans
  `src/app/(dashboard)/fournisseur-de-rafraichissement.tsx`).
- Chaque geste qui change l'arbre appelle `useRafraichir()` (`router.refresh()` chez l'hôte), qui rejoue le layout :
  le rail doit alors adopter l'arbre qu'il reçoit en props.

**Refs :**
- PRD : coque (rail), parcours 4.4
- Architecture : § 5 « Portes » (`api/`, `ui/`) ; ADR-008 § 4 (mutations et lectures des écrans par l'API) ; ADR-012 § 3
  (droits dans le service)

## Périmètre

La route `GET /api/platform/nodes/tree` ; la relecture de l'arbre dans `RailApplication` (navigation, retour sur
l'onglet ou la fenêtre, relecture de la page) ; `useRafraichir` qui demande aussi la relecture du rail.

## Hors périmètre

- Les équipes et le nom de l'organisation restent lus au chargement et à chaque relecture de la page
  (`router.refresh()`) : leur relecture seule demanderait une seconde route (`GET teams` rend l'annuaire, que le
  layout ne passe pas au rail) — HN-E11S20-5.
- Une mise à jour poussée par le serveur (abonnement, SSE) : V2 si la relecture ne suffit pas.
- `SectionsDuRail` monté seul dans la barre d'un ERP (AC-a8 d'E05-S09) : il reçoit l'arbre de l'ERP, qui le relit à sa
  façon ; seul `RailApplication` relit.

## Critères d'acceptation

- [ ] **AC-1** — **Given** une personne connectée **When** `GET /api/platform/nodes/tree` **Then** 200 et
  `{ data: { tree, truncated } }`, exactement ce que `visibleTree` rend pour elle (le service du layout, sous sa
  session : un nœud qu'elle ne lit pas n'y est pas ; borne `truncated` à 5 000 nœuds) ; aucune ligne de journal (une lecture).
- [ ] **AC-2** — **Given** aucune session (jeton absent ou refusé) **When** `GET /api/platform/nodes/tree` **Then** 401
  `forbidden` « Authentication required. », sans lecture.
- [ ] **AC-3** — **Given** le rail monté **When** l'adresse courante change (navigation client) **Then** le rail relit son
  arbre (`GET nodes/tree`) et le montre en place : une section repliée le reste, la ligne courante est celle de la
  nouvelle adresse ; l'arbre affiché reste pendant la lecture.
- [ ] **AC-4** — **Given** le rail monté **When** l'onglet redevient visible (`visibilitychange` → `visible`) ou la fenêtre
  reprend le focus **Then** le rail relit son arbre si la relecture précédente (ou le montage) date de 5 s au moins ;
  sinon rien ne part.
- [ ] **AC-5** — **Given** un geste de l'écran qui relit la page (`useRafraichir()` : création, titre publié,
  déplacement, rangement, duplication, corbeille, restauration, import, et tout autre geste qui l'appelle) **When** il
  aboutit **Then** la page est relue par l'hôte comme avant, et le rail relit son arbre.
- [ ] **AC-6** — **Given** une relecture en échec (réseau, refus, réponse sans arbre) **Then** l'arbre montré reste, sans
  alerte ; après trois échecs d'affilée, une ligne discrète sous les sections dit « L'arbre n'a pas pu être actualisé. »
  (région `role="status"` montée vide), retirée à la première relecture réussie.
- [ ] **AC-7** — **Given** une relecture en cours **When** d'autres relectures sont demandées **Then** aucune requête ne
  part en parallèle ; une seule relecture suit la fin de la première.
- [ ] **AC-8** — **Given** un nouvel arbre servi par le layout (relecture de la page) **Then** il remplace l'arbre montré.

## Implémentation

### Migrations prévues
Aucune : la route lit le service existant (`visibleTree`).

### Schémas Zod
Aucun : la route ne prend aucun paramètre ; la réponse a la forme de `DonneesDuRail["arbre"]` (`ui/coque/types.ts`),
vérifiée à la lecture (un tableau `tree`, un booléen `truncated`).

### Fichiers à créer, par face
- `ui/` : `packages/plateforme/ui/coque/use-arbre-du-rail.ts` (`useArbreDuRail`, `relireLeRail`).

### Fichiers à modifier, par face
- `api/` : `packages/plateforme/api/nodes.ts` (route `GET nodes/tree`).
- `ui/` : `packages/plateforme/ui/coque/rail-application.tsx` (l'arbre de `useArbreDuRail`, la ligne discrète),
  `packages/plateforme/ui/coque/libelles.ts` (`RAIL.arbreNonActualise`), `packages/plateforme/ui/hote/rafraichir.ts`
  (`useRafraichir` demande aussi la relecture du rail).
- Hôte : aucun (la route attrape-tout sert déjà `GET`).
- Tests : `tests/unit/api-rail.test.ts`, `tests/integration/components/rail-application.test.tsx`,
  `tests/e2e/rail.spec.ts`.
- Documents : `docs/architecture.md`, `docs/decisions/hypotheses.md`, `.method/conventions/component-registry.md`,
  `packages/plateforme/CHANGELOG.md`, `packages/plateforme/package.json` (1.1.5), `docs/changelog.md`,
  `.method/sprint/status.md`.

### Patterns à suivre
- `security-patterns.md § Droits dans le service` : la route délègue à `visibleTree`, qui filtre par `nodeLevels`.
- `portage-ecrans.md § 2` : l'îlot relu remet son état à l'état servi quand celui-ci change ; `§ 7` : aucune mesure de
  mise en page.
- `portage-ecrans.md § 4` : une lecture en échec se dit ; ici l'arbre servi reste montré (HN-E11S20-3).

## Rayon d'impact

### Appelants
- `useRafraichir` — `rg -n "useRafraichir\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src` → 22 appelants dans `ui/`
  (`components/{relire-la-page,action-plateforme}.tsx`, `tableau/{options-du-tableau,decision-de-revue}.tsx`,
  `profil/formulaire-du-profil.tsx`, `noeud/{publication,partage-du-noeud,en-tete-modifiable}.tsx`,
  `noeud/editeur/use-envois.ts`, `admin/{connecteurs/creation-de-compte,organisation/formulaire-organisation,retours/refus-du-retour}.tsx`,
  `corbeille/restauration.tsx`, `equipes/{reglages-d-equipe,gestes,creation-d-equipe,ajout-de-regle}.tsx`,
  `invitations/inviter-quelqu-un.tsx`, `coque/{import-de-fichier,deplacement-dans-le-rail,gestes-du-rail,creation-dans-le-rail}.tsx`)
  et un commentaire de l'hôte. Pour chacun : la fonction rendue appelle toujours la relecture de l'hôte, une fois, puis
  demande la relecture du rail (un événement de la fenêtre ; sans rail monté, rien ne part). Identité de la fonction
  stable tant que l'hôte donne la même (`useCallback`). Doublures : `rg -ln "ContexteDeRafraichissement" C:/apps/oto-pkg/tests`
  → 35 fichiers de tests qui posent une relecture espionnée : toujours appelée une fois par geste ; seuls ceux qui
  montent `RailApplication` voient une requête de plus (`rail-application.test.tsx`, `e05s11-coque.test.tsx`, sans
  geste) ; `SectionsDuRail` monté seul n'écoute pas.
- `RailApplication` — `rg -n "RailApplication" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` →
  `src/app/(dashboard)/layout.tsx` (props inchangées), `ui/index.ts`, `README.md`, `CHANGELOG.md` ; tests
  `rail-application.test.tsx` (sa simulation de l'API sert `GET nodes/tree` hors de la file des réponses, en panne par
  défaut : l'arbre des props reste), `e05s11-coque.test.tsx` (aucun geste ni navigation : inchangé).
- `nodesRoutes` — `rg -n "nodesRoutes" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` →
  `api/handler.ts` (table de dispatch), `tests/integration/exports.test.ts` (route `export` : inchangée) ; la route
  ajoutée est départagée par son segment fixe `tree`, aucune autre route `GET nodes/<un segment>` ne le porte.
- `visibleTree` — `rg -n "visibleTree\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` →
  `src/lib/plateforme/lectures.ts` (layout), tests `e05s10e-gestes`, `invitations`, `nodes-personal-tree` : service
  inchangé, un appelant de plus.

### Doublons
- Registry : `rg -n -i "relecture|relire|rafraich" C:/apps/oto-pkg/.method/conventions/component-registry.md` →
  `useRafraichir` (relecture de la page), `ErreurDeLecture` / `RelireLaPage`, `useArbreAvecLesCreations` (nœud créé
  montré avant la relecture). Verdict : réutiliser `useRafraichir` comme déclencheur des gestes (un seul point) ;
  `useArbreAvecLesCreations` reste (il se vide quand l'arbre change de référence, ce que fait une relecture) ; aucun
  hook ne relit une donnée hors de la page.
- Concept (écoute du retour sur l'onglet, signal entre îlots) :
  `rg -n "visibilitychange|addEventListener\(\"focus\"|dispatchEvent\(" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/src`
  → `noeud/publication.tsx` (publie à la sortie de la page : autre geste), `accueil/recherche-de-l-accueil.tsx` (ouvre la
  palette par un raccourci simulé) : laisser, besoins différents.
- Lecture de l'arbre : `rg -n "visibleTree" C:/apps/oto-pkg/packages/plateforme/api` → rien ; `GET search` (palette) et
  `GET nodes?path=` (tête d'un nœud) ne rendent pas l'arbre : une route nouvelle, dans la ressource `nodes`.

### Effet produit
- Liste d'outils MCP : inchangée (route d'écran, ADR-002 non touché).
- Schéma `platform`, RLS : inchangés (lecture du service existant).
- Hôte : aucune route à ajouter (attrape-tout) ; après chaque geste de n'importe quel écran du paquet, une requête
  `GET nodes/tree` de plus quand le rail est monté (bornée comme la lecture du layout) ; à chaque navigation, une.
- Journal : aucune ligne (lecture).
- Barre d'un ERP qui monte `SectionsDuRail` seul : inchangée.

### Refacto
- Écarté : passer la relecture de la page (`router.refresh()`) à une relecture par îlot. Hors demande ; la relecture du
  rail s'ajoute au point unique qu'appellent déjà tous les gestes.

## Hypothèses

- **HN-E11S20-1 (AC-5).** Le geste demande la relecture du rail par `useRafraichir` (un seul point, tous les gestes
  d'aujourd'hui et de demain) plutôt que par un appel ajouté à chaque geste : une requête de plus après un geste qui ne
  change pas l'arbre (profil, connecteurs), bornée. Dans Next, `router.refresh()` rejoue aussi le layout, qui sert un
  nouvel arbre (AC-8) : la relecture du rail garantit l'arbre à jour même chez un hôte dont la relecture ne rejoue pas
  le rail ; le rail montre le dernier arbre arrivé.
- **HN-E11S20-2 (AC-4).** Délai minimal de 5 s entre deux relectures, compté depuis le départ de la relecture
  précédente, quel qu'en soit le déclencheur, ou depuis le montage (l'arbre vient d'être servi) ; il ne vaut que pour le
  retour sur l'onglet ou la fenêtre (les deux arrivent souvent ensemble) : une navigation ou un geste relit toujours.
- **HN-E11S20-3 (AC-6).** Une relecture en échec ne dit rien tout de suite (l'arbre servi reste juste, à la dernière
  lecture près) ; trois échecs d'affilée affichent une ligne dans une région de statut montée vide (annonce polie,
  jamais d'alerte : `accessibility-patterns.md § Régions dynamiques`), retirée au premier succès.
  Une réponse sans tableau `tree` ni booléen `truncated` compte comme un échec. Un arbre servi en échec par le layout
  est remplacé par la première relecture réussie.
- **HN-E11S20-4 (AC-7).** Une relecture demandée pendant qu'une autre est en vol n'en lance pas une seconde : elle est
  notée, et une seule relecture suit (les demandes se fondent). La requête en vol n'est pas annulée : elle peut porter
  l'arbre d'avant un geste, la suivante le corrige.
- **HN-E11S20-5 (hors périmètre).** Équipes et nom de l'organisation : relus seulement avec la page (`router.refresh()`,
  qui suit la création d'une équipe) ; les relire avec l'arbre demanderait une seconde route ou d'élargir celle-ci.
- **HN-E11S20-6 (AC-1).** Route `GET nodes/tree` dans la ressource `nodes`, à côté de `nodes/links`, `nodes/impact`,
  `nodes/export` : aucun paramètre, lecture sans journal (D138).

## Actions JB

Aucune (publication de la 1.1.5 par le pilote).

## Tests attendus

### Unit tests (base réelle, suite portable)
- [ ] `tests/unit/api-rail.test.ts` : `GET nodes/tree` rend `visibleTree` de la personne (une page d'une autre équipe
  absente) (AC-1) ; sans session, 401 (AC-2).

### Integration tests (composants)
- [ ] `tests/integration/components/rail-application.test.tsx` : relecture à la navigation, section repliée gardée (AC-3) ;
  au retour sur l'onglet et la fenêtre, délai de 5 s respecté (AC-4) ; après un geste (« Dupliquer ») (AC-5) ; ancien
  arbre gardé sur une panne, ligne discrète après trois échecs, retirée au succès (AC-6) ; une seule requête en vol et une
  seule relecture après (AC-7) ; arbre servi adopté (AC-8).

### E2E tests (écrit, lancé par le pilote)
- [ ] `tests/e2e/rail.spec.ts` : une page créée dans un autre onglet apparaît dans le rail à la navigation suivante, sans
  recharger le document ; mise à la corbeille à la fin.

## Post-implémentation

### Écarts avec l'architecture
Aucun invariant touché ; `docs/architecture.md` § 5 complété (route et relecture du rail).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `useArbreDuRail`, `relireLeRail` | `packages/plateforme/ui/coque/use-arbre-du-rail.ts` | L'arbre montré par le rail et ses relectures |
| route `GET nodes/tree` | `packages/plateforme/api/nodes.ts` | `visibleTree` sous la session |

### Notes
- Revue : la ligne discrète d'AC-6 passe d'un `<p>` sans rôle à une région `role="status"` montée vide, hors de la mise
  en page tant qu'elle l'est (`oto-sr-only`) : un échec dit sans être annoncé laissait un lecteur d'écran sans le signal
  (`accessibility-patterns.md § Régions dynamiques`).
- La lecture de l'arbre par un composant client suit l'exception d'ADR-008 § 4 (lectures des écrans par `api/`, comme la
  palette et la liste de « @ ») ; l'arbre du premier rendu reste servi en props par le layout.
- Tests lancés isolés (`PLATFORM_TEST_DB=local`) : `tests/unit/api-rail.test.ts` 5/5 ; `rail-application.test.tsx`,
  `e05s11-coque.test.tsx`, `e05s13-coque.test.tsx` 65/65 ; voisins de `useRafraichir` (`e05s10b2-adresse`,
  `import-de-fichier`, `en-tete-modifiable`, `fournisseur-de-rafraichissement`, `e05s10b2-corbeille`,
  `frontiere-client-serveur`, `action-plateforme`) 55/55 ; `package-publish.test.ts` 5/5. E2E `rail.spec.ts` écrit,
  non lancé.
