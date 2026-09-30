# Story E11-S21 — L'image de partage d'une adresse : aperçu Open Graph aux couleurs de l'organisation

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | Partage public d'un contenu (E05-S10 partie d, ADR-013) ; tout lien de l'hôte collé dans une messagerie (Slack, WhatsApp, LinkedIn, mail) |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : aucune capture ; l'image est décrite ici (1200 × 630, fond clair `--base` du thème, filet et anneau à la couleur `--primary`, logo ou initiale, nom de l'organisation, titre teinté comme `--title`, résumé en `--mute`) |
| **Conventions** | coding-standards, seo, nextjs, api, security, auth, a11y, portage, registry, testing, performance, state |
| **Estimation** | M |
| **Version** | 1.1.5 |
| **Dépend de** | E05-S10 (✅, page publique `/p/<jeton>`, `readPublicNode`), E09-S01 (✅, marque de l'organisation), E10-S02 (✅, `fetchSource`) |
| **Porteuse de migration** | Non |

## Contexte

Demande de JB (2026-09-30) : un lien de l'hôte collé dans une messagerie montre une image d'aperçu autogénérée, jolie
par défaut, selon la page, aux couleurs et au nom de l'organisation. Aujourd'hui aucune métadonnée Open Graph n'est
servie : `rg -n -i "opengraph|og:image|ImageResponse|twitter" C:/apps/oto-pkg/src C:/apps/oto-pkg/packages` ne trouve
rien ; le layout racine ne pose ni `metadataBase` ni `openGraph` ; `/p/<jeton>` pose un titre et une description.

État constaté :
- Un robot d'aperçu n'a pas de session : le middleware de l'hôte renvoie toute adresse privée (`/n/<chemin>`, `/`,
  écrans) à `/login` ; seules `/p/*` et les routes publiques sont servies sans session (`src/middleware.ts`).
- `/p/[jeton]/[[...chemin]]` est un attrape-tout optionnel : la convention de fichier `opengraph-image` ne peut pas s'y
  poser (Next monterait `…/[[...chemin]]/opengraph-image`, un attrape-tout qui n'est pas en fin d'adresse), et posée à
  `/p/[jeton]/` elle ne reçoit pas `chemin` (l'image d'un contenu dessous serait celle du contenu partagé).
- La lecture sans session d'un lien est `readPublicNode` (`server/shares.ts`) ; la marque de l'adresse, `resolveOrg`
  sous `anon` puis `readBrand` (`src/lib/plateforme/marque-de-l-adresse.ts`).
- Satori (`next/og`) ne lit ni classe ni variable CSS : les couleurs se donnent en valeurs.

