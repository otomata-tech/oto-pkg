// `table.import` et `importRows` (E10-S01, AC-b3 à AC-b5, AC-b7, AC-c1 ; fiches D100, D117, D120) : des lignes
// lues d'un CSV, écrites dans un tableau existant, ou dans un tableau que l'import crée et publie. Un service, deux
// portes (`mcp-patterns.md § 1`) : `table.import` derrière `call`, adaptateur fin en fin de fichier, et `POST
// /api/plateforme/tables/import` (l'écran, un lot de 500 lignes par requête, et la conversion d'un tableau
// simple) ; E10-S05 l'appellera aussi. Les droits se décident avant toute requête sur les lignes : la gestion du
// parent pour une création (l'en-tête est publié, D120, HN-E10S01-2), l'écriture du tableau sinon ; puis tout le
// lot est contrôlé (`checkImport`, que l'écran a déjà joué), puis écrit en une transaction, tout ou rien, fusionné
// sur la clé comme `table.write` : une valeur égale à la valeur rangée est ignorée, une valeur nouvelle porte la
// provenance `import` et son commentaire, qui tient lieu de preuve (D100). Sans lui, un CSV ne devient un tableau
// que ligne à ligne, par `table.write`.
import {
  checkImport,
  columnNameOf,
  columnNames,
  detectSeparator,
  IMPORT_CELL_MAX,
  IMPORT_COLUMNS_MAX,
  IMPORT_CSV_MAX,
  IMPORT_ROWS_MAX,
  importProblemsText,
  inferTable,
  parseCsv,
  tableImportArgsSchema,
  tableImportBodySchema,
  type CellValue,
  type ImportRow,
  type TableColumn,
  type TableHeader,
  type TableImportArgs,
} from "../../schemas"
import { isRecord } from "../../schemas/tables"
import { ACCESS_LEVELS, describeOwner, reservedTo } from "../access"
import { defineFunction, type FunctionContext, type FunctionOutput } from "../catalog/define"
import { changedMeanwhile, inTransaction, invalidInput, isPlatformError, PlatformError } from "../errors"
import { wellFormed } from "../journal"
import { charCount, formatCount } from "../nodes/document"
import { findNode, lookupAlias, lookupNode, notAvailable, parentPath, ROOT_PATH } from "../nodes/lookup"
import { ownerOf } from "../nodes/view"
import type { WriteOrigin } from "../nodes/write"
import { columnOf } from "./header"
import { loadTable, type LoadedTable } from "./meta"
import { requireWrite, tableResult, tableTeamId, utcClock } from "./output"
import { rowKey } from "./row-rules"
import { asJson, insertRow, leaseActive, rowsByKey, updateRow, type StoredRow } from "./row-store"
import { applyRowWrite, type RowActor } from "./write-row"
import { sameValue } from "./write-values"

export type ImportContext = Pick<FunctionContext, "db" | "identity" | "ctx" | "origin">

/** L'en-tête d'un tableau que l'import crée : ses colonnes et sa clé, publiées avant la première ligne. */
export type ImportedHeader = { columns: TableColumn[]; key: string }

export type ImportRequest = {
  path: string
  /** Qui crée le tableau (sa provenance de nœud) : un assistant et son `ctx`, ou l'écran. */
  by: WriteOrigin
  /** Le commentaire de chaque valeur écrite : « Importé de <fichier> », « Converti depuis <page> » (AC-b3, AC-b7). */
  comment: string
  create?: { title: string; summary: string; header: ImportedHeader }
  /** La clé nommée par l'appel : pour un tableau existant, la sienne, sinon refus. */
  key?: string
  /** L'en-tête du CSV : chaque cellule se rapproche d'une colonne par `columnNameOf` (AC-b5). */
  headers: readonly string[]
  rows: readonly (readonly string[])[]
  /** La ligne du texte de chaque ligne (`parseCsv`), citée par un refus. */
  lines?: readonly number[]
}

