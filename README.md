# oto-pkg — `@otomata_tech/oto_platform`

La plateforme MCP d'entreprise, en paquet npm : écrans, API, serveur MCP à six outils figés,
services et migrations du schéma Postgres `platform`. Elle s'installe dans une application Next
(App Router) adossée à Supabase, qui monte ses routes. Le paquet est publié en sources TypeScript,
sans étape de build, sous licence MIT.

Ce dépôt porte :

- **le paquet**, dans `packages/plateforme/` : publié sur npm sous `@otomata_tech/oto_platform`, en sources TypeScript ;
  son mode d'emploi complet est [`packages/plateforme/README.md`](packages/plateforme/README.md), ses
  versions [`packages/plateforme/CHANGELOG.md`](packages/plateforme/CHANGELOG.md) ;
- **l'application de base**, à la racine (`src/`) : l'hôte de référence qui monte le paquet et le teste ;
  ses routes sont celles qu'un hôte recopie (« Routes à monter » ci-dessous) ;
- les tests (`tests/`), l'outillage de tout hôte (`scripts/`), la méthode (`CLAUDE.md`, `.method/`,
  `.claude/`) et les documents du paquet (`docs/`).

Documents qui font foi : [`docs/architecture.md`](docs/architecture.md), [`docs/decisions/`](docs/decisions/),
[`docs/prd.md`](docs/prd.md), [`docs/mcp-golden-queries.md`](docs/mcp-golden-queries.md), et pour les
utilisateurs [`docs/pilote/guide-installation.md`](docs/pilote/guide-installation.md).

## Installer le paquet

### 2.1 Dépendance

1. `pnpm add @otomata_tech/oto_platform@<version exacte>` ; installer aussi ses dépendances pairs
   (`peerDependencies` du `package.json` du paquet : `next` 15, `react` et `react-dom` 19,
   `@supabase/supabase-js` 2, `@phosphor-icons/react` 2, `zod` 3.25 au moins, `react-hook-form`
   7.55 au moins, `@hookform/resolvers` 5). `@supabase/supabase-js` reste exigé même en mode OIDC.
   Le mode OIDC de l'hôte ajoute `oauth4webapi` 3.8.8, en version exacte.
2. pnpm 12 : exclure le paquet de `minimumReleaseAge` dans `pnpm-workspace.yaml`
   (README du paquet, « Installer dans une application », point 2).
3. `next.config.ts` : `transpilePackages: ["@otomata_tech/oto_platform"]` (le paquet est publié en
   sources TypeScript).
4. `src/app/globals.css`, après `@import "tailwindcss";` :
   `@source "../../node_modules/@otomata_tech/oto_platform/ui";` puis
   `@import "@otomata_tech/oto_platform/ui/styles.css";`.

**Vérifier** : `pnpm build` passe sans aucune variable d'environnement (§ 4.3, étape 14).

### 2.2 Routes à monter

À recopier de l'hôte de référence (`src/app/`), puis à adapter au routeur de l'application :