**Refs :**
- ADR-013 (partage public : ce qu'un lien donne, § 3 ; jamais indexé, § 5 ; l'hôte monte la route, § 6) ; ADR-012
  (portabilité : `src/` = montage) ; ADR-020 (adresses en anglais) ; ADR-008 § 3 (tokens d'`oto.css`).
- Architecture : § 5 « Services et portes », § 7 « Installation et exploitation d'un hôte ».

## Périmètre

Le dessin de l'image (`ui/`), la lecture de ses données sans session (`server/`), leur type (`schemas/`), les
métadonnées de partage (`ui/`), et le montage de l'hôte : l'image générique (convention `opengraph-image.tsx` à la
racine), l'image d'un lien public (route `/p/<jeton>/share-image/[[...chemin]]`), les métadonnées du layout racine et de
la page publique, `/opengraph-image` laissé passer par le middleware.

## Hors périmètre

- Police Inter embarquée : aucun fichier de police n'est installé localement ; la police par défaut de `ImageResponse`
  (Noto Sans, latin, accents compris) sert (HN-E11S21-5). Ajouter un `.ttf` : story à part, si le rendu déçoit.
- Image propre à un écran privé (`/n/<chemin>`) pour une personne connectée : jamais (HN-E11S21-2).
- Nuit : l'image est claire (un aperçu de messagerie ne connaît pas le mode de la personne).

## Critères d'acceptation

- [ ] **AC-1** — **Given** les données d'une image (organisation, thème, logo, page) **When** `ImageDePartage` les
  dessine **Then** l'arbre rend le titre de la page, son résumé coupé au mot (« … »), le nom de l'organisation, la
  couleur `--primary` du thème, le logo s'il existe sinon l'initiale du nom ; sans page, le nom de l'organisation en
  grand ; sans organisation, « Oto » et la marque d'Oto, au thème Manuscrit ; 1200 × 630.
- [ ] **AC-2** — **Given** les huit thèmes **Then** la table de couleurs de l'image égale `--primary`, `--primary-on` et
  `--base` de chaque bloc `.oto[data-oto-theme]` d'`ui/styles/oto.css` (un test la confronte au fichier).
- [ ] **AC-3** — **Given** un lien public actif **When** `shareImageData(host, { token, path })` **Then** il rend le titre
  et le résumé que `readPublicNode` sert pour ce jeton et ce chemin, l'organisation de l'adresse et son thème, et le logo
  lu par `fetchSource` en `data:` (PNG ou JPEG, 1 Mo au plus) ; un logo illisible, trop lourd ou d'un autre type : `null`.
- [ ] **AC-4** — **Given** un jeton inconnu, révoqué ou hors de portée (`not_found`) ou une lecture en panne **When**
  `shareImageData` **Then** `page: null` (image générique de l'organisation), jamais une erreur ; une panne est
  journalisée (`[platform] share image:`). **Given** une adresse sans organisation (`unknown_org`) **Then**
  `org: null` (image « Oto »).
- [ ] **AC-5** — **Given** `shareImageData(host)` sans lien **Then** aucune lecture de nœud (`readPublicNode` non
  appelé) : l'image générique ne porte que l'organisation.
- [ ] **AC-6** — **Given** `/p/<jeton>[/<chemin>]` servi **When** ses métadonnées se composent **Then** `og:title` = titre,
  `og:description` = résumé coupé (sinon « Partagé par <organisation>. »), `og:url` = `/p/<jeton>[/<chemin>]`,
  `og:site_name` = nom de l'organisation, `og:type` = `article`, `og:image` =
  `/p/<jeton>/share-image[/<chemin>]?v=<révision>` avec `width` 1200, `height` 630 et `alt`, `twitter:card` =
  `summary_large_image` ; toujours `noindex`. Un lien introuvable ou en panne garde ses métadonnées d'aujourd'hui (le
  générique du layout racine s'applique).
- [ ] **AC-7** — **Given** toute page **When** le layout racine compose ses métadonnées **Then** `metadataBase` = l'origine
  de la requête (lue par `webUrl`), `og:site_name` et `og:title` = nom de l'organisation (« Oto » sans organisation),
  `og:url` = `/`, `twitter:card` = `summary_large_image`, `og:image` = l'image générique (`/opengraph-image`) ; le titre
  d'onglet garde son gabarit (`%s | Oto`).
- [ ] **AC-8** — **Given** `/n/<chemin>` d'une page privée **Then** ses métadonnées ne posent ni `openGraph` ni `twitter`
  (le titre privé ne sort que dans `<title>`, pour la personne connectée) ; sans session, le middleware renvoie à
  `/login` avant toute lecture ; l'image générique ne lit aucun nœud (AC-5).
- [ ] **AC-9** — **Given** un robot sans session **When** il demande `/opengraph-image` **Then** le middleware la laisse
  passer (aucune redirection vers `/login`).
- [ ] **AC-10** — **Given** les routes d'image **When** elles répondent **Then** 200 `image/png` ; l'image d'un lien public
  en `Cache-Control: private, max-age=300` (aucun cache partagé : une révocation vaut aussitôt), l'image générique en
  `public, max-age=3600`.

## Implémentation

### Migrations prévues
Aucune : lectures existantes (`org_by_host`, `public_node_by_token`).

### Schémas Zod
Aucun schéma : un type partagé `ShareImageData` (`schemas/share-image.ts`), rendu par `server/`, dessiné par `ui/`.

### Fichiers à créer, par face
- `schemas/` : `packages/plateforme/schemas/share-image.ts` (`ShareImageData`).
- `server/` : `packages/plateforme/server/share-image.ts` (`shareImageData`, `logoDataUrl`).
- `ui/` : `packages/plateforme/ui/public/image-de-partage.tsx` (`ImageDePartage`, `TAILLE_DE_PARTAGE`,
  `metadonneesDePartage` ; `COULEURS_DE_L_IMAGE` exporté par le module seul, pour son test).
- Hôte : `src/app/opengraph-image.tsx`, `src/app/p/[jeton]/share-image/[[...chemin]]/route.tsx`.
- Tests : `tests/unit/share-image.test.ts`, `tests/integration/components/image-de-partage.test.tsx`.

### Fichiers à modifier, par face
- `schemas/index.ts`, `server/index.ts`, `ui/index.ts` (exports).
- Hôte : `src/app/layout.tsx` (`generateMetadata`), `src/app/p/[jeton]/[[...chemin]]/page.tsx` (métadonnées de
  partage), `src/lib/plateforme/marque-de-l-adresse.ts` (`cache` par requête), `src/middleware.ts` (`/opengraph-image`).
- Outillage : `scripts/check-framework-invariants.mjs` (`share-image` dans `SEGMENTS_ADMIS`, ADR-020 § 4).
- Tests : `tests/integration/pages/e05s10d-page-publique.test.tsx` (métadonnées du lien), `tests/unit/middleware.test.ts`
  (AC-9), `tests/integration/pages/ecrans-d-authentification.test.tsx` (titre du layout racine lu par `generateMetadata`).
- Documents : `docs/architecture.md`, `docs/decisions/hypotheses.md`, `.method/conventions/component-registry.md`,
  `packages/plateforme/CHANGELOG.md` (1.1.5), `packages/plateforme/README.md` (montage de l'aperçu),
  `docs/changelog.md`, `.method/sprint/status.md`.

### Patterns à suivre
- `security-patterns.md § XSS Prevention` : l'origine de `metadataBase` passe par `webUrl`.
- `security-patterns.md § Droits dans le service` : ce que l'image d'un lien montre est ce que `readPublicNode` décide.
- `seo-patterns.md § Metadata API` : les défauts (`metadataBase`, `openGraph`) au layout racine.
- `portage-ecrans.md § 3` : les valeurs de couleur viennent d'`oto.css`, jamais recalculées (table confrontée au fichier).

## Rayon d'impact

### Appelants
- `marqueDeLAdresse` (enveloppé de `cache`) — `rg -n "marqueDeLAdresse" C:/apps/oto-pkg/src C:/apps/oto-pkg/tests C:/apps/oto-pkg/packages`
  → `src/app/(auth)/{login,forgot-password,reset-password}/page.tsx`, `src/app/auth/confirm/page.tsx`,
  `src/app/p/[jeton]/[[...chemin]]/{page,not-found}.tsx` ; deux appelants de plus (layout racine, métadonnées de `/p/`).
  Même signature ; dans une requête, une seule lecture pour tous. Doublures : `ecrans-d-authentification`,
  `e10s02-visionneuse-pages`, `e05s10d-page-publique`, `auth-callback` la simulent (inchangé) ;
  `marque-de-l-adresse.test.ts` l'appelle hors requête (`cache` n'y garde rien : inchangé).
- `readPublicNode` — `rg -n "readPublicNode\(" C:/apps/oto-pkg/src C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests -l`
  → `src/app/p/.../page.tsx`, `api/public.ts`, `server/shares.ts`, tests `e05s10e-partage-public`, `retraits-v1` ; un
  appelant de plus (`shareImageData`), service inchangé.
- `fetchSource` — `rg -n "fetchSource\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` → `server/catalog/upload-link.ts`,
  ses tests ; un appelant de plus (le logo), service inchangé (délai passé en `timeoutMs`).
- Métadonnées du layout racine (`metadata` → `generateMetadata`) — `rg -n "app/layout\"" C:/apps/oto-pkg/tests` →
  `ecrans-d-authentification.test.tsx` (lit `metadata.title` : passe à `generateMetadata`, sa simulation de
  `@/lib/plateforme/session` reçoit `getRequestOrigin`), `favicon-du-theme.test.tsx` (rend `RootLayout` : inchangé).
- `generateMetadata` de `/p/` — `rg -n "generateMetadata" C:/apps/oto-pkg/tests -l` → `e05s10d-page-publique` (le cas
  servi compare l'objet entier : il reçoit `openGraph` et `twitter`), `noeud-page`, `e05s10c-requetes-de-la-page`
  (`/n/`, inchangés : ils prouvent AC-8 par `toEqual({ title, robots })`).
- `PUBLIC_ROUTES` — `rg -n "PUBLIC_ROUTES" C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` → `src/middleware.ts` seul.

### Doublons
- Registry et concept (image, Open Graph, table de couleurs de thème) :
  `rg -n -i "open ?graph|opengraph|og:image|ImageResponse|twitter|partage.*image|image.*partage" C:/apps/oto-pkg/src C:/apps/oto-pkg/packages C:/apps/oto-pkg/.method/conventions/component-registry.md --glob "!**/CHANGELOG.md"`
  → rien. `rg -n -i "theme.*couleur|couleurs? des? th|--primary" C:/apps/oto-pkg/packages/plateforme/ui --glob "*.ts*" -l`
  → `FaviconDuTheme` (lit les jetons dans le style calculé du navigateur : impossible hors navigateur, verdict laisser),
  `ecran-d-authentification.tsx`, `ds/react/rail.tsx` (classes, pas de valeurs : laisser).
- `LogoDOrganisation` (logo ou initiale) : classes Tailwind, `<img>` d'une adresse distante ; Satori ne lit pas les
  classes et l'image doit être en `data:` : verdict laisser, l'initiale se redessine en style en ligne.
- Téléchargement d'une adresse choisie : `fetchSource` (`server/uploads-fetch.ts`, https, port 443, adresses privées
  refusées, 1 Mo, redirections bornées) : **réutilisé** pour le logo.
- Coupe d'un texte : `cutAtWord` (`schemas/nodes.ts`) coupe un slug au `_` ; aucune coupe au mot avec « … » pour un
  texte : `rg -n -i "function \w*(coup|tronq|abreg|court|trunc|ellips)\w*" C:/apps/oto-pkg/packages/plateforme` →
  `extraitCourt` (palette, interne), `NomCoupe` (CSS) : laisser ; une fonction interne à l'image.

### Effet produit
- Toute page de l'hôte : le layout racine lit la marque de l'adresse (une lecture `anon` bornée à 1 s, partagée par la
  requête) et l'origine ; toute page devient dynamique (elle l'était déjà, sauf `/design-system` et le 404 racine).
- Middleware : `/opengraph-image` public (une image sans donnée privée).
- Page publique : métadonnées enrichies ; une route de plus sous `/p/<jeton>` (`share-image`), qu'aucun chemin de nœud
  ne peut porter (le tiret est hors de `NODE_PATH_PATTERN`).
- Liste d'outils MCP, schéma `platform`, RLS : inchangés. Journal : aucune ligne (lectures anonymes).
- Un ERP hôte : deux fichiers à monter, deux métadonnées à composer, une route publique (CHANGELOG `Install:`).

### Refacto
- Écarté : lire la marque une seule fois pour le layout du groupe `(dashboard)` et le layout racine (l'identité rend
  déjà la marque) ; `cache` sur `marqueDeLAdresse` suffit aux pages publiques, et le layout `(dashboard)` garde sa
  lecture par l'identité. Sans lui : une lecture `anon` de plus par page connectée, bornée.

## Hypothèses

- **HN-E11S21-1 (AC-6, route).** L'image d'un lien public est une route de l'hôte, `/p/[jeton]/share-image/[[...chemin]]`,
  et non la convention `opengraph-image` : sous l'attrape-tout optionnel `[[...chemin]]`, Next ne peut monter la
  convention, et posée à `/p/[jeton]/` elle ignore le chemin d'un contenu dessous. L'image générique garde la convention
  (`src/app/opengraph-image.tsx`), comme demandé. Segment en anglais (ADR-020), hors de `NODE_PATH_PATTERN` (tiret).
- **HN-E11S21-2 (AC-8).** Un robot d'aperçu n'est pas la personne : toute adresse autre qu'un lien public ne montre que
  l'organisation (nom, couleur, logo), jamais le titre ni le contenu d'une page privée, même pour une personne
  connectée qui colle son lien ; `/n/<chemin>` ne pose aucune métadonnée de partage.
- **HN-E11S21-3 (AC-10, cache).** Clé de cache par révision : l'adresse de l'image d'un lien porte `?v=<révision>` du
  contenu servi ; un titre ou un résumé publié change la révision, donc l'adresse, et les messageries relisent. La
  réponse est en `private, max-age=300` (aucun cache partagé, comme toute réponse publique d'ADR-013 : une révocation
  vaut aussitôt côté serveur). L'image générique, sans contenu, en `public, max-age=3600` (une marque changée se voit
  dans l'heure).
- **HN-E11S21-4 (AC-3, logo).** Le logo se lit côté serveur par `fetchSource` (https, 443, adresses privées refusées,
  1 Mo, 3 redirections), en 3 s au plus, et entre dans l'image en `data:` : PNG ou JPEG seulement (Satori ne décode ni
  WebP ni AVIF, et un SVG mal formé casserait l'image après l'envoi du statut 200) ; sinon l'initiale. Une lecture
  réseau de plus par image, bornée.
- **HN-E11S21-5 (police).** Aucune police Inter n'est disponible en fichier local (seule la police de `next/font`,
  compilée) : l'image utilise la police par défaut de `ImageResponse`, Noto Sans (latin, accents français), sans appel
  réseau. Graisse unique : le titre se distingue par sa taille et sa teinte.
