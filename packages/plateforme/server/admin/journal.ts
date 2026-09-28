// Journal du MCP admin, lu par `admin_journal admin_log` (E08-S06, AC16 ; N7) : les lignes
// d'`admin_journal` de toute l'équipe plateforme, servies au seul membre de l'équipe plateforme, décidé
// ici (`requireStaff`, E08-S02) avant la lecture, jamais « ce que la RLS laisse passer » (H123). 50 lignes
// par page, les plus récentes d'abord, curseur `(ts, id)` ; les arguments, pour une session (`code`)
// seulement, montrés comme au journal des utilisateurs (`displayArgs`, masquage d'E03-S01) ; une ligne
// d'un autre membre sur l'espace personnel d'autrui, comme ce journal la sert (fiche D44, M14). Sans ce
// module, `admin_journal` s'écrit sans que personne le lise.
//
// Repris d'Oto (`oto_mcp/capabilities/audit_log.py` l. 134-201) : le curseur opaque rendu tel quel, la
// portée exacte d'une organisation (les lignes émises sous elle) ; retiré : `run_id`, l'export S3.
//
// Face SQL (E01-S10, lot d2) : la page en une requête (`inTransaction`, `members.ts`), chaque ligne passée
// par `to_json` comme PostgREST la rendait ; l'instant du curseur repasse en texte converti dans la
// requête (`supabase-patterns.md § Couplage à Supabase (ADR-012)`).
import { CTX_PATTERN, type JournalArgs } from "../../schemas"
import type { Json } from "../database"
import type { PlatformDb } from "../db"
import { inTransaction } from "../errors"
import { INSTANT } from "../feedback"
import { displayArgs, errorCode, errorFor, hidesContent, targetFor, type JournalReader } from "../journal-rows"
import { requireStaff, staffDirectory, type StaffCaller } from "./context"
import { listOrgs } from "./orgs"

/** Lignes par page (N7). */
const ADMIN_LOG_PAGE = 50

const DAY_MS = 86_400_000

/** Une ligne d'`admin_journal` telle que `to_json` la rend : `id` en nombre, `ts` en texte à la microseconde. */
type LogRow = {
  id: number
  ts: string
  user_id: string | null
  method: string
  ctx: string | null
  tool: string | null
  op: string | null
  org_id: string | null
  target: string | null
  is_error: boolean
  error: string | null
  duration_ms: number | null
  args: Json | null
}

/** `orgId`, `userId` : l'organisation et la personne déjà résolues par la porte ; `days` : la fenêtre. */
export type AdminLogFilters = { orgId?: string; userId?: string; days: number; code?: string; cursor?: string }

export type AdminLogEntry = {
  id: number
  ts: string
  /** `null` : la personne n'est plus de l'équipe plateforme. */
  email: string | null
  method: string
  tool: string | null
  op: string | null
  ctx: string | null
  orgId: string | null
  /** Le slug de l'organisation, quand l'appelant y agit (`listOrgs` : membre, ou accès en cours). */
  org: string | null
  target: string | null
  isError: boolean
  error: string | null
  durationMs: number | null
  /** Les arguments masqués puis coupés, pour une session (`code`) seulement. */
  args?: JournalArgs
  /**
   * Ligne d'un autre membre de l'équipe plateforme sur l'espace personnel d'autrui (fiche D44, M14) :
   * cible coupée à `private/<handle>` (`perso/<handle>` pour une ligne d'avant D107), erreur réduite à son code, arguments nuls ; absent sinon.
   */
  hidden?: boolean
}

/** Une page, sa suite, et un curseur après toute ligne servie : la porte coupe sous le plafond de 45 000 caractères. */
export type AdminLogPage = { entries: AdminLogEntry[]; nextCursor: string | null; restarted: boolean; cursorAfter: (entry: AdminLogEntry) => string }

type Cursor = { ts: string; id: number }

/** Un jeton opaque : base64url de `[ts, id]` de la dernière ligne servie (`api-patterns.md § Pagination`). */
function cursorAfter(entry: Cursor): string {
  return Buffer.from(JSON.stringify([entry.ts, entry.id])).toString("base64url")
}

