# Changelog — @otomata_tech/oto_platform

Every published version of the package, newest first. Versions follow semantic versioning;
the package only adds (ADR-006), so a breaking change is a major version.

Format, checked by tests:
- a version is a heading `## <x.y.z> — <YYYY-MM-DD>`; changes not yet published sit under
  `## Unreleased`, which the release commit renames to the version before opening an empty
  `## Unreleased` above it;
- under a version, at most two lists: `### Assistants` (what an assistant connected to the
  platform can do; one sentence of 200 characters at most per entry) and `### Hosts` (what an
  application that installs the package must know or do; one line per point, led by what it
  concerns: `Install:`, `UI:`, `Schemas:`, `API:`, `MCP:`, `Server:`, `Migrations:`, `CLI:`;
  shown in Renovate pull requests).

Version 1.0.0 describes the whole package; each later version lists what it changes.

## Unreleased

## 1.0.0 — 2026-09-28

### Assistants
- Six tools named with your organisation's prefix: `context`, `find`, `read`, `write`, `call`, `feedback`; the list only ever grows.
- Call `context` first with the user's request: it returns the ctx code every other tool requires and starts with « How this workspace works » (tools, spaces, drafts, confirmation).
- `context` always says the reply language (« Reply in French unless the user writes in another language. »), from the profile, then the organisation, then French.
- A ctx expires when a Context (rules, tone) is published: the refusal says to call `context` again. Every result carries the same content as text and as structured content.
- `context` serves the steps of the procedure that clearly matches the request, or candidates with an instruction; it only weighs procedures the person can read.
- `context` serves the person's Contextes (everyone, private, teams), each opened by a facts line, with the contents filed under it; then what's new, useful procedures and recent content.
- `find` searches titles, summaries, content and table rows, says where each match is, forgives a typo as a last resort, and lists matching catalogue functions.
- `read` serves a node: whole page, one section, its outline, changes since a revision, the draft, links in and out; long pages come in parts.
- `write` creates and edits pages, procedures and tables by section or by block on a shared draft, and publishes with `publish: true`; a stale revision is refused.
- A published title moves the node to a path that follows it, the first free one if taken: `write` says « Renamed: now at <path> », and the old path stays an alias.
- Personal spaces live under `private/<handle>`; an old `perso/…` path still serves its node and says where it moved.
- A block written by a newer platform version shows as a comment line in `read` and `context`; `write` refuses with `conflict` any operation that would lose it.
- Links are written `[[path]]`; a `reference` block shows a line of another node; after a move or a rename, the old path still leads to the node, with a moved to line.
- Publishing a procedure checks every call block first and returns every problem at once; `read` serves the `write.procedure` and `write.table` contracts.
- `call` runs catalogue functions (native ones, `table.*`, the ERP's business functions); a sensitive one first returns a summary and runs only with `confirm: true`.
- Each `call` report names the team and the connector account used, and says when the account is simulated; in this version the `mail` connector is simulated.
- `table.schema`, `table.rows` and `table.aggregate` read a table; `table.write` needs a comment or a link as proof of a new value; `table.claim` and `table.release` share its work queue.
- `read` with path `journal` shows your conversations of the last 24 hours or 7 days and their calls; secret values are masked.
- `feedback` files a ticket numbered per organisation (FB-0001), linked to the ctx; the same report sent again within 10 minutes returns the same ticket.
- Published procedures you can read are offered as prompts, up to 20 in path order; each prompt sends the procedure's title.
- Content in the trash is hidden from `find`, `read`, `context` and prompts until it is restored.
- The admin connector, for the platform team only: `admin_context`, `admin_org`, `admin_team`, `admin_node`, `admin_connector`, `admin_journal`, `admin_feedback`, `admin_cell`.
- Each team part names all its leads; team parts come in name order; connector lines sit in the part of the team that has the account.
- A call with no team named runs under your only team with that account; if several could, it is refused with `ambiguous_team`.

### Hosts
- Install: `pnpm add @otomata_tech/oto_platform@1.0.0`, an exact version; peer dependencies `next` 15, `react` and `react-dom` 19, `@supabase/supabase-js` 2, `@phosphor-icons/react` 2, `zod` ^3.25, `react-hook-form` ^7.55, `@hookform/resolvers` 5.
- Install: pinned dependencies of the package: `@modelcontextprotocol/sdk` 1.26.0, `mcp-handler` 1.1.0, `jose` 6.2.12, `nodemailer` 10.0.10 (Node 20 or later), `postgres` 3.4.9.
- Install: the package ships TypeScript sources: add it to `transpilePackages` in `next.config.ts`; with pnpm 12, add it to `minimumReleaseAgeExclude` to receive each version as soon as it is published.
- Install: Renovate: extend `github>otomata-tech/oto-pkg//renovate/preset` in `renovate.json`; the version stays pinned, minors and patches merge when CI passes, a major waits for review under the label `oto-platform-major`.
- Install: `PLATFORM_DATABASE_URL`, server side only, is required by every request: the package's own Postgres connection, role `platform_app` (created by `oto-platform db prepare`), on Supabase the transaction pooler (port 6543); TLS off the local machine. No service key in the application.
- Install: identity issuer, one per host: Supabase Auth by default (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, asymmetric JWT keys), or an OpenID Connect issuer (Logto, Keycloak) with `PLATFORM_OIDC_ISSUER`, written exactly as in `iss`, and `PLATFORM_OIDC_AUDIENCE`, the MCP address.
- Install: with an OIDC issuer, invitations are emailed by the platform through `PLATFORM_SMTP_URL` and `PLATFORM_MAIL_FROM` (TLS required; a missing variable refuses the invitation), consent happens at the issuer, and the reference host signs in with `PLATFORM_OIDC_CLIENT_ID`, `PLATFORM_OIDC_CLIENT_SECRET` and `PLATFORM_SESSION_SECRET`.
- Install: `NEXT_PUBLIC_SITE_URL` is read by the cell health check; the reference application's `src/app/` is the model of every route and page to mount.
- UI: in `globals.css`, after `@import "tailwindcss";`, add `@source` on `node_modules/@otomata_tech/oto_platform/ui` and `@import "@otomata_tech/oto_platform/ui/styles.css"`: the design system ported from oto-frontend, eight themes, Inter and JetBrains Mono (SIL OFL 1.1).
- UI: mount `CoquilleOto` once, in the authenticated layout, with `preferredTheme(identity)` (the person's colour, else the organisation's); night follows the host's `.dark` class; pages inside it use the package screens and Oto classes, not the host's own tokens.
- UI: lend the screens your router from a client component: `ContexteDeLHote` (link, current path, navigation, logout) and `ContexteDeRafraichissement` (`() => router.refresh()`); without the latter a screen reloads the whole document.
- UI: three ways to mount the screens, one shell visible at a time: the whole shell (`Desk`, `RailApplication`, `Content`), the rail pieces in the ERP's own sidebar (`EntrepriseDuRail`, `RechercheDuRail`, `SectionsDuRail`, `PiedDuRail`), or one screen inside an ERP page.
- UI: screens, each with its loading state: `EcranDAccueil` (`/`, tabs « Activités » and « Contexte » through `onglet` and `hrefDOnglet`; `DonneesDeLAccueil` takes `activites` from `listActivities` and `procedures` from `usefulProcedures`, shown as « Procédures les plus utilisées »), `EcranDeNoeud` and `TableauDuNoeud` (`/n/[...chemin]`), `EcranEquipes` (`/equipes`, « Équipes & accès »), `EcranDuJournal` (`/journal`), `EcranConnexion` (`/connect`, connect an assistant), `EcranProfil` (`/profil`, every member), `EcranDeLaCorbeille` (`/corbeille`, restores under the nearest ancestor).
- UI: the rail's addresses (`AdressesDuRail`): `profil` and `corbeille` open from the account menu (Profil, Brancher un assistant, Corbeille, Déconnexion), `connecteurs` sits at the bottom of the rail for administrators; an absent address removes its entry.
- UI: administration screens under `/admin/*`, reserved to administrators (`reserveAuxAdministrateurs`): `EcranOrganisation` (organisation, brand, language and the « Contexte · Tout le monde » island), `EcranConnecteurs`, `EcranUsage`, `EcranRetours`; redirect `/admin/marque` and `/admin/drapeaux` to `/admin/organisation`, and `/admin/acces` to `/equipes?onglet=acces` (308).
- UI: authentication screens under `<CoquilleOto pleinePage>`: `EcranDAuthentification` with `IlotDAuthentification`, `AucuneOrganisation` (`/aucune-organisation`), `Consentement` (the OAuth consent page, `/oauth/consent`).
- UI: mount the public share page on `/p/<token>`, outside the session (`readPublicNode`): read-only, `noindex, nofollow` in header and tag, in no sitemap; a link serves only the last published version of what its author reads at that moment, a table as a read-only grid of 500 rows at most; the organisation settings list public links and revoke them.
- UI: on the « Contexte » tab, read the Contexte of every preview part by `cheminDuContexte`, served or not, and skip a `not_found`: a writable draft Contexte then shows its editor.
- UI: every choice list of the screens is a popover `Select` (keyboard per the select-only combobox pattern) over a hidden input; without JavaScript a GET filter keeps its served value.
- UI: a procedure is edited and read like a page on screen (text only, call blocks shown as text); assistants still receive it through `context`, prompts and the publication check.
- UI: mount `FaviconDuTheme` once in the root layout (tab icon in the organisation's theme) and keep a static `app/icon.svg`; under a Content Security Policy, `img-src` must allow `data:`.
- UI: design-system primitives (`Alert`, `Button`, `Field`, `Input`, `DropdownMenu`, `Rail`, `RailItem`, `RailSection`, `RailTree`) are exported for host pages under `CoquilleOto`; `ErreurDeLecture` renders a read failure.
- Schemas: shared Zod schemas (`zod/v4`) of forms, API and tools, and pure block rendering (`renderBlocks`, `splitSections`), usable by every face, `ui/` included.
- API: mount `handlePlateforme` on `app/api/plateforme/[...route]/route.ts` (`GET`, `POST`, `PATCH`, `DELETE`) with `{ accessToken, host: rawRequestHost(request.headers), defer: (task) => after(task) }`: the same-origin door of every screen mutation, each one journaled.
- API: `PATCH profile` (`first_name`, `last_name`, `theme`), `PATCH brand` (`language`: `fr`, `en` or `null`, kept when absent); `POST nodes/move` takes the first free path when `new_path` is taken and returns it in `data.path`.
- API: rail gestures and sharing: `POST nodes/position`, `POST nodes/duplicate`, `GET nodes/impact`, `POST nodes/access` (the whole organisation at a level, ADR-014), `GET nodes/links`, `GET|POST trash`, `POST trash/restore` (30 days), `GET|POST shares`, `DELETE shares/<id>`, `GET public/<token>` outside any session.
- API: answers are `{ data }` or `{ error: { code, message, details? } }` with the HTTP status; a race lost between the decision and the write answers 409 `conflict`, a stale revision 409 `stale_revision`, a token refused 401 `unauthorized`.
- MCP: mount `app/api/mcp/route.ts`: `POST` calls `handleMcpPost(request, { verifyToken: makeVerifyToken(), defer: (task) => after(task) })`, `GET` and `DELETE` return `mcpMethodNotAllowed()`, with `maxDuration = 60` and `dynamic = "force-dynamic"`; the route checks the token itself.
- MCP: mount `handleAdminMcp` on `app/api/mcp-admin/route.ts` the same way (401 outside the platform team); its optional `orgCreation` hook (`OrgCreationHook`) adds addresses once an organisation is created.
- MCP: mount `handleResourceMetadata` (`GET`) and `metadataOptions` (`OPTIONS`) on `app/.well-known/oauth-protected-resource/[[...path]]/route.ts` (RFC 9728); keep `/api` and `/.well-known` public in the middleware.
- MCP: on Supabase Auth, enable its OAuth 2.1 server with dynamic registration and set « Authorization Path » to `/oauth/consent`, a page that renders `Consentement` and decides with `consentRequest` and `consentDecision`; let its `POST` through the middleware without a session.
- Server: build the client with `createPlatformDb({ caller })`, the verified caller of the session: `{ userId, email, name }` on Supabase Auth (`callerName(user)`), `{ issuer, issuerKind: "oidc", subject, email, name }` with an OIDC issuer; each operation runs in one transaction (`db.tx`).
- Server: `resolveIdentity(db, host, { email })` gives the organisation of the request address, the person, role, teams and platform access (`readProfile` and `preferredTheme` read the person's profile and colour); services decide rights before each request and throw `PlatformError` with a named code.
- Server: ERP business functions: `defineErpFunction` and `registerFunctions([...])` in `src/lib/fonctions-metier.ts`, imported first in the three routes above; they run under the caller's token (`ctx.accessToken`); a bad list throws `CatalogRegistrationError` at route load.
- Server: call `acceptInvitations` at every sign-in return; `createAnonPlatformDb()` serves the only anonymous reads, the brand of an address (pages without a session such as `/login`) and a public share link; flags are declared in `FLAGS` (empty in 1.0.0) and read with `isEnabled(org, name)`.
- Migrations: the SQL touches only the `platform` schema and only adds; every table is under row level security, which keeps the boundary between organisations while services decide levels and roles.
- Migrations: a new host applies, after `db prepare`, the V1 baseline `20260928100000_platform_base_v1.sql` and the migrations after it, in order; a host that applied the former chain follows `migrations/README.md` (« Hôtes déjà installés ») once.
- Migrations: extensions `pg_trgm`, `unaccent` and `ltree` in schema `extensions`; no reference to `auth.users` and no `moddatetime`: the schema installs on Supabase and on a bare Postgres.
- Migrations: on Supabase, declare `platform.hook_before_user_created` as the Auth hook « Before User Created » (only invited people sign up, Google and Microsoft included) and remove `platform` from the Data API exposed schemas.
- Migrations: rows your tooling inserts in `members` and `platform_staff` carry `email` (lower case) and `name`; call `platform.forget_user(<id>)` before deleting an account at the issuer.
- CLI: `oto-platform migrations sync|check`: `sync --to supabase/migrations` copies the package migrations missing from the application and never overwrites a changed copy; `check` refuses anything outside `platform`, any removal, a function without `revoke execute … from public`, a tie to `auth.users` or another extension. Run `sync` after every upgrade, `check` in CI.
- CLI: `oto-platform db prepare --db-url <url>`, once before the migrations: on a bare Postgres it creates the roles `anon` and `authenticated`, the `auth` schema (`uid()`, `jwt()`, `role()`) and the three extensions; on any host the login role `platform_app` (password from `PLATFORM_APP_PASSWORD`); TLS unless the URL sets `sslmode`.
- CLI: `oto-platform --help` gives usage and exit codes (0 success, 1 refusal, 2 wrong usage); from a clone of the repository, `pnpm auth:settings`, `pnpm data-api:close` and `pnpm platform:staff` set a Supabase project's Auth, close its Data API and manage the platform team.
- `CONTEXT_INDEX` (schemas): titles and line form of a Contexte's index lists served by `context`; the home Contexte view shows them as links under the editor of a Contexte the person can write.
- Teams: several leads per team (`team_members.role`), `PATCH teams/:id/members/:userId` { role }, `setTeamMemberRole`; the Teams & access screen keeps members and teams only (`/admin/acces` redirects). The default team is gone from screens and services (`TeamView.leadUserId`, `MemberView.defaultTeamId`, `Identity.member.defaultTeamId` removed; columns emptied by migration `20260929090000`, dropped in 1.1).
- Organisation screen: one name, no work domains; its Contexte insert lists the contents filed under it. Usage is hidden; feedback is for the platform team only (`handlesFeedback`); Journal sits in the settings menu; the node header no longer has « Déplacer ».
