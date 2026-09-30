// Les cellules d'un import (E10-S01, AC-b2, AC-b4) : la lecture d'une cellule selon le type de sa colonne, la
// déduction des types et de la clé d'un tableau, le contrôle de tout un import (`checkImport`) et ses refus servis
// au modèle. Fonctions pures, partagées par le dialogue de l'écran, `table.import`, la conversion d'un tableau
// simple et le service `importRows`, qui rejoue le contrôle sur chaque lot. Fichier à part de `csv.ts` pour la
// borne de 300 lignes d'ESLint.
//
// Chaque cellule se lit en temps linéaire : des expressions ancrées dont chaque caractère n'a qu'une lecture
// (`security-patterns.md § Validation des inputs`).
import { chars } from "./blocks"
import { IMPORT_CELL_MAX, IMPORT_COLUMNS_MAX, IMPORT_ROWS_MAX, LINK_PATTERN } from "./table-write"
import { COLUMN_TEXT_MAX, instantOf, isEmail, isValidDate, KEY_COLUMN_TYPES, maxLengthOf, ROW_KEY_MAX, type CellValue, type ColumnType } from "./tables"

const count = (value: number) => value.toLocaleString("en-US")

/** Une valeur citée : coupée à 50 caractères (par point de code), entre guillemets. */
function quote(value: string): string {
  const points = Array.from(value.slice(0, 200))
  return JSON.stringify(points.length > 50 ? `${points.slice(0, 49).join("")}…` : points.join(""))
}

/** Une colonne lue ou écrite par un import : celle d'un en-tête de tableau, ou déduite (`inferTable`). */
export type ImportColumn = { name: string; type: ColumnType; options?: string[]; max_length?: number }

export type CellRead = { value: CellValue } | { empty: true } | { expected: string }

const BOOLEANS = new Map<string, boolean>([
  ["true", true],
  ["false", false],
  ["vrai", true],
  ["faux", false],
  ["oui", true],
  ["non", false],
  ["yes", true],
  ["no", false],
])

/** `1234`, `-12.5`, `12,5` ; jamais un zéro suivi d'un chiffre en tête (`01000` reste un code, HN-E10S01-28). */
const PLAIN_NUMBER = /^-?(?:0|[1-9]\d*)(?:([.,])\d+)?$/
/** `1 234,5` : groupes de trois séparés par une espace, une espace insécable ou une fine insécable, virgule décimale. */
const GROUPED_NUMBER = /^-?[1-9]\d{0,2}(?:[ \u00A0\u202F]\d{3})+(?:,\d+)?$/

/** Un nombre écrit, et son séparateur décimal (`null` : entier). */
function numberOf(text: string): { value: number; decimal: "." | "," | null } | null {
  const plain = PLAIN_NUMBER.exec(text)
  if (!plain && !GROUPED_NUMBER.test(text)) return null
  const value = Number(text.replace(/[ \u00A0\u202F]/g, "").replace(",", "."))
  if (!Number.isFinite(value)) return null
  const separator = plain ? plain[1] : text.includes(",") ? "," : undefined
  return { value, decimal: separator === "." || separator === "," ? separator : null }
}

/** Une date réelle, `YYYY-MM-DD` ou `JJ/MM/AAAA` (jamais mois d'abord, HN-E10S01-9), rangée `YYYY-MM-DD`. */
function dateOf(text: string): string | null {
  const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  const iso = french ? `${french[3]}-${french[2]}-${french[1]}` : text
  return isValidDate(iso) ? iso : null
}

/** Ce qu'attend une colonne, dans les refus servis au modèle. */
function expectedOf(column: ImportColumn): string {
  switch (column.type) {
    case "bool":
      return "true or false"
    case "number":
      return "a number"
    case "date":
      return "a date (YYYY-MM-DD or DD/MM/YYYY)"
    case "datetime":
      return "a date and time with a time zone"
    case "email":
      return "an email address"
    case "url":
      return "a URL starting with http:// or https://"
    case "enum": {
      const options = column.options ?? []
      return `one of: ${options.slice(0, 20).join(", ")}${options.length > 20 ? ", …" : ""}`
    }
    case "text":
      return `a text of ${count(maxLengthOf(column) ?? COLUMN_TEXT_MAX)} characters at most`
  }
}