export type ImportOutcome = { table: LoadedTable; created: number; updated: number; unchanged: number; ignored: string[]; teamId: string | null }

/** La consigne d'un import trop grand (AC-c1). */
export const PIECES = "send it in pieces of about 20,000 characters, each starting with the header line."

/** La consigne de chaque borne d'un lot (AC-c1) : des lignes se coupent en morceaux, des colonnes ou une cellule non. */
const BOUND_ADVICE = {
  lines: PIECES,
  columns: "keep only the columns the table needs, in the header line and in every line.",
  cell: "shorten that cell; a long text belongs in a page, whose path the cell can hold.",
} as const

/** Refus cités au plus, puis « and <n> more » (AC-c1). */
const REFUSALS_SHOWN = 10

/**
 * Le refus d'un lot écrit après la création de son tableau par le même appel (HN-E10S01-21) : aucune ligne n'est
 * écrite, mais le tableau reste, publié et vide. Le refus le dit, à son chemin, aussi dans `details.created`, pour que
 * la reprise le remplisse sans `create` et sans chercher une autre adresse.
 */
function createdEmpty(code: PlatformError["code"], created: string, reason: string): PlatformError {
  const message = `The table ${created} was created and published, but none of these rows was written: ${reason}. Send them again to ${created}, without create.`
  return new PlatformError(code, message, { created })
}

/**
 * Toute erreur levée après la création, avant ou pendant l'écriture du lot (relecture du tableau, lecture de son
 * équipe, lot refusé ou en panne) : elle porte le tableau créé (HN-E10S01-21), sinon l'écran en recréerait un autre.
 */
function afterCreation(created: string, error: unknown): PlatformError {
  if (isPlatformError(error)) return error.details?.created === undefined ? createdEmpty(error.code, created, error.message.replace(/\.$/, "")) : error
  // Une erreur sans code (bogue) : sa pile au log serveur, jamais au refus.
  console.error("[platform] tables: import: failure after creating", created, error)
  return createdEmpty("internal", created, "Internal error")
}

function nothingWritten(refusals: readonly string[], created: string | null): PlatformError {
  const more = refusals.length - REFUSALS_SHOWN
  // Un refus de `applyRowWrite` finit par un point, que la phrase pose une seule fois.
  const reason = `${refusals.slice(0, REFUSALS_SHOWN).map((refusal) => refusal.replace(/\.$/, "")).join("; ")}${more > 0 ? ` and ${more} more` : ""}`
  return created === null ? new PlatformError("invalid_arguments", `Nothing was written: ${reason}.`) : createdEmpty("invalid_arguments", created, reason)
}

/** Une ligne changée pendant l'écriture du lot (`conflict`, journalisé) : le lot se rejoue, dans le tableau créé s'il l'est. */
function meanwhile(lot: Lot, row: { line: number; rowKey: string }, what: "was created" | "changed"): PlatformError {
  const reason = `line ${row.line}: ${row.rowKey} ${what} meanwhile`
  const conflict = changedMeanwhile("tables: import", `${lot.table.node.id}#${row.rowKey}`, `${reason}; nothing was written. Import this lot again.`)
  return lot.created === null ? conflict : createdEmpty("conflict", lot.created, reason)
}

/**
 * Une création (AC-b3, AC-c1, D120) : le chemin libre (un nœud, visible ou non, ou l'ancien chemin d'un autre :
 * `conflict`, N31), le parent visible, sa gestion ; sinon le refus dit à qui demander. Rien n'est lu ni écrit
 * des lignes avant.
 */
async function requireCreation(context: ImportContext, path: string): Promise<void> {
  const { db, identity } = context
  if ((await lookupNode(db, identity, path)) ?? (await lookupAlias(db, identity, path))) throw notAvailable(path)
  const parentAt = parentPath(path) ?? ROOT_PATH
  const parent = await findNode(db, identity, parentAt)
  if (!parent) throw new PlatformError("not_found", `Cannot create ${path}: its parent ${parentAt} does not exist.`)
  if (parent.level >= ACCESS_LEVELS.manage) return
  const owner = await ownerOf(db, parent.node.id)
  const who = owner ? await describeOwner(db, identity, owner) : "its managers"
  throw new PlatformError("forbidden", reservedTo("publish", `a new table under ${parentAt}`, who))
}