/** Le curseur relu ; son instant a la forme que rend PostgREST, seul texte admis dans le filtre (`INSTANT`). */
function decodeCursor(value: string): Cursor | null {
  try {
    const parts: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    if (!Array.isArray(parts) || parts.length !== 2) return null
    const [ts, id] = parts
    return typeof ts === "string" && INSTANT.test(ts) && typeof id === "number" && Number.isSafeInteger(id) ? { ts, id } : null
  } catch {
    // Un curseur illisible : la liste repart du début (`restarted`).
    return null
  }
}

/**
 * Les lignes du journal admin sur `days` jours (AC16), filtrées par organisation, personne et session,
 * triées par `ts` puis `id` décroissants, 50 à partir du curseur composite. L'appelant est de l'équipe
 * plateforme, décidé avant toute lecture (`requireStaff`), sinon `forbidden` ; une organisation est
 * nommée quand il y agit (`listOrgs`), jamais par ce que la RLS rend. Une ligne d'un autre membre sur
 * l'espace personnel d'autrui perd arguments et message, sa cible coupée (fiche D44, fonctions de M14),
 * pour un lecteur sans espace personnel : le journal admin couvre toutes les organisations, un `handle`
 * n'en vaut qu'une ; ses propres lignes restent entières. Un code mal formé ne désigne aucune session ;
 * un curseur illisible fait repartir la liste du début.
 */
export async function listAdminLog(db: PlatformDb, staff: StaffCaller, filters: AdminLogFilters): Promise<AdminLogPage> {
  const caller = await requireStaff(db, staff)
  const cursor = filters.cursor === undefined ? null : decodeCursor(filters.cursor)
  const restarted = filters.cursor !== undefined && cursor === null
  const code = filters.code?.trim().toUpperCase()
  if (code !== undefined && !CTX_PATTERN.test(code)) return { entries: [], nextCursor: null, restarted, cursorAfter }
  const since = new Date(Date.now() - filters.days * DAY_MS)
  const data = await inTransaction(db, "listAdminLog: admin_journal", async (sql) => {
    const read = await sql<{ row: LogRow }[]>`
      select (select to_json(r) from (select j.id, j.ts, j.user_id, j.method, j.ctx, j.tool, j.op, j.org_id, j.target,
                                             j.is_error, j.error, j.duration_ms, j.args) r) as row
        from platform.admin_journal j
       where j.ts >= ${since}
         ${filters.orgId ? sql`and j.org_id = ${filters.orgId}` : sql``}
         ${filters.userId ? sql`and j.user_id = ${filters.userId}` : sql``}
         ${code ? sql`and j.ctx = ${code}` : sql``}
         ${cursor ? sql`and (j.ts, j.id) < (${cursor.ts}::text::timestamptz, ${cursor.id})` : sql``}
       order by j.ts desc, j.id desc
       limit ${ADMIN_LOG_PAGE + 1}`
    return read.map(({ row }) => row)
  })
  const rows = data.slice(0, ADMIN_LOG_PAGE)
  const [staffList, orgs] = await Promise.all([staffDirectory(db), listOrgs(db, caller)])
  const emails = new Map(staffList.map((entry) => [entry.userId, entry.email]))
  const slugs = new Map(orgs.map((org) => [org.id, org.slug]))
  const reader: JournalReader = { userId: caller.userId, handle: null }
  const entries = rows.map((row): AdminLogEntry => {
    const hidden = hidesContent(reader, row, row.args)
    const entry: AdminLogEntry = {
      id: row.id,
      ts: row.ts,
      email: row.user_id ? (emails.get(row.user_id) ?? null) : null,
      method: row.method,
      tool: row.tool,
      op: row.op,
      ctx: row.ctx,
      orgId: row.org_id,
      org: row.org_id ? (slugs.get(row.org_id) ?? null) : null,
      target: row.target === null ? null : targetFor(reader, row.user_id, row.target),
      isError: row.is_error,
      error: hidden ? errorCode(row.error) : errorFor(reader, row.user_id, row.error),
      durationMs: row.duration_ms,
      ...(code ? { args: hidden ? null : displayArgs(row.args) } : {}),
    }
    return hidden ? { ...entry, hidden: true } : entry
  })
  const last = entries.at(-1)
  return { entries, nextCursor: data.length > ADMIN_LOG_PAGE && last ? cursorAfter(last) : null, restarted, cursorAfter }
}
