// Lecture du journal (E05-S05, FR-OBS-02, FR-OBS-03) : les conversations que l'appelant voit,
// regroupées par code `ctx`, et les appels d'une conversation. La portée (H74) est décidée ici, avant
// la requête, et posée dans chaque requête avec l'organisation de l'adresse et les filtres demandés
// (H123, `security-patterns.md § Droits dans le service`) : la RLS, réduite à l'isolation par E01-S08,
// ne décide plus rien. Sans ce module, le journal s'écrit (E03-S01) mais ne se lit nulle part. Un appel
// sur l'espace personnel d'une autre personne ne livre, à qui n'en est pas l'auteur, que son outil, son
// heure, son issue, son code d'erreur et sa cible coupée à `private/<handle>` (D44, M14 ; D107), décidé ici ; le
// message d'erreur d'un autre appel y nomme un tel espace sans le chemin dessous (D52, M14b).
//
// Repris d'Oto (`oto_mcp/capabilities/audit_log.py` l. 59-111, 201-236) : le curseur opaque qui porte
// la fenêtre gelée, refusé s'il vient d'une autre lecture, et « une pièce qui ne dit pas si elle est
// complète n'atteste de rien » (`truncated`). Retiré : `run_id`, la portée « org du run », l'export REST.
import { CTX_PATTERN, NODE_PATH_PATTERN, type ConversationDetail, type ConversationSummary, type JournalCall, type JournalPage } from "../schemas"
import { JOURNAL_REQUEST_CHARS, JOURNAL_ROWS_SCANNED } from "../schemas/journal"
import { ACCESS_LEVELS, accountLevels, isOrgAdmin, leadsTeam, nodeLevels } from "./access"
import type { PlatformDb } from "./db"
import { memberDirectory } from "./directory"
import { inTransaction } from "./errors"
import type { Identity } from "./identity"
import { cut } from "./journal"
import { bareTool, displayArgs, displayError, errorCode, errorFor, groupConversations, hidesContent, journalReader, targetFor, type ConversationGroup, type JournalRow } from "./journal-rows"
import { fingerprint } from "./nodes/read-format"
import type { Tx } from "./sql"

export const CONVERSATIONS_PER_PAGE = 50
export const CALLS_PER_PAGE = 200

const DAY_MS = 86_400_000

/** Qui voit quelles lignes (H74) : toute l'organisation, ou les siennes et celles des équipes qu'on mène. */
export type JournalScope = { kind: "org" } | { kind: "own"; userId: string; ledTeams: { id: string; name: string }[] }

export function journalScope(identity: Identity): JournalScope {
  if (isOrgAdmin(identity)) return { kind: "org" }
  const ledTeams = identity.teams.filter((team) => leadsTeam(identity, team.id)).map(({ id, name }) => ({ id, name }))
  return { kind: "own", userId: identity.user.id, ledTeams }
}

/**
 * La portée, posée dans la requête (AC5) après l'organisation : rien de plus pour toute
 * l'organisation, sinon la personne, ou la personne et les équipes qu'elle mène.
 */
export function inScope(sql: Tx, scope: JournalScope) {
  if (scope.kind === "org") return sql``
  const teamIds = scope.ledTeams.map((team) => team.id)
  if (teamIds.length === 0) return sql`and j.user_id = ${scope.userId}`
  return sql`and (j.user_id = ${scope.userId} or j.team_id = any(${teamIds}))`
}

/**
 * Une ligne de la liste (`j`), telle que PostgREST la rendait : passée par `to_json` dans la requête qui
 * porte l'ordre, `ts` en texte ISO à la microseconde, `id` en nombre (postgres.js rendrait une `Date`
 * et une chaîne).
 */
function listRow(sql: Tx) {
  return sql`(select to_json(r) from (select j.id, j.ts, j.user_id, j.team_id, j.ctx, j.tool, j.target, j.is_error, j.host, j.user_agent) r)`
}

/** Les lignes telles que l'appelant les voit, avant le regroupement : cible sur l'espace personnel d'autrui coupée (D44). */
function seenBy(identity: Identity, rows: JournalRow[]): JournalRow[] {
  const reader = journalReader(identity)
  return rows.map((row) => (row.target === null ? row : { ...row, target: targetFor(reader, row.user_id, row.target) }))
}

/** La fenêtre d'une liste : depuis `since`, jusqu'à `maxId`, gelé à la première page (AC6). */
type Window = { since: string; maxId: number | null }

type ScanRequest = { window: Window; teamId?: string; userId?: string }