| Route | Fichier de référence | Rôle | Mode |
|---|---|---|---|
| `/api/mcp` | `src/app/api/mcp/route.ts` | MCP des organisations (`handleMcpPost`, `makeVerifyToken()`) | les deux |
| `/api/mcp-admin` | `src/app/api/mcp-admin/route.ts` | MCP de l'équipe plateforme (`handleAdminMcp`) | les deux |
| `/api/platform/*` | `src/app/api/platform/[...route]/route.ts` | API des écrans (`handlePlateforme`), jeton lu dans la session de l'hôte | les deux |
| `/.well-known/oauth-protected-resource/*` | `src/app/.well-known/oauth-protected-resource/[[...chemin]]/route.ts` | Métadonnées de ressource protégée (racine et forme suffixée) | les deux |
| `/auth/oidc/login`, `/callback`, `/logout` | `src/app/auth/oidc/*/route.ts` | Connexion chez l'émetteur, rappel, déconnexion (`POST`) | OIDC (404 sinon) |
| `/login`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/auth/confirm`, `/oauth/consent` | `src/app/(auth)/…`, `src/app/auth/…`, `src/app/oauth/consent/` | Écrans de Supabase Auth ; `/login` renvoie à `/auth/oidc/login` en mode OIDC | Supabase (404 en OIDC, § 4.3) |
| `/no-organization` | `src/app/no-organization/page.tsx` | Personne connectée sans appartenance | les deux |
| `/p/<jeton>` | page publique de l'hôte de référence | Lien de partage public, hors session, `noindex, nofollow` (ADR-013) | les deux |
| écrans | `src/app/(dashboard)/…` | Coque, rail, pages ; `CoquilleOto` au thème de l'organisation | les deux |

Chaque route qui monte une porte du paquet importe d'abord `@/lib/fonctions-metier`
(`src/lib/fonctions-metier.ts`, `registerFunctions`) : une route qui l'oublie sert un catalogue sans
les fonctions métier de l'ERP (README du paquet, « Fonctions métier »).

Modules de l'hôte que ces routes lisent : `src/lib/plateforme/session.ts` (session dans les deux
modes), `src/lib/plateforme/oidc-client.ts` et `oidc-session.ts` (mode OIDC : découverte, cookie
chiffré `__Host-plateforme-session`, rafraîchissement), `src/lib/schemas/auth.ts` (`loginPath`,
`safeRedirect`), `src/lib/actions/auth.ts` (déconnexion).

### 2.3 Middleware

`src/middleware.ts` : en mode OIDC, la session est le cookie chiffré de l'hôte, rafraîchi une
minute avant l'expiration du jeton d'accès ; en mode Supabase, la session
`@supabase/ssr`. Routes publiques : `/login`, `/auth/oidc`, `/api`, `/.well-known`, `/p` et les pages
d'authentification de Supabase. Une page sans session renvoie à `/auth/oidc/login?redirect=<page>`.

### 2.4 Thème et écrans

`CoquilleOto` se pose une fois dans le layout, au thème de l'organisation
(`readBrand(identity.org).theme`) ; trois niveaux de montage (coque entière, morceaux du rail, écran
seul) : README du paquet, « Monter les écrans : trois niveaux ».

### 2.5 Variables d'environnement

Côté serveur seulement, jamais en `NEXT_PUBLIC_`, sauf les trois qui le portent. « Secret » : jamais
affichée, jamais commitée.

| Variable | Mode | Lue par | Rôle | Secret |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | les deux | outillage, `admin_cell` | Adresse commune du site | non |
| `PLATFORM_DATABASE_URL` | les deux | `server/sql.ts` | Connexion du serveur, rôle `platform_app` ; TLS exigé hors de la machine locale | oui |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | middleware, `issuer.ts`, `invitations.ts` | Projet Supabase, émetteur par défaut | non |
| `PLATFORM_OIDC_ISSUER` | OIDC | paquet et hôte | Émetteur, **exactement** comme dans `iss` ; sa présence choisit le mode | non |
| `PLATFORM_OIDC_AUDIENCE` | OIDC | paquet et hôte | Audience exigée dans `aud` de chaque jeton ; une par hôte | non |
| `PLATFORM_OIDC_CLIENT_ID`, `PLATFORM_OIDC_CLIENT_SECRET` | OIDC | hôte | Client web confidentiel de l'hôte chez l'émetteur | le secret |
| `PLATFORM_SESSION_SECRET` | OIDC | hôte | Clé du cookie de session (AES-GCM, 32 caractères au moins) ; la changer ferme toutes les sessions | oui |
| `PLATFORM_SMTP_URL` | OIDC | `server/mail.ts` | Relais des invitations, `smtps://…:465` ou `smtp://…:587`, TLS exigé | oui |
| `PLATFORM_MAIL_FROM` | OIDC | `server/mail.ts` | Expéditeur, `Nom <adresse>`, domaine à SPF et DKIM | non |

Jamais dans l'environnement de l'application déployée : `PLATFORM_ADMIN_DATABASE_URL` (connexion
d'administration), `PLATFORM_APP_PASSWORD`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL`,
`SUPABASE_ACCESS_TOKEN` : outillage seulement (`docs/architecture.md` § 6, « Isolation et secrets »).

Le mode OIDC n'a besoin d'aucune variable Supabase : l'essai a joué tout le parcours sans elles
(§ 4.3), et `admin_cell` contrôle les variables exigées selon le mode.

### 2.6 Base de données

Une fois par base, par le **compte d'administration** (un rôle qui a `CREATEROLE` et le droit de
créer un schéma), jamais par l'application :

1. `PLATFORM_APP_PASSWORD='<tiré au hasard>' pnpm exec oto-platform db prepare --db-url '<url d'administration>?sslmode=require'`
   : rôles `anon`, `authenticated`, schéma `auth` réduit (`uid()`, `jwt()`, `role()`), schéma
   `extensions` (`pg_trgm`, `unaccent`, `ltree`), rôle `platform_app`. Un second passage ne change
   rien (« déjà présent »).
2. `pnpm exec oto-platform migrations sync --to supabase/migrations`, puis
   `pnpm exec oto-platform migrations check`.