/** Une valeur d'un type exigé par une forme, `null` sinon. */
function typedValue(column: ImportColumn, text: string): CellValue | null {
  switch (column.type) {
    case "bool":
      return BOOLEANS.get(text.toLowerCase()) ?? null
    case "number":
      return numberOf(text)?.value ?? null
    case "date":
      return dateOf(text)
    case "datetime":
      return instantOf(text) === null ? null : text
    case "enum":
      return (column.options ?? []).includes(text) ? text : null
    default: {
      const shaped = column.type === "email" ? isEmail(text) : column.type !== "url" || LINK_PATTERN.test(text)
      const fits = chars(text) <= (maxLengthOf(column) ?? COLUMN_TEXT_MAX) && shaped
      return fits ? text : null
    }
  }
}

/**
 * Une cellule lue selon le type de sa colonne (AC-b2) : vide (blancs seuls), sa valeur rangée, ou ce qu'elle
 * attendait. Un texte reste tel quel ; toute autre valeur se lit sans ses blancs de bord.
 */
export function readCell(column: ImportColumn, raw: string): CellRead {
  const trimmed = raw.trim()
  if (trimmed === "") return { empty: true }
  const value = typedValue(column, column.type === "text" ? raw : trimmed)
  return value === null ? { expected: expectedOf(column) } : { value }
}

// ------------------------------------------------------------------------------------------ Déduction

/** Les types déduits, dans l'ordre où une colonne prend le premier auquel toutes ses cellules répondent (AC-b2). */
const INFERRED: readonly ColumnType[] = ["bool", "number", "date", "datetime", "email", "url"]

/** Des nombres dont les uns portent `.` et les autres `,` décimaux : la colonne reste un texte (AC-b2). */
function mixedDecimals(values: readonly string[]): boolean {
  const seen = new Set(values.map((value) => numberOf(value.trim())?.decimal ?? null))
  return seen.has(".") && seen.has(",")
}

function inferColumn(name: string, cells: readonly string[]): ImportColumn {
  const values = cells.filter((cell) => cell.trim() !== "")
  const fits = (type: ColumnType) => values.every((value) => "value" in readCell({ name, type }, value))
  const type = values.length === 0 ? undefined : INFERRED.find((candidate) => fits(candidate) && (candidate !== "number" || !mixedDecimals(values)))
  if (type) return { name, type }
  const longest = values.reduce((most, value) => Math.max(most, chars(value)), 0)
  return longest > COLUMN_TEXT_MAX ? { name, type: "text", max_length: longest } : { name, type: "text" }
}

/**
 * La clé d'une ligne telle que l'import la compare : sans blancs de bord, un nombre en écriture canonique, une date
 * rangée `YYYY-MM-DD` (`29/09/2026` et `2026-09-29` désignent la même ligne, FB-0014).
 */
function keyText(column: ImportColumn, raw: string): string {
  const read = readCell(column, raw)
  return "value" in read && (typeof read.value === "number" || column.type === "date") ? String(read.value) : raw.trim()
}

/** Une clé que le service range (`rowKey`) : 200 caractères au plus, sans caractère de contrôle. */
const keyProblem = (key: string): string | null =>
  chars(key) > ROW_KEY_MAX ? `a key of ${count(ROW_KEY_MAX)} characters at most` : /\p{Cc}/u.test(key) ? "a key without control characters" : null

/** Les types d'une clé proposée : ceux d'une clé (`KEY_COLUMN_TYPES`) sauf `url`, qui ne se propose pas. */
const PROPOSED_KEY_TYPES: readonly ColumnType[] = KEY_COLUMN_TYPES.filter((type) => type !== "url")

/** Un nombre à virgule ne se propose jamais comme clé (FB-0014) : une colonne `number` n'y prétend qu'en entiers. */
const decimalsIn = (column: ImportColumn, cells: readonly string[]) => column.type === "number" && cells.some((cell) => (numberOf(cell.trim())?.decimal ?? null) !== null)

/**
 * La colonne clé proposée (AC-b2) : la première, dans l'ordre, de type `text`, `number` entier, `email` ou `date`
 * (FB-0014), dont toutes les valeurs sont présentes, distinctes une fois lues et rangeables comme clé ; `null` sinon.
 */