/**
 * Les 2 000 lignes les plus récentes de la fenêtre, et si la période en compte davantage : une
 * requête, bornée à une ligne de plus, sans page (la face SQL n'a pas la coupe de PostgREST).
 */
async function scanWindow(db: PlatformDb, identity: Identity, request: ScanRequest): Promise<{ rows: JournalRow[]; truncated: boolean }> {
  const { window } = request
  const scope = journalScope(identity)
  const read = await inTransaction(db, "journal: rows", (sql) => sql<{ row: JournalRow }[]>`
    select ${listRow(sql)} as row
    from platform.journal j
    where j.org_id = ${identity.org.id} ${inScope(sql, scope)}
      and j.ts >= ${new Date(window.since)} and j.ctx is not null
      ${request.teamId ? sql`and j.team_id = ${request.teamId}` : sql``}
      ${request.userId ? sql`and j.user_id = ${request.userId}` : sql``}
      ${window.maxId === null ? sql`` : sql`and j.id <= ${window.maxId}`}
    order by j.id desc
    limit ${JOURNAL_ROWS_SCANNED + 1}`)
  const rows = seenBy(identity, read.map(({ row }) => row))
  return { rows: rows.slice(0, JOURNAL_ROWS_SCANNED), truncated: rows.length > JOURNAL_ROWS_SCANNED }
}

