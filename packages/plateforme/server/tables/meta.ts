// Valeurs typées et chargement d'un tableau (E07-S01, AC3, AC4 ; H68, H90, H123). `valueProblem` est
// la règle d'une valeur par type, partagée avec l'écriture (E07-S02) et les filtres ; `loadTable`
// décide avant toute lecture de lignes : niveau calculé par `access.ts` (E01-S07, par `findNode`
// d'E03-S03), niveau 0 = tableau inconnu. Sans lui, chaque fonction relirait l'en-tête et déciderait
// seule du droit de lire.
//
// Repris de la maquette (`mcp-test/src/proto/functions/table.ts` l. 26-61) : `loadTable`, « Tables you
// can read », `valueProblem`. Retiré : l'équipe portée par le nœud (→ niveau d'`access.ts`), `null`
// servi, le refus « reserved » d'un tableau invisible (→ inconnu, H68). Repris d'Oto
// (`datastore/validation.py` l. 43-155) : une règle par type, un nombre refuse un booléen ; retiré :
// `"42"` accepté pour un nombre (refusé ici, AC3), la valeur hors options écartée en silence.
import type { CellValue, TableColumn, TableHeader } from "../../schemas"
import { ACCESS_LEVELS, nodeLevels, type AccessLevel } from "../access"
import type { PlatformDb } from "../db"
import { boundedList, inTransaction, PlatformError, READ_PAGE_ROWS } from "../errors"
import type { Identity } from "../identity"
import { cut } from "../journal"
import { charCount, formatCount } from "../nodes/document"
import { findNode, type NodeRow } from "../nodes/lookup"
import { isRecord, isValidDate } from "../../schemas/tables"
import { keyColumn, parseTableHeader } from "./header"

// La règle d'une date vit dans `schemas/tables.ts`, que l'adresse de l'écran lit aussi (E07-S03) ; les
// filtres la lisent toujours ici.
export { isValidDate }

/** Texte sans `max_length` (N2) ; adresse email (AC3) ; URL (AC3). */
const TEXT_MAX = 2_000
const EMAIL_MAX = 254
const URL_MAX = 2_000

/** Une valeur citée dans un refus : son JSON, coupé à 50 caractères (`cut`, N30). */
export function shown(value: unknown): string {
  return cut(JSON.stringify(value) ?? String(value), 50)
}

/** Longueur maximale d'une colonne de texte, d'email ou d'URL ; `null` pour les autres types. */
export function maxLengthOf(column: TableColumn): number | null {
  if (column.type === "text") return column.max_length ?? TEXT_MAX
  if (column.type === "email") return Math.min(column.max_length ?? EMAIL_MAX, EMAIL_MAX)
  if (column.type === "url") return Math.min(column.max_length ?? URL_MAX, URL_MAX)
  return null
}

const DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))$/

/** L'instant (ms) d'une date et heure ISO 8601 avec fuseau (`Z` ou décalage) ; `null` sinon. */
export function instantOf(value: string): number | null {
  const match = DATETIME.exec(value)
  if (!match || !isValidDate(match[1])) return null
  const [hour, minute, second, offsetHour, offsetMinute] = match.slice(2).map((part) => Number(part ?? 0))
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null
  const instant = Date.parse(value)
  return Number.isNaN(instant) ? null : instant
}

function textProblem(value: unknown, max: number, expected: string): string | null {
  if (typeof value !== "string") return `expected ${expected} (not ${shown(value)})`
  const length = charCount(value)
  return length > max ? `expected ${expected} of ${formatCount(max)} characters at most (not ${formatCount(length)} characters)` : null
}

/** Une adresse email (AC3) : un seul `@`, une partie de chaque côté, sans espace. */
function isEmail(value: string): boolean {
  const parts = value.split("@")
  return parts.length === 2 && parts[0] !== "" && parts[1] !== "" && !/\s/.test(value)
}

/** Une colonne email ou url : un texte sous sa longueur, puis sa forme. */
function addressProblem(column: TableColumn, value: unknown): string | null {
  const email = column.type === "email"
  const tooLong = textProblem(value, maxLengthOf(column) ?? TEXT_MAX, email ? "an email address" : "a URL")
  if (tooLong !== null || typeof value !== "string") return tooLong
  if (email) return isEmail(value) ? null : `expected an email address, e.g. contact@example.test (not ${shown(value)})`
  return /^https?:\/\/\S+$/i.test(value) ? null : `expected a URL starting with http:// or https:// (not ${shown(value)})`
}

