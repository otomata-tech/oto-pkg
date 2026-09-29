// `table.delete_rows` (E11-S02, lot f ; FB-0010 partie 3) : supprimer pour de bon des lignes d'un tableau,
// par leur clé, en deux temps (H86). Le tableau est chargé et l'écriture décidée avant toute lecture de
// lignes (`loadTable`, `requireWrite`), comme `table.write` ; une ligne réservée par une autre personne,
// bail actif, est refusée (HN-E11S02-9) ; une ligne à l'état de revue se supprime comme les autres, et le
// récapitulatif comme le résultat le disent (HN-E11S02-8) ; un tableau fermé n'empêche rien (HN-E11S02-7).
// L'exécution relit les lignes et les supprime en une transaction, chacune gardée par la révision relue ;
// elle rend `outcome`, que la ligne de journal garde pour le fil de l'accueil (AC-h2, HN-E11S02-16). Sans
// lui, un assistant ne pouvait que vider des cellules (`table.write` avec `clear`).
import type { TableHeader } from "../../schemas"
import { tableDeleteRowsArgsSchema, type TableDeleteRowsArgs } from "../../schemas/table-write"
import { defineFunction, type FunctionContext, type FunctionOutput, type FunctionSummary } from "../catalog/define"
import { boundedList, inTransaction } from "../errors"
import { wellFormed } from "../journal"
import { formatCount } from "../nodes/document"
import { plural } from "../nodes/op-kit"
import { memberNames } from "../nodes/view"
import { loadTable, rowCells, type LoadedTable } from "./meta"
import { requireWrite, tableResult, tableTeamId } from "./output"
import { rowKey } from "./row-rules"
import { claimedBySentence, heldByOther, rowsByKey, type StoredRow } from "./row-store"

/** Colonnes montrées au plus pour chaque ligne du récapitulatif, après sa clé (AC-f2). */
const SHOWN_COLUMNS = 3

/** Une ligne refusée, rien de supprimé pour elle (AC-f4), et pourquoi. */
type Refused = { key: string; reason: string }

/**
 * Ce que l'appel décide sur les lignes lues : à supprimer, absentes ; refusées, par leur clé (`invalid`), leur bail
 * (`claimed`) ou une course (`changed`) ; `review`, les clés à revoir parmi celles à supprimer.
 */
type Judged = { rows: StoredRow[]; missing: string[]; invalid: Refused[]; claimed: StoredRow[]; changed: StoredRow[]; review: string[] }

/** Les clés de l'appel, normalisées comme celles de `table.write` (N19), sans doublon ; une clé mal formée est refusée. */
function keysOf(table: LoadedTable, raw: TableDeleteRowsArgs["keys"]): { keys: string[]; refused: Refused[] } {
  const keys = new Set<string>()
  const refused: Refused[] = []
  for (const key of raw) {
    const keyed = rowKey(table.header, key)
    if ("key" in keyed) keys.add(keyed.key)
    else refused.push({ key: String(key), reason: keyed.problem })
  }
  return { keys: [...keys], refused }
}

/** Une ligne à l'état de revue du tableau (`lifecycle.review.state`). */
function inReview(row: StoredRow, header: TableHeader): boolean {
  const lifecycle = header.lifecycle
  return lifecycle?.review !== undefined && rowCells(row, header).get(lifecycle.column) === lifecycle.review.state
}

function claimedReason(row: StoredRow, names: ReadonlyMap<string, string>): string {
  return `${claimedBySentence(row, names)}; wait for its release or the end of the lease.`
}

