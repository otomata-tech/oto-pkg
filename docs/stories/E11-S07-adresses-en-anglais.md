# Story E11-S07 — Adresses en anglais : routes, paramètres, ancres, préfixe d'API

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | Tous les écrans (4.1 à 4.6) : seule l'adresse change, pas l'écran |
| **Statut** | 🟢 Ready |
| **Priorité** | Must (cassante, sort avec 1.0.1) |
| **Référence UI** | N/A : aucun changement visible hors de la barre d'adresse |
| **Conventions** | api, forms, state, nextjs, seo, performance, stack, auth, i18n, security, supabase, mcp, portage, a11y, registry, testing |
| **Estimation** | L (quatre lots mécaniques : a routes et préfixe, b paramètres, c ancres, d garde et documents) |
| **Vague** | E11, dernière story d'E10 et d'E11 (après E10-S04, S01, S06, S02, S03, S05 et E11-S01 à S06, S09 et S10) |
| **Dépend de** | Toutes les stories d'E10, et E11-S01 à S06, S09 et S10 : elle renomme aussi les routes qu'elles créent (`/context` d'E11-S10 est déjà en anglais) |
| **Porteuse de migration** | Non : aucune table, aucune donnée. Les chemins des nœuds (`contexte`, `private/<handle>/contexte`) sont des données, hors périmètre |

## Contexte

Consigne du responsable d'Oto (fiche D132) : « il ne faut jamais mettre de français dans les URL ».
Aujourd'hui, l'hôte de référence et le paquet servent des adresses en français : routes (`/equipes`,
`/corbeille`…), préfixe de l'API des écrans (`/api/plateforme/*`), paramètres (`?onglet=`,
`?periode=`…), valeurs (`?version=publiee`) et ancres (`#nouveautes`). Le renommage sort dans 1.0.1 avec
le reste d'E10 et d'E11, **sans alias ni redirection** : la plateforme n'a pas de client (fiche D131).
La PR Renovate de l'hôte se relit à la main malgré la fusion automatique des correctives (D131).

Décisions existantes touchées :
- Aucun ADR n'impose des adresses françaises. ADR-015 § 3 dit seulement que l'adresse ne porte pas
  la langue (pas de `/en/`). La règle nouvelle le complète : l'adresse est en anglais quelle que soit
  la langue de l'écran.
- L'hypothèse N7 d'E08-S09 (`hypotheses.md`, « Paramètres d'URL de l'usage et des retours en
  français, comme `/journal` ») est **remplacée**.
- Le préfixe `/api/plateforme/*` est le contrat de montage entre l'hôte et le paquet (H03, H06,
  ADR-012, ADR-016 § 5 et § 7, ADR-017, ADR-018 § 1, README du paquet) : le changer est un
  changement cassant pour tout hôte, d'où l'ADR ci-dessous.

