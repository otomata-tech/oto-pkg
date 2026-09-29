// Lectures de l'écran d'un tableau (E07-S03 : AC4 à AC8, AC10, AC15 ; H93, H95 à H97, H123) : les
// lignes de la grille, son résumé et la file de revue, que lit la page de l'hôte, et les lignes d'une
// vue de bloc `reference`. Chaque lecture de l'hôte décide d'abord (`loadTable`, E07-S01 : niveau 1 au
// moins, niveau 0 = tableau inconnu), puis lit les blocs `row` par le lecteur d'E07-S01 (`loadRows`) ;
// filtre de H95, `q`, tri typé et forme de lecture de H93 sont ceux de `table.rows`, jamais réécrits.
// Sans elles, l'hôte n'atteindrait les lignes que par `call` : une page de `table.rows` est coupée à
// 16 000 caractères pour le modèle (N11), et 200 lignes avec leur provenance y demanderaient une
// dizaine de lectures du tableau entier.
import { queryWords, type CellValue, type TableHeader, type TableSort } from "../../schemas"
import { GRID_ROWS_MAX, type TableGridRows, type TableGridSummary, type TableReviewQueue } from "../../schemas/table-screen"
import { isRecord } from "../../schemas/tables"
import type { PlatformDb } from "../db"
import { boundedList, inTransaction, PlatformError } from "../errors"
import type { Identity } from "../identity"
import { memberNames } from "../nodes/view"
import { metricValue } from "./aggregate"
import { matchesQuery, matchesRow, parseFilter, unknownColumns, unknownColumnsMessage, type FilterClause } from "./filters"
import { loadTable, rowCells, type LoadedTable, type RowBlock } from "./meta"
import { sortRows } from "./paging"
import { countRows, FILTERED_ROWS_MAX, leaseEnd, loadRows, toReadRow, tooManyRows } from "./rows"

/** Ce qui choisit les lignes : le filtre de H95, le texte libre et le tri, tels que l'adresse les porte. */
export type RowSelection = { filter?: unknown; q?: string | null; sort?: TableSort | null }

/** Un tableau déjà décidé par l'appelant (niveau 1 au moins) : son organisation, son nœud, son en-tête publié. */
export type ReadableTable = { orgId: string; nodeId: string; path: string; header: TableHeader }

type Checked = { clauses: FilterClause[]; q: string[] | null; sort: TableSort | undefined }

type Entry = { block: RowBlock; cells: Map<string, CellValue> }

function readable(identity: Identity, table: LoadedTable): ReadableTable {
  return { orgId: identity.org.id, nodeId: table.node.id, path: table.node.path, header: table.header }
}

/** Le filtre, `q` et le tri contrôlés contre l'en-tête : colonnes inconnues d'abord, puis la grammaire de H95. */
function checkedSelection(header: TableHeader, selection: RowSelection): Checked {
  const named = [...(isRecord(selection.filter) ? Object.keys(selection.filter) : []), ...(selection.sort ? [selection.sort.column] : [])]
  const unknown = unknownColumns(header, named)
  if (unknown.length > 0) throw new PlatformError("invalid_arguments", unknownColumnsMessage(header, unknown))
  const parsed = parseFilter(selection.filter, header)
  if ("problems" in parsed) throw new PlatformError("invalid_arguments", boundedList(parsed.problems, " "))
  // Un `q` sans mot est ignoré par la grille (E11-S01, AC-c2), que `table.rows` refuse.
  const q = selection.q ? queryWords(selection.q) : []
  return { clauses: parsed.clauses, q: q.length === 0 ? null : q, sort: selection.sort ?? undefined }
}

/** Les lignes du tableau qui répondent au filtre et à `q`, sur 5 000 lignes au plus (N6 d'E07-S01) ; au-delà, `too_large`. */
async function matching(db: PlatformDb, table: ReadableTable, checked: Pick<Checked, "clauses" | "q">): Promise<Entry[]> {
  const rows = await loadRows(db, table.nodeId, FILTERED_ROWS_MAX)
  if (rows.length > FILTERED_ROWS_MAX) throw tooManyRows(table.path, rows.length)
  return rows
    .map((block) => ({ block, cells: rowCells(block, table.header) }))
    .filter(({ cells }) => matchesRow(cells, checked.clauses) && (checked.q === null || matchesQuery(cells, table.header, checked.q)))
}

type SelectRequest = RowSelection & { limit: number; provenance?: boolean; columns?: readonly string[] | null }

/**
 * Les `limit` premières lignes d'un tableau déjà décidé (AC4 à AC7, AC15), à la forme de lecture de
 * H93 : filtre, `q` et tri calculés dans le service sur 5 000 lignes au plus, comme `table.rows` ;
 * au-delà, sans filtre, `q` ni tri, les premières dans l'ordre de la clé en base (AC16 d'E07-S01).
 * Rend aussi le nombre de lignes qui répondent (`total`) et celui du tableau (`count`).
 */