function proposedKey(columns: readonly ImportColumn[], rows: readonly (readonly string[])[]): string | null {
  const found = columns.findIndex((column, index) => {
    if (!PROPOSED_KEY_TYPES.includes(column.type) || decimalsIn(column, rows.map((row) => row[index] ?? ""))) return false
    const keys = rows.map((row) => keyText(column, row[index] ?? ""))
    return rows.length > 0 && keys.every((key) => key !== "" && keyProblem(key) === null) && new Set(keys).size === keys.length
  })
  return found === -1 ? null : columns[found].name
}

export type InferredTable = { columns: ImportColumn[]; key: string | null }

/** Les types et la clé d'un tableau tirés de ses lignes (AC-b2) ; `enum` n'est jamais déduit (HN-E10S01-3). */
export function inferTable(rows: readonly (readonly string[])[], names: readonly string[]): InferredTable {
  const columns = names.map((name, index) => inferColumn(name, rows.map((row) => row[index] ?? "")))
  return { columns, key: proposedKey(columns, rows) }
}

// ------------------------------------------------------------------------------------------- Contrôle

/**
 * Un problème d'un import (AC-b4) : `value`, une cellule hors de son type ; `key`, une clé vide, en double ou
 * que le service ne range pas ; `cells`, une ligne dont le nombre de cellules diffère de l'en-tête ;
 * `key_missing`, la colonne clé absente de l'en-tête. `expected`, en anglais, est servi au modèle ; l'écran écrit
 * sa phrase par `kind`, `type` et `first`.
 */
export type ImportProblem = {
  kind: "value" | "key" | "cells" | "key_missing"
  line: number | null
  column: string | null
  value: string
  expected: string
  /** Le type de la colonne d'une valeur refusée. */
  type?: ColumnType
  /** Pour une clé en double, la ligne qui la porte déjà. */
  first?: number
}

export type ImportPlan = {
  columns: readonly ImportColumn[]
  key: string
  /** La colonne de chaque cellule d'une ligne, par rang ; `null` : ignorée (inconnue, ou l'état d'une file). */
  names: readonly (string | null)[]
  rows: readonly (readonly string[])[]
  /** La ligne du texte où commence chaque ligne (`parseCsv`) ; sans elles, son rang + 2 (l'en-tête est la ligne 1). */
  lines?: readonly number[]
}

/** Une ligne contrôlée : sa clé telle que l'import la compare, et ses valeurs rangées par colonne. */
export type ImportRow = { line: number; key: string; values: Record<string, CellValue> }

/** Une borne dépassée (AC-b4) : laquelle, que la consigne du refus suit, et sa mesure. */
export type ImportBound = { bound: "lines" | "columns" | "cell"; text: string }

export type CheckedImport = { tooLarge: ImportBound | null; problems: ImportProblem[]; rows: ImportRow[] }

/** Les bornes d'un import (AC-b4) : lignes, colonnes, caractères d'une cellule ; `null` en deçà. */
function boundsProblem(plan: ImportPlan): ImportBound | null {
  if (plan.rows.length > IMPORT_ROWS_MAX) return { bound: "lines", text: `${count(plan.rows.length)} lines; ${count(IMPORT_ROWS_MAX)} at most per import` }
  if (plan.names.length > IMPORT_COLUMNS_MAX) return { bound: "columns", text: `${count(plan.names.length)} columns; ${count(IMPORT_COLUMNS_MAX)} at most` }
  const at = plan.rows.findIndex((row) => row.some((cell) => cell.length > IMPORT_CELL_MAX && chars(cell) > IMPORT_CELL_MAX))
  if (at === -1) return null
  return { bound: "cell", text: `line ${plan.lines?.[at] ?? at + 2}: a cell of more than ${count(IMPORT_CELL_MAX)} characters; ${count(IMPORT_CELL_MAX)} at most` }
}

type RowCheck = { byName: ReadonlyMap<string, ImportColumn>; keyIndex: number; seen: Map<string, number>; problems: ImportProblem[] }

