// Tri typé et curseur de `table.rows` (E07-S01, AC9, AC12 ; H96, N5, N7). Fichier à part de
// `rows.ts` pour la borne de 300 lignes (story, § Fichiers à créer). Fonctions pures, sans base.
//
// Repris d'Oto (`datastore/declaration.py` l. 202-226 et `lecture.py` l. 79-163) : tri selon le type
// déclaré, rang d'option pour un `enum`, hors type en queue ; curseur opaque, refusé sur une autre
// requête, `next_cursor` seulement s'il reste des lignes. Retiré : les deux régimes de curseur (un
// seul ici : position et dernière clé servie), le tri textuel des nombres.
import { blockKeySchema, normalizeTitle, type CellValue, type TableColumn, type TableHeader, type TableSort } from "../../schemas"
import { isRecord } from "../../schemas/tables"
import { PlatformError } from "../errors"
import { fingerprint } from "../nodes/read-format"
import { comparedCell } from "./filters"
import { columnOf, keyColumn } from "./header"
import type { RowBlock } from "./meta"

/** Comparaison naturelle, sans casse ni accent : « Atelier 2 » avant « Atelier 10 », « École » avec « Ecole ». */
export const NATURAL = new Intl.Collator("fr", { numeric: true, sensitivity: "base" })

/** Une ligne lue et ses cellules (`rowCells`), calculées une fois pour le filtre, `q` et le tri. */
type RowEntry = { block: RowBlock; cells: Map<string, CellValue> }

/** Rang d'une cellule dans un tri : 0 valeur du type, 1 hors type, 2 sans valeur (N5). */
type SortValue = { tier: 0 | 1 | 2; value: number | string }

const TEXT_TYPES: readonly string[] = ["text", "email", "url"]

function sortValue(column: TableColumn, cell: CellValue | undefined): SortValue {
  if (cell === undefined) return { tier: 2, value: 0 }
  if (TEXT_TYPES.includes(column.type)) return typeof cell === "string" ? { tier: 0, value: cell } : { tier: 1, value: 0 }
  if (column.type === "enum") {
    const rank = typeof cell === "string" ? (column.options ?? []).indexOf(cell) : -1
    return rank >= 0 ? { tier: 0, value: rank } : { tier: 1, value: 0 }
  }
  const typed = comparedCell(column, cell)
  if (!typed) return { tier: 1, value: 0 }
  return { tier: 0, value: typed.kind === "bool" ? Number(typed.value) : typed.value }
}

function compareValues(column: TableColumn, a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  if (TEXT_TYPES.includes(column.type)) return NATURAL.compare(String(a), String(b))
  // Une date `YYYY-MM-DD` validée : l'ordre des caractères est l'ordre chronologique.
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

/** L'ordre des clés (N5) : typé sur la colonne clé (un nombre pour une clé `number`), naturel sinon, puis exact. */
function keyOrder(header: TableHeader): (a: RowEntry, b: RowEntry) => number {
  const column = keyColumn(header)
  return (a, b) => {
    const [x, y] = [a.cells.get(column.name), b.cells.get(column.name)]
    if (typeof x === "number" && typeof y === "number" && x !== y) return x - y
    const [p, q] = [a.block.key, b.block.key]
    return NATURAL.compare(p, q) || (p < q ? -1 : p > q ? 1 : 0)
  }
}

/**
 * Les lignes triées (AC9) : par la colonne demandée selon son type, les valeurs hors type puis les
 * cellules vides en dernier dans les deux sens, égalité départagée par la clé croissante ; sans
 * `sort`, par la clé (AC6).
 */
export function sortRows(entries: readonly RowEntry[], header: TableHeader, sort: TableSort | undefined): RowEntry[] {
  const byKey = keyOrder(header)
  const column = sort ? columnOf(header, sort.column) : undefined
  if (!column) return [...entries].sort(byKey)
  const sign = sort?.direction === "desc" ? -1 : 1
  const valued = entries.map((entry) => ({ entry, value: sortValue(column, entry.cells.get(column.name)) }))
  valued.sort((a, b) => {
    if (a.value.tier !== b.value.tier) return a.value.tier - b.value.tier
    const typed = a.value.tier === 0 ? sign * compareValues(column, a.value.value, b.value.value) : 0
    return typed || byKey(a.entry, b.entry)
  })
  return valued.map((item) => item.entry)
}

// ------------------------------------------------------------------------------------ Curseur (N7)

const INVALID_CURSOR = "Invalid cursor: pass the next_cursor of the previous page unchanged, or omit it."
const OTHER_QUERY = "This cursor belongs to another query (filter, q, match or sort changed): start again without cursor."

/** Un objet aux clés triées, pour qu'un même filtre écrit dans un autre ordre donne la même empreinte. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  )
}

/**
 * L'empreinte d'une requête : le tableau, `filter`, `q` (sans casse ni accent), `sort`, et `match: "any"` avec `q`
 * (E11-S19, AC-f3 : son ordre n'est pas celui du ET ; sans lui, l'empreinte d'avant) ; ni `columns` ni `limit`.
 */
export function queryPrint(nodeId: string, query: { filter?: unknown; q?: string; sort?: TableSort; match?: "all" | "any" }): string {
  const sort = query.sort ? [query.sort.column, query.sort.direction ?? "asc"] : null
  const any = query.q !== undefined && query.match === "any" ? ["any"] : []
  return fingerprint(JSON.stringify([nodeId, canonical(query.filter ?? null), query.q === undefined ? null : normalizeTitle(query.q), sort, ...any]))
}

/** Où reprendre : la position de la première ligne à servir, et la dernière clé servie (lecture par la base). */
export type TableCursor = { offset: number; after: string | null }

/** Un jeton opaque : base64url de `[empreinte, position, dernière clé]`. */
export function tableCursor(print: string, cursor: TableCursor): string {
  return Buffer.from(JSON.stringify([print, cursor.offset, cursor.after])).toString("base64url")
}

/**
 * Le contenu d'un jeton, ou `null` s'il est illisible. La dernière clé servie part dans un filtre de
 * la base (`key > after`, au-delà de 5 000 lignes) : elle n'est lue que si elle a la forme d'une clé
 * de `blocks` (`blockKeySchema` : 500 caractères au plus), jamais un texte libre du modèle dans
 * l'adresse de la requête (`supabase-patterns.md § Error Handling`).
 */
function decoded(token: string): [string, number, string | null] | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"))
    if (!Array.isArray(value) || value.length !== 3) return null
    const [print, offset, after] = value
    if (typeof print !== "string" || !Number.isInteger(offset) || offset < 0) return null
    if (after === null) return [print, offset, null]
    const key = blockKeySchema.safeParse(after)
    return key.success ? [print, offset, key.data] : null
  } catch {
    // Un jeton illisible est refusé par l'appelant, avec la consigne de le repasser tel quel.
    return null
  }
}

/** Le point de reprise d'un curseur (AC12) ; illisible, ou d'une autre requête → `invalid_arguments`. */
export function openCursor(token: string | undefined, print: string): TableCursor {
  if (token === undefined) return { offset: 0, after: null }
  const cursor = decoded(token)
  if (!cursor) throw new PlatformError("invalid_arguments", INVALID_CURSOR)
  if (cursor[0] !== print) throw new PlatformError("invalid_arguments", OTHER_QUERY)
  return { offset: cursor[1], after: cursor[2] }
}