export async function selectRows(db: PlatformDb, table: ReadableTable, request: SelectRequest): Promise<TableGridRows> {
  const checked = checkedSelection(table.header, request)
  const narrowed = checked.clauses.length > 0 || checked.q !== null || checked.sort !== undefined
  const count = await countRows(db, table.nodeId)
  if (count > FILTERED_ROWS_MAX && narrowed) throw tooManyRows(table.path, count)
  let blocks: RowBlock[]
  let total = count
  if (count > FILTERED_ROWS_MAX) {
    blocks = (await loadRows(db, table.nodeId, request.limit)).slice(0, request.limit)
  } else {
    const ordered = sortRows(await matching(db, table, checked), table.header, checked.sort)
    blocks = ordered.slice(0, request.limit).map((entry) => entry.block)
    total = ordered.length
  }
  const now = Date.now()
  // Les noms des personnes : ceux de la provenance servie et des baux en cours (`claim.by`).
  const named = request.provenance === true || blocks.some((block) => (leaseEnd(block) ?? 0) > now)
  const names = named ? await memberNames(db, table.orgId) : new Map<string, string>()
  const options = { columns: request.columns ?? null, provenance: request.provenance === true, now }
  return { rows: blocks.map((block) => toReadRow(block, table.header, names, options)), total, count }
}

/**
 * Les lignes de la grille (AC4 à AC7) : le tableau décidé par `loadTable` avant toute lecture de ligne,
 * puis les `limit` premières (1 à 200) sous le filtre, `q` et le tri de l'adresse, provenance servie.
 */
export async function tableGridRows(db: PlatformDb, identity: Identity, request: { table: string; limit: number } & RowSelection): Promise<TableGridRows> {
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > GRID_ROWS_MAX) {
    throw new PlatformError("invalid_arguments", `limit: 1 to ${GRID_ROWS_MAX} rows.`)
  }
  // Le tableau, son niveau et ses lignes dans une transaction (E05-S10, partie c).
  return inTransaction(db, "tables: grid rows", async () => {
    const table = await loadTable({ db, identity }, request.table)
    return selectRows(db, readable(identity, table), { ...request, provenance: true })
  })
}

/**
 * Le résumé de la grille (AC8, H97) sous le même filtre et le même `q` : le compte de chaque état
 * déclaré, zéros compris, et la somme de chaque colonne nombre (règle de `table.aggregate`, seuls les
 * nombres s'additionnent) ; plus de 5 000 lignes : `too_large`, comme `table.aggregate`.
 */
export async function tableGridSummary(db: PlatformDb, identity: Identity, request: { table: string } & Pick<RowSelection, "filter" | "q">): Promise<TableGridSummary> {
  // Le tableau, son niveau et ses lignes dans une transaction (E05-S10, partie c).
  return inTransaction(db, "tables: grid summary", () => gridSummaryIn(db, identity, request))
}

async function gridSummaryIn(db: PlatformDb, identity: Identity, request: { table: string } & Pick<RowSelection, "filter" | "q">): Promise<TableGridSummary> {
  const table = await loadTable({ db, identity }, request.table)
  const checked = checkedSelection(table.header, request)
  const count = await countRows(db, table.node.id)
  if (count > FILTERED_ROWS_MAX) throw tooManyRows(table.node.path, count)
  const cells = (await matching(db, readable(identity, table), checked)).map((entry) => entry.cells)
  const { columns, lifecycle } = table.header
  return {
    states: lifecycle ? lifecycle.states.map((state) => ({ state, count: cells.filter((row) => row.get(lifecycle.column) === state).length })) : null,
    sums: columns
      .filter((column) => column.type === "number")
      .map((column) => ({ column: column.name, total: metricValue({ op: "sum", column, name: `sum_${column.name}` }, cells) ?? 0 })),
  }
}

/**
 * Lignes de la file lues pour la revue (M54, P2) : de quoi choisir ou passer une fiche sans relire ; au-delà,
 * la fiche dit « 20 premières sur N », et les suivantes paraissent après les décisions (HN-M54-5).
 */
const REVIEW_ROWS = 20

/**
 * La file de revue (AC10, H99, HN-E07S03-1) : le nombre de lignes à l'état `review.state` et les 20
 * premières dans l'ordre des clés, provenance servie (la preuve de chaque valeur, P3) ; un tableau sans
 * revue déclarée n'a pas de file (`invalid_arguments`).
 */
export async function tableReviewQueue(db: PlatformDb, identity: Identity, request: { table: string }): Promise<TableReviewQueue> {
  // Le tableau, son niveau et sa file dans une transaction (E05-S10, partie c).
  return inTransaction(db, "tables: review queue", async () => {
    const table = await loadTable({ db, identity }, request.table)
    const { lifecycle } = table.header
    if (!lifecycle?.review) throw new PlatformError("invalid_arguments", `Table ${table.node.path} has no review queue.`)
    const filter = { [lifecycle.column]: lifecycle.review.state }
    const { rows, total } = await selectRows(db, readable(identity, table), { filter, limit: REVIEW_ROWS, provenance: true })
    return { count: total, rows }
  })
}