/** Les lignes des clés, lues en une fois et jugées : absente, réservée par une autre personne (bail actif), sinon à supprimer. */
async function judge(context: FunctionContext, table: LoadedTable, requested: { keys: string[]; refused: Refused[] }): Promise<Judged> {
  const { db, identity } = context
  const stored = await rowsByKey(db, table.node.id, requested.keys)
  const now = Date.now()
  const claimed = requested.keys.flatMap((key) => {
    const row = stored.get(key)
    return row && heldByOther(row, identity.user.id, now) ? [row] : []
  })
  const rows = requested.keys.flatMap((key) => {
    const row = stored.get(key)
    return row && !claimed.includes(row) ? [row] : []
  })
  return {
    rows,
    missing: requested.keys.filter((key) => !stored.has(key)),
    invalid: requested.refused,
    claimed,
    changed: [],
    review: rows.filter((row) => inReview(row, table.header)).map((row) => row.key),
  }
}

/**
 * Les lignes refusées et pourquoi (AC-f4) ; les noms des personnes, hors de la transaction qui ne tient que ses
 * requêtes, ne se lisent que pour un refus qui en cite une.
 */
async function refusedOf(context: FunctionContext, judged: Judged): Promise<Refused[]> {
  const names = judged.claimed.length > 0 ? await memberNames(context.db, context.identity.org.id) : new Map<string, string>()
  return [
    ...judged.invalid,
    ...judged.claimed.map((row) => ({ key: row.key, reason: claimedReason(row, names) })),
    ...judged.changed.map((row) => ({ key: row.key, reason: "changed meanwhile; read it again." })),
  ]
}

/** « - Atelier 2 (ville: Valbrune, contact: Anne Roy, montant: 18000) » : la clé et ses trois premières colonnes renseignées. */
function rowLine(row: StoredRow, header: TableHeader): string {
  const cells = [...rowCells(row, header)].filter(([column]) => column !== header.key).slice(0, SHOWN_COLUMNS)
  const shown = cells.map(([column, value]) => `${column}: ${String(value)}`).join(", ")
  return shown ? `- ${row.key} (${shown})` : `- ${row.key}`
}

/** Clés absentes et lignes refusées, bornées à 20 (`mcp-patterns.md § 4`). */
function missingAndRefused(missing: readonly string[], refused: readonly Refused[]): string[] {
  return [
    ...(missing.length > 0 ? [`Not found: ${boundedList(missing)}.`] : []),
    ...(refused.length > 0 ? [boundedList(refused.map((one) => `Refused: ${one.key} — ${one.reason}`), "\n")] : []),
  ]
}

function rowsText(count: number): string {
  return `${formatCount(count)} ${plural(count, "row")}`
}

/** Le tableau chargé et l'écriture décidée, avant toute lecture de lignes (AC-f6). */
async function writableTable(context: FunctionContext, args: TableDeleteRowsArgs): Promise<{ table: LoadedTable; requested: { keys: string[]; refused: Refused[] } }> {
  const table = await loadTable(context, args.table)
  await requireWrite(context, table)
  return { table, requested: keysOf(table, args.keys) }
}

/** Le récapitulatif d'AC-f2, sans rien écrire ; `calls.ts` ajoute la phrase commune de l'accord. */
async function summarizeDeletion(context: FunctionContext, validated: TableDeleteRowsArgs): Promise<FunctionSummary> {
  const { table, requested } = await writableTable(context, wellFormed(validated))
  const judged = await judge(context, table, requested)
  const refused = await refusedOf(context, judged)
  const path = table.node.path
  const review = judged.review.length
  const lines = [
    judged.rows.length > 0 ? `About to delete ${rowsText(judged.rows.length)} of ${path} for good:` : `No row of ${path} to delete.`,
    ...(judged.rows.length > 0 ? [boundedList(judged.rows.map((row) => rowLine(row, table.header)), "\n")] : []),
    ...(review > 0
      ? [`${formatCount(review)} of these rows ${review === 1 ? "is" : "are"} waiting for review: ${boundedList(judged.review)}. Deleting them removes them from the review queue.`]
      : []),
    ...missingAndRefused(judged.missing, refused),
    "Their values and proofs cannot be restored. To empty cells instead, use table.write with clear.",
  ]
  const data = { table: path, rows: judged.rows.map((row) => row.key), review: judged.review, not_found: judged.missing, refused }
  return { text: lines.join("\n"), data }
}

