// `read {path: "journal"}` (E05-S05, AC9 à AC13, FR-OBS-03) : les conversations des 24 dernières
// heures ou des 7 derniers jours, ou les appels d'une conversation, rendus pour le modèle en anglais,
// heures en UTC explicite (HN-E05S05-3). Même texte en `text` et en `structuredContent`, données en
// champs, sous le plafond de 45 000 caractères, la suite par curseur (H26). La lecture passe par
// `journal-read.ts`, donc par la même portée que l'écran (H74). Sans ce module, le modèle ne peut pas
// dire à la personne ce qu'il a fait pour elle, ni pourquoi un appel a échoué. `admin_journal` (E08-S06)
// y lit la coupe d'une page, les champs d'une conversation et d'un appel, et le texte d'un appel masqué
// (M18a) : une seule version de chacun.
import { CTX_PATTERN, journalSectionSchema, type ConversationSummary, type JournalCall, type JournalSection, type ReadNodeInput } from "../schemas"
import { JOURNAL_PATH, JOURNAL_ROWS_SCANNED } from "../schemas/journal"
import type { PlatformDb } from "./db"
import { boundedList, PlatformError } from "./errors"
import type { Identity } from "./identity"
import { journalScope, readConversation, readConversations, type ConversationList, type ConversationRead } from "./journal-read"
import { formatCount } from "./nodes/document"
import { plural } from "./nodes/op-kit"
import { callArguments } from "./nodes/read-body"
import { MAX_DATA_CHARS, MAX_RESULT_CHARS, type ToolOutput } from "./tool-output"

const PERIODS = { today: { days: 1, label: "last 24 hours" }, week: { days: 7, label: "last 7 days" } } as const

const SECTIONS = "Sections: today, week, or a conversation code (XXXX-XXXX)."

function unknownSection(section: string): PlatformError {
  return new PlatformError("not_found", `Unknown section «${section}» in journal. ${SECTIONS}`)
}

function staleCursor(section: string): PlatformError {
  return new PlatformError("invalid_arguments", `This cursor no longer matches journal ${section}: read again without cursor.`)
}

/** La section demandée : `today` sans section (AC9) ; un code se lit sans casse, comme la garde `ctx` (HN-E05S05-21). */
function sectionOf(raw: string | undefined): JournalSection {
  const text = raw?.trim() || "today"
  const code = text.toUpperCase()
  const parsed = journalSectionSchema.safeParse(CTX_PATTERN.test(code) ? code : text.toLowerCase())
  if (!parsed.success) throw unknownSection(text)
  return parsed.data
}

/** « 2,000 calls », « 1 error » : le nombre et le mot comme `read` les écrit (`formatCount`, `plural`). */
const counted = (count: number, word: string) => `${formatCount(count)} ${plural(count, word)}`

/** Une ligne du texte : un saut de ligne d'une phrase ou d'une erreur n'en fait pas une seconde. */
const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, " ")

/** La portée dite au modèle (AC9) ; les équipes menées, 20 au plus (`boundedList`, `mcp-patterns.md § 4`). */
function scopeLine(identity: Identity): string {
  const scope = journalScope(identity)
  if (scope.kind === "org") return `Scope: every call of ${identity.org.name}.`
  if (scope.ledTeams.length === 0) return "Scope: your own calls."
  const names = scope.ledTeams.map((team) => team.name)
  return `Scope: your calls and the calls of ${names.length === 1 ? "team" : "teams"} ${boundedList(names)}.`
}

/** « 2026-09-23T14:02:07.000Z » : l'instant en UTC, que le texte découpe. */
const utc = (iso: string) => new Date(iso).toISOString()

function routing(summary: ConversationSummary): string[] {
  if (!summary.context) return []
  if (summary.procedurePath) return [`procedure ${summary.procedurePath}`]
  return summary.request ? [`request « ${oneLine(summary.request)} »`] : ["no request"]
}

/** « Claire Morel · claude-ai@0.1.0 · started 2026-09-23 14:02 UTC · last 14:09 UTC · … · 9 calls · 1 error » */
function summaryText(summary: ConversationSummary): string {
  const started = utc(summary.startedAt)
  const last = utc(summary.lastAt)
  const lastText = last.slice(0, 10) === started.slice(0, 10) ? last.slice(11, 16) : `${last.slice(0, 10)} ${last.slice(11, 16)}`
  return [
    summary.userName ?? "removed person",
    summary.host ?? "unknown host",
    `started ${started.slice(0, 10)} ${started.slice(11, 16)} UTC`,
    `last ${lastText} UTC`,
    ...routing(summary),
    counted(summary.calls, "call"),
    counted(summary.errors, "error"),
  ].join(" · ")
}

