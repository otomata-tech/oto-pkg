// Aides communes des tests d'intégration sur le projet Supabase d'oto-platform (H120, P2, P28) :
// organisations et personnes jetables, reconnaissables (`t<hex>`, `test-<hex>@example.invalid`),
// nettoyées après chaque passage. Les lignes de `platform` par la connexion d'administration
// (`platformSeeds`, E01-S10 f2) ; les comptes et les sessions par Supabase Auth (`createFixtures`), ou des
// personnes sans compte pour les suites portables (`createSqlFixtures`, `tests/helpers/sql.ts`, M47). La clé
// secrète et la connexion d'administration ne servent qu'aux tests, jamais au paquet ni à l'hôte.
import { randomBytes, randomInt } from "crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { BlockInput } from "../../packages/plateforme/schemas"
import type { Json } from "../../packages/plateforme/server/database"
import { accountCopy } from "../../scripts/lib/account-copy.mjs"
import { platformAdminSql, type AdminSql } from "./admin-sql"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

export const supabaseConfigured = Boolean(url && anonKey && secretKey)

/** Raison du saut, sans aucune valeur. */
export const SKIP_REASON =
  "skipped: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SECRET_KEY in .env.local"

const CTX_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

export const hex = (bytes: number) => randomBytes(bytes).toString("hex")

