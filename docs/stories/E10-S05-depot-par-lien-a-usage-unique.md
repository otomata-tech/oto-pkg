# Story E10-S05 — Dépôt par lien à usage unique : Claude Code envoie un fichier sans le réécrire

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E10 — Contenus riches |
| **Parcours** | 4.2 Faire (Claude Code range un rapport, un compte rendu, un export) ; 4.4 Concevoir et mettre à jour |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : aucun écran ; texte servi à l'assistant (`mcp-patterns.md`) |
| **Conventions** | database, supabase, security, api, mcp, uploads, testing |
| **Estimation** | M |
| **Vague** | E10, après 1.0.0 ; dernière de l'epic (ordre E10-S04, E10-S01, E10-S06, E10-S02, E10-S03, E10-S05) |
| **Dépend de** | ADR-018 (« ticket d'envoi », écrit par le pilote avant le code) ; E10-S01 (mode tolérant, `table.import`, provenance `import`) ; E10-S03 (bloc `html`, page artefact, `HTML_MAX`) |
| **Porteuse de migration** | **Oui** (Ⓜ) : table `platform.upload_tickets`, fonction `platform.consume_upload_ticket` |

## Contexte

JB, 2026-09-28 : un assistant ne doit pas réécrire dans un appel MCP un fichier qu'il a déjà.
Avec `write`, un rapport HTML de 100 ko représente environ 30 000 jetons générés, plusieurs
minutes et un risque de coupure. Le même problème touche un gros CSV (`table.import`, 40 000
caractères par appel) et un long `.md`. Or Claude Code a le fichier sur disque et un shell.

JB a choisi un **lien à usage unique** (fiche D117) :
- une fonction derrière `call` rend une adresse ;
- Claude Code y envoie le fichier par `curl` ;
- le contenu ne passe jamais par le modèle.

Aucun outil n'est ajouté (ADR-002). Pour Claude ou ChatGPT dans le navigateur, sans shell, le
dépôt se fait à l'écran (E10-S03 AC5, E10-S01 AC-a4 et AC-b1), et ` ```html-artifact ` reste pour
les petits artefacts.

La route d'envoi est la première porte du paquet qui **écrit au nom d'une personne sans jeton de
session**. Le ticket prouve qui et où ; le droit se relit à l'envoi. ADR-018 pose cette exception
à la garde de portabilité (`CLAUDE.md § Projet`, « vérification du jeton injectée sur chaque
porte ») et à ADR-012 § 3.

**Refs :**
- PRD : FR-CONC-11
- ADR-002 (fonction derrière `call`), ADR-012 § 3 (le service décide), ADR-013 § 4 (fonction
  `security definer` sous `anon`, bornée au jeton et à l'organisation de l'adresse), ADR-017 (page
  artefact), ADR-018 (ticket d'envoi)

## Périmètre

- La fonction `upload.link` au catalogue de `call`.
- La table `upload_tickets` et la fonction `consume_upload_ticket`.
- La route `POST /api/plateforme/uploads/<jeton>`, sans session.
- L'écriture d'une page (`html`, `md`) et d'un tableau (`csv`) par les services existants.
- Le journal des deux temps, le ménage des tickets, l'isolation.

## Hors périmètre

- Envoi de fichiers binaires (images, PDF) : E10-S02, par URL présignée.
- Dépôt à l'écran d'un `.md`, d'un `.csv` ou d'un `.html` : E10-S01 et E10-S03.
- Remplacement complet des lignes d'un tableau (`csv replace`) : écarté (décision du pilote C10) ;
  un tableau se remplace à l'écran, ou se supprime puis se recrée.
- Envoi en plusieurs morceaux, reprise d'un envoi coupé : V2 si le besoin apparaît (1 Mo suffit).
- Rate limiting : aucun store partagé dans le paquet ; le jeton de 256 bits en tient lieu (AC11).
- Commande CLI du paquet avec connexion OAuth de l'appareil : écartée (option B de D117).

## Critères d'acceptation

### Lot a — Le lien

- [ ] **AC1 — `upload.link`.** **Given** un assistant avec un `ctx` valide **When** il appelle
  `call` avec `upload.link` et :
  - `path` : la page ou le tableau à créer, ou le nœud existant ;
  - `kind` : `html`, `md` ou `csv` ;
  - `mode` : `create` ou `replace` pour `html` et `md` ; `create` ou `merge` pour `csv` ;
  - `title` et `summary`, exigés pour `create`, sous les règles de `write` ;
  - `base_revision`, exigée pour `replace` et `merge` ;
  - `key`, facultative, pour un `csv` ;
  - `publish`, facultatif (défaut `false`), pour `html` et `md` ;

  **Then** le service décide tout de suite, avant toute écriture, ce qu'il décidera à l'envoi :
  - `create` : écriture sur le dossier parent, chemin libre ; pour un `csv`, gestion du dossier
    (fiche D120, HN-E10S05-7) ;
  - `replace`, `merge` : écriture sur le nœud, chemin existant, `base_revision` égale à la
    révision courante ;
  - genre : `html` et `md` visent une page (`kind: page`), jamais une procédure, un Contexte ni un
    tableau ; `replace` d'un `html` vise une page artefact (E10-S03 AC4), `replace` d'un `md` une
    page qui n'en est pas une ; `csv` vise un tableau ;
  - `publish: true` : niveau manage sur le nœud (ou le parent pour `create`).

  Un refus se donne à ce moment, avec son code : `forbidden` (avec à qui s'adresser, H68),
  `not_found`, `conflict` (chemin pris), `stale_revision`, `invalid_arguments`.
- [ ] **AC2 — Ce que l'assistant reçoit.** **Given** un `upload.link` accepté **Then** le texte et
  le contenu structuré portent les mêmes éléments :
  - l'adresse `https://<adresse de l'organisation>/api/plateforme/uploads/<jeton>` ;
  - l'expiration (ISO 8601) ;
  - la commande pour bash : `curl -sS --fail-with-body --data-binary @'<fichier>' '<adresse>'` ;
  - la commande pour PowerShell : `curl.exe -sS --fail-with-body --data-binary "@<fichier>" "<adresse>"` ;
  - la limite du type demandé (AC7) ;
  - la phrase « the link works once, for 15 minutes; the file never goes through this
    conversation ».

  **And** la description d'`upload.link` et le contrat de `write` servi par `read`
  (`catalog/contracts.ts`) disent quand préférer le lien : « a file that already exists on your
  disk, or more than 20,000 characters, and only if you have a shell ».
- [ ] **AC3 — Le ticket.** **Given** un `upload.link` accepté **Then** une ligne
  `upload_tickets` est créée :
  - jeton : 32 octets aléatoires en base64url, 43 caractères, jamais stocké ni journalisé ; seule
    son empreinte SHA-256 (hex) est gardée ;
  - liée à la personne, à l'organisation, au `ctx` de l'appel, à la destination, au type, au mode
    et aux paramètres d'AC1 ;
  - valable 15 minutes et un seul envoi.

  **And** les tickets de l'organisation expirés depuis plus de 24 heures sont supprimés dans la
  même transaction (décision du pilote C10).

### Lot b — L'envoi

- [ ] **AC4 — Ordre des contrôles.** **Given** `POST /api/plateforme/uploads/<jeton>` sans
  session **When** la porte le reçoit, avant le jeton de session (comme `isPublicRoute`) **Then**
  elle contrôle, dans cet ordre, et s'arrête au premier refus :
  1. la requête porte un en-tête `Origin` : `forbidden`, sans lire le corps ni la base ;
  2. le jeton ne suit pas `^[A-Za-z0-9_-]{43}$` : `not_found`, sans lire le corps ni la base ;
  3. `Content-Length` au-delà de 1 048 576 octets : `too_large`, sans lire le corps ;
  4. le corps est lu par morceaux et coupé à 1 048 576 octets : au-delà, `too_large` ;
  5. le ticket est consommé (AC5) ;
  6. l'identité et le droit sont relus (AC6) ;
  7. le contenu est contrôlé (AC7) ;
  8. le contenu est écrit (AC8).

  Les refus 1 à 4 ne consomment pas le ticket. À partir de l'étape 5, le ticket est servi,
  réussi ou non. Le `Content-Type` est ignoré (curl envoie `application/x-www-form-urlencoded`).
- [ ] **AC5 — Consommation atomique.** **Given** un jeton bien formé **When** le service le
  consomme **Then** il appelle, sous `anon`, `platform.consume_upload_ticket(p_org, p_hash)` :
  - `p_org` : l'organisation de l'adresse (`resolveOrg`, comme `readPublicNode`) ;
  - la fonction exécute un seul
    `update … set used_at = now() where token_hash = p_hash and org_id = p_org and used_at is null
    and expires_at > now() returning …`, dans sa **propre transaction**, validée avant
    l'écriture ;
  - elle rend la ligne du ticket, ou rien.

  **And** un ticket inconnu, expiré, déjà servi ou d'une autre organisation rend `not_found`
  (404), sans dire lequel. **And** deux envois simultanés du même jeton : un seul passe, l'autre
  rend `not_found`. **And** un échec d'écriture ne rend pas le ticket réutilisable.
- [ ] **AC6 — Qui écrit.** **Given** un ticket consommé **Then** le service ouvre
  `createPlatformDb({ caller: { userId: ticket.user_id, email } })` puis
  `resolveIdentity(db, host, { userId, email })`, l'e-mail lu dans `members` par la fonction de
  consommation (ADR-018). **And** une personne qui n'est plus membre : `not_member` ; un droit
  retiré depuis le lien : `forbidden` ; un chemin pris depuis le lien (`create`) : `conflict` ; une
  révision changée depuis le lien : `stale_revision`. Chaque droit est relu par les services
  d'écriture, jamais recopié du ticket.
- [ ] **AC7 — Contrôle du contenu.** **Given** un corps lu **Then** :
  - il est décodé en UTF-8 strict ; un BOM UTF-8 en tête est retiré ; un octet invalide rend
    `invalid_arguments` avec « the file is not UTF-8; convert it first (iconv -f WINDOWS-1252 -t
    UTF-8, or Get-Content -Encoding Default | Set-Content -Encoding UTF8) » ;
  - `\r\n` et `\r` deviennent `\n` pour `html` et `md` ; le CSV les garde (l'analyseur d'E10-S01
    les lit) ;
  - corps vide : `invalid_arguments` ;
  - `html` : `HTML_MAX` (250 000 caractères) au plus, sinon `too_large` ;
  - `md` : analysé par `parseMarkdown` en mode tolérant (E10-S01 AC-a2, décision du pilote C2) ;
    `OP_TEXT_MAX` et `SECTION_MAX` ne s'appliquent pas, `PAGE_MAX` (300 000 caractères) et
    `BLOCKS_MAX` (1 000 blocs) si, sinon `too_large` ;
  - `csv` : règles d'`table.import` (E10-S01 AC-c1, AC-b3), sans la limite de 40 000 caractères,
    dans la limite de `FILTERED_ROWS_MAX` (5 000 lignes), sinon `too_large` ; refus nommés (ligne,
    colonne, valeur), bornés comme tout refus en liste (`MAX_LISTED`, 20, `server/errors.ts`).
- [ ] **AC8 — Écriture.** **Given** un contenu accepté **Then** :
  - `html` : `create` crée une page artefact à un seul bloc `html` (E10-S03 AC4) ; `replace`
    remplace ce bloc (`replace_block`) ;
  - `md` : `create` crée la page avec ses blocs ; `replace` remplace tout le corps publié par les
    blocs du fichier, dans un brouillon ;
  - l'un et l'autre passent par `writeNode` : brouillon, révision gardée par `base_revision`,
    provenance `{ origin: "agent", ctx }` du ticket (ADR-011 § 2), publication seulement si
    `publish: true` ;
  - `csv` : `create` ou `merge` passent par le service de `table.import` (E10-S01), qui pose la
    provenance `{ origin: "import", comment: "Importé de <chemin>" }` (décision du pilote C10) ;
  - la réponse est du texte brut, lisible par `curl` : chemin, révision, état (brouillon ou
    publié), adresse de la page, et pour un `md` « N éléments conservés en texte » quand le mode
    tolérant en a gardé.

  **And** un refus est aussi en texte brut, `<code>: <message>`, au statut HTTP de `HTTP_STATUS`
  (`server/errors.ts`), avec les en-têtes `Cache-Control: private, no-store` et
  `X-Robots-Tag: noindex, nofollow`. `--fail-with-body` fait sortir `curl` en erreur et affiche ce
  texte à Claude Code.

### Lot c — Trace, ménage, isolation, sécurité

- [ ] **AC9 — Journal.** **Given** un `upload.link` **Then** il s'inscrit comme tout `call`.
  **Given** un envoi qui a consommé son ticket **Then** une ligne s'écrit sous le `ctx` du ticket :
  `method: "api"`, `tool: "uploads"`, `target` = le chemin, `args` = `{ kind, mode, bytes }`,
  `is_error` et `error` selon l'issue. Le jeton n'apparaît jamais dans le journal. **And** une
  personne qui n'est plus membre : la policy `journal_insert_own` refuse la ligne ; le refus part au
  log serveur (`console.error("[platform] uploads: …")`), pas au journal. Les refus 1 à 4 d'AC4 ne
  sont pas journalisés (aucune personne connue).
- [ ] **AC10 — Isolation.** **Given** deux organisations A et B **Then** la RLS d'isolation par
  organisation couvre `upload_tickets`. **And** la table entre dans `NEVER_EXPORTED`
  (`scripts/lib/org-transfer.mjs`), par un `push` comme `lexicon` : un ticket ne se transfère pas.
  **And** la suite d'isolation reçoit une ligne dans A et dans B.
- [ ] **AC11 — Canaux de sécurité.** Chaque canal est nommé, fermé ou ouvert, et testé :
  - *fermé* — rejeu : un seul envoi (AC5), test « deux fois le même jeton » ;
  - *fermé* — course : deux envois simultanés, un seul passe (AC5) ;
  - *fermé* — énumération : 256 bits de hasard, forme contrôlée avant la base, même `not_found` pour
    inconnu, expiré, servi ou autre organisation ; test des quatre cas ;
  - *fermé* — autre organisation : le ticket de A envoyé à l'adresse de B rend `not_found` ;
  - *fermé* — navigateur : toute requête avec `Origin` est refusée (`forbidden`), ce qui ferme un
    POST d'un site tiers ou d'un artefact HTML isolé (E10-S03, `allow-scripts`) qui connaîtrait le
    jeton ; test avec `Origin: null` et `Origin: https://example.invalid` ;
  - *fermé* — droit ou appartenance retirés entre le lien et l'envoi : AC6, deux tests ;
  - *fermé* — corps trop gros : refus avant lecture complète (AC4), test avec et sans
    `Content-Length` ;
  - *fermé* — HTML servi : le contenu devient un bloc `html`, rendu seulement par l'iframe isolée
    d'E10-S03 ; la réponse d'envoi est du texte brut, jamais `text/html` ; test du `Content-Type`
    de la réponse ;
  - *ouvert* — fuite du lien : qui le voit pendant 15 minutes, avant l'envoi, écrit au nom de la
    personne (transcription partagée, journaux de Claude Code, d'un proxy ou de l'hébergeur). Borné
    par l'usage unique, la durée, la destination fixée au lien et le droit relu ; test qu'un ticket
    ne sert que sa destination (un autre `path` n'est jamais pris en compte) ;
  - *ouvert* — débit : aucun rate limiting (hors périmètre) ; les refus 1 à 3 ne coûtent ni
    lecture du corps ni requête en base.

## Implémentation

### Migrations prévues

`packages/plateforme/migrations/<horodatage>_upload_tickets.sql`, additive :
- table `platform.upload_tickets` : `id uuid`, `org_id uuid not null` (références `orgs`),
  `user_id uuid not null`, `ctx text`, `token_hash text not null unique`, `kind text not null`
  (check `html`, `md`, `csv`), `mode text not null` (check `create`, `replace`, `merge`),
  `target_path text not null`, `title text`, `summary text`, `key text`, `base_revision integer`,
  `publish boolean not null default false`, `expires_at timestamptz not null`,
  `used_at timestamptz`, `created_at timestamptz not null default now()` ;
- index sur `(org_id, expires_at)` pour le ménage ;
- RLS activée, policies d'isolation par organisation (`member_orgs()`), comme les autres tables ;
- fonction `platform.consume_upload_ticket(p_org uuid, p_hash text)`, `security definer`,
  `search_path` fixé, `grant execute` à `anon` seul : l'`update` conditionnel d'AC5, et rend
  `user_id`, l'e-mail de `members` (null si la personne n'est plus membre), `ctx`, `kind`, `mode`,
  `target_path`, `title`, `summary`, `key`, `base_revision`, `publish`. Elle ne lit que la ligne de
  cette empreinte dans cette organisation.

### Schémas Zod

- `packages/plateforme/schemas/uploads.ts` : `uploadLinkSchema` (entrée d'`upload.link`, strict,
  `mode` et `publish` contraints par `kind`), `UPLOAD_TOKEN_PATTERN`, `UPLOAD_BYTES_MAX`
  (1 048 576), `UPLOAD_TTL_MINUTES` (15). Exportés par `schemas/index.ts` (fichier d'ajout).

### Fichiers à créer, par face

- `migrations/` : le fichier ci-dessus.
- `schemas/uploads.ts`.
- `server/uploads.ts` : `createUploadTicket` (contrôles d'AC1, jeton, ménage), `consumeUpload`
  (AC5 à AC8), commandes rendues (AC2). Le jeton s'écrit en une ligne ici
  (`randomBytes(32).toString("base64url")`) : `newToken` de `server/shares.ts` n'est pas exporté et
  `node_shares` garde son jeton en clair.
- `server/catalog/upload-link.ts` : `defineFunction` d'`upload.link` (connecteur `upload`, classe
  `write`, origine `paquet`, exemples, refus).
- `api/uploads.ts` : `isUploadRoute`, `uploadResponse` (AC4, lecture bornée du corps, réponse en
  texte brut), sur le modèle d'`api/public.ts`.
- Tests : `tests/unit/uploads.test.ts`, `tests/integration/upload-tickets.test.ts`,
  `tests/integration/upload-link-mcp.test.ts`.

### Fichiers à modifier

- `api/handler.ts` : une ligne après celle de `isPublicRoute`,
  `if (isUploadRoute(...)) return await uploadResponse(request, options.host, ...)`. Ajout seul.
- `server/catalog/registry.ts` : `upload.link` dans `catalogFunctions()`.
- `server/catalog/contracts.ts` : la phrase d'AC2 dans le contrat de `write`.
- `server/index.ts` : export de ce que les tests appellent (fichier d'ajout).
- `scripts/lib/org-transfer.mjs` : `NEVER_EXPORTED.push('upload_tickets')`, avec son commentaire.
- `tests/integration/isolation/donnees.ts` : `seedRows` insère un ticket dans B.
- `tests/integration/isolation/tables.test.ts` : `CREATION.upload_tickets` pose un `token_hash`
  neuf (la colonne est unique) ; `user_id` est déjà dans `AUTHORS`.
- Hôte : aucun changement. `src/app/api/plateforme/[...route]/route.ts` exporte déjà `POST` et
  passe `accessToken` nul sans cookie ; `src/middleware.ts` laisse `/api` public.

### Points de départ

- `packages/plateforme/api/public.ts` et `server/shares.ts` l. 203 (`readPublicNode`) : on reprend
  la porte avant le jeton, l'organisation de l'adresse et la fonction `security definer` sous
  `anon` ; on retire la lecture seule et la réponse JSON.
- Banc et Oto : aucun. Ni la maquette (`C:\apps\mcp-test\src\proto\`) ni Oto n'ont de dépôt par
  lien.

### Patterns à suivre

- `security-patterns.md § Droits dans le service` : le ticket prouve qui et où ; le droit se relit
  à l'envoi.
- `security-patterns.md § CSRF Protection` : un Route Handler vérifie l'origine lui-même ; ici,
  toute `Origin` est refusée.
- `security-patterns.md § Idempotence et mutations concurrentes` : consommation par un `update`
  conditionnel, `conflict` et `stale_revision` précédés de leur `console.error`.
- `uploads-patterns.md § Validation` : contrôle côté serveur, aucun HTML servi en retour.
- `mcp-patterns.md § 4` : refus bornés, en anglais, qui disent quoi faire ensuite.

## Rayon d'impact

### Appelants
- Portes sans session : `rg -n "isPublicRoute|accessToken" C:/apps/oto-platform/packages/plateforme/api`
  → `api/handler.ts` l. 254-257 (seule `GET public/<jeton>` passe avant le jeton) et `api/public.ts`.
  La route d'envoi s'ajoute au même endroit, sans rien ouvrir d'autre.
- Création d'un client de base : `rg -n "createPlatformDb\(" C:/apps/oto-platform/packages/plateforme --glob "!**/*.test.ts"`
  → `api/handler.ts` l. 261, `mcp/handler.ts` l. 57, `mcp/admin/handler.ts` l. 41 : toujours sur un
  appelant vérifié. `server/uploads.ts` sera le premier à le bâtir sur une ligne en base (ADR-018).
- Services d'écriture réutilisés, non modifiés : `server/nodes/write.ts` (`writeNode`),
  `server/nodes/publish.ts`, le service de la page artefact (E10-S03), `server/tables/import.ts`
  (créé par E10-S01).
- Catalogue : `rg -n "catalogFunctions\(\)" C:/apps/oto-platform/packages/plateforme` → la
  recherche de `find`, le contrat servi par `read` et la description de `call` voient une fonction
  de plus.
- Ménage : `rg -n "purgeTrash" C:/apps/oto-platform/packages/plateforme/server` → la purge ne tourne
  qu'avec `trashNode` et `listTrash` ; les tickets ne s'y rattachent pas (AC3).

### Doublons
- Jeton aléatoire : `rg -n "randomBytes\(32\)" C:/apps/oto-platform/packages/plateforme` →
  `server/shares.ts` l. 36, fonction privée, jeton gardé en clair. Verdict : laisser ; une ligne
  écrite dans `uploads.ts`, avec l'empreinte en plus.
- Envoi de fichiers : E10-S02 envoie des octets au stockage S3 par URL présignée. Ici, le contenu
  est du texte qui devient des blocs ou des lignes, et ne va jamais au stockage. Verdict : laisser
  les deux.

### Effet produit
- Schéma : Ⓜ, une table et une fonction.
- MCP : une fonction au catalogue de `call`, liste d'outils inchangée ; le contrat de `write` gagne
  une phrase.
- Sécurité : une porte sans session, bornée par le ticket (AC11, ADR-018).
- Transfert et isolation : `NEVER_EXPORTED`, suite d'isolation.
- Journal : des lignes `api` qui portent un `ctx` ; la vue d'une conversation par `ctx` (E03-S08)
  les montre.

### Refacto
- Écarté : exporter `newToken` de `server/shares.ts` dans un module commun. Une ligne ; le jeton
  des liens publics est gardé en clair, celui-ci en empreinte.
- Écarté : une commande CLI du paquet avec connexion OAuth de l'appareil (option B de D117).

## Hypothèses

- **HN-E10S05-1** : nom `upload.link`, connecteur `upload` (source : simple ; `table.*` fixe la
  forme `<espace>.<verbe>`).
- **HN-E10S05-2** : 15 minutes, un envoi, 1 Mo (sous la coupure de Vercel à 4,5 Mo,
  `uploads-patterns.md § La limite de 1 Mo décide de l'architecture`) (source : simple).
- **HN-E10S05-3** : l'envoi est journalisé sous le `ctx` du ticket, même après la fin de la
  conversation (source : H04 et journal d'E03-S01).
- **HN-E10S05-4** : un `.md` envoyé est lu en mode tolérant, avec « N éléments conservés en
  texte » ; `write` reste strict (source : décision du pilote C2).
- **HN-E10S05-5** : `csv` en `create` ou `merge` seulement ; `publish` facultatif ;
  `base_revision` exigée pour `replace` et `merge` ; requête avec `Origin` refusée ; organisation
  de l'adresse égale à celle du ticket ; consommation dans sa propre transaction ; tickets expirés
  supprimés à chaque `upload.link` (source : décision du pilote C10).
- **HN-E10S05-6** : classe `write`, pas `sensitive` : le dépôt ne publie qu'avec `publish` et le
  droit de publier, et `replace` passe par un brouillon (source : `catalog/define.ts` l. 12,
  « sensitive : envoie, supprime ou paie »).
- **HN-E10S05-7** : un CSV en tableau nouveau exige la gestion du dossier, sinon `forbidden` avec à
  qui s'adresser (source : décision du pilote C9, fiche D120 ouverte).
- **HN-E10S05-8** : les refus 1 à 4 d'AC4 ne consomment pas le ticket, pour qu'un fichier trop
  gros se corrige sans nouveau lien (source : simple).
- **HN-E10S05-9** : une page reçoit la provenance `agent` avec le `ctx` du ticket, un tableau la
  provenance `import` d'E10-S01 (source : ADR-011 § 2, décision du pilote C10).
- **HN-E10S05-10** : `upload.link` n'est pas admis dans un bloc `call` de procédure : son
  `checkArgs` rend « upload.link is called by an assistant, not by a procedure » (source : simple ;
  le lien n'a de sens que dans une conversation qui a un shell).

## Actions JB

- Aucune action externe. ADR-018 est écrit par le pilote avant le code.

## Tests attendus

### Unit tests (`tests/unit/uploads.test.ts`)
- [ ] Jeton : 43 caractères base64url ; empreinte SHA-256 ; le jeton n'est ni dans la ligne insérée
  ni dans les arguments journalisés.
- [ ] Commandes rendues (bash, PowerShell) pour un nom de fichier avec espaces et apostrophe.
- [ ] `uploadLinkSchema` : `mode` selon `kind` (`csv replace` refusé), `title` et `summary` exigés
  pour `create`, `base_revision` exigée pour `replace` et `merge`.
- [ ] Porte (AC4) : `Origin` → `forbidden` ; jeton mal formé → `not_found` ; `Content-Length`
  trop grand → `too_large` ; corps coupé sans `Content-Length` → `too_large` ; aucune requête en
  base dans ces quatre cas (espion).
- [ ] Contenu (AC7) : BOM retiré, CRLF normalisé, UTF-8 invalide, corps vide.

### Integration tests (`tests/integration/upload-tickets.test.ts`, données jetables)
- [ ] `upload.link` : refus immédiats (droit d'écrire, droit de publier, chemin pris, chemin absent,
  genre, révision), ticket créé, tickets expirés de plus de 24 h supprimés.
- [ ] Envoi : `html` (création, remplacement), `md` (création, remplacement, éléments conservés en
  texte), `csv` (création, fusion), publication avec `publish: true`, brouillon sinon.
- [ ] `not_found` identique pour un ticket servi, expiré, inconnu, et d'une autre organisation.
- [ ] Deux envois simultanés du même jeton : un seul passe.
- [ ] Écriture refusée (CSV invalide) : ticket servi quand même.
- [ ] Droit retiré entre le lien et l'envoi (`forbidden`), membre retiré (`not_member`), chemin pris
  (`conflict`), révision changée (`stale_revision`).
- [ ] Limites : `html` au-delà de `HTML_MAX`, `md` au-delà de `PAGE_MAX`, `csv` au-delà de 5 000
  lignes : `too_large`.
- [ ] Réponse : texte brut, `Content-Type: text/plain`, en-têtes `no-store` et `noindex`.
- [ ] Journal : les deux lignes sous le même `ctx`, sans jeton.
- [ ] Isolation : ligne dans A et dans B (suite d'isolation), `NEVER_EXPORTED`, RLS.

### MCP (`tests/integration/upload-link-mcp.test.ts`, `InMemoryTransport`, `tests/helpers/mcp.ts`)
- [ ] `find` trouve `upload.link` ; `read` sert son contrat ; `call upload.link` rend l'adresse,
  l'expiration, les deux commandes et la phrase d'AC2 à l'identique dans le texte et dans
  `structuredContent`.
- [ ] Refus d'AC1 servis en anglais, avec `isError`, texte comparé mot pour mot.
- [ ] La liste des outils reste de six.

### Golden queries (écrites par le pilote dans `docs/mcp-golden-queries.md`)
- [ ] « Range le rapport que tu viens de générer dans ventes/rapports » (Claude Code) →
  `upload.link` puis `curl`.
- [ ] Cas négatif : la même demande dans Claude ou ChatGPT dans le navigateur, sans shell →
  pas d'`upload.link` ; ` ```html-artifact ` par `write` pour un petit fichier, sinon le dépôt à
  l'écran.

### E2E tests
- [ ] Par le banc MCP : `call upload.link`, puis `curl` d'un rapport HTML de 150 ko, puis `read` de
  la page artefact.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
