// Publication d'un en-tête de tableau (E07-S04, AC1, AC6 à AC10) : temps 1 et 3 de la publication
// d'E03-S03 (`publishNode`, N22), après sa décision de gestion. Temps 1 : l'écart entre l'en-tête
// publié (`nodes.meta`) et celui du brouillon (`node_drafts.meta`) ; les lignes lues (5 000 au plus)
// quand un changement les regarde ; les refus d'`evolution-checks.ts` ; la purge des valeurs restées
// sous le nom d'une colonne ajoutée, avant que `publish_node` ne la déclare. Temps 3 : la purge des
// colonnes retirées, que plus aucune écriture ne peut viser, puis le résumé et les avertissements ; la
// publication étant faite, une panne n'y est jamais un refus. Chaque ligne est purgée par une mise à
// jour atomique, gardée par sa révision, dans sa propre transaction de la face SQL (E01-S10, lot c1) :
// la purge reste hors de celle de la publication, choix délibéré de N6 (arbitrage du pilote du
// 2026-09-26) ; appelée pendant une transaction ouverte, elle y entrerait (HN-E01S10-7), et une ligne
// en panne l'annulerait. Fichier à part pour la borne de 300 lignes.
import { isRecord, type TableHeader } from "../../schemas/tables"
import type { Json } from "../database"
import type { PlatformDb } from "../db"
import { boundedList, databaseFailure, isPlatformError, PlatformError } from "../errors"
import type { Identity } from "../identity"
import { formatCount } from "../nodes/document"
import type { NodeRow } from "../nodes/lookup"
import { plural } from "../nodes/op-kit"
import { diffTableHeaders, draftHeader, headerShape, publishedOrNull, type HeaderDiff } from "./evolution"
import { carries, checkEvolution, readsRows, rowsText, warned, type TableWarning, type Warned } from "./evolution-checks"
import { rowCells, type RowBlock } from "./meta"
import { sortRows } from "./paging"
import { countRows, FILTERED_ROWS_MAX, loadRows } from "./rows"

/**
 * Lignes purgées à la fois (AC9) : le pool de la face SQL (`server/sql.ts`, cinq connexions par
 * instance) est partagé par toutes les requêtes ; au-delà de cinq, une purge attend sa connexion.
 */
const PURGE_CONCURRENCY = 10

/** Essais d'une ligne changée entre sa lecture et sa purge (AC9). */
const PURGE_RETRIES = 3

/**
 * La purge relit toutes les pages du tableau, sans la borne des contrôles : des lignes écrites pendant
 * la publication, sous une colonne encore déclarée, peuvent passer la 5 000e, et leur valeur resterait
 * sous le nom retiré sans être dite. Aucune ligne nouvelle ne porte une colonne que l'en-tête ne
 * déclare pas : la relecture ne lit que ce que la publication a laissé grandir (5 000 lignes aux contrôles).
 */
const ALL_ROWS = Number.POSITIVE_INFINITY

/**
 * Ce que le temps 1 laisse au temps 3 : l'écart, l'en-tête publié, les lignes des contrôles, les
 * avertissements, les valeurs périmées purgées.
 */
type TableStep = { diff: HeaderDiff; target: TableHeader; first: boolean; rows: RowBlock[]; warnings: Warned[]; stale: ReadonlyMap<string, number> }

/** Ce que la réponse de `write` dit d'une publication de tableau : son résumé et ses avertissements (AC6). */
export type TablePublication = { summary: string | null; warnings: TableWarning[]; texts: string[] }

function tooManyRows(path: string, count: number): PlatformError {
  return new PlatformError(
    "too_large",
    `Publication of ${path} refused: the table has ${formatCount(count)} rows; header changes that check its rows work on tables of ${formatCount(FILTERED_ROWS_MAX)} rows at most in this version. The draft is kept; nothing was published.`,
  )
}

/**
 * Les lignes d'un tableau pour les contrôles (AC9) : comptées d'abord, sans en lire aucune au-delà de
 * 5 000 ; lues par pages (`loadRows` d'E07-S01) ; rangées dans l'ordre naturel des clés (E07-S01, AC6).
 */
async function scanRows(db: PlatformDb, table: NodeRow, header: TableHeader): Promise<RowBlock[]> {
  const count = await countRows(db, table.id)
  if (count > FILTERED_ROWS_MAX) throw tooManyRows(table.path, count)
  const rows = await loadRows(db, table.id, FILTERED_ROWS_MAX)
  if (rows.length > FILTERED_ROWS_MAX) throw tooManyRows(table.path, rows.length)
  return sortRows(rows.map((block) => ({ block, cells: rowCells(block, header) })), header, undefined).map((entry) => entry.block)
}