/**
 * Pourquoi une valeur ne convient pas à la colonne, ou `null` (AC3). `null` n'est jamais une valeur ;
 * un nombre est un nombre JSON (`"12000"` refusé), un booléen un booléen JSON (`"true"` refusé).
 */
export function valueProblem(column: TableColumn, value: unknown): string | null {
  if (value === null || value === undefined) return "expected a value (not null)"
  switch (column.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : `expected a number, e.g. 12000 (not ${shown(value)})`
    case "bool":
      return typeof value === "boolean" ? null : `expected true or false (not ${shown(value)})`
    case "enum":
      return typeof value === "string" && (column.options ?? []).includes(value) ? null : `expected one of: ${(column.options ?? []).join(", ")}`
    case "date":
      return typeof value === "string" && isValidDate(value) ? null : `expected a date YYYY-MM-DD, e.g. 2026-09-24 (not ${shown(value)})`
    case "datetime":
      return typeof value === "string" && instantOf(value) !== null
        ? null
        : `expected a date and time with a time zone, e.g. 2026-09-24T14:30:00Z (not ${shown(value)})`
    case "email":
    case "url":
      return addressProblem(column, value)
    case "text":
      return textProblem(value, maxLengthOf(column) ?? TEXT_MAX, "a text")
  }
}

/**
 * Une date et heure ISO 8601 avec fuseau, en UTC `…Z` (`datetime-patterns.md § Dates`) ; tout autre
 * texte tel quel : une valeur rangée (AC3) comme une date de provenance servie (AC13).
 */
export function utcText(value: string): string {
  const instant = instantOf(value)
  return instant === null ? value : new Date(instant).toISOString()
}

/** La forme rangée d'une valeur conforme : une date et heure passe en UTC `…Z` (AC3) ; le reste tel quel. */
export function normalizeValue(column: TableColumn, value: CellValue): CellValue {
  return column.type === "datetime" && typeof value === "string" ? utcText(value) : value
}

// ------------------------------------------------------------------------------ Cellules d'une ligne

/** Un bloc `row` lu (E01-S06 § Contrat, 1) : clé en texte, `data` et `provenance` non contrôlés en base. */
export type RowBlock = {
  key: string
  data: unknown
  provenance: unknown
  revision: number
  claimed_by: string | null
  claimed_by_user: string | null
  lease_until: string | null
}

/** Une valeur de `data` servie : scalaire tel quel, tout autre JSON en texte (hors type) ; `null` : pas de valeur. */
function cellValue(raw: unknown): CellValue | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === "string" || typeof raw === "boolean") return raw
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : String(raw)
  return JSON.stringify(raw)
}

/** La clé dans le type de la colonne clé (AC7) : un nombre pour une clé `number` écrite en décimal. */
export function keyValue(key: string, header: TableHeader): string | number {
  if (keyColumn(header).type !== "number" || !/^-?\d+(\.\d+)?$/.test(key)) return key
  const number = Number(key)
  return Number.isFinite(number) ? number : key
}

/**
 * Les cellules d'une ligne (N16) : les seules colonnes déclarées qui ont une valeur dans `data` ; la
 * colonne clé porte la clé du bloc. Une clé de `data` hors en-tête et un `null` rangé ne comptent pas.
 */
export function rowCells(row: Pick<RowBlock, "key" | "data">, header: TableHeader): Map<string, CellValue> {
  const data = isRecord(row.data) ? row.data : {}
  const cells = new Map<string, CellValue>()
  for (const column of header.columns) {
    const value = column.name === header.key ? keyValue(row.key, header) : cellValue(data[column.name])
    if (value !== undefined) cells.set(column.name, value)
  }
  return cells
}

// ------------------------------------------------------------------------------- Chargement (AC4)

export type LoadedTable = { node: NodeRow; header: TableHeader; level: AccessLevel; movedFrom: string | null; movedAt: string | null }

/** Tableaux nommés au plus dans le refus d'un tableau inconnu, après le filtre des niveaux (HN-E01S07-8). */
const TABLES_LISTED = 20