/** Les procédures que l'appelant lit parmi les cibles de `context` (HN-E05S05-4), en une lecture, niveaux en un lot. */
async function readableProcedures(db: PlatformDb, identity: Identity, targets: string[]): Promise<Set<string>> {
  const paths = [...new Set(targets.filter((target) => NODE_PATH_PATTERN.test(target)))]
  const found: readonly { id: string; path: string }[] =
    paths.length === 0
      ? []
      : await inTransaction(db, "journal: procedures", (sql) => sql<{ id: string; path: string }[]>`
        select n.id, n.path from platform.nodes n
        where n.org_id = ${identity.org.id} and n.kind = 'procedure' and n.path = any(${paths})`)
  const levels = await nodeLevels(db, identity, found.map((node) => node.id))
  return new Set(found.filter((node) => (levels.get(node.id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read).map((node) => node.path))
}

function summaryOf(group: ConversationGroup, names: Map<string, string>, procedures: ReadonlySet<string>): ConversationSummary {
  const target = group.contextTarget ?? null
  const served = target !== null && procedures.has(target)
  // Coupée ici une fois, pour l'écran comme pour le modèle (AC3, AC9).
  const request = served || target === null ? null : cut(target, JOURNAL_REQUEST_CHARS)
  return {
    ctx: group.ctx,
    startedAt: group.startedAt,
    lastAt: group.lastAt,
    userId: group.userId,
    userName: group.userId ? (names.get(group.userId) ?? null) : null,
    host: group.host,
    context: group.contextTarget !== undefined,
    procedurePath: served ? target : null,
    request,
    calls: group.calls,
    errors: group.errors,
  }
}

/** Les conversations montrées : noms par `member_directory`, procédure servie si l'appelant la lit (AC3). */
async function summaries(db: PlatformDb, identity: Identity, groups: ConversationGroup[]): Promise<ConversationSummary[]> {
  if (groups.length === 0) return []
  const targets = groups.flatMap((group) => (group.contextTarget ? [group.contextTarget] : []))
  const [directory, procedures] = await Promise.all([memberDirectory(db, identity.org.id), readableProcedures(db, identity, targets)])
  const names = new Map(directory.map((person) => [person.userId, person.name]))
  return groups.map((group) => summaryOf(group, names, procedures))
}

// ------------------------------------------------------------------------------------ Curseurs

/** Un jeton opaque : base64url d'un tableau JSON court ; il ne porte aucune donnée du journal. */
function token(parts: unknown[]): string {
  return Buffer.from(JSON.stringify(parts)).toString("base64url")
}

function partsOf(value: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    // Un jeton illisible est traité comme un jeton d'une autre lecture : la liste repart du début.
    return null
  }
}

const isRank = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0

/** La lecture d'où vient un curseur : organisation, personne, période et filtres (AC6). */
function listKey(identity: Identity, filters: ConversationFilters): string {
  const { periodDays, teamId, userId, errorsOnly } = filters
  return fingerprint(JSON.stringify(["list", identity.org.id, identity.user.id, periodDays, teamId ?? null, userId ?? null, errorsOnly === true]))
}

type ListCursor = Window & { rank: number }

function decodeListCursor(value: string, key: string): ListCursor | null {
  const parts = partsOf(value)
  if (!parts || parts.length !== 4) return null
  const [readKey, since, maxId, rank] = parts
  if (readKey !== key || typeof since !== "string" || Number.isNaN(Date.parse(since))) return null
  if (!(maxId === null || isRank(maxId)) || !isRank(rank)) return null
  return { since, maxId, rank }
}

function callsKey(identity: Identity, code: string): string {
  return fingerprint(JSON.stringify(["calls", identity.org.id, identity.user.id, code]))
}

function decodeCallsCursor(value: string, key: string): number | null {
  const parts = partsOf(value)
  if (!parts || parts.length !== 2 || parts[0] !== key) return null
  return isRank(parts[1]) ? parts[1] : null
}

// ------------------------------------------------------------------------------------ Liste

/** Filtres d'une liste (AC4) ; `periodDays` : 1 pour `today`, 7, 30 ou 90 à l'écran. */
export type ConversationFilters = { periodDays: number; teamId?: string; userId?: string; errorsOnly?: boolean; cursor?: string }

/** Une page de conversations, son rang, et un curseur à tout rang de la même fenêtre (`read journal`). */
export type ConversationList = { page: JournalPage; rank: number; cursorAt: (rank: number) => string }

/**
 * Les conversations de la portée sur la période (AC3 à AC6) : 2 000 lignes au plus regroupées par
 * `ctx`, 50 conversations à partir du rang du curseur. Un curseur porte sa fenêtre (depuis, jusqu'à
 * l'id le plus récent lu à la première page) : la page suivante relit les mêmes lignes, sans doublon
 * ni perte même si des appels arrivent entre-temps. Un curseur illisible, ou d'une autre lecture,
 * fait repartir la liste du début (`restarted`).
 */
export async function readConversations(db: PlatformDb, identity: Identity, filters: ConversationFilters): Promise<ConversationList> {
  const key = listKey(identity, filters)
  const cursor = filters.cursor === undefined ? null : decodeListCursor(filters.cursor, key)
  const window: Window = cursor ?? { since: new Date(Date.now() - filters.periodDays * DAY_MS).toISOString(), maxId: null }
  const scan = await scanWindow(db, identity, { window, teamId: filters.teamId, userId: filters.userId })
  const groups = groupConversations(scan.rows, identity.org.prefix).filter((group) => !filters.errorsOnly || group.errors > 0)
  const valid = cursor !== null && cursor.rank < groups.length
  const rank = valid ? cursor.rank : 0
  const shown = groups.slice(rank, rank + CONVERSATIONS_PER_PAGE)
  const frozen: Window = { since: window.since, maxId: window.maxId ?? scan.rows[0]?.id ?? null }
  const cursorAt = (at: number) => token([key, frozen.since, frozen.maxId, at])
  const end = rank + shown.length
  const page: JournalPage = {
    conversations: await summaries(db, identity, shown),
    total: groups.length,
    calls: groups.reduce((sum, group) => sum + group.calls, 0),
    withErrors: groups.filter((group) => group.errors > 0).length,
    truncated: scan.truncated,
    restarted: filters.cursor !== undefined && !valid,
    nextCursor: end < groups.length ? cursorAt(end) : null,
  }
  return { page, rank, cursorAt }
}

export async function listConversations(db: PlatformDb, identity: Identity, filters: ConversationFilters): Promise<JournalPage> {
  return (await readConversations(db, identity, filters)).page
}

// ------------------------------------------------------------------------------------ Détail

/** Toutes les lignes de la conversation dans la portée, sans les arguments, dans l'ordre d'écriture : une requête. */
async function conversationRows(db: PlatformDb, identity: Identity, code: string): Promise<JournalRow[]> {
  const scope = journalScope(identity)
  const read = await inTransaction(db, "journal: rows", (sql) => sql<{ row: JournalRow }[]>`
    select ${listRow(sql)} as row
    from platform.journal j
    where j.org_id = ${identity.org.id} ${inScope(sql, scope)} and j.ctx = ${code}
    order by j.id`)
  return seenBy(identity, read.map(({ row }) => row))
}

type CallDetail = { id: number; account_id: string | null; error: string | null; duration_ms: number | null; args: unknown }

/** Erreur, durée, compte et arguments des lignes de la page, lues par leurs ids (déjà dans la portée), en une lecture. */
async function callDetails(db: PlatformDb, identity: Identity, ids: number[]): Promise<Map<number, CallDetail>> {
  if (ids.length === 0) return new Map()
  const rows = await inTransaction(db, "journal: calls", (sql) => sql<{ row: CallDetail }[]>`
    select (select to_json(r) from (select j.id, j.account_id, j.error, j.duration_ms, j.args) r) as row
    from platform.journal j
    where j.org_id = ${identity.org.id} and j.id = any(${ids})`)
  return new Map(rows.map(({ row }) => [row.id, row]))
}

async function teamNames(db: PlatformDb, identity: Identity, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await inTransaction(db, "journal: teams", (sql) => sql<{ id: string; name: string }[]>`
    select t.id, t.name from platform.teams t where t.org_id = ${identity.org.id} and t.id = any(${ids})`)
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** Le libellé des comptes que l'appelant lit (niveau ≥ 1, `accountLevels`) ; les autres restent sans nom, et ne sont pas lus. */
async function accountLabels(db: PlatformDb, identity: Identity, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  const levels = unique.length > 0 ? await accountLevels(db, identity, unique) : new Map()
  const readable = unique.filter((id) => (levels.get(id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read)
  if (readable.length === 0) return new Map()
  const rows = await inTransaction(db, "journal: accounts", (sql) => sql<{ id: string; label: string }[]>`
    select a.id, a.label from platform.accounts a where a.org_id = ${identity.org.id} and a.id = any(${readable})`)
  return new Map(rows.map((row) => [row.id, row.label]))
}

async function callsOf(db: PlatformDb, identity: Identity, request: { page: JournalRow[]; start: number }): Promise<JournalCall[]> {
  const { page } = request
  const details = await callDetails(db, identity, page.map((row) => row.id))
  const teamIds = [...new Set(page.flatMap((row) => (row.team_id ? [row.team_id] : [])))]
  const accountIds = [...details.values()].flatMap((row) => (row.account_id ? [row.account_id] : []))
  const [teams, accounts] = await Promise.all([teamNames(db, identity, teamIds), accountLabels(db, identity, accountIds)])
  const reader = journalReader(identity)
  return page.map((row, index) => {
    const detail = details.get(row.id)
    const call: JournalCall = {
      id: row.id,
      rank: request.start + index + 1,
      ts: row.ts,
      tool: bareTool(row.tool, identity.org.prefix),
      target: row.target,
      teamName: row.team_id ? (teams.get(row.team_id) ?? null) : null,
      accountLabel: detail?.account_id ? (accounts.get(detail.account_id) ?? null) : null,
      durationMs: detail?.duration_ms ?? null,
      isError: row.is_error,
      error: displayError(errorFor(reader, row.user_id, detail?.error ?? null)),
      args: displayArgs(detail?.args ?? null),
    }
    // Sur l'espace personnel d'autrui, restent l'outil, l'heure, l'issue et le code d'erreur (D44).
    return hidesContent(reader, row, detail?.args ?? null) ? { ...call, error: errorCode(detail?.error ?? null), args: null, hidden: true } : call
  })
}

/** Le détail d'une conversation, et un curseur après tout appel (`read journal`). */
export type ConversationRead = { detail: ConversationDetail; restarted: boolean; cursorAfter: (callId: number) => string }

/**
 * Une conversation de la portée (AC7, AC10) : son résumé, puis 200 appels à partir du curseur, dans
 * l'ordre d'écriture. `null` pour un code mal formé, inconnu ou hors de la portée : une seule réponse
 * pour les trois (H68). Un curseur illisible, ou d'une autre conversation, repart du premier appel.
 */
export async function readConversation(db: PlatformDb, identity: Identity, code: string, options: { cursor?: string } = {}): Promise<ConversationRead | null> {
  if (!CTX_PATTERN.test(code)) return null
  const rows = await conversationRows(db, identity, code)
  if (rows.length === 0) return null
  const key = callsKey(identity, code)
  const after = options.cursor === undefined ? null : decodeCallsCursor(options.cursor, key)
  const found = after === null ? -1 : rows.findIndex((row) => row.id > after)
  const start = Math.max(found, 0)
  const page = rows.slice(start, start + CALLS_PER_PAGE)
  const [summary, calls] = await Promise.all([summaries(db, identity, groupConversations(rows, identity.org.prefix)), callsOf(db, identity, { page, start })])
  const cursorAfter = (callId: number) => token([key, callId])
  const more = start + page.length < rows.length
  return {
    detail: { summary: summary[0], calls, nextCursor: more ? cursorAfter(page[page.length - 1].id) : null },
    restarted: options.cursor !== undefined && found < 0,
    cursorAfter,
  }
}

export async function getConversation(db: PlatformDb, identity: Identity, code: string, options: { cursor?: string } = {}): Promise<ConversationDetail | null> {
  return (await readConversation(db, identity, code, options))?.detail ?? null
}