/** Une erreur de la base, gardée telle quelle jusqu'à sa traduction (`databaseFailure`). */
type DbError = { code?: string }

/**
 * Ce que rejette une requête de la purge : l'erreur de la base, qui porte toujours son code (SQLSTATE,
 * erreur de connexion du pilote), gardée ; ce qui ne vient pas de la base (configuration, bogue, refus
 * déjà décidé) est relancé, comme le font `fromDatabaseError` et `databaseFailure` (HN-E01S10-15).
 */
function purgeError(error: unknown): DbError {
  const code: unknown = error instanceof Error && !isPlatformError(error) ? Reflect.get(error, "code") : undefined
  if (typeof code !== "string") throw error
  return { code }
}

type PurgeRow = Pick<RowBlock, "key" | "data" | "provenance" | "revision">

/** Un objet JSON sans `columns` : `data` ou `provenance` d'une ligne purgée. */
function without(value: unknown, columns: readonly string[]): Json {
  const kept = Object.entries(isRecord(value) ? value : {}).filter(([column]) => !columns.includes(column))
  // Les valeurs viennent d'une ligne lue en base : du JSON par construction.
  return Object.fromEntries(kept) as Json
}

type Purging = { db: PlatformDb; identity: Identity; nodeId: string; columns: readonly string[] }

/** La ligne relue après une mise à jour sans effet (`row` nul : elle n'est plus là), ou l'erreur de la base. */
async function readRow(purging: Purging, key: string): Promise<{ row: PurgeRow | null; error: DbError | null }> {
  try {
    const [found] = await purging.db.tx(
      (sql) => sql<Omit<PurgeRow, "key">[]>`
        select data, provenance, revision from platform.blocks
         where node_id = ${purging.nodeId} and state = ${"published"} and type = ${"row"} and key = ${key}`,
    )
    return { row: found ? { ...found, key } : null, error: null }
  } catch (error) {
    return { row: null, error: purgeError(error) }
  }
}

/** Une mise à jour gardée par la révision lue : écrite, ou aucune ligne rendue (changée entre-temps : relire), ou l'erreur de la base. */
async function writePurge(purging: Purging, row: PurgeRow, carried: readonly string[]): Promise<{ written: boolean; error: DbError | null }> {
  try {
    const written = await purging.db.tx(
      (sql) => sql`
        update platform.blocks
           set data = ${sql.json(without(row.data, carried))}, provenance = ${sql.json(without(row.provenance, carried))},
               revision = ${row.revision + 1}, updated_by = ${purging.identity.user.id}
         where node_id = ${purging.nodeId} and state = ${"published"} and type = ${"row"} and key = ${row.key} and revision = ${row.revision}
        returning key`,
    )
    return { written: written.length > 0, error: null }
  } catch (error) {
    return { written: false, error: purgeError(error) }
  }
}

/** Ce que la purge d'une ligne a donné : les colonnes effacées, celles qui restent, et la panne qui l'a arrêtée. */
type RowPurge = { erased: string[]; missed: string[]; error: DbError | null }

/**
 * Purge une ligne (H100 : révision + 1) ; changée entre-temps (garde de révision, aucune ligne rendue),
 * elle est relue et purgée à nouveau, 3 essais, puis journalisée (`security-patterns.md § Idempotence
 * et mutations concurrentes`) ; une panne de la base l'arrête, son erreur gardée pour l'appelant.
 */
async function purgeRow(purging: Purging, row: PurgeRow): Promise<RowPurge> {
  let current: PurgeRow | null = row
  for (let attempt = 0; attempt < PURGE_RETRIES && current; attempt++) {
    const carried: string[] = purging.columns.filter((column) => current !== null && carries(current, column))
    if (carried.length === 0) return { erased: [], missed: [], error: null }
    const write = await writePurge(purging, current, carried)
    if (write.error) return { erased: [], missed: carried, error: write.error }
    if (write.written) return { erased: carried, missed: [], error: null }
    const again = await readRow(purging, current.key)
    if (again.error) return { erased: [], missed: carried, error: again.error }
    current = again.row
  }
  const missed = purging.columns.filter((column) => current !== null && carries(current, column))
  if (missed.length > 0) console.error(`[platform] tables: purge of ${purging.nodeId}: a row changed ${PURGE_RETRIES} times, no row written`)
  return { erased: [], missed, error: null }
}