const KIND_NAMES: Record<string, string> = { page: "a page", procedure: "a procedure", context: "a Contexte" }

/** Refus d'un tableau jamais publié (AC4) ; `read` le sert en corps (AC18). */
export function noHeaderMessage(path: string, prefix: string): string {
  return `Table ${path} has no published header yet: its owner publishes it with ${prefix}_write.`
}

/**
 * L'en-tête publié d'un tableau (`nodes.meta`) ; `missing` pour un tableau jamais publié (révision 0 ou
 * en-tête vide, E07-S04). Un en-tête publié invalide (semé par la clé service) → `internal`, le
 * problème au log du serveur (N13).
 */
export function publishedHeader(node: NodeRow): { header: TableHeader } | { missing: true } {
  if (node.revision === 0 || node.meta === null || (isRecord(node.meta) && Object.keys(node.meta).length === 0)) return { missing: true }
  const parsed = parseTableHeader(node.meta)
  if ("header" in parsed) return parsed
  console.error(`[platform] tables: invalid published header of ${node.path}:`, boundedList(parsed.problems, "; "))
  throw new PlatformError("internal", "Internal error.")
}

/** Une page des tableaux de l'organisation, par chemin, après `after` (face SQL, E01-S10). */
async function tablesPage(db: PlatformDb, orgId: string, after: string | null): Promise<{ id: string; path: string }[]> {
  return inTransaction(db, "tables: readable tables", (sql) => sql<{ id: string; path: string }[]>`
      select id, path from platform.nodes
       where org_id = ${orgId} and kind = ${"table"} and (${after}::text is null or path > ${after})
       order by path
       limit ${READ_PAGE_ROWS}`)
}

/**
 * Les 20 premiers tableaux lisibles, par chemin : pages de `READ_PAGE_ROWS` ordonnées par chemin,
 * niveaux par lot (`nodeLevels`, au seuil de la lecture), jusqu'à 20 gardés ou une page courte.
 */
async function readableTables(db: PlatformDb, identity: Identity): Promise<string[]> {
  const readable: string[] = []
  let after: string | null = null
  for (;;) {
    const data = await tablesPage(db, identity.org.id, after)
    // Un filtre de liste compare `nodeLevels` à 1 seulement (`security-patterns.md § Droits dans le service`).
    const levels = await nodeLevels(db, identity, data.map((row) => row.id))
    readable.push(...data.filter((row) => (levels.get(row.id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read).map((row) => row.path))
    if (readable.length >= TABLES_LISTED || data.length < READ_PAGE_ROWS) return readable.slice(0, TABLES_LISTED)
    after = data[data.length - 1].path
  }
}

async function unknownTable(db: PlatformDb, identity: Identity, path: string): Promise<PlatformError> {
  const tables = await readableTables(db, identity)
  const listed = tables.length > 0 ? `Tables you can read: ${tables.join(", ")}. Use ${identity.org.prefix}_find with type table for more.` : "You cannot read any table here."
  return new PlatformError("not_found", `Unknown table ${path}. ${listed}`)
}

/**
 * Le tableau d'un chemin, son en-tête publié et le niveau de l'appelant (AC4), décidés avant toute
 * lecture de lignes : `findNode` (organisation de l'identité, niveau d'`access.ts`, alias dès
 * E03-S07) ; niveau 0 comme chemin inconnu → `not_found` qui liste les tableaux lisibles ; autre
 * genre → `invalid_arguments` ; jamais publié → `conflict`.
 */
export async function loadTable(context: { db: PlatformDb; identity: Identity }, path: string): Promise<LoadedTable> {
  const { db, identity } = context
  const wanted = path.trim()
  const found = await findNode(db, identity, wanted)
  if (!found) throw await unknownTable(db, identity, wanted)
  const { node } = found
  const prefix = identity.org.prefix
  if (node.kind !== "table") {
    throw new PlatformError("invalid_arguments", `${node.path} is ${KIND_NAMES[node.kind] ?? `a ${node.kind}`}, not a table. Read it with ${prefix}_read.`)
  }
  const published = publishedHeader(node)
  if ("missing" in published) throw new PlatformError("conflict", noHeaderMessage(node.path, prefix))
  return { node, header: published.header, level: found.level, movedFrom: found.movedFrom, movedAt: found.movedAt }
}