/** La clé d'une ligne (AC-b4) : présente, du type de sa colonne, rangeable, jamais deux fois ; `null` et son problème sinon. */
function rowKeyOf(check: RowCheck, plan: ImportPlan, raw: string, line: number): { key: string; value: CellValue } | null {
  const column = check.byName.get(plan.key)
  if (!column) return null
  const read = readCell(column, raw)
  const refuse = (problem: Omit<ImportProblem, "line" | "column" | "value">): null => {
    check.problems.push({ line, column: plan.key, value: raw, ...problem })
    return null
  }
  if ("empty" in read) return refuse({ kind: "key", expected: "a key: every line needs one" })
  if ("expected" in read) return refuse({ kind: "value", expected: read.expected, type: column.type })
  const key = keyText(column, raw)
  const invalid = keyProblem(key)
  if (invalid !== null) return refuse({ kind: "key", expected: invalid })
  const first = check.seen.get(key)
  if (first !== undefined) return refuse({ kind: "key", expected: `a key: line ${first} has it already`, first })
  check.seen.set(key, line)
  return { key, value: read.value }
}

function checkRow(check: RowCheck, plan: ImportPlan, row: readonly string[], line: number): ImportRow | null {
  if (row.length !== plan.names.length) {
    check.problems.push({ kind: "cells", line, column: null, value: String(row.length), expected: String(plan.names.length) })
    return null
  }
  const values: Record<string, CellValue> = {}
  let valid = true
  plan.names.forEach((name, index) => {
    const column = name === null || index === check.keyIndex ? undefined : check.byName.get(name)
    if (!column) return
    const read = readCell(column, row[index])
    if ("value" in read) values[column.name] = read.value
    if (!("expected" in read)) return
    valid = false
    check.problems.push({ kind: "value", line, column: column.name, value: row[index], expected: read.expected, type: column.type })
  })
  const key = rowKeyOf(check, plan, row[check.keyIndex], line)
  if (!key || !valid) return null
  return { line, key: key.key, values: { ...values, [plan.key]: key.value } }
}

/**
 * Le contrôle de tout un import (AC-b4) : ses bornes d'abord (`tooLarge`), puis chaque ligne, dans l'ordre : le
 * nombre de ses cellules, chaque valeur lue selon le type de sa colonne (`readCell`), sa clé. L'écran le joue sur
 * tout le fichier avant d'envoyer, le service sur chaque lot avant d'en écrire une ligne ; rien ne s'écrit tant
 * qu'il rend un problème.
 */
export function checkImport(plan: ImportPlan): CheckedImport {
  const tooLarge = boundsProblem(plan)
  if (tooLarge !== null) return { tooLarge, problems: [], rows: [] }
  const keyIndex = plan.names.indexOf(plan.key)
  if (keyIndex === -1) {
    return { tooLarge: null, problems: [{ kind: "key_missing", line: null, column: plan.key, value: "", expected: "the key column" }], rows: [] }
  }
  const check: RowCheck = { byName: new Map(plan.columns.map((column) => [column.name, column])), keyIndex, seen: new Map(), problems: [] }
  const rows = plan.rows.flatMap((row, index) => checkRow(check, plan, row, plan.lines?.[index] ?? index + 2) ?? [])
  return { tooLarge: null, problems: check.problems, rows }
}

/** Problèmes cités au plus dans un refus servi au modèle, puis « and <n> more » (AC-c1). */
const PROBLEMS_SHOWN = 10

function problemText(problem: ImportProblem): string {
  if (problem.kind === "cells") return `line ${problem.line}: ${problem.value} cells; the header line has ${problem.expected}`
  if (problem.kind === "key_missing") return `column ${problem.column}: missing from the header line; it is the key of the table`
  return `line ${problem.line}, column ${problem.column}: ${quote(problem.value)} is not ${problem.expected}`
}

/** « line 4, column montant: "12 abc" is not a number; … and 3 more » : dix problèmes au plus (AC-c1). */
export function importProblemsText(problems: readonly ImportProblem[]): string {
  const more = problems.length - PROBLEMS_SHOWN
  return `${problems.slice(0, PROBLEMS_SHOWN).map(problemText).join("; ")}${more > 0 ? ` and ${more} more` : ""}`
}