- **HN-E11S21-6 (paquet et `next/og`).** Le paquet ne dépend pas de `next/og` : il rend l'arbre JSX (`ImageDePartage`) et
  les données (`shareImageData`) ; l'hôte appelle `new ImageResponse(…)` (trois lignes par route). Un paquet qui
  importerait `next/og` chargerait le moteur d'image (WASM) dans chaque face qui l'importe.
- **HN-E11S21-7 (AC-6, AC-7, textes).** `og:description` générique : « Les pages, procédures et tableaux de
  <organisation>. » ; d'un lien sans résumé : « Partagé par <organisation>. » ; titre coupé à 90 caractères, résumé à
  160 dans l'image, 200 dans `og:description`, au dernier mot entier, suivis de « … ». `og:url` générique : `/`
  (l'adresse demandée n'est pas connue du layout).
- **HN-E11S21-8 (AC-7, coût).** Le layout racine compose ses métadonnées à chaque page (lecture `anon` bornée de la
  marque, partagée avec la page par `cache`) ; Next 15 diffuse les métadonnées après le premier octet pour un
  navigateur, seul un robot les attend.
- **HN-E11S21-9 (ADR-013).** L'image d'un lien ne porte que ce que le lien donne déjà (titre, résumé, organisation) :
  aucun ajout à ADR-013 § 3 ; § 6 (« l'hôte monte une route de plus ») devient deux routes, écrit dans l'architecture.

## Actions JB

- Partager dans Slack et WhatsApp (et, si possible, LinkedIn) un lien public `/p/<jeton>` et un lien interne `/n/<chemin>`
  de la 1.1.5 déployée : le premier montre le titre et le résumé de la page, le second l'image de l'organisation seule.

## Tests attendus

### Unit tests
- [ ] `tests/unit/share-image.test.ts` : lien actif → titre, résumé, organisation, logo en `data:` (AC-3) ; jeton inconnu
  et panne → `page: null`, panne journalisée (AC-4) ; adresse sans organisation → `org: null` (AC-4) ; sans lien, aucun
  `readPublicNode` (AC-5) ; logo d'un autre type ou en échec → `null` (AC-3).
- [ ] `tests/unit/middleware.test.ts` : `/opengraph-image` sans session passe (AC-9).

### Integration tests (composants et pages)
- [ ] `tests/integration/components/image-de-partage.test.tsx` : titre, résumé coupé, organisation, couleur, initiale et
  logo, générique, « Oto » (AC-1) ; table confrontée à `oto.css` (AC-2) ; métadonnées générique et d'un lien (AC-6,
  AC-7) ; rendu PNG réel par `ImageResponse` : 200, `image/png` (AC-10).