export function ctxCode(): string {
  const chars = Array.from({ length: 8 }, () => CTX_ALPHABET[randomInt(CTX_ALPHABET.length)])
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`
}

/** Une lecture ou une écriture de mise en place, à la clé secrète : lève sur une erreur ou sans données. */
export async function must<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await query
  if (error || data === null || data === undefined) throw new Error(`${what} failed: ${error?.message ?? "no data"}`)
  return data
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false }

/** L'API d'administration de Supabase Auth (comptes, liens de connexion), à la clé secrète, sans schéma. */
export function authAdminClient(): SupabaseClient {
  return createClient(url ?? "", secretKey ?? "", { auth: NO_SESSION })
}

/** Les méthodes de Supabase Auth d'une session ouverte par `signIn` ou `sessionFor` (consentement OAuth). */
export type SessionAuth = SupabaseClient["auth"]

export type TestUser = { id: string; email: string; password: string }
export type TestOrg = { id: string; slug: string; prefix: string; name: string }

/** Racine `guide`, dossier `private` et Contexte de Tout le monde d'une organisation (E01-S04). */
export type TestTree = { root: string; private: string; contexte: string }

export type NodeOptions = {
  parentId: string
  path: string
  kind?: "page" | "procedure" | "context" | "table"
  title?: string
  summary?: string
  ownerKind?: "org" | "team" | "user"
  ownerTeamId?: string
  ownerUserId?: string
  status?: "draft" | "published"
  revision?: number
}

export type RuleLevel = "none" | "read" | "write" | "manage"

/** Une règle vise un nœud ou un compte, pour une équipe ou une personne (H82). */
export type RuleInput = {
  orgId: string
  nodeId?: string
  accountId?: string
  teamId?: string
  userId?: string
  level: RuleLevel
}

export type AccountInput = {
  connector?: string
  ownerKind: "org" | "team" | "user"
  ownerTeamId?: string
  ownerUserId?: string
  label: string
  mode?: "reel" | "sandbox" | "simule"
}

/** En-tête en attente et liens d'une publication (E01-S06) ; `links[].block` : rang du bloc dans `blocks`. */
export type PublishOptions = {
  title?: string
  summary?: string
  kind?: "page" | "procedure"
  meta?: Json
  links?: { block: number; path: string; key?: string }[]
}

/**
 * Une ligne de journal d'un appel d'outil (E04-S01) : `tool` complet (`<préfixe>_read`), `target`
 * (chemin ou phrase) ; `ctx` : un autre code que celui du `ctx` semé ; `error` : ligne en erreur.
 */
export type JournalLineInput = { tool: string; target: string | null; ctx?: string; error?: boolean }

/** Une ligne de tableau (bloc `row` publié) ; `claim` : le bail d'une file de travail. */
export type RowInput = {
  key: string
  data: Json
  provenance?: Json
  revision?: number
  claim?: { worker: string; userId: string; until: string }
}

/**
 * Un nœud semé par `seedNodes` (contrat d'E03-S02, N20) : publié par défaut (`published: false` le
 * laisse jamais publié), avec ses blocs ; `meta` et `rows` pour un tableau seulement.
 */
export type SeedNode = {
  path: string
  kind: "page" | "procedure" | "context" | "table"
  title: string
  summary: string
  ownerTeamId?: string
  published?: boolean
  blocks?: BlockInput[]
  meta?: Json
  rows?: { key: string; data: Json }[]
}

export const REFERENCE_PEOPLE = ["ada", "claire", "lea", "paul", "marc"] as const
export type ReferencePerson = (typeof REFERENCE_PEOPLE)[number]

/** Noms et handles de l'organisation O des AC d'E01-S04 (noms fictifs). */
const REFERENCE_NAMES: Record<ReferencePerson, string> = {
  ada: "Ada Martin",
  claire: "Claire Morel",
  lea: "Léa Roux",
  paul: "Paul Girard",
  marc: "Marc Petit",
}

/**
 * L'organisation O des AC d'E01-S04 : « Acme Test », Ada admin, Ventes (responsable Claire, Léa
 * membre), Support (responsable Paul), Marc sans équipe ; `ventes/devis`, `ventes/devis/modele`,
 * `support/faq`. L'arbre est posé d'abord : dossiers d'équipe, espaces personnels et Contextes
 * naissent par déclencheur (P39). `Person` : une personne de `createFixtures` (un compte de Supabase Auth), ou de
 * `createSqlFixtures` (sans compte).
 */
export type ReferenceOrg<Person extends { id: string } = TestUser> = {
  org: TestOrg
  host: string
  people: Record<ReferencePerson, Person & { handle: string; name: string }>
  teams: { ventes: string; support: string }
  nodes: {
    root: string
    private: string
    contexte: string
    ventes: string
    ventesContexte: string
    devis: string
    modele: string
    support: string
    supportContexte: string
    faq: string
  }
  /** `private/<handle>` de chaque personne. */
  spaces: Record<ReferencePerson, string>
}

/** L'email et le nom d'une personne, tels que l'outillage les copie dans `members` et `platform_staff`. */
export type AccountCopy = { email: string | null; name: string | null }

/**
 * Les lignes jetables de `platform`, écrites et relues par la connexion d'administration `sql` (E01-S10 f2 :
 * `platform` n'est plus servi par le Data API) : ce que `createFixtures` et `createSqlFixtures` partagent (M47),
 * seules leurs personnes diffèrent. `accountOf` : l'email et le nom d'une personne (E01-S09, AC15 : sans clé
 * vers `auth.users`, la base ne copie plus le compte dans `members` ni dans `platform_staff`, l'outillage les
 * passe). `removeRows` supprime ce que la graine a posé, sans fermer `sql`.
 */
export function platformSeeds(sql: AdminSql, accountOf: (userId: string) => Promise<AccountCopy> | AccountCopy) {
  const orgIds: string[] = []
  /** Une valeur `jsonb` : `sql.json`, jamais `JSON.stringify` (`supabase-patterns.md § Couplage à Supabase`). */
  const json = (value: unknown) => sql.json(JSON.parse(JSON.stringify(value ?? null)))

  async function createOrg(options: { hosts?: string[]; settings?: unknown; name?: string } = {}): Promise<TestOrg> {
    const suffix = hex(4)
    const settings = options.settings === undefined ? {} : { settings: json(options.settings) }
    const [org] = await sql<TestOrg[]>`
      insert into platform.orgs ${sql({ name: options.name ?? `test_${suffix}`, slug: `t${suffix}`, prefix: `t${suffix}`, ...settings })}
      returning id, slug, prefix, name`
    orgIds.push(org.id)
    for (const host of options.hosts ?? []) await sql`insert into platform.org_domains (host, org_id) values (${host}, ${org.id})`
    return { ...org }
  }

  async function addMember(
    orgId: string,
    userId: string,
    options: { role?: "admin" | "member"; profile?: unknown } = {},
  ): Promise<void> {
    const { email, name } = await accountOf(userId)
    await sql`
      insert into platform.members (org_id, user_id, role, profile, email, name)
      values (${orgId}, ${userId}, ${options.role ?? "member"}, ${json(options.profile ?? {})}, ${email}, ${name})`
  }

  /** Une équipe ; `leadUserId` y entre au rôle `lead` (`team_members.role`, seule source depuis E05-S13). */
  async function createTeam(
    orgId: string,
    options: { slug?: string; name?: string; leadUserId?: string } = {},
  ): Promise<{ id: string; slug: string; name: string }> {
    const slug = options.slug ?? `team-${hex(3)}`
    const [team] = await sql<{ id: string; slug: string; name: string }[]>`
      insert into platform.teams (org_id, slug, name)
      values (${orgId}, ${slug}, ${options.name ?? slug})
      returning id, slug, name`
    if (options.leadUserId) await sql`insert into platform.team_members (team_id, user_id, role) values (${team.id}, ${options.leadUserId}, 'lead')`
    return { ...team }
  }

  // Idempotente : le responsable posé par `createTeam` ou `setLead` y est déjà, et garde son rôle.
  async function addTeamMember(teamId: string, userId: string, role: "lead" | "member" = "member"): Promise<void> {
    await sql`insert into platform.team_members (team_id, user_id, role) values (${teamId}, ${userId}, ${role}) on conflict (team_id, user_id) do nothing`
  }

  /** Une organisation créée hors de `createOrg` (par `create_org`), supprimée par `cleanup()`. */
  function trackOrg(orgId: string): void {
    orgIds.push(orgId)
  }

  async function createNode(orgId: string, options: NodeOptions): Promise<string> {
    const [node] = await sql<{ id: string }[]>`
      insert into platform.nodes (org_id, parent_id, path, kind, title, summary, owner_kind, owner_team_id, owner_user_id, status, revision)
      values (${orgId}, ${options.parentId}, ${options.path}, ${options.kind ?? "page"}, ${options.title ?? options.path},
              ${options.summary ?? `Test node ${options.path}.`}, ${options.ownerKind ?? null}, ${options.ownerTeamId ?? null},
              ${options.ownerUserId ?? null}, ${options.status ?? "draft"}, ${options.revision ?? 0})
      returning id`
    return node.id
  }

  /** Racine `guide` (organisation), `private` et `contexte` : ce que pose `create_org`. */
  async function createTree(orgId: string): Promise<TestTree> {
    const [root] = await sql<{ id: string }[]>`
      insert into platform.nodes (org_id, parent_id, path, title, summary, owner_kind)
      values (${orgId}, null, 'guide', 'Guide', 'Test root.', 'org') returning id`
    const privateFolder = await createNode(orgId, { parentId: root.id, path: "private", title: "Espaces personnels" })
    const contexte = await createNode(orgId, { parentId: root.id, path: "contexte", title: "Contexte" })
    return { root: root.id, private: privateFolder, contexte }
  }

  async function addRule(rule: RuleInput): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      insert into platform.access_rules (org_id, node_id, account_id, subject_team_id, subject_user_id, level)
      values (${rule.orgId}, ${rule.nodeId ?? null}, ${rule.accountId ?? null}, ${rule.teamId ?? null}, ${rule.userId ?? null}, ${rule.level})
      returning id`
    return row.id
  }

  async function createAccount(orgId: string, account: AccountInput): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      insert into platform.accounts (org_id, connector, owner_kind, owner_team_id, owner_user_id, label, mode)
      values (${orgId}, ${account.connector ?? "mail"}, ${account.ownerKind}, ${account.ownerTeamId ?? null}, ${account.ownerUserId ?? null},
              ${account.label}, ${account.mode ?? "simule"})
      returning id`
    return row.id
  }

  /** Le seul responsable de l'équipe (`team_members.role`, E05-S13), qui y entre au besoin ; `null` : aucun. */
  async function setLead(teamId: string, userId: string | null): Promise<void> {
    await sql`update platform.team_members set role = 'member' where team_id = ${teamId} and role = 'lead'`
    if (userId) {
      await sql`insert into platform.team_members (team_id, user_id, role) values (${teamId}, ${userId}, 'lead')
                on conflict (team_id, user_id) do update set role = 'lead'`
    }
  }

  /** Inscrit la personne dans l'équipe plateforme (outillage seulement, jamais l'API). */
  async function makeStaff(userId: string): Promise<void> {
    const { email, name } = await accountOf(userId)
    await sql`insert into platform.platform_staff (user_id, email, name) values (${userId}, ${email}, ${name})`
  }

  async function grantPlatformAccess(orgId: string, userId: string, grantedBy: string | null): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      insert into platform.platform_grants (org_id, user_id, granted_by) values (${orgId}, ${userId}, ${grantedBy}) returning id`
    return row.id
  }

  async function nodeId(orgId: string, path: string): Promise<string> {
    const [node] = await sql<{ id: string }[]>`select id from platform.nodes where org_id = ${orgId} and path = ${path}`
    if (!node) throw new Error(`node ${path} not found`)
    return node.id
  }

  /**
   * Le brouillon d'un nœud rempli de `blocks` (étapes communes de `publishBlocks` et `draftBlocks`) :
   * `open_draft`, brouillon vidé, blocs `draft` aux positions 1 024 × rang, en-tête en attente. Rend la
   * révision de départ du brouillon et les ids des blocs, dans l'ordre. Mêmes colonnes pour chaque bloc :
   * `sql(rows)` prend celles de la première ligne (`supabase-patterns.md § Couplage à Supabase`).
   */
  async function fillDraft(node: string, blocks: BlockInput[], header: Record<string, unknown>): Promise<{ baseRevision: number; blockIds: string[] }> {
    const [draft] = await sql<{ base_revision: number }[]>`select base_revision from platform.open_draft(${node})`
    if (!draft) throw new Error("open_draft failed: no draft")
    await sql`delete from platform.blocks where node_id = ${node} and state = 'draft'`
    let blockIds: string[] = []
    if (blocks.length > 0) {
      const rows = blocks.map((block, index) => ({
        node_id: node,
        state: "draft",
        position: 1024 * (index + 1),
        type: block.type,
        text: block.text ?? null,
        data: json(block.data ?? {}),
        key: block.key ?? null,
      }))
      const inserted = await sql<{ id: string; position: number }[]>`insert into platform.blocks ${sql(rows)} returning id, position`
      blockIds = [...inserted].sort((a, b) => a.position - b.position).map((row) => row.id)
    }
    const pending = Object.entries(header).filter(([, value]) => value !== undefined)
    if (pending.length > 0) {
      const values = Object.fromEntries(pending.map(([column, value]) => [column, column === "meta" ? json(value) : value]))
      await sql`update platform.node_drafts set ${sql(values)} where node_id = ${node}`
    }
    return { baseRevision: draft.base_revision, blockIds }
  }

  /**
   * Publie exactement `blocks` sur un nœud (E01-S06, N25) : `open_draft`, brouillon vidé, blocs
   * insérés aux positions 1 024 × rang, en-tête en attente, puis `publish_node` à la révision de
   * départ du brouillon, avec les liens. Rend la révision publiée et les ids des blocs, dans l'ordre.
   */
  async function publishBlocks(
    node: string,
    blocks: BlockInput[],
    options: PublishOptions = {},
  ): Promise<{ revision: number; blockIds: string[] }> {
    const { links, ...header } = options
    const { baseRevision, blockIds } = await fillDraft(node, blocks, header)
    const pLinks = links?.map(({ block, path, key }) => ({ block_id: blockIds[block], path, ...(key === undefined ? {} : { key }) }))
    // Arguments nommés, comme l'appel RPC : seule la surcharge sans `p_draft_stamp` les accepte tous.
    const [published] = await sql<{ revision: number }[]>`
      select platform.publish_node(p_node => ${node}, p_base_revision => ${baseRevision}, p_links => ${pLinks === undefined ? null : json(pLinks)}::jsonb) as revision`
    return { revision: published.revision, blockIds }
  }

  /**
   * Un brouillon ouvert sur un nœud, sans le publier (E03-S03 ; forme demandée par E03-S06) : les
   * étapes de `publishBlocks` jusqu'à `publish_node` exclu — `open_draft`, brouillon vidé, blocs `draft`
   * aux positions 1 024 × rang, en-tête en attente. Rend les ids des blocs, dans l'ordre.
   */
  async function draftBlocks(
    node: string,
    blocks: BlockInput[],
    header: { title?: string; summary?: string; kind?: "page" | "procedure" } = {},
  ): Promise<string[]> {
    return (await fillDraft(node, blocks, header)).blockIds
  }

  /** Lignes publiées d'un tableau, insérées d'un coup (E01-S06, N25) ; rend leurs ids dans l'ordre de `rows`. */
  async function addRows(tableId: string, rows: RowInput[]): Promise<string[]> {
    const values = rows.map((row) => ({
      node_id: tableId,
      state: "published",
      type: "row",
      key: row.key,
      data: json(row.data),
      provenance: json(row.provenance ?? {}),
      revision: row.revision ?? 1,
      claimed_by: row.claim?.worker ?? null,
      claimed_by_user: row.claim?.userId ?? null,
      lease_until: row.claim?.until ?? null,
    }))
    const inserted = await sql<{ id: string; key: string }[]>`insert into platform.blocks ${sql(values)} returning id, key`
    return rows.map((row) => {
      const found = inserted.find((written) => written.key === row.key)
      if (!found) throw new Error(`row ${row.key} not returned`)
      return found.id
    })
  }

  /** Activation d'un connecteur pour l'organisation (E01-S06, H81). */
  async function addActivation(orgId: string, connector = "mail", state: "active" | "inactive" = "active"): Promise<void> {
    await sql`insert into platform.connector_activations (org_id, connector, state) values (${orgId}, ${connector}, ${state})`
  }

  /** `orgs.rules_version` (H28 amendé : + 1 à chaque publication d'un nœud Contexte). */
  async function rulesVersion(orgId: string): Promise<number> {
    const [org] = await sql<{ rules_version: number }[]>`select rules_version from platform.orgs where id = ${orgId}`
    if (!org) throw new Error("rules_version read failed: no org")
    return org.rules_version
  }

  type Placed = { id: string; team: string | null }
  type PlacedRow = { id: string; parent_id: string | null; path: string; owner_kind: string | null; owner_team_id: string | null }

  /** Chaque nœud de l'organisation par chemin, avec son équipe propriétaire effective (H52). */
  async function placedNodes(orgId: string): Promise<{ placed: Map<string, Placed>; rootPath: string }> {
    const data = await sql<PlacedRow[]>`select id, parent_id, path, owner_kind, owner_team_id from platform.nodes where org_id = ${orgId}`
    const byId = new Map(data.map((node) => [node.id, node]))
    const teamOf = (id: string | null): string | null => {
      const node = id ? byId.get(id) : undefined
      if (!node) return null
      if (node.owner_kind === null) return teamOf(node.parent_id)
      return node.owner_kind === "team" ? node.owner_team_id : null
    }
    const root = data.find((node) => node.parent_id === null)
    if (!root) throw new Error("seedNodes: the tree is not set (createTree first)")
    return { placed: new Map(data.map((node) => [node.path, { id: node.id, team: teamOf(node.id) }])), rootPath: root.path }
  }

  /**
   * Sème des nœuds (contrat d'E03-S02, N20) dans une organisation dont l'arbre est posé
   * (`createTree`), avant ses équipes et ses membres : dossiers d'équipe et Contextes naissent par
   * déclencheur (P39). Par profondeur croissante : un nœud déjà là est gardé et reçoit ses blocs ; un
   * parent absent est créé en page, propriétaire l'équipe du premier enfant qui la nomme ; un enfant de
   * la même équipe que son parent hérite (propriétaire nul, H52), sinon il porte son équipe. Publié :
   * `publishBlocks` (révision 1 ; `kind` passé pour une page ou une procédure seulement), puis
   * `addRows` pour un tableau ; sinon `createNode` seul. Rend l'id de chaque chemin semé ou créé.
   */
  async function seedNodes(orgId: string, nodes: SeedNode[]): Promise<Map<string, string>> {
    const { placed, rootPath } = await placedNodes(orgId)
    const depth = (path: string) => path.split("/").length
    const sorted = [...nodes].sort((a, b) => depth(a.path) - depth(b.path))
    const ids = new Map<string, string>()
    const parentPath = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : rootPath)

    async function place(path: string, kind: SeedNode["kind"], header: { title?: string; summary?: string }, team: string | null) {
      const known = placed.get(path)
      if (known) return known
      const parent = await placeParent(parentPath(path))
      const own = team !== null && team !== parent.team ? team : null
      const owner = own ? { ownerKind: "team" as const, ownerTeamId: own } : {}
      const id = await createNode(orgId, { parentId: parent.id, path, kind, ...header, ...owner })
      const node = { id, team: own ?? parent.team }
      placed.set(path, node)
      ids.set(path, id)
      return node
    }

    function placeParent(path: string): Promise<Placed> {
      const named = sorted.find((node) => node.ownerTeamId && node.path.startsWith(`${path}/`))
      return place(path, "page", {}, named?.ownerTeamId ?? null)
    }

    for (const node of sorted) {
      const { id } = await place(node.path, node.kind, { title: node.title, summary: node.summary }, node.ownerTeamId ?? null)
      ids.set(node.path, id)
      if (node.published === false) continue
      const kind = node.kind === "page" || node.kind === "procedure" ? { kind: node.kind } : {}
      const meta = node.meta === undefined ? {} : { meta: node.meta }
      await publishBlocks(id, node.blocks ?? [], { title: node.title, summary: node.summary, ...kind, ...meta })
      if (node.rows?.length) await addRows(id, node.rows)
    }
    return ids
  }

  /**
   * Un `ctx` de la personne et ses lignes de journal (E04-S01, dernière procédure du `ctx`), datées
   * d'une seconde en une seconde dans l'ordre de `lines` : la dernière est la plus récente. Rend le
   * code du `ctx` semé.
   */
  async function seedCtxJournal(org: { id: string }, user: { id: string }, lines: JournalLineInput[]): Promise<string> {
    const code = ctxCode()
    // `contexts` vide : aucun Contexte gardé, le code n'est jamais périmé (E11-S03).
    await sql`insert into platform.ctx (code, org_id, user_id, rules_version, contexts) values (${code}, ${org.id}, ${user.id}, ${await rulesVersion(org.id)}, ${sql.json({})})`
    if (lines.length === 0) return code
    const start = Date.now() - lines.length * 1000
    const rows = lines.map((line, index) => ({
      ts: new Date(start + index * 1000),
      org_id: org.id,
      user_id: user.id,
      ctx: line.ctx ?? code,
      method: "tools/call",
      tool: line.tool,
      target: line.target,
      is_error: line.error ?? false,
      error: line.error ? "not_found: Unknown path." : null,
    }))
    await sql`insert into platform.journal ${sql(rows)}`
    return code
  }

  /**
   * L'organisation O des AC d'E01-S04 (`ReferenceOrg`) sur les personnes `people` déjà créées ; les mêmes
   * personnes d'une O déjà construite font une seconde organisation (sessions de Supabase Auth limitées par
   * adresse IP).
   */
  async function referenceOrgOf<Person extends { id: string }>(people: ReferenceOrg<Person>["people"]): Promise<ReferenceOrg<Person>> {
    const host = `t${hex(4)}.example.invalid`
    const org = await createOrg({ name: "Acme Test", hosts: [host] })
    const tree = await createTree(org.id)
    const ventes = (await createTeam(org.id, { slug: "ventes", name: "Ventes", leadUserId: people.claire.id })).id
    const support = (await createTeam(org.id, { slug: "support", name: "Support", leadUserId: people.paul.id })).id
    for (const person of REFERENCE_PEOPLE) {
      const { handle, name, id } = people[person]
      await addMember(org.id, id, { role: person === "ada" ? "admin" : "member", profile: { handle, name } })
    }
    await addTeamMember(ventes, people.lea.id)
    const folders = { ventes: await nodeId(org.id, "ventes"), support: await nodeId(org.id, "support") }
    const devis = await createNode(org.id, { parentId: folders.ventes, path: "ventes/devis", title: "Devis" })
    const spaces: ReferenceOrg["spaces"] = {
      ada: await nodeId(org.id, "private/ada"),
      claire: await nodeId(org.id, "private/claire"),
      lea: await nodeId(org.id, "private/lea"),
      paul: await nodeId(org.id, "private/paul"),
      marc: await nodeId(org.id, "private/marc"),
    }
    return {
      org,
      host,
      people,
      teams: { ventes, support },
      nodes: {
        ...tree,
        ventes: folders.ventes,
        ventesContexte: await nodeId(org.id, "ventes/contexte"),
        devis,
        modele: await createNode(org.id, { parentId: devis, path: "ventes/devis/modele", title: "Modèle" }),
        support: folders.support,
        supportContexte: await nodeId(org.id, "support/contexte"),
        faq: await createNode(org.id, { parentId: folders.support, path: "support/faq", title: "FAQ" }),
      },
      spaces,
    }
  }

  // Journal admin et équipe plateforme des personnes du test d'abord (le journal admin survit à
  // l'organisation), puis organisations (cascade : arbre, règles, accès), puis chaque personne oubliée de
  // `platform` (`forget_user`, ce que faisaient les clés vers `auth.users` avant E01-S09). Chaque étape
  // manquée est notée dans `failures`, et le ménage continue.
  async function removeRows(userIds: readonly string[], failures: string[]): Promise<void> {
    if (userIds.length > 0) {
      await step("admin_journal delete", () => sql`delete from platform.admin_journal where user_id in ${sql(userIds)}`, failures)
      await step("platform_staff delete", () => sql`delete from platform.platform_staff where user_id in ${sql(userIds)}`, failures)
    }
    if (orgIds.length > 0) await step("orgs delete", () => sql`delete from platform.orgs where id in ${sql(orgIds)}`, failures)
    for (const id of userIds) await step("forget_user", () => sql`select platform.forget_user(${id})`, failures)
  }

  return {
    createOrg,
    addMember,
    createTeam,
    addTeamMember,
    trackOrg,
    createTree,
    createNode,
    addRule,
    createAccount,
    setLead,
    makeStaff,
    grantPlatformAccess,
    nodeId,
    publishBlocks,
    draftBlocks,
    addRows,
    addActivation,
    rulesVersion,
    seedNodes,
    seedCtxJournal,
    referenceOrgOf,
    removeRows,
  }
}