/**
 * La colonne de chaque cellule (AC-b5, HN-E10S01-5) : son en-tête rapproché d'une colonne par `columnNameOf` ;
 * une colonne inconnue, nommée deux fois, ou l'état d'une file de travail, est ignorée et listée.
 */
function namesOf(header: TableHeader, headers: readonly string[]): { names: (string | null)[]; ignored: string[] } {
  const used = new Set<string>()
  const ignored: string[] = []
  const names = headers.map((cell, index) => {
    const name = columnNameOf(cell, index + 1)
    if (!columnOf(header, name) || name === header.lifecycle?.column || used.has(name)) {
      ignored.push(cell.trim() || name)
      return null
    }
    used.add(name)
    return name
  })
  return { names, ignored }
}

/** Le lot contrôlé (AC-b4) : bornes (`too_large`), puis chaque cellule, forme et clé (`invalid_arguments`). */
function checkedRows(header: ImportedHeader, names: readonly (string | null)[], request: ImportRequest): ImportRow[] {
  const checked = checkImport({ columns: header.columns, key: header.key, names, rows: request.rows, lines: request.lines })
  if (checked.tooLarge !== null) throw new PlatformError("too_large", `${checked.tooLarge.text}: ${BOUND_ADVICE[checked.tooLarge.bound]}`)
  if (checked.problems.length > 0) throw new PlatformError("invalid_arguments", `Nothing was written: ${importProblemsText(checked.problems)}.`)
  return checked.rows
}

/** Les valeurs nouvelles d'une ligne (AC-b5) : hors de la clé, sans celles égales à la valeur rangée, chacune avec sa preuve. */
function newValues(header: TableHeader, row: ImportRow, current: StoredRow | null, comment: string): Record<string, { value: CellValue; comment: string }> {
  const data = current && isRecord(current.data) ? current.data : {}
  const kept = Object.entries(row.values).filter(([name, value]) => {
    const column = name === header.key ? undefined : columnOf(header, name)
    return column !== undefined && !(current && sameValue(column, Object.hasOwn(data, name) ? data[name] : undefined, value))
  })
  return Object.fromEntries(kept.map(([name, value]) => [name, { value, comment }]))
}

type Counts = { created: number; updated: number; unchanged: number }

/** `created` : le chemin du tableau que cet appel vient de créer, que dit le refus d'un lot (HN-E10S01-21). */
type Lot = { context: ImportContext; table: LoadedTable; comment: string; now: number; created: string | null }

/**
 * Une ligne du lot, dans la transaction : inchangée, créée ou mise à jour sous garde de révision ; un refus
 * (tableau fermé, ligne réservée par un autre, colonne requise…) est rendu, et plus rien ne s'écrit.
 */