- [ ] `tests/integration/pages/e05s10d-page-publique.test.tsx` : métadonnées d'un lien servi (AC-6).
- [ ] `tests/integration/pages/noeud-page.test.tsx` (inchangé) : `/n/` sans `openGraph` (AC-8).

### Build
- [ ] `pnpm build` : les deux routes d'image se construisent (convention racine, route sous l'attrape-tout).

## Post-implémentation

- **Livré** : AC-1 à AC-10. Tests isolés (`PLATFORM_TEST_DB=local pnpm vitest run <fichiers>`) : `share-image` 7/7,
  `image-de-partage` 8/8 (PNG réel rendu par `ImageResponse` sous Node, couleur lue dans les pixels), puis
  `middleware`, `e05s10d-page-publique`, `ecrans-d-authentification`, `marque-de-l-adresse`, `noeud-page`,
  `favicon-du-theme`, `e10s02-visionneuse-pages` : 96/96 ; tests de structure (`ui-tokens`, `frontiere-client-serveur`,
  `import-cycles`, `package-faces`, `package-publish`…) 78/78, `check-framework` 33/33. `pnpm build` vert (routes
  `/opengraph-image` et `/p/[jeton]/share-image/[[...chemin]]`) ; `next start` : `/login` sert `og:*` et
  `twitter:card`, `metadataBase` suit `x-forwarded-host`, `/opengraph-image` 200 `image/png` sans session,
  `/n/<chemin>` redirigé vers `/login`. Aperçus contrôlés à l'œil (cinq cas : page, titre long, générique, logo, « Oto »).
- **Écart avec la demande** : l'image d'un lien public est une route et non la convention `opengraph-image`
  (HN-E11S21-1) ; police par défaut d'`ImageResponse`, Inter absente en fichier (HN-E11S21-5).
- **Garde écrite** : `portage-ecrans.md § 3` (et sa fiche) : hors navigateur, une couleur du jeu se lit dans une table
  confrontée à `oto.css` par un test, un jeton dérivé tiré de sa formule `color-mix`.
- **Option d'un cran plus simple écartée** : poser `opengraph-image.tsx` à `/p/[jeton]/` (aucune route dédiée) ; elle
  ignore le chemin, et un contenu dessous montrerait le titre du contenu partagé.
- **Reste** : aperçu réel dans Slack et WhatsApp (actions de JB) ; un hôte monte les fichiers de la ligne `Install:`.