/** Une étape du ménage : son échec est noté, et le ménage continue. */
export async function step(what: string, run: () => Promise<unknown>, failures: string[]): Promise<void> {
  try {
    await run()
  } catch (error) {
    failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Les cinq personnes de l'organisation O, chacune créée par `createUser` avec son nom (noms fictifs). */
export async function referencePeople<Person>(
  createUser: (options: { fullName: string }) => Promise<Person>,
): Promise<Record<ReferencePerson, Person & { handle: string; name: string }>> {
  const person = async (handle: ReferencePerson) => ({ ...(await createUser({ fullName: REFERENCE_NAMES[handle] })), handle, name: REFERENCE_NAMES[handle] })
  return { ada: await person("ada"), claire: await person("claire"), lea: await person("lea"), paul: await person("paul"), marc: await person("marc") }
}

/**
 * Fabrique de données jetables, les personnes avec un compte de Supabase Auth. Chaque ressource est
 * enregistrée à sa création : `cleanup()` (en `afterAll`, même après un échec) supprime les organisations
 * (cascade), puis les personnes, et lève une erreur qui liste ce qui n'a pas pu l'être. Les lignes de
 * `platform` par `platformSeeds` (`sql`, la connexion d'administration) ; les comptes, par l'API
 * d'administration de Supabase Auth (`auth`, clé secrète, sans schéma).
 */
export function createFixtures() {
  const sql = platformAdminSql()
  const auth = authAdminClient()
  const userIds: string[] = []
  const accounts = new Map<string, AccountCopy>()

  /** L'email (minuscules) et le nom d'un compte : ceux de `createUser`, sinon lus dans Supabase Auth. */
  async function accountOf(userId: string): Promise<AccountCopy> {
    const known = accounts.get(userId)
    if (known) return known
    const { data, error } = await auth.auth.admin.getUserById(userId)
    if (error || !data.user) throw new Error(`getUserById failed: ${error?.message}`)
    const account = accountCopy(data.user)
    accounts.set(userId, account)
    return account
  }

  const { referenceOrgOf, removeRows, ...seeds } = platformSeeds(sql, accountOf)

  // Email toujours vérifié : Supabase refuse la connexion d'un email non vérifié. `email` : une
  // adresse jetable choisie par le test (deux adresses au même handle, E01-S04 AC26).
  async function createUser(options: { fullName?: string; email?: string } = {}): Promise<TestUser> {
    const email = options.email ?? `test-${hex(6)}@example.invalid`
    const password = randomBytes(24).toString("base64url")
    const { data, error } = await auth.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: options.fullName ? { full_name: options.fullName } : undefined,
    })
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
    userIds.push(data.user.id)
    accounts.set(data.user.id, accountCopy(data.user))
    return { id: data.user.id, email, password }
  }

  /** Client à la clé publique, sans session ni schéma : la session d'une personne, rien de `platform`. */
  const sessionClient = () => createClient(url ?? "", anonKey ?? "", { auth: NO_SESSION })

  async function signIn(email: string, password: string): Promise<{ auth: SessionAuth; accessToken: string }> {
    const client = sessionClient()
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session) throw new Error(`signInWithPassword failed: ${error?.message}`)
    return { auth: client.auth, accessToken: data.session.access_token }
  }

  /**
   * Même session qu'une connexion par mot de passe, obtenue par un lien de connexion généré à la
   * clé secrète (aucun email ne part) puis vérifié à la clé publique. Supabase Auth limite les
   * connexions par adresse IP (« sign-ins », mesuré le 2026-09-24 : la suite d'E02-S01 l'atteint
   * seule) ; la vérification d'un lien a son propre quota. Les tests d'E01-S04 passent par ici.
   */
  async function sessionFor(user: { email: string }): Promise<{ auth: SessionAuth; accessToken: string }> {
    const link = await auth.auth.admin.generateLink({ type: "magiclink", email: user.email })
    const tokenHash = link.data.properties?.hashed_token
    if (link.error || !tokenHash) throw new Error(`generateLink failed: ${link.error?.message}`)
    const client = sessionClient()
    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" })
    if (error || !data.session) throw new Error(`verifyOtp failed: ${error?.message}`)
    return { auth: client.auth, accessToken: data.session.access_token }
  }

  /**
   * L'organisation O ; `existing` : les personnes d'une organisation O déjà construite, pour une seconde
   * organisation jetable avec les mêmes sessions (Supabase Auth limite les sessions ouvertes par adresse IP).
   */
  async function buildReferenceOrg(existing?: ReferenceOrg["people"]): Promise<ReferenceOrg> {
    return referenceOrgOf(existing ?? (await referencePeople(createUser)))
  }

  // Les lignes de `platform` (`removeRows`), puis chaque compte supprimé ; enfin la connexion d'administration.
  async function cleanup(): Promise<void> {
    const failures: string[] = []
    await removeRows(userIds, failures)
    for (const id of userIds) {
      const { error } = await auth.auth.admin.deleteUser(id)
      if (error) failures.push(`deleteUser: ${error.message}`)
    }
    await step("admin connection end", () => sql.end({ timeout: 5 }), failures)
    if (failures.length > 0) throw new Error(`cleanup incomplete: ${failures.join("; ")}`)
  }

  return { sql, auth, createUser, signIn, sessionFor, ...seeds, buildReferenceOrg, cleanup }
}

export type Fixtures = ReturnType<typeof createFixtures>