/**
 * Les lignes relues, jugées et supprimées en une transaction (AC-f3) : une requête, chaque ligne gardée
 * par son id et la révision relue ; une ligne changée entre-temps n'est pas supprimée, refusée et
 * journalisée d'abord (`security-patterns.md § Idempotence et mutations concurrentes`).
 */
async function deleteJudged(context: FunctionContext, table: LoadedTable, requested: { keys: string[]; refused: Refused[] }): Promise<Judged> {
  const { db } = context
  return inTransaction(db, "tables: delete rows", async (sql) => {
    const judged = await judge(context, table, requested)
    if (judged.rows.length === 0) return judged
    const deleted = await sql<{ id: string }[]>`
      delete from platform.blocks b
       using unnest(${judged.rows.map((row) => row.id)}::uuid[], ${judged.rows.map((row) => row.revision)}::int[]) as t(id, revision)
       where b.id = t.id and b.revision = t.revision
         and b.node_id = ${table.node.id} and b.state = 'published' and b.type = 'row'
      returning b.id`
    const gone = new Set(deleted.map((row) => row.id))
    const changed = judged.rows.filter((row) => !gone.has(row.id))
    for (const row of changed) console.error("[platform] tables: delete_rows row changed before its delete", `${table.node.id}#${row.key}`)
    const rows = judged.rows.filter((row) => gone.has(row.id))
    return { ...judged, rows, changed, review: rows.filter((row) => inReview(row, table.header)).map((row) => row.key) }
  })
}

async function deleteRows(context: FunctionContext, validated: TableDeleteRowsArgs): Promise<FunctionOutput> {
  const { table, requested } = await writableTable(context, wellFormed(validated))
  const teamId = await tableTeamId(context.db, table)
  const done = await deleteJudged(context, table, requested)
  const refused = await refusedOf(context, done)
  const path = table.node.path
  const deleted = done.rows.map((row) => row.key)
  const review = done.review.length
  const lines = [
    deleted.length > 0 ? `Deleted ${rowsText(deleted.length)} of ${path}: ${boundedList(deleted)}.` : `Deleted 0 rows of ${path}.`,
    ...(review > 0 ? [`${formatCount(review)} of these rows ${review === 1 ? "was" : "were"} waiting for review.`] : []),
    ...missingAndRefused(done.missing, refused),
  ]
  const output: FunctionOutput = {
    text: lines.join("\n"),
    data: { table: path, deleted, review: done.review, not_found: done.missing, refused },
    outcome: { deleted: deleted.length, review },
    next: ["table.rows"],
  }
  return tableResult(table, output, teamId)
}

export const tableDeleteRows = defineFunction({
  name: "table.delete_rows",
  connector: "table",
  class: "sensitive",
  origin: "paquet",
  description:
    "Deletes rows of a table for good, by key: their values and proofs cannot be restored. Use it when the user asks to remove rows; to empty cells instead, use table.write with clear. Two steps: a summary of the rows that would go (rows waiting for review included, which leave the review queue), then confirm: true after the user agreed. 50 keys at most per call; a row claimed by someone else is refused.",
  schema: tableDeleteRowsArgsSchema,
  examples: [{ table: "ventes/suivi_prospects", keys: ["Atelier 2", "Atelier 10"] }],
  refusals: [
    "Unknown table: not a table you can read; the refusal lists the tables you can read.",
    "Writing is reserved to the team that owns the table: the refusal says whom to ask.",
    "No key or more than 50 keys.",
    "A row refused on its own, nothing deleted for it: a key that is not well formed, a row claimed by someone else (wait for its release or the end of the lease), a row changed meanwhile (read it again).",
  ],
  summarize: summarizeDeletion,
  run: deleteRows,
})