/**
 * Ce que la purge a donné (`api-patterns.md § Bulk Operations`) : les lignes effacées par colonne ; les
 * lignes restées, changées trois fois (`changed`) ou non écrites sur une panne (`failed`) ; la première
 * panne de la base, jamais servie comme une course.
 */
type Purge = { erased: Map<string, number>; changed: Map<string, RowBlock[]>; failed: Map<string, RowBlock[]>; error: DbError | null }

/** Ajoute à `purge` ce que la purge d'une ligne a donné. */
function tally(purge: Purge, outcome: RowPurge, row: RowBlock): void {
  for (const column of outcome.erased) purge.erased.set(column, (purge.erased.get(column) ?? 0) + 1)
  const left = outcome.error ? purge.failed : purge.changed
  for (const column of outcome.missed) left.set(column, [...(left.get(column) ?? []), row])
  purge.error = purge.error ?? outcome.error
}

/**
 * Retire `columns` de `data` et de `provenance` de chaque ligne qui les porte (AC8, AC9) : toutes les
 * lignes relues par pages, purgées 10 à la fois ; rend ce qui est effacé et ce qui reste, jamais un
 * refus : l'appelant le décide. Une lecture des lignes en panne lève (`loadRows`).
 */
async function purgeColumns(purging: Purging): Promise<Purge> {
  const purge: Purge = { erased: new Map(), changed: new Map(), failed: new Map(), error: null }
  if (purging.columns.length === 0) return purge
  const rows = (await loadRows(purging.db, purging.nodeId, ALL_ROWS)).filter((row) => purging.columns.some((column) => carries(row, column)))
  for (let start = 0; start < rows.length; start += PURGE_CONCURRENCY) {
    const slice = rows.slice(start, start + PURGE_CONCURRENCY)
    const outcomes = await Promise.all(slice.map((row) => purgeRow(purging, row)))
    outcomes.forEach((outcome, index) => tally(purge, outcome, slice[index]))
  }
  return purge
}

/**
 * Des valeurs restées sous le nom d'une colonne ajoutée qu'une ligne changée trois fois a empêché
 * d'effacer (journalisé par `purgeRow`) : la colonne publiée les montrerait (AC9). Refus, rien n'est publié.
 */
function stalePurgeFailed(path: string, changed: ReadonlyMap<string, RowBlock[]>, header: TableHeader): PlatformError {
  const reasons = [...changed].flatMap(([column, rows]) =>
    warned({ kind: "not_purged", column, rows, header }, (count, sampled) => `the old values left under « ${column} » could not be erased on ${rowsText(count)} (${sampled})`),
  )
  const listed = boundedList(reasons.map((reason) => reason.text), "; ")
  return new PlatformError("conflict", `Publication of ${path} refused: ${listed}; an added column never shows old values. The draft is kept; nothing was published. Retry the publication.`)
}

/**
 * Une panne de la base pendant la purge d'avant la publication : une panne, jamais une course ; un jeton
 * refusé reste `unauthorized` (`supabase-patterns.md § Error Handling`). Rien n'est publié.
 */
function stalePurgeStopped(path: string, columns: readonly string[], error: DbError): PlatformError {
  const names = boundedList(columns.map((column) => `« ${column} »`))
  return databaseFailure(
    error,
    "tables: purge",
    `Publication of ${path} stopped on a database error while erasing the old values left under ${names}. The draft is kept; nothing was published. Retry the publication.`,
  )
}

/**
 * Temps 1 d'une publication de tableau, après la décision de gestion (`requireNodeLevel`, E03-S03) :
 * `null` sans en-tête en attente (titre ou résumé seuls). Un refus garde le brouillon et
 * `publish_node` n'est pas appelé ; les valeurs restées sous le nom d'une colonne ajoutée sont purgées
 * ici, avant que la colonne n'existe, ou la publication est refusée : une colonne ajoutée ne ressuscite
 * jamais d'anciennes valeurs (AC9).
 */