/** Les champs d'une conversation servis au modèle, par `read journal` et par `admin_journal`. */
export function summaryData(summary: ConversationSummary): Record<string, unknown> {
  const { ctx, userName, host, startedAt, lastAt, procedurePath, request, calls, errors } = summary
  return { ctx, person: userName, host, started_at: startedAt, last_at: lastAt, procedure: procedurePath, request, calls, errors }
}

const duration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

/** Ce qui remplace les arguments d'un appel sur l'espace personnel d'autrui, pour qui n'en est pas l'auteur (D44) ; `admin_journal` le sert aussi. */
export const HIDDEN_ARGS = "args not shown: call on another person's personal space"

/** « 3. 14:03:40 call table.write · team Ventes · 120 ms · ERROR invalid_arguments: … », puis ses arguments (AC10) ou `HIDDEN_ARGS`. */
function callLines(call: JournalCall): string[] {
  const line = [
    `${call.rank}. ${utc(call.ts).slice(11, 19)} ${call.tool}${call.target ? ` ${oneLine(call.target)}` : ""}`,
    ...(call.teamName ? [`team ${call.teamName}`] : []),
    ...(call.accountLabel ? [`account ${call.accountLabel}`] : []),
    ...(call.durationMs === null ? [] : [duration(call.durationMs)]),
    call.isError ? `ERROR${call.error ? ` ${oneLine(call.error)}` : ""}` : "OK",
  ].join(" · ")
  if (!call.isError) return [line]
  return [line, `   ${call.hidden ? HIDDEN_ARGS : `args ${JSON.stringify(call.args)}`}`]
}

/** Les champs d'un appel servis au modèle, sans son rang : `read journal` le met en tête, `admin_journal` ne le sert pas. */
export function callData(call: JournalCall): Record<string, unknown> {
  const { ts, tool, target, teamName, accountLabel, durationMs, isError, error, args, hidden } = call
  const data = { at: ts, tool, target, team: teamName, account: accountLabel, duration_ms: durationMs, is_error: isError, error, args }
  return hidden ? { ...data, args_hidden: true } : data
}

/** Un élément d'une page : ses lignes et ses données. */
export type PagePiece = { lines: string[]; data: Record<string, unknown> }

/** Une page : ses lignes de tête et de fin, ses données communes, le champ de ses éléments et ses suites. */
export type PageFrame = {
  head: string[]
  tail: string[]
  data: Record<string, unknown>
  items: string
  nextActions: string[]
  /** Le curseur de la suite quand `count` éléments sont servis ; `null` : rien ne suit. */
  cursorFor: (count: number) => string | null
  /** La dernière ligne quand un curseur suit : comment lire la suite. */
  continueLine: (cursor: string) => string
}

/** La suite d'une section du journal : « Continue with acme_read {…, "cursor": "…"}. » (AC11). */
function continueWith(prefix: string, section: string): (cursor: string) => string {
  return (cursor) => `Continue with ${prefix}_read ${callArguments({ path: JOURNAL_PATH, section, cursor })}.`
}

function assemble(frame: PageFrame, pieces: readonly PagePiece[], count: number): { text: string; data: Record<string, unknown>; cursor: string | null } {
  const shown = pieces.slice(0, count)
  const cursor = frame.cursorFor(count)
  const lines = [...frame.head, ...shown.flatMap((piece) => piece.lines), ...frame.tail, ...(cursor ? [frame.continueLine(cursor)] : [])]
  return { text: lines.join("\n"), data: { ...frame.data, [frame.items]: shown.map((piece) => piece.data), next_cursor: cursor }, cursor }
}

function fits(result: { text: string; data: Record<string, unknown> }, nextActions: string[]): boolean {
  if (JSON.stringify(result.data).length > MAX_DATA_CHARS) return false
  return JSON.stringify({ ...result.data, text: result.text, next_actions: nextActions }).length <= MAX_RESULT_CHARS
}

/**
 * Les éléments qui tiennent sous le plafond, texte et données comptés ensemble (H26) : tous s'ils
 * tiennent, sinon le plus grand nombre qui tient, coupé à la ligne, avec la consigne de suite (AC11).
 * `admin_journal` y coupe aussi ses pages, sa suite dite par `next_cursor`.
 */