3. Appliquer : `supabase db push --db-url '<url d'administration>'` (CLI Supabase, qui sert aussi un
   Postgres sans Supabase et tient l'historique dans `supabase_migrations.schema_migrations`, que lit
   `admin_cell`), ou le workflow de migrations de l'hôte.
4. `PLATFORM_DATABASE_URL` = `postgresql://platform_app:<mot de passe>@<hôte>:<port>/<base>` :
   `platform_app` ne peut que devenir `authenticated` ou `anon`, chaque requête porte l'appelant
   vérifié, sous RLS. Chaque instance de l'application ouvre au plus cinq connexions
   (`POOL_MAX`, `server/sql.ts`) : le nombre d'instances × 5 reste sous `max_connections`.

Après chaque montée de version du paquet : `migrations sync`, puis le point 3. Oublier une personne :
`select platform.forget_user('<identifiant interne>');` par le compte d'administration
(`migrations/README.md`, « Supprimer une personne »).

**Vérifier** : `select version from supabase_migrations.schema_migrations order by 1` liste les
migrations du paquet ; `admin_cell {"op":"migrations"}` les compte (§ 4.3, étape 11).

### 2.7 Équipe plateforme, première organisation, premier administrateur

1. **Équipe plateforme** : depuis un clone du dépôt de référence (le script n'est pas dans la CLI du
   paquet), `pnpm platform:staff add <email>`, avec dans l'environnement
   `PLATFORM_ADMIN_DATABASE_URL` et, en mode OIDC, `PLATFORM_OIDC_ISSUER` (sa présence suffit). La
   personne entre au MCP admin avec un jeton dont l'email **vérifié** est celui-là.
   Retirée puis rajoutée après sa première connexion : `add <email> --user <identifiant>`. Lancer le script depuis la racine du clone : ailleurs, pnpm prend le `package.json` le plus
   proche.
2. **Organisation** : un membre de l'équipe plateforme, dans un assistant branché sur
   `https://<adresse>/api/mcp-admin`, appelle `admin_context`, puis
   `admin_org {"op":"create","org":"<slug>","name":"<nom>","prefix":"<préfixe>","host":"<adresse>"}`,
   une première fois pour le résumé, une seconde avec `"confirm": true`. Le préfixe nomme les outils
   de l'organisation pour toujours.
3. **Premier administrateur** : le membre de l'équipe plateforme ouvre l'adresse de l'organisation
   (il y a un accès plateforme), écran « Équipes », et invite la personne en rôle administrateur. En
   mode OIDC, l'email part par le relais de l'hôte ; la personne se connecte ou crée son compte chez
   l'émetteur avec cette adresse, et entre.

## Développer le paquet

```bash
pnpm install
cp .env.example .env.local   # connexions de test ; jamais commité
pnpm verify                  # check:framework · type-check · lint · test, puis le reçu
pnpm dev                     # l'application de base sur http://localhost:3000
```

La CI (`.github/workflows/ci.yml`) contrôle les migrations, construit l'application de base et fait
tourner la suite sur un Postgres nu.

## Publier une version

Un changement se fait ici (retours produit compris), se commite sur `main`, puis sort par une version.

1. Chaque changement visible d'un assistant ou d'un hôte a sa ligne sous `## Unreleased` de
   `packages/plateforme/CHANGELOG.md` (format en tête du fichier, vérifié par les tests).
2. Choisir le numéro : correctif `x.y.Z` (aucune migration, aucun export changé), mineure `x.Y.0`
   (ajout, migration additive) ; une majeure demande un ADR (le paquet n'ajoute que, ADR-006).
3. Commit de version : `"version"` de `packages/plateforme/package.json`, `## Unreleased` renommé en
   `## <version> — <AAAA-MM-JJ>` sous un `## Unreleased` vide ; `pnpm verify`, commit, push sur
   `main`, CI verte.
4. `git tag -a v<version> -m "@otomata_tech/oto_platform <version>"` puis
   `git push origin v<version>` : `publish.yml` contrôle les secrets de l'arbre, les migrations,
   l'accord du tag, de la version et du `CHANGELOG.md`, puis publie avec provenance. Seul JB pousse
   un tag, ou l'agent avec son accord.
5. Vérifier : `npm view @otomata_tech/oto_platform@<version> version`.
6. Dans chaque application (oto-saas) : la pull request Renovate (§ Mises à jour par Renovate du
   README du paquet), ou à la main `pnpm add @otomata_tech/oto_platform@<version> -E`, puis
   `pnpm migrations:sync`, les migrations appliquées à sa base, et le déploiement.

## Licence

MIT : [`LICENSE`](LICENSE).