export async function prepareTablePublication(
  db: PlatformDb,
  identity: Identity,
  node: NodeRow,
  request: { meta: Record<string, unknown> | null; confirmRemove: boolean },
): Promise<TableStep | null> {
  if (!request.meta) return null
  const published = publishedOrNull(node)
  const target = draftHeader(node.path, request.meta)
  const diff = diffTableHeaders(published, target)
  const rows = readsRows(diff) ? await scanRows(db, node, published ?? target) : []
  const check = { path: node.path, prefix: identity.org.prefix, revision: node.revision, published, target, diff, rows, confirmRemove: request.confirmRemove, now: Date.now() }
  const { warnings, stale } = checkEvolution(check)
  const purged = await purgeColumns({ db, identity, nodeId: node.id, columns: stale })
  if (purged.error) throw stalePurgeStopped(node.path, stale, purged.error)
  if (purged.changed.size > 0) throw stalePurgeFailed(node.path, purged.changed, published ?? target)
  return { diff, target, first: published === null, rows, warnings, stale: purged.erased }
}

function valuesText(count: number): string {
  return `${formatCount(count)} ${plural(count, "value")}`
}

/** « added telephone; changed entreprise (max_length); removed notes (12 values erased) » (AC8, AC9). */
function publishedChanges(step: TableStep, erased: ReadonlyMap<string, number>): string[] {
  const { diff } = step
  const added = (name: string) => {
    const stale = step.stale.get(name) ?? 0
    return stale > 0 ? `added ${name} (purged ${formatCount(stale)} stale ${plural(stale, "value")} left under « ${name} »)` : `added ${name}`
  }
  const removed = (name: string) => {
    const count = erased.get(name) ?? 0
    return count > 0 ? `removed ${name} (${valuesText(count)} erased)` : `removed ${name}`
  }
  return [
    ...diff.added.map((column) => added(column.name)),
    ...diff.changed.map((change) => `changed ${change.name} (${change.attributes.join(", ")})`),
    ...diff.removed.map((column) => removed(column.name)),
    ...(diff.key ? [`key set to ${diff.key.after}`] : []),
    ...(diff.lifecycle ? [diff.lifecycle.before ? "lifecycle replaced" : "lifecycle set"] : []),
    ...(diff.closed === null ? [] : [diff.closed ? "closed" : "reopened"]),
  ]
}

/**
 * La purge des colonnes retirées, après `publish_node` (AC8) : la publication est faite, une panne n'en
 * fait jamais un refus (N6). Une lecture des lignes en panne (journalisée par `loadRows`) laisse les
 * valeurs que portaient les lignes des contrôles, dites non écrites.
 */
async function purgeRemoved(purging: Purging, step: TableStep): Promise<Purge> {
  try {
    return await purgeColumns(purging)
  } catch (error) {
    if (!isPlatformError(error)) throw error
    const failed = new Map(purging.columns.map((column) => [column, step.rows.filter((row) => carries(row, column))]))
    return { erased: new Map(), changed: new Map(), failed, error: null }
  }
}

/** Les lignes que la purge n'a pas pu retirer (AC9) : dites, jamais tues ; purgées si la colonne revient. */
function notPurged(purge: Purge, header: TableHeader): Warned[] {
  const said = (left: ReadonlyMap<string, RowBlock[]>, why: string) =>
    [...left].flatMap(([column, rows]) =>
      warned(
        { kind: "not_purged", column, rows, header },
        (count, sampled) =>
          `${rowsText(count)} still ${count === 1 ? "holds a value" : "hold values"} under removed column ${column} (${why}; ${sampled}); ${count === 1 ? "it is" : "they are"} purged if a column ${column} is added again.`,
      ),
    )
  return [...said(purge.changed, "changed while purging"), ...said(purge.failed, "could not be written")]
}

/**
 * Temps 3, après `publish_node` : purge des colonnes retirées (AC8), puis le résumé de la publication
 * (AC1 : un tableau publié pour la première fois ; sinon ses changements) et les avertissements (AC6).
 */
export async function finishTablePublication(db: PlatformDb, identity: Identity, node: NodeRow, step: TableStep | null): Promise<TablePublication | null> {
  if (!step) return null
  const purge = await purgeRemoved({ db, identity, nodeId: node.id, columns: step.diff.removed.map((column) => column.name) }, step)
  if (purge.error) console.error(`[platform] tables: purge of ${node.id}`, purge.error.code)
  const all = [...step.warnings, ...notPurged(purge, step.target)]
  const changes = publishedChanges(step, purge.erased)
  const first = `a table with ${headerShape(step.target)}. Write rows with ${identity.org.prefix}_call table.write`
  const summary = step.first ? first : changes.length > 0 ? changes.join("; ") : null
  return { summary, warnings: all.map((one) => one.warning), texts: all.map((one) => one.text) }
}