**Refs :** fiches D131, D132 ; ADR-008 § 2 (l'hôte donne les adresses aux écrans), ADR-015 § 3 ;
`seo-patterns.md § Règles SEO` ; `state-management.md § URL State (recommandé pour les filtres)`.

## Périmètre

Ce qui s'écrit dans la barre d'adresse ou dans un lien (HN-E11S07-1) : segments statiques des routes
de `src/app`, préfixe d'API, noms et valeurs des paramètres lus par une page ou écrits par un
formulaire `GET`, ancres qu'un lien vise, adresses d'écran que le paquet écrit lui-même (lien
d'invitation, texte MCP). Plus une garde machine qui refuse un retour du français (lot d).

## Hors périmètre

- Les identifiants de code (`handlePlateforme`, `AdressesDuRail.equipes`, `AdressesDuRail.organisation`,
  `hrefDOnglet`, `UsageSummary.periode`), les noms de dossier entre crochets (`[...chemin]`, `[jeton]`)
  et les chemins de modules du paquet (`ui/admin/organisation/`, `ui/identite/aucune-organisation.tsx`),
  qui n'apparaissent pas dans l'adresse.
- Les textes servis en anglais par le paquet (outils MCP, refus) : ils gardent l'orthographe
  britannique `organisation` ; seules les adresses passent en américain (HN-E11S07-3).
- Les `id` d'éléments qu'aucun lien ne vise : `<ancre>-liste-<n>` et `fin-liste-<n>` (`aria-labelledby`,
  `ui/contexte/listes-servies.tsx` l. 136, `contexte-servi.tsx` l. 214), `regles-du-noeud`, `usage-equipe`…
  et la sentinelle `#sans-cible` (`ui/public/page-publique.tsx` l. 50), jamais rendue en lien.
- Les chemins des nœuds et le contenu écrit par les personnes : données, sans migration (décision 1).
- Le retrait des écrans Marque, Drapeaux, Accès plateforme et de leurs clés d'adresse : reste M65.
- Les adresses déjà neutres ou anglaises : `/`, `/n/`, `/p/`, `/connect`, `/context` (créée par
  E11-S10), `/login`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/auth/oidc/*`, `/oauth/consent`,
  `/admin`, `/admin/usage`, `/api/mcp`, `/api/mcp-admin`, `/.well-known/*`, et les paramètres `q`, `f`,
  `n`, `type`, `conversation`, `next`, `redirect`, `error`, `authorization_id`, `token_hash`, `path`,
  `state`, `disposition`, `phrase`. Les ressources de l'API (`nodes`, `teams`, `trash`…) sont déjà
  en anglais : seul le préfixe change.

## Correspondance (ancien → nouveau)

| Genre | Ancien | Nouveau |
|-------|--------|---------|
| Route | `/equipes` | `/teams` |
| Route | `/profil` | `/profile` |
| Route | `/corbeille` | `/trash` |
| Route | `/plateforme` | `/platform` |
| Route | `/aucune-organisation` | `/no-organization` (HN-E11S07-3) |
| Route | `/auth/confirmer` | `/auth/confirm` |
| Route | `/admin/organisation` | `/admin/organization` (HN-E11S07-3) |
| Route | `/admin/connecteurs` | `/admin/connectors` |
| Route | `/admin/retours` | `/admin/feedback` |
| Route gardée | `/journal` | inchangée (HN-E11S07-2) |
| Redirection retirée | `/admin/acces`, `/admin/marque`, `/admin/drapeaux`, `/plateforme/invitations` | 404 (HN-E11S07-5) |
| Préfixe d'API | `/api/plateforme/*` | `/api/platform/*` |
| Équipes | `onglet=membres\|equipes` | `tab=members\|teams` |
| Équipes | `filtre=invitations`, `tri=equipe\|personnes`, `sens` | `filter=invitations`, `sort=team\|people`, `order` |
| Journal | `periode`, `equipe`, `personne`, `erreurs`, `curseur`, `appels` | `period`, `team`, `person`, `errors`, `cursor`, `calls` |
| Retours | `etat`, `periode`, `curseur` | `state`, `period`, `cursor` |
| Usage, procédures | `periode`, `equipe` | `period`, `team` |
| Grille | `tri` ; opérations de `f` `contient\|egal\|min\|max\|vide\|rempli` ; booléens `oui\|non` | `sort` ; `contains\|eq\|gte\|lte\|empty\|not_empty` ; `true\|false` |
| Filtre de colonne | champs `colonne`, `contient`, `egal`, `presence=vide\|rempli` | `column`, `contains`, `eq`, `presence=empty\|not_empty` (`min`, `max` inchangés) |
| Nœud | `version=publiee` | `version=published` |
| Organisation | `enregistre=1` | `saved=1` |
| Consentement | `erreur=decision` | `error=decision` |
| Ancres | `nouveautes`, `contenus`, `contexte-tout-le-monde`, `contexte-prive`, `contexte-<slug>`, `partie-<n>` | `news`, `recent-content`, `context-everyone`, `context-private`, `context-<slug>`, `part-<n>` (`procedures` inchangée) |

## Critères d'acceptation

### Lot a — Routes et préfixe d'API

- [ ] **AC-a1 — Routes renommées.** **Given** l'hôte de référence **When** une personne connectée
  ouvre chaque route de la colonne « Nouveau » **Then** elle voit l'écran de l'ancienne adresse.
  **And** chaque ancienne adresse, redirections retirées comprises, répond 404, sans redirection.
  **And** `/admin` mène à `/admin/organization` (`src/app/(dashboard)/admin/page.tsx` l. 5).
- [ ] **AC-a2 — Adresses données au paquet.** **Given** le rail, l'accueil, le fil d'administration
  **Then** leurs liens mènent aux nouvelles routes : `ADRESSES` de `src/app/(dashboard)/layout.tsx`
  l. 27-41 et de `admin/adresses.ts` (dont `organisation: "/admin/organization"`, `layout.tsx` l. 33,
  `adresses.ts` l. 13), `NAVIGATION` de `src/app/(dashboard)/page.tsx` l. 63-71, `CONTEXTE_SERVI` de
  `n/[...chemin]/page.tsx` l. 67, `ICI` d'`admin/organization/page.tsx` (l. 21), et chaque
  `redirect("/aucune-organisation")`, devenu `redirect("/no-organization")`.
- [ ] **AC-a3 — Préfixe d'API.** **Given** un écran du paquet **When** il appelle l'API **Then**
  `fetch` vise `/api/platform/<ressource>` (`ui/api/client.ts` l. 51), servie par
  `src/app/api/platform/[...route]/route.ts`. **And** `handlePlateforme` ne répond que sous
  `/api/platform/` (`PREFIX`, `api/handler.ts` l. 115) : sous `/api/plateforme/`, `not_found` (404).
  **And** le client, la porte et les services qui écrivent une adresse d'API lisent le préfixe de la
  seule constante `PLATFORM_API_PREFIX` de `schemas/` (HN-E11S07-10) : aucun littéral `/api/platform/`
  ailleurs dans le paquet hors tests et commentaires.
  **And** les routes d'E10 y passent : `nodes/export`, `tables/import`, `tables/export`, `files`,
  `files/<id>`, `files/<id>/complete`, `blocks/<id>/html`, `public/<jeton>/files/<id>`,
  `public/<jeton>/blocks/<id>/html`, `uploads/<jeton>`, et celles qu'E11-S01 à S06 ajoutent.
- [ ] **AC-a4 — Adresses écrites par le paquet.** **Given** un service qui écrit une adresse
  **Then** elle suit la correspondance :
  - lien d'invitation `<origine>/auth/confirm?next=/` (`api/invitations.ts` l. 24) et lien magique
    de l'hôte (`src/lib/actions/auth.ts` l. 72) ; `/auth/confirm` public (`src/middleware.ts` l. 15) ;
  - refus `not_enabled` servi à l'assistant (`server/connectors/resolution.ts` l. 271) :
    « … connect one on the dashboard: <origine>/admin/connectors. », comparé mot pour mot ;
  - liens de fichiers servis par `read` et relus par `parseMarkdown` : `/api/platform/files/<id>`
    (E10-S02 AC-d1) ; adresse rendue par `upload.link` : `/api/platform/uploads/<jeton>` (E10-S02
    AC-f2) ; exclusions de `X-Frame-Options` et `Referrer-Policy` des deux routes HTML dans
    `next.config.ts` (E10-S02 AC-c3) sur le nouveau préfixe.
  **And** la liste des outils MCP reste de six, schémas inchangés (ADR-002).

### Lot b — Paramètres et valeurs

- **AC-b1** : retiré, l'accueil n'a plus d'onglet (E11-S10 AC-e3).
- [ ] **AC-b2 — Équipes.** **Given** `/teams?tab=teams&sort=people&order=desc&filter=invitations&q=a`
  **Then** l'écran montre l'onglet, le tri, le filtre et la recherche ; les liens qu'il écrit
  (`hrefDOnglet`, `src/app/(dashboard)/equipes/page.tsx` l. 31-37) n'ont que ces noms.
- [ ] **AC-b3 — Journal, retours, usage.** **Given** `/journal?period=30&team=<id>&person=<id>&errors=1`,
  `/admin/feedback?state=all&period=7&cursor=<c>` et `/admin/usage?period=90&team=<id>` **Then**
  chaque écran applique ses filtres et ses liens (période, suite, conversation) les réécrivent sous
  ces noms. **And** un ancien nom (`periode=30`) est ignoré comme tout paramètre inconnu.
  **And** `ListeDesProcedures` lit et écrit `?team=`.
- [ ] **AC-b4 — Grille d'un tableau.** **Given** une grille **When** une personne trie, filtre une
  colonne texte, un choix, un nombre, un booléen, puis « Vide » **Then** l'adresse porte `sort`,
  `f=<colonne>:<contains|eq|gte|lte|empty|not_empty>:<valeur>` et `true|false` pour un booléen, et le
  formulaire « Filtrer » envoie `column`, `contains`, `eq`, `min`, `max`, `presence`. **And** une
  clause à l'ancienne (`f=nom:contient:x`) est écartée et l'écran le signale, comme toute clause
  illisible (`ignores` de `reglagesDepuisLAdresse`).
- [ ] **AC-b5 — Version publiée.** **Given** un rédacteur **When** il suit « Voir la version publiée »
  (`ui/noeud/corps-du-noeud.tsx` l. 112, `ui/contexte/contexte-servi.tsx` l. 101) **Then**
  l'adresse est `/n/<chemin>?version=published` et la page la lit (`nodeVersionParamSchema`,
  `schemas/nodes.ts` l. 223 ; `ici` de `ecran-de-noeud.tsx` l. 213 et de `n/[...chemin]/page.tsx` l. 274).
- [ ] **AC-b6 — Retours de formulaire.** **Given** la marque enregistrée **Then** la page revient à
  `/admin/organization?saved=1` (`ui/marque/formulaire-de-marque.tsx` l. 136) et son statut
  d'enregistrement s'affiche. **Given** une décision OAuth à refaire **Then** l'adresse porte
  `&error=decision` (`src/lib/actions/consentement.ts` l. 24, `src/app/oauth/consent/page.tsx` l. 46-58).

### Lot c — Ancres

- [ ] **AC-c1 — Parties du Contexte.** **Given** l'aperçu du Contexte d'une page **When** une personne
  suit une couche **Then** elle arrive à `/context#<ancre>` (E11-S10 AC-e4), ancre de la correspondance
  (`ancreDeLaPartie`, `ui/contexte/parties-du-contexte.ts` l. 35-40 et 68-75), et la partie défile
  à l'écran (`vers-la-partie.tsx`).

### Lot d — Garde et documents

- [ ] **AC-d1 — Segments de route.** **Given** `pnpm check:framework` **When** un dossier de route de
  `src/app` (hors groupes `(…)`, paramètres `[…]` et dossiers en `.`) porte un segment absent de la
  liste des segments admis, écrite dans `scripts/check-framework-invariants.mjs` **Then** le check
  échoue et nomme le fichier et le segment (HN-E11S07-7). **And** la liste porte `organization`,
  `no-organization` et `context` (route `/context` d'E11-S10), jamais `organisation` : un dossier
  `src/app/(dashboard)/admin/organisation/`
  fait échouer le check (HN-E11S07-3).
- [ ] **AC-d2 — Anciens noms.** **Given** `pnpm check:framework` **When** un fichier de `src/`,
  `packages/plateforme/` (sauf `CHANGELOG.md`), `scripts/`, `tests/` ou `next.config.ts` écrit un
  ancien nom en position d'adresse (`/api/plateforme`, `[?&](onglet|periode|equipe|…)=`,
  `version=publiee`, `#nouveautes`, `/equipes`…, et `organisation` en segment d'adresse :
  `/admin/organisation`, `/aucune-organisation`, `/no-organisation`) **Then** le check échoue avec le
  fichier, la ligne et le nouveau nom. Un chemin de module (`./admin/organisation/…`,
  `ui/identite/aucune-organisation`) et le mot des textes anglais (« an organisation ») passent. Le motif ne vise pas les mots français des commentaires hors adresse. Seuls le check,
  son test et la spec d'AC-a1, qui citent les anciens noms, en sont exclus, par chemin.
- [ ] **AC-d3 — Documents** (vérifié en revue, story technique) : README racine (table des routes
  l. 49-53) et README du paquet (l. 15, 95, 193, 205) ; entrée 1.0.1 du `CHANGELOG.md` du paquet,
  `### Hosts` : la correspondance, les dossiers à renommer, l'absence d'alias, la liste de
  redirections de Supabase Auth ; l'historique n'est pas réécrit.

## Implémentation

### Migrations prévues
Aucune : ni table ni donnée ne porte une adresse d'écran.

### Schémas Zod
Clés renommées en place, sans schéma nouveau : `equipesSearchSchema` et `EQUIPES_TABS`
(`schemas/teams.ts` l. 35-44), `equipesListesSchema` (`schemas/team-screen.ts` l. 18-23), `PARAMS` et
`journalFiltersSchema` (`schemas/journal.ts` l. 29-38, 59-70), `feedbackListQuerySchema`
(`schemas/feedback.ts` l. 70-75), `usageQuerySchema` (`schemas/usage.ts` l. 17-20),
`tableScreenParamsSchema.tri` (`schemas/table-screen.ts` l. 44), `proceduresSearchSchema`
(`schemas/procedures.ts` l. 73), `nodeVersionParamSchema` (`schemas/nodes.ts` l. 223). L'accueil ne lit plus
de paramètre (E11-S10 AC-e3). Commentaires N7 de `feedback.ts` l. 67 et `usage.ts` l. 14 corrigés.
Constante nouvelle (refacto accepté, HN-E11S07-10) : `PLATFORM_API_PREFIX = "/api/platform/"`, dans
`schemas/api.ts`, réexportée par `schemas/index.ts` ; lue par `api/handler.ts` (`PREFIX`),
`ui/api/client.ts` et les services qui écrivent une adresse d'API (lien de `read`, motif de
`parseMarkdown`, `upload.link`).

### Fichiers à déplacer, supprimer ou modifier dans l'hôte
- Déplacer (`git mv`, contenu inchangé hors adresses) : `src/app/(dashboard)/{equipes,profil,corbeille,plateforme}/`
  vers `{teams,profile,trash,platform}/` ; `admin/{organisation,connecteurs,retours}/` vers
  `admin/{organization,connectors,feedback}/` (`admin/organisation/` porte `page.tsx` et
  `loading.tsx`) ; `src/app/aucune-organisation/` vers `no-organization/` ;
  `src/app/auth/confirmer/` vers `auth/confirm/` ; `src/app/api/plateforme/` vers `api/platform/`.
- Supprimer : `src/app/(dashboard)/admin/{acces,marque,drapeaux}/page.tsx` ; la redirection de
  `next.config.ts` l. 12-17 (le bloc `redirects()` part s'il reste vide) ;
  `tests/integration/pages/e05s11-redirections-admin.test.tsx`.
- Modifier : `src/middleware.ts` l. 15 ; `src/app/(dashboard)/layout.tsx` (l. 33, 57),
  `admin/adresses.ts` (l. 13), `admin/page.tsx` (l. 5), `page.tsx`, `n/[...chemin]/page.tsx`,
  `journal/page.tsx`, `connect/page.tsx`, `admin/organization/page.tsx` (l. 21 `ICI`, l. 28 étiquette
  `admin/organization`, l. 30 `redirect`, l. 25 et 53 `saved`), `no-organization/page.tsx` (étiquette
  l. 51, 71) et les pages déplacées (chacune son `redirect("/no-organization")`) ;
  `src/app/oauth/consent/page.tsx` ; `src/lib/actions/{auth,consentement}.ts` ;
  commentaires de `src/lib/schemas/auth.ts`, `src/app/(auth)/*` (dont `layout.tsx` l. 5),
  `src/app/auth/callback/route.ts`.

### Fichiers à modifier dans le paquet, par face
- `api/` : `handler.ts` (l. 1, 115, 143, 150), `invitations.ts` l. 24, commentaires de `index.ts`,
  `public.ts`, `search.ts` et des routes d'E10.
- `ui/` : `api/client.ts` l. 51 ; `contexte/`
  (`parties-du-contexte.ts`, `contexte-servi.tsx`, commentaires d'`apercu-du-contexte.tsx`,
  `annexes-du-contexte.tsx`, `vers-la-partie.tsx`) ; `noeud/ecran-de-noeud.tsx`, `corps-du-noeud.tsx` ;
  `tableau/adresse.ts` (l. 15, 40-57, 118, 160-176, 222 : `Operation` prend les noms de H95,
  `OPERATEURS` disparaît) et `filtre-de-colonne.tsx` (l. 44-48, 69-71, 98) ; `equipes/` (valeurs
  d'onglet) ; `journal/ecran-du-journal.tsx`, `filtres-du-journal.tsx` ; `admin/usage/ecran-usage.tsx` ;
  `admin/retours/ecran-retours.tsx` ; `procedure/liste-des-procedures.tsx` ;
  `marque/formulaire-de-marque.tsx`, `ecran-marque.tsx`, `admin/organisation/ecran-organisation.tsx`.
- `schemas/` : ci-dessus.
- `server/` : `usage.ts` l. 251-254 (lit `query.period`, `query.team`) ; `connectors/resolution.ts`
  l. 271 ; lien de `read` et motif de `parseMarkdown` (E10-S02), adresse d'`upload.link` (E10-S02 lot f).
- `README.md` et `CHANGELOG.md` du paquet (AC-d3).
- `scripts/check-framework-invariants.mjs` (AC-d1, AC-d2) ; commentaire de
  `scripts/supabase-auth-settings.mjs` l. 43.

### Documents (écrits dans la même branche, sans skill : `CLAUDE.md § Modifications documentaires`)
- **Nouvel ADR** « Les adresses sont en anglais » (prochain numéro libre, ADR-020 à ce jour,
  HN-E11S07-9) : segments, paramètres, valeurs et ancres en anglais, quelle que soit la langue de
  l'écran ; préfixe `/api/platform/*` du contrat de montage ; renommage sans alias tant qu'aucun
  client n'existe ; renvoi à ADR-015 § 3.
- Amendements de texte (préfixe) : ADR-012 l. 98, ADR-016 § 5 et § 7, ADR-017 l. 32 et 78,
  ADR-018 § 1 ; `docs/architecture.md` l. 35, 91, 94, 98, 108, 306, 338 ; `CLAUDE.md` l. 219.
- `hypotheses.md` : N7 d'E08-S09 remplacée ; H03, H06, P12, NH11 (E08-S04), NH2 (E08-S05), N6
  d'E04-S01, N1, N12, N27 d'E02-S01, HN-E05S02-7, HN-E05S04-4, HN-E07S03-3 mis à jour ; fiche D11.
- Conventions : `seo-patterns.md § Règles SEO` (la redirection vaut pour une page publique indexée,
  HN-E11S07-5) ; `forms-patterns.md` l. 88 et sa fiche l. 10 ; `accessibility-patterns.md` l. 259 ;
  `component-registry.md` l. 46, 65 (`/admin/organization?saved=1`), 125, 134, 147, 160, 207, 320.

### Patterns à suivre
- `state-management.md § URL State (recommandé pour les filtres)`, `api-patterns.md § Search & Filter` :
  une valeur illisible retombe sur son défaut, jamais passée brute à une requête.
- `mcp-patterns.md § 4. Résultats de tools` : texte servi en anglais, comparé mot pour mot.

## Rayon d'impact

### Appelants
- Adresses dans le code : `rg -l -e "<motif>" C:/apps/oto-pkg/src C:/apps/oto-pkg/packages/plateforme C:/apps/oto-pkg/next.config.ts C:/apps/oto-pkg/scripts --glob '!**/*.test.*' --glob '!**/CHANGELOG.md'`,
  avec `<motif>` = `[^.a-z_]/(equipes|profil|corbeille|plateforme|aucune-organisation|auth/confirmer|admin/(organisation|connecteurs|retours|acces|marque|drapeaux))\b|/api/plateforme|[?&](onglet|periode|equipe|personne|erreurs|curseur|appels|etat|filtre|tri|sens|colonne|egal|contient|presence|version|enregistre|erreur)=|#(regles|nouveautes|contenus|contexte-)`
  → 91 fichiers, dont une majorité de commentaires qui citent `/api/plateforme/…` ; tous suivent la
  correspondance (AC-d2 les garde).
- Tests : même commande sur `C:/apps/oto-pkg/tests` → 104 fichiers (20 e2e, 64 intégration,
  19 unitaires, un utilitaire) ; doublures comprises (`rail-application.test.tsx`,
  `gestes-equipes.test.tsx` attendent les anciennes adresses de `fetch`).
- `organisation` dans une adresse : `rg -l -e "/admin/organisation" -e "/aucune-organisation" C:/apps/oto-pkg/src C:/apps/oto-pkg/packages/plateforme C:/apps/oto-pkg/next.config.ts C:/apps/oto-pkg/scripts --glob '!**/CHANGELOG.md'`
  → 16 fichiers de `src/app` : `admin/page.tsx` (l. 5), `admin/adresses.ts` (l. 13), `layout.tsx`
  (l. 33, 57), `admin/organisation/page.tsx` (l. 21, 28, 30), les deux redirections retirées
  (`admin/{marque,drapeaux}/page.tsx`), le commentaire de `(auth)/layout.tsx` l. 5, et le
  `redirect("/aucune-organisation")` de dix pages (accueil, nœud, journal, équipes, corbeille, profil, connect,
  retours, connecteurs, organisation) ; dans le paquet, `ui/index.ts` l. 8-9 et 36-37, chemins de modules,
  inchangés. Le paquet n'écrit aucune de ces deux adresses : il reçoit `ADRESSES.organisation` et
  `ici` de l'hôte (ADR-008 § 2). `rg -n "organisation" C:/apps/oto-pkg/src/middleware.ts` → rien :
  le middleware ne les nomme pas. Même commande sur `C:/apps/oto-pkg/tests` → 24 fichiers
  (7 e2e dont `aucune-organisation.spec.ts` et `admin-config.spec.ts` l. 103-104, 16 intégration,
  `tests/unit/ui-tokens.test.ts` l. 51 et 149 qui listent les dossiers d'authentification) ;
  doublures d'`ADRESSES` : `e05s11-coque.test.tsx` l. 31, `ecran-organisation.test.tsx` l. 38,
  `rail-application.test.tsx` l. 51.
- Pages qui lisent l'adresse : `rg -n "searchParams" C:/apps/oto-pkg/src/app` → accueil (plus après
  E11-S10), équipes,
  journal, nœud, consentement, `/auth/confirmer`, login (anglais) ; retours et usage par leur schéma.
- Formulaires `GET` : `rg -n "method=\"get\"" C:/apps/oto-pkg/packages/plateforme/ui` → journal,
  usage, liste des procédures, filtre de colonne ; leurs `name` suivent (AC-b3, AC-b4).
- Adresses écrites par le serveur : `rg -n -e "/admin/connecteurs" -e "/auth/confirmer" -e "/n/" -e "/connect" C:/apps/oto-pkg/packages/plateforme/server C:/apps/oto-pkg/packages/plateforme/mcp C:/apps/oto-pkg/packages/plateforme/api`
  → `api/invitations.ts` l. 24, `server/connectors/resolution.ts` l. 271 (renommés) ;
  `server/tables/write.ts` l. 255 (`/n/`) et `mcp/metadata.ts` l. 65 (`/connect`), inchangés.
- Clés françaises lues par un service : `rg -n "\.periode|\.equipe\b" C:/apps/oto-pkg/packages/plateforme/server`
  → `server/usage.ts` l. 251-254 seulement.
- Ancres : `rg -n "ancreDeLaPartie|#(regles|contexte-)" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `apercu-du-contexte.tsx` l. 68 et trois tests (`e05s11-parties-du-contexte.test.ts`,
  `noeud-page.test.tsx` l. 293, `procedure-et-contexte.spec.ts` l. 191).
- Routes d'E10 : `rg -n "api/plateforme" C:/apps/oto-pkg/docs/stories/E10-*.md` → S01 (l. 148, 210,
  244), S02 (l. 115-730). Leurs paramètres (`path`, `disposition=inline`, `view`) sont déjà en
  anglais. La page de `form_url` (E10-S02 AC-f15)
  n'a pas encore de route nommée : AC-d1 l'oblige en anglais.

### Doublons
- Registry, entrée `reglagesDepuisLAdresse, adresseDesReglages` : seul propriétaire de l'adresse de
  la grille. Verdict : modifier en place.
- `rg -n "hrefDOnglet" C:/apps/oto-pkg/src` → deux fonctions de page (accueil, équipes) aux
  paramètres différents ; celle de l'accueil part avec E11-S10. Verdict : laisser.
- Préfixe d'API : `rg -n "/api/plateforme/" C:/apps/oto-pkg/packages/plateforme --glob '!**/*.test.*'`
  → `PREFIX` (`api/handler.ts` l. 115) et un littéral (`ui/api/client.ts` l. 51), plus les adresses
  que construisent les services d'E10. Verdict : fusionner dans une constante (refacto accepté
  ci-dessous).

### Effet produit
- **Hôte** : dossiers de routes à renommer ; un hôte qui garde `src/app/api/plateforme` voit toutes
  les mutations des écrans en 404. Montage à jour dans le README, `### Hosts` du CHANGELOG.
- **oto-saas** (hôte dérivé, hors de ce dépôt) : même renommage, relu à la main (D131).
- **Supabase Auth** : les motifs de retour autorisés (`uri_allow_list`) qui nomment
  `/auth/confirmer` ne couvrent plus `/auth/confirm` : action réservée ci-dessous.
- **E-mails transactionnels** : une invitation déjà envoyée mène à `/auth/confirmer`, en 404.
- **MCP** : un texte de refus change (AC-a4) ; outils et schémas inchangés ; `read` sert des liens
  de fichier au nouveau préfixe. Un lien déjà rendu dans une conversation ne répond plus.
- **Middleware** : `PUBLIC_ROUTES` ; `/p/` (partage public) inchangé. **SEO** : toutes les pages
  renommées sont authentifiées et `noindex` ; aucun référencement perdu.
- **Contenu** : un lien écrit à la main dans une page vers une ancienne adresse casse (données).
- **Textes MCP** : aucun texte servi ne change pour `organization` ; l'adresse
  `/admin/organization` côtoie le mot « organisation » des descriptions d'outils (HN-E11S07-3).

### Refacto
- **Proposé, accepté le 2026-09-29 (HN-E11S07-10)** : une constante du préfixe dans `schemas/`
  (face commune), `PLATFORM_API_PREFIX`, lue par `api/handler.ts`, `ui/api/client.ts` et les services
  qui écrivent une adresse d'API (AC-a3). Coût : un export et quatre à six lectures. Sans elle :
  chaque littéral se renomme à la main, et seule la garde AC-d2 rattrape un oubli.
- Écartés : renommer les identifiants de code ; retirer `/platform` ; retirer les écrans de M65 ;
  rendre configurables les deux adresses d'écran que le paquet écrit (surface sans besoin présent).

## Hypothèses

- **HN-E11S07-1** : une adresse est ce qui s'écrit dans la barre d'adresse ou dans un lien ; un `id`
  qu'aucun lien ne vise, un identifiant de code et un nom de dossier entre crochets n'en sont pas
  (source : consigne D132 ; simple).
- **HN-E11S07-2 — validée (2026-09-29)** : `/journal` reste : « journal » est un mot anglais, et
  c'est déjà le chemin MCP `journal` (P22, `JOURNAL_PATH`) et la table `platform.journal`. Option
  écartée : `/log`.
- **HN-E11S07-3 — tranchée (2026-09-29), alternative retenue** : les adresses suivent l'orthographe
  américaine, `organization` : `/admin/organisation` devient `/admin/organization`,
  `/aucune-organisation` devient `/no-organization`, et toute adresse, paramètre ou ancre future
  qui nommerait l'organisation s'écrit `organization` (garde AC-d1, AC-d2). Seules les **adresses**
  passent en américain : les textes servis en anglais par le paquet gardent l'orthographe
  britannique actuelle (`organisation` : 0 occurrence d'« organization » dans `server/` et `mcp/`,
  ex. `mcp/admin/inputs.ts` l. 72, `mcp/admin/tools.ts` l. 46-50), hors périmètre. L'écart entre
  l'adresse `/admin/organization` et le texte « an organisation » est une incohérence assumée
  (source : décision du responsable d'Oto, 2026-09-29). Option écartée : britannique, `/admin/organisation`
  gardée.
- **HN-E11S07-4** : un nom nouveau reprend celui que l'API ou le service donne déjà à la même chose
  (`trash`, `feedback`, `connectors`, `profile`, `teams`, `sort` de H96, opérateurs de H95) ; `sens`
  devient `order` (source : `api/handler.ts` l. 73-98, H05, H95, H96).
- **HN-E11S07-5** : les anciennes adresses répondent 404 ; les trois pages de redirection et la
  redirection de `next.config.ts` partent. `seo-patterns.md § Règles SEO` (« URL renommée ou
  supprimée → redirection ») ne vaut que pour une page publique indexée, ce qu'aucune de ces pages
  n'est : la règle se précise en ce sens (source : décision 1, D131).
- **HN-E11S07-6** : un ancien nom de paramètre est ignoré comme tout paramètre inconnu, sans refus
  (source : `state-management.md § URL State`, comportement actuel des schémas).
- **HN-E11S07-7** : la garde des routes est une liste de segments admis (un segment nouveau s'ajoute
  à la liste, visible en revue) ; celle des paramètres, une liste d'anciens noms refusés
  (source : `CLAUDE.md § Après une erreur`, règle détectable par `pnpm verify`).
- **HN-E11S07-8** : `/plateforme` (`PlateformeHome`, version du paquet) se renomme `/platform` ; son
  retrait serait une décision produit, hors de cette story (source : simple).
- **HN-E11S07-9** : un nouvel ADR plutôt qu'un amendement d'ADR-015, dont le statut est « Proposé »
  pour la version qui traduira les écrans ; la règle vaut dès 1.0.1 (source : ADR-015 Meta).
- **HN-E11S07-10 — validée (2026-09-29), refacto accepté** : constante unique du préfixe d'API,
  `PLATFORM_API_PREFIX` dans `schemas/api.ts` (fichier nouveau : `schemas/index.ts` n'est qu'un
  barillet de réexports ; nom et fichier tranchés seuls, choix technique mineur). Option écartée :
  renommer les littéraux en place.
- **HN-E11S07-11** : `recent-content` pour le bloc servi `recent content`, `end` non retenu (`fin`
  n'est qu'un préfixe d'`id`, hors périmètre) ; aucune ancre pour le bloc `code`, que la vue et
  l'encart n'affichent plus (E11-S10 AC-f4, AC-g2).

## Actions JB

Gestes réservés au responsable d'Oto :
1. Projet Supabase de test : relire les adresses de retour autorisées ; un motif qui nomme
  `/auth/confirmer` reçoit son jumeau `/auth/confirm`
  (`pnpm auth:settings --to <ref> --site-url <url> --redirect <motif> --apply`, qui ajoute sans
  retirer), puis retirer l'ancien à la main.
2. oto-saas : renommer ses dossiers de routes et son middleware en prenant 1.0.1 (PR Renovate relue
  à la main, D131).
3. Renvoyer les invitations en attente de Démo, dont le lien vise `/auth/confirmer`.

## Tests attendus

### Unit tests
- [ ] `tests/unit/check-framework.test.ts` : un dossier `src/app/(dashboard)/equipes/page.tsx` ou
  `admin/organisation/page.tsx` dans le dépôt jetable fait échouer AC-d1 ; `fetch("/api/plateforme/x")`,
  `?onglet=` et `redirect("/admin/organisation")` font échouer AC-d2 ; un commentaire « la corbeille »,
  un import `./admin/organisation/ecran-organisation` et le texte « an organisation » passent.
- [ ] `tests/unit/ui-tokens.test.ts` : liste des dossiers d'authentification sur `no-organization`
  et `auth/confirm` (l. 51, 149).
- [ ] Schémas (tests existants mis à jour) : `tests/unit/schemas/journal.test.ts`, `e05s13-equipes.test.ts`,
  `usage-and-feedback.test.ts` lisent les noms anglais et ignorent les anciens (AC-b2, AC-b3).
- [ ] `ui-tableau-adresse.test.ts` : aller-retour de `adresseDesReglages` et de
  `reglagesDepuisLAdresse` aux nouveaux noms ; clause ancienne écartée (AC-b4).
- [ ] `e05s11-parties-du-contexte.test.ts` : ancres de la correspondance (AC-c1).
- [ ] `api-handler.test.ts` : `/api/plateforme/…` → 404 `not_found` (AC-a3) ; `middleware.test.ts` :
  `/auth/confirm` public ; `next-config.test.ts` : plus de redirection ;
  `connectors-resolution.test.ts` et `calls.test.ts` : texte d'AC-a4 mot pour mot.

### Integration tests
- [ ] `rail-application.test.tsx`, `gestes-equipes.test.tsx` : liens et `fetch` sur les nouvelles
  adresses (AC-a2, AC-a3).
- [ ] Pages : équipes, journal, retours, organisation (`/admin/organization`,
  `saved`, `/admin` qui y mène, `admin-config-pages.test.tsx`), `NEXT_REDIRECT:/no-organization` des
  pages qui le testent, consentement
  (`error`), nœud (`version=published`, liens des couches vers `/context#<ancre>`) (AC-b2 à AC-b6,
  AC-c1).
- [ ] MCP : liste des outils toujours de six (`mcp-tools.test.ts`, inchangé).

### E2E tests
- [ ] Suites existantes réécrites sur les nouvelles adresses, vertes.
- [ ] `tests/e2e/e11s07-adresses.spec.ts` : chaque nouvelle route répond, chaque ancienne répond 404
  (AC-a1).

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