async function writeRow(lot: Lot, row: ImportRow & { rowKey: string }, current: StoredRow | null, refused: boolean): Promise<keyof Counts | string[]> {
  const { context, table, comment, now } = lot
  const { header, node } = table
  const set = newValues(header, row, current, comment)
  if (current && Object.keys(set).length === 0) return "unchanged"
  if (!current && header.closed) return [`line ${row.line}: ${row.rowKey} is not a row of this closed table; only existing rows can be written`]
  if (current && leaseActive(current, now) && current.claimed_by_user !== context.identity.user.id) {
    return [`line ${row.line}: ${row.rowKey} is claimed by worker ${current.claimed_by} until ${utcClock(current.lease_until ?? "")}`]
  }
  const actor: RowActor = { userId: context.identity.user.id, ctx: context.ctx ?? null, at: new Date(now).toISOString(), origin: "import" }
  const reviewQueue = `${context.origin ?? ""}/n/${node.path}`
  const write = applyRowWrite({ header, path: node.path, argPath: `line ${row.line}`, reviewQueue, current, input: { key: row.rowKey, set }, actor })
  if (write.problems.length > 0) return write.problems.map((problem) => `line ${row.line}: ${problem}`)
  if (refused) return "unchanged"
  if (!current) {
    const inserted = await insertRow(context.db, { nodeId: node.id, key: row.rowKey, data: write.data, provenance: write.provenance, userId: actor.userId })
    if (inserted === "duplicate") throw meanwhile(lot, row, "was created")
    return "created"
  }
  if (!write.effective) return "unchanged"
  const values = { data: asJson(write.data), provenance: asJson(write.provenance), revision: current.revision + 1, updated_by: actor.userId }
  if (!(await updateRow(context.db, current, values))) throw meanwhile(lot, row, "changed")
  return "updated"
}

/** Le lot en une transaction, tout ou rien (AC-b5, AC-c1) : les lignes des clés lues en une fois, puis une à une. */
async function writeLot(lot: Lot, rows: readonly ImportRow[]): Promise<Counts> {
  const { table } = lot
  const keyed = rows.map((row) => ({ ...row, keyed: rowKey(table.header, row.key) }))
  const invalid = keyed.flatMap((row) => ("problem" in row.keyed ? [`line ${row.line}: ${row.keyed.problem}`] : []))
  if (invalid.length > 0) throw nothingWritten(invalid, lot.created)
  const lotRows = keyed.flatMap((row) => ("key" in row.keyed ? [{ ...row, rowKey: row.keyed.key }] : []))
  return inTransaction(lot.context.db, "tables: import", async () => {
    const stored = await rowsByKey(lot.context.db, table.node.id, lotRows.map((row) => row.rowKey))
    const counts: Counts = { created: 0, updated: 0, unchanged: 0 }
    const refusals: string[] = []
    for (const row of lotRows) {
      const outcome = await writeRow(lot, row, stored.get(row.rowKey) ?? null, refusals.length > 0)
      if (typeof outcome === "string") counts[outcome]++
      else refusals.push(...outcome)
    }
    // Un refus annule la transaction : rien du lot n'est écrit (tout ou rien).
    if (refusals.length > 0) throw nothingWritten(refusals, lot.created)
    return counts
  })
}

/**
 * Le tableau créé et publié par le service de `write` (E07-S04) : son chemin, que la publication rend. Le registre
 * importe ce module, et la publication relit le registre (contrôle des procédures) : lu à l'appel, par un import
 * dynamique, `write` ne forme pas de cycle d'import (précédent : `functionNames` de `tables/schema.ts`).
 */
async function createTable(context: ImportContext, request: ImportRequest, create: NonNullable<ImportRequest["create"]>): Promise<string> {
  const { title, summary, header } = create
  const body = { path: request.path, kind: "table", title, summary, header, publish: true }
  const { writeNode } = await import("../nodes/write")
  const output = await writeNode(context.db, context.identity, body, request.by)
  return typeof output.data?.path === "string" ? output.data.path : request.path
}

/**
 * Un import (AC-b3 à AC-b5, AC-c1) : les droits, le contrôle de tout le lot, la création au besoin, puis
 * l'écriture en une transaction. Lève les refus nommés ; rend les lignes créées, mises à jour, inchangées, et les
 * colonnes ignorées.
 */
