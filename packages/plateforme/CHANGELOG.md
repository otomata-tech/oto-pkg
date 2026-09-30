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

## 1.1.0 — 2026-09-30

### Assistants
- Without a clear match, `context` offers every shown candidate as a choice for a question, a « comment » question or a polite request; it answers or explains first and runs nothing unpicked.
- `context` matches a procedure on each phrasing its summary lists, weighs rare words above common ones, and forgives a typo in the request through the organisation's lexicon.
- Content in the trash no longer takes a place among `find` and `context` results before their cut: a live match ranked lower now shows instead.
- `write` reads GFM tables, `---` dividers, `<details>` toggles, lists nested three levels deep and headings down to `######`; `read` and `context` serve them back in the same form.
- Page text shows ~~strikethrough~~, backslash escapes, `<br>`, a mark inside a mark of another character and `<https://…>` links; `\[[path]]` is not a link.
- Publishing a procedure refuses a `call` fence inside a table cell, a toggle or a sub-item, as in a paragraph; a step stays a top-level item of the numbered list.
- `call table.import` files a CSV into a new table (`create`) or an existing one: 40,000 characters per call, each piece starting with the header line, rows merged on the key.
- The `write.table` contract says a CSV the user gives you becomes a table through `table.import`, and a markdown file a page whose first # heading is the title.
- A ctx expires only when a Context served to your conversation changes, and the refusal names which; `feedback` accepts an expired ctx.
- `context` serves each block whole, up to 35,000 characters in all; beyond, the cut is said, with the `read` call that gives the rest.
- `write`: `move_block` takes `section` to move a block to the end of that section; `append` continues the list that ends the section.
- `call table.write` takes `create_only: true`: a key that already exists is refused (conflict) with the row as it is, and nothing is written for it.
- `table.rows` finds rows by words: each word of `q`, in any order, without case or accents, in any searchable cell, e.g. "mairie valbrune".
- `table.schema` gives the table's revision; `table.rows` with `provenance: true` shows the MCP client (`host`) and the `worker` behind each value.
- A column with `allow_verified_empty: false` needs a real value; a table whose review has `agents_may_decide: true` lets you set approve or reject.
- Proof is per table: a new value needs `{value, comment | link}` only where the header says `proof: true`, as `table.schema` tells.
- `write` publishes by default and says « Next write: base_revision N. »; pass `publish: false` to keep an unpublished draft, e.g. until the last call of a long procedure.
- Whoever can write a node publishes it, a table's header included; a published title moves the path at that level, and the old path still leads to the node.
- `call node.discard_draft` drops a node's pending draft, such as a refused table header, back to its published revision; a refused header says to do so.
- `call node.trash` moves a node to the trash (manage level, restorable 30 days on screen); `call table.delete_rows` deletes rows by key for good, naming those in review.
- `call table.import` with `create` needs the write level on the parent, no longer manage.
- `read` of a page shows an attached image as `![alt](<link>)` and a file as `[name (size, type)](<link>)`; `write` keeps both forms, only for files already attached to that page.
- `read` with `file` = the id from a file link serves the text of an attached html, md, txt or csv file alone, in its own fence; long files come in parts.
- `call upload.link` gives a one-time link (15 minutes, 1 MB) to put a file on your disk in a page, or a `.md` or a CSV in a page or a table: send it with the curl command it returns.
- Without a shell, `upload.link` takes `source_url`, a public https address the server downloads; otherwise give the person `form_url`, a one-time upload form.
- `find` finds an attached file by its name.