export function fittedPage(frame: PageFrame, pieces: readonly PagePiece[]) {
  let count = pieces.length
  if (count > 1 && !fits(assemble(frame, pieces, count), frame.nextActions)) {
    let [low, high] = [1, count - 1]
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (fits(assemble(frame, pieces, middle), frame.nextActions)) low = middle
      else high = middle - 1
    }
    count = low
  }
  return assemble(frame, pieces, count)
}

/** La page servie par `read journal`, sa cible au journal et, coupée, la consigne de suite que dit le formateur. */
function served(frame: PageFrame, pieces: PagePiece[]): ToolOutput {
  const result = fittedPage(frame, pieces)
  const base = { text: result.text, data: result.data, nextActions: frame.nextActions, target: JOURNAL_PATH, teamId: null }
  return result.cursor ? { ...base, continuation: frame.continueLine(result.cursor) } : base
}

function listOutput(identity: Identity, section: "today" | "week", list: ConversationList): ToolOutput {
  const { page, rank, cursorAt } = list
  const prefix = identity.org.prefix
  const label = PERIODS[section].label
  const title = [`# Journal — ${label}`, scopeLine(identity)]
  const totals =
    page.total === 0
      ? [`No conversation in the ${label}.`]
      : [`${counted(page.total, "conversation")}, ${counted(page.calls, "call")}, ${formatCount(page.withErrors)} with errors. Most recent first.`]
  const truncated = page.truncated ? [`More than ${formatCount(JOURNAL_ROWS_SCANNED)} calls in this period: only the most recent are grouped here.`] : []
  const pieces = page.conversations.map((summary) => ({ lines: [`- ${summary.ctx} · ${summaryText(summary)}`], data: summaryData(summary) }))
  return served(
    {
      head: [...title, ...totals, ...truncated],
      tail: page.total === 0 ? [] : [`Read a conversation with ${prefix}_read ${callArguments({ path: JOURNAL_PATH, section: "<code>" })}.`],
      data: { section, scope: journalScope(identity).kind, total: page.total, calls: page.calls, with_errors: page.withErrors, truncated: page.truncated },
      items: "conversations",
      nextActions: page.total === 0 ? [] : [`${prefix}_read`],
      cursorFor: (count) => (count < pieces.length ? cursorAt(rank + count) : page.nextCursor),
      continueLine: continueWith(prefix, section),
    },
    pieces,
  )
}

function conversationOutput(identity: Identity, code: string, read: ConversationRead): ToolOutput {
  const { detail, cursorAfter } = read
  const pieces = detail.calls.map((call) => ({ lines: callLines(call), data: { rank: call.rank, ...callData(call) } }))
  return served(
    {
      head: [`# Conversation ${code}`, summaryText(detail.summary)],
      tail: [],
      data: { conversation: summaryData(detail.summary) },
      items: "calls",
      nextActions: [],
      cursorFor: (count) => (count < pieces.length ? cursorAfter(detail.calls[count - 1].id) : detail.nextCursor),
      continueLine: continueWith(identity.org.prefix, code),
    },
    pieces,
  )
}

/** Ce que `read journal` sert : une liste de conversations, ou les appels d'une conversation. */
export type ServedJournal =
  | { kind: "list"; section: "today" | "week"; list: ConversationList }
  | { kind: "conversation"; section: string; read: ConversationRead }

/** Le texte et les données servis au modèle pour une section du journal (AC9, AC10, AC11). */
export function renderJournalForModel(identity: Identity, journal: ServedJournal): ToolOutput {
  return journal.kind === "list" ? listOutput(identity, journal.section, journal.list) : conversationOutput(identity, journal.section, journal.read)
}

/**
 * La branche `journal` de `read` (AC9 à AC11) : le journal n'a ni révision ni brouillon ; une section
 * inconnue, ou une conversation hors de la portée de l'appelant, répond le même `not_found` (H68).
 */
export async function readJournal(db: PlatformDb, identity: Identity, input: ReadNodeInput): Promise<ToolOutput> {
  if (input.since_revision !== undefined || input.draft !== undefined) throw new PlatformError("invalid_arguments", "journal has no revisions or drafts.")
  const section = sectionOf(input.section)
  if (section === "today" || section === "week") {
    const list = await readConversations(db, identity, { periodDays: PERIODS[section].days, cursor: input.cursor })
    if (list.page.restarted) throw staleCursor(section)
    return renderJournalForModel(identity, { kind: "list", section, list })
  }
  const read = await readConversation(db, identity, section, { cursor: input.cursor })
  if (!read) throw unknownSection(section)
  if (read.restarted) throw staleCursor(section)
  return renderJournalForModel(identity, { kind: "conversation", section, read })
}