export async function importRows(context: ImportContext, request: ImportRequest): Promise<ImportOutcome> {
  const lot = { context, comment: request.comment, now: Date.now(), created: null }
  if (request.create) {
    await requireCreation(context, request.path)
    const header: TableHeader = { ...request.create.header, closed: false, proof: false }
    const { names, ignored } = namesOf(header, request.headers)
    const rows = checkedRows(request.create.header, names, request)
    const created = await createTable(context, request, request.create)
    try {
      const table = await loadTable(context, created)
      // L'équipe se lit avant la première ligne écrite : sa panne ne suit jamais l'effet (`output.ts`).
      const teamId = await tableTeamId(context.db, table)
      const counts = await writeLot({ ...lot, table, created }, rows)
      return { table, ...counts, ignored, teamId }
    } catch (error) {
      throw afterCreation(created, error)
    }
  }
  const table = await loadTable(context, request.path)
  await requireWrite(context, table)
  if (request.key !== undefined && columnNameOf(request.key, 1) !== table.header.key) {
    throw new PlatformError("invalid_arguments", `key « ${request.key} » is not the key of ${table.node.path}, which is ${table.header.key}. Rows are matched on it.`)
  }
  const teamId = await tableTeamId(context.db, table)
  const { names, ignored } = namesOf(table.header, request.headers)
  const rows = checkedRows(table.header, names, request)
  const counts = await writeLot({ ...lot, table }, rows)
  return { table, ...counts, ignored, teamId }
}

/**
 * Un lot de l'écran, `POST tables/import` (AC-b3, AC-b5, AC-b7) : validé par `tableImportBodySchema`, chaque
 * chaîne bien formée ; le commentaire de ses valeurs dit le fichier, ou la page d'un tableau simple converti.
 */
export async function importLot(context: ImportContext, body: unknown): Promise<{ data: Record<string, unknown>; target: string; teamId: string | null }> {
  const parsed = tableImportBodySchema.safeParse(body)
  if (!parsed.success) throw invalidInput(parsed.error)
  const lot = wellFormed(parsed.data)
  const comment = lot.converted_from ? `Converti depuis ${lot.converted_from}` : `Importé de ${lot.file_name ?? ""}`
  const outcome = await importRows(context, { path: lot.table, by: { kind: "human" }, comment, create: lot.create, headers: lot.columns, rows: lot.rows })
  const path = outcome.table.node.path
  const { created, updated, unchanged, ignored } = outcome
  return { data: { path, created, updated, unchanged, ignored }, target: path, teamId: outcome.teamId }
}

// ------------------------------------------------------------------------------ `table.import` (AC-c1)

/**
 * L'en-tête d'un tableau créé par `table.import` (AC-b2, AC-c1) : les noms de la ligne d'en-tête, les types
 * déduits, la clé nommée par l'appel, sinon déduite ; sans elle, le refus d'AC-c1 (aucune clé générée par `call`).
 */
function inferredHeader(headers: readonly string[], rows: readonly (readonly string[])[], key: string | undefined): ImportedHeader {
  const names = columnNames(headers)
  const inferred = inferTable(rows, names)
  if (key === undefined) {
    if (inferred.key === null) throw new PlatformError("invalid_arguments", "no column has a value on every line, all distinct: pass key, the column that identifies a row")
    return { columns: inferred.columns, key: inferred.key }
  }
  const wanted = names.find((name, index) => name === columnNameOf(key, index + 1) || headers[index].trim() === key.trim())
  if (wanted === undefined) throw new PlatformError("invalid_arguments", `key « ${key} » is not a column of the header line. Columns: ${names.join(", ")}.`)
  return { columns: inferred.columns, key: wanted }
}

/** Le compte rendu (AC-c1) : le même en texte et en champs ; le tableau créé, les colonnes ignorées. */
function importReport(outcome: ImportOutcome, created: ImportedHeader | undefined): FunctionOutput {
  const path = outcome.table.node.path
  const { ignored } = outcome
  const lines = [
    ...(created ? [`Created and published ${path}: ${created.columns.map((column) => `${column.name} (${column.type})`).join(", ")}; key ${created.key}.`] : []),
    `${path}: ${formatCount(outcome.created)} row(s) created, ${formatCount(outcome.updated)} updated, ${formatCount(outcome.unchanged)} unchanged.`,
    ...(ignored.length > 0 ? [`Ignored columns, not in the table or its state column: ${ignored.join(", ")}.`] : []),
  ]
  const data = {
    table: path,
    created: outcome.created,
    updated: outcome.updated,
    unchanged: outcome.unchanged,
    ...(created ? { columns: created.columns, key: created.key } : {}),
    ...(ignored.length > 0 ? { ignored } : {}),
  }
  return { text: lines.join("\n"), data }
}