### Hosts
- Migrations: run `oto-platform migrations sync`, then apply `20260930100000_v1_1_0.sql`, the one additive migration of this version: `platform.lexicon_fix` (no client role executes it), `route_candidates` (two more columns, `s_phrase` and `lexical_title`) and `search_content` recreated; `ensure_private_space`, which at application sets every missing member handle and creates the « Privé » space and its Context of each member who had none; `blocks_type_check` and `blocks_shape_check` widened (block types `simple_table`, `divider`, `toggle`, `file`; nested list items; heading levels 1 to 5; `image` with `file_id`, `width`), every existing row staying valid; the column `platform.ctx.contexts` (every conversation open at the upgrade calls `context` once more); `discard_draft` (security definer, granted to `authenticated`); the tables `platform.files` and `platform.upload_tickets`, `public_file_by_token` and `consume_upload_ticket` (granted to `anon` only); `duplicate_subtree`, `block_search_text` and `forget_user` recreated. A database that applied one of its six development files follows `migrations/README.md` (« Hôtes qui avaient appliqué une migration de la 1.1.0 »).
- Install: attached files are optional: set all five of `PLATFORM_STORAGE_ENDPOINT`, `PLATFORM_STORAGE_BUCKET`, `PLATFORM_STORAGE_REGION`, `PLATFORM_STORAGE_ACCESS_KEY_ID`, `PLATFORM_STORAGE_SECRET_ACCESS_KEY` (S3 access keys, never `service_role`), or none: without them, files are disabled and everything else works.
- Install: the bucket is private, its CORS allows `PUT` and `GET` from each address of the application with the `content-type` header; a host CSP allows the bucket's origin in `img-src` and `connect-src`, and `frame-src 'self'` (package README).
- Install: pinned dependency `aws4fetch` 1.0.20 (S3 signing, no AWS SDK).
- Install: exclude `api/platform/files/<id>/html` and `api/platform/public/<token>/files/<id>/html` from a global `X-Frame-Options`, `Referrer-Policy` or CSP (ADR-017): source `/((?!api/platform/(?:public/[^/]+/)?files/[^/]+/html/?$).*)` in the reference `next.config.ts`.
- Install: addresses are in English, without alias or redirect, and an old one answers 404 (ADR-020): rename the route folders `/equipes` to `/teams`, `/profil` to `/profile`, `/corbeille` to `/trash`, `/plateforme` to `/platform`, `/aucune-organisation` to `/no-organization`, `/auth/confirmer` to `/auth/confirm`, `/admin/organisation` to `/admin/organization`, `/admin/connecteurs` to `/admin/connectors`, `/admin/retours` to `/admin/feedback`, and every address the host gives the screens or passes to `redirect()`.
- Install: drop the pages `/admin/acces`, `/admin/marque` and `/admin/drapeaux` and the `/plateforme/invitations` redirect of `next.config.ts`; `/journal` keeps its name.
- Install: mount the screens' API on `app/api/platform/[...route]/route.ts` (`PLATFORM_API_PREFIX`, exported by `./schemas`); `/api/plateforme/*` now answers 404, so every screen mutation fails until the route moves.
- Install: add `/auth/confirm` to the Supabase Auth redirect URLs (`pnpm auth:settings --redirect`, then remove the `/auth/confirmer` one) and to the middleware's public routes; an invitation sent before this version leads to a 404: send it again.
- API: `GET nodes/export?path=` (the `.md` of a published node) and `GET tables/export?path=` (the `.csv` of a table, 5,000 rows at most) answer `{filename, content}` and are reads, never journaled; `POST tables/import` writes one lot of 500 CSV rows at most, creating the table for who can write its parent.
- API: the body of `POST nodes` takes `tolerant: true` (paste and file import: nothing refused, `kept_as_text` counts what stayed text); `write` over MCP stays strict.
- API: default changed: `write` and `POST nodes` publish by default; `publish: false` keeps a draft; publishing a node or a table header needs the write level, no longer manage.
- API: `GET public/<token>` and `readPublicNode` return `language`, the organisation's, which sets the separator of a public table's CSV.
- API: `GET files`, `POST files`, `POST files/<id>/complete`, `GET files/<id>` (302 to a 60 s presigned URL; `?check`, `?disposition=inline`), `GET files/<id>/markdown`, `GET files/<id>/html`; outside any session `GET public/<token>/files/<id>` (with `/markdown`, `/html`) and `POST uploads/<token>`, never behind CORS.
- API: `POST nodes/duplicate` copies the attached files, counted in the 10 GB quota; the trash purge deletes the files of purged nodes and their objects.
- MCP: six tools, unchanged, but the descriptions of `write` (its `publish` field, `move_block` into a section), `read` (optional field `file`) and `call` change: refresh the tool list in each host after upgrading; `table.import`, `node.discard_draft`, `node.trash`, `table.delete_rows` and `upload.link` join the `call` catalogue; the table functions, described through `read`, need nothing.
- MCP: the `not_enabled` refusal links `<origin>/admin/connectors` and `node.trash` points to `<origin>/trash`: the host serves both routes; the tool list and schemas are unchanged.
- Server: routing scores change for every organisation; an `orgs.settings.routing` threshold keeps its 0 to 1 scale, not its calibration: replay your routing phrases after upgrading.
- Server: `context` returns up to 35,000 characters (20,000 before), each block whole; `previewContext` and the « Contexte » view follow.
- Server: the header attribute `proof` defaults to false: an existing table no longer requires proof until `header: {"proof": true}` is published through `write`; the review queue shows « sans preuve » only then.
- Server: the `node.` namespace belongs to the package's native `node` connector: `registerFunctions` refuses an ERP function named `node.*`.
- Server: the journal line of a `table.delete_rows` run carries `_outcome` (`deleted`, `review`) among its arguments, shown by the journal screen and `admin_journal`.
- Schemas: `./schemas` exports the CSV functions (`parseCsv`, `columnNameOf`, `inferTable`, `checkImport`, `toCsv`…), `pageMarkdown`, `readPageMarkdown`, `tableImportArgsSchema`, `tableImportBodySchema` and the import bounds (`IMPORT_*`).
- Schemas: `./schemas` exports `queryWords`; `tableHeaderSchema` gains `proof`, `tableColumnSchema` `allow_verified_empty`, `tableReviewSchema` `agents_may_decide`.
- Schemas: `./schemas` exports `rowCells`, `keyValue` (moved from the server) and `PUBLIC_TABLE_ROWS_MAX`.
- Schemas: URL keys renamed in place, an old name ignored like any unknown parameter: `equipesSearchSchema.tab` (`members`, `teams`); `equipesListesSchema` `filter`, `sort` (`team`, `people`), `order`; `journalFiltersSchema` `period`, `team`, `person`, `errors`, `cursor`, `calls`; `feedbackListQuerySchema` `state`, `period`, `cursor`; `usageQuerySchema` `period`, `team`; `proceduresSearchSchema.team`; `tableScreenParamsSchema.sort`; `nodeVersionParamSchema` takes `published`.
- UI: `EcranDAccueilProps` loses `hrefDesGuides`; `DonneesDeLAccueil.adresse` is a whole `AdresseDeConnexion` (url, nom, nomCli, phrase), no longer a string.
- UI: the `prompts` prop of `EcranConnexion` takes the useful procedures (`usefulProcedures(db, identity, 3)`), no longer `listPrompts`; `/connect` shows the connection guide, then « Vos connexions ».
- UI: « Brancher mon Claude, ChatGPT ou Mistral » replaces « Brancher un assistant » in the account menu, the palette, the home card and `/connect`; the home card no longer shows the server address.
- UI: the home page no longer reads `?onglet=`; give the rail `adresses.contexte` (`/context`) and mount `EcranDuContexte` on that route (example: `src/app/(dashboard)/context/page.tsx`).
- UI: `ContexteServi` and `EcranDAccueil` lose `hrefDuProfil`; `EcranDAccueil` loses `onglet` and `hrefDOnglet`; `ONGLETS_DE_L_ACCUEIL` and `OngletDeLAccueil` are no longer exported.
- UI: headings render one level lower: a heading of level N is an `h(N+1)`, at most `h6` (`h(N+2)` under `baliseDeTitre="h3"`); level 2 and 3 headings already written become `h3` and `h4`.
- UI: pages show the new blocks (simple table scrolling inside its block, divider, toggle closed by default, nested lists); in the editor, a block's « + » and `/` in an empty text open a choice in two groups (« Texte », « Insérer »), and a simple table, a divider and a toggle are written on screen.
- UI: the rail's « ⋯ » offers « Télécharger en .md » (page, procedure, Contexte) and « Télécharger en .csv » (table); « Importer un fichier… » in the rail's « + », or a file dropped on a rail line, imports a `.md` as a page or a `.csv` as a table; to who writes a table, its screen offers « Importer un fichier… » above the table and takes a dropped `.csv`.
- UI: the editor draws one marker per list item, on its first line, and edits a link in a « Lien » panel; nothing for the host to do.
- UI: a node created from the rail is published at once; the draft banner, « Voir la version publiée » and « La publication revient… » are gone; the home feed says « a supprimé des lignes dans …, dont N à revoir ».
- UI: a table's header offers « Réglages » to who writes it (proof required, review decided by the assistant, closed), published through the page's queue; nothing for the host to do.
- UI: `TableauDuNoeud` takes `assistant?`, the most recent family of `lastConnections`, read by the host for a table without rows (example: `src/app/(dashboard)/n/[...chemin]/page.tsx`); an empty table names that assistant.
- UI: `EcranDeNoeud` always lays a page, a procedure or a Contexte out in two columns, « Cité dans », « Cite » and « Sous-pages » folded on the right; a node's header and the public page offer « Télécharger en .csv/.md ».
- UI: pass `fileView` (`/n/…`) or `publicFileView` (`/p/<token>/…`, with `routeDesFichiers={publicFilesRoute(<token>)}`) for `?view=<id>` to show the viewer of an attached `html` or `md` file.
- UI: add the page `/upload/<token>` under the session: it passes `uploadForm(db, identity, token)` to `EcranDeDepot` (example: `src/app/(dashboard)/upload/[token]/page.tsx`); its form posts to `POST uploads/<token>/form`.
- UI: a grid's `f=` clause is `<column>:<contains|eq|gte|lte|empty|not_empty>:<value>`, a boolean `true|false`, and the « Filtrer » form sends `column`, `contains`, `eq`, `min`, `max`, `presence` (`empty`, `not_empty`); an older clause is dropped and said; `Operation` takes these names, `CHAMP_DE_L_OPERATION` maps them to the form fields.
- UI: the brand form returns to `?saved=1` (the host reads it for `enregistre`), a consent to redo carries `?error=decision`; anchors are `news`, `recent-content`, `everyone-context`, `private-context`, `context-<slug>` and `part-<n>`.
- CLI: `pnpm org:export` and `pnpm org:import` need the five storage variables when the organisation has attached files, and carry their bytes in `<file>.files/`.

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