async function runImport(context: FunctionContext, validated: TableImportArgs): Promise<FunctionOutput> {
  // Aucune moitié de paire de substitution vers la base (`supabase-patterns.md § Error Handling`).
  const args = wellFormed(validated)
  const size = charCount(args.csv)
  if (size > IMPORT_CSV_MAX) throw new PlatformError("too_large", `csv is ${formatCount(size)} characters; ${formatCount(IMPORT_CSV_MAX)} at most per call: ${PIECES}`)
  const read = parseCsv(args.csv, detectSeparator(args.csv))
  if ("unclosedQuote" in read) throw new PlatformError("invalid_arguments", `Nothing was written: line ${read.unclosedQuote}: a quote is never closed.`)
  const [headers = [], ...rows] = read.rows
  const header = args.create ? inferredHeader(headers, rows, args.key) : undefined
  const outcome = await importRows(context, {
    path: args.table,
    by: { kind: "agent", ctx: context.ctx ?? null },
    comment: `Importé de ${args.file_name ?? "table.import"}`,
    ...(args.create && header ? { create: { ...args.create, header } } : { key: args.key }),
    headers: header ? header.columns.map((column) => column.name) : headers,
    rows,
    lines: read.lines.slice(1),
  })
  return tableResult(outcome.table, importReport(outcome, header), outcome.teamId)
}

export const tableImport = defineFunction({
  name: "table.import",
  connector: "table",
  class: "write",
  origin: "paquet",
  description:
    "Imports the rows of a CSV into a table, matched on its key; with create, creates and publishes the table first. A CSV or a spreadsheet the user gives you becomes a table: use table.import, in pieces of 40,000 characters, each starting with the header line. Each piece is checked whole, then written whole or not at all: a row whose key exists is updated, a value equal to the stored one is ignored, and every new value carries the provenance import with the file name, which stands as its proof. With create, the types are read from the values (bool, number, date, datetime, email, url, else text) and the key is the first column whose values are all present and distinct, unless you pass key; it needs the manage level on the parent. Columns the table does not have are ignored and listed.",
  schema: tableImportArgsSchema,
  examples: [
    {
      table: "ventes/clients",
      csv: "Nom;Ville;Chiffre d'affaires\nBoulangerie du Pont;Valbrune;12 500,50\nAtelier 2;Brémontier;8 000",
      create: { title: "Clients", summary: "Les clients exportés du logiciel de facturation." },
      file_name: "clients.csv",
    },
    { table: "ventes/clients", csv: "Nom;Ville\nAtelier 2;Valbrune", file_name: "clients.csv" },
  ],
  refusals: [
    "A cell that does not fit its column, an empty or duplicate key, a line whose cells do not match the header line, or a quote never closed: nothing is written; the refusal lists ten problems at most (line, column, value, what was expected).",
    "create without key and no column whose values are all present and distinct: pass key, the column that identifies a row.",
    `More than ${formatCount(IMPORT_CSV_MAX)} characters or ${formatCount(IMPORT_ROWS_MAX)} lines: ${PIECES}`,
    `More than ${formatCount(IMPORT_COLUMNS_MAX)} columns: ${BOUND_ADVICE.columns} A cell of more than ${formatCount(IMPORT_CELL_MAX)} characters: ${BOUND_ADVICE.cell}`,
    "create on a path already taken; an unknown table without create: the refusal lists the tables you can read.",
    "create without the manage level on the parent, or no write level on the table: the refusal says whom to ask.",
    "A new key in a closed table, a required column missing on a new row, a row claimed by someone else: nothing is written.",
  ],
  next: ["table.rows", "table.write", "table.import"],
  run: runImport,
})
