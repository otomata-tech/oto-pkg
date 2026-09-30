// Lecture et écriture d'un CSV (E10-S01, AC-b1, AC-b2, AC-b6) ; ses cellules, leur déduction et le contrôle d'un
// import sont dans `csv-cells.ts` (borne de 300 lignes d'ESLint). Fonctions pures,
// sans Zod (précédents : `blocks-render.ts`, `link-syntax.ts`), partagées par le dialogue d'import de l'écran,
// `table.import`, la conversion d'un tableau simple (AC-b7) et l'export d'un tableau. L'écran joue `checkImport`
// sur tout le fichier avant d'envoyer, le service le rejoue sur chaque lot : une seule règle, deux portes. Sans ce
// module, l'écran et le service liraient chacun un CSV à leur façon.
//
// Toute lecture est linéaire (`security-patterns.md § Validation des inputs`) : un parcours à la main pour le
// CSV, des expressions ancrées dont chaque caractère n'a qu'une lecture pour les cellules.
import { cutAtWord, slugOf } from "./nodes"
import { isRecord, type CellValue } from "./tables"

/** Les séparateurs lus, dans l'ordre qui départage une égalité (AC-b1). */
export const CSV_SEPARATORS = [";", "\t", ","] as const

export type CsvSeparator = (typeof CSV_SEPARATORS)[number]

/** Un nom de colonne : 60 caractères au plus (`COLUMN_NAME_PATTERN`) ; le segment d'un fichier importé ou d'un tableau converti, autant. */
export const IMPORT_NAME_MAX = 60

// ------------------------------------------------------------------------------------------- Lecture

/** Le BOM d'UTF-8 en tête, retiré avant toute lecture. */
const withoutBom = (text: string) => (text.startsWith("\uFEFF") ? text.slice(1) : text)

/** Le séparateur le plus fréquent hors guillemets sur la première ligne ; `;`, tabulation, `,` à égalité (AC-b1). */
export function detectSeparator(text: string): CsvSeparator {
  const counts = new Map<string, number>(CSV_SEPARATORS.map((separator) => [separator, 0]))
  const source = withoutBom(text)
  let quoted = false
  for (let at = 0; at < source.length; at++) {
    const char = source[at]
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === "\n" || char === "\r")) break
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1)
  }
  return CSV_SEPARATORS.reduce((best, separator) => ((counts.get(separator) ?? 0) > (counts.get(best) ?? 0) ? separator : best))
}

/** Les lignes d'un CSV, et le numéro de la ligne du texte où chacune commence (1 : la première). */
export type CsvTable = { rows: string[][]; lines: number[] }

/** Une apostrophe devant `=`, `+`, `-`, `@`, une tabulation ou un retour chariot : celle qu'un export pose (AC-b6). */
const unguarded = (cell: string) => (/^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell)

/**
 * Un CSV lu (RFC 4180, AC-b2) : BOM retiré ; guillemets doubles, `""` pour un guillemet, sauts de ligne dans une
 * cellule ; fins de ligne CRLF, LF ou CR ; une ligne vide ignorée ; l'apostrophe d'un export retirée. Un guillemet
 * jamais fermé : le problème, avec la ligne où il s'ouvre. Un seul parcours, chaque caractère lu une fois.
 */
export function parseCsv(text: string, separator: CsvSeparator): CsvTable | { unclosedQuote: number } {
  const source = withoutBom(text)
  const table: CsvTable = { rows: [], lines: [] }
  let row: string[] = []
  let field = ""
  let fresh = true
  let quoted = false
  let wasQuoted = false
  let line = 1
  let rowLine = 1
  let quoteLine = 0
  const endField = () => {
    row.push(unguarded(field))
    field = ""
    fresh = true
  }
  const endRow = () => {
    const blank = row.length === 0 && field === "" && !wasQuoted
    if (!blank) {
      endField()
      table.rows.push(row)
      table.lines.push(rowLine)
    }
    row = []
    field = ""
    fresh = true
    wasQuoted = false
  }
  for (let at = 0; at < source.length; at++) {
    const char = source[at]
    if (quoted) {
      // `""` : un guillemet dans la cellule ; `"` seul la ferme ; un saut de ligne y compte une ligne du texte.
      const doubled = char === '"' && source[at + 1] === '"'
      if (char === '"' && !doubled) quoted = false
      else field += char
      if (doubled) at++
      else if (char === "\n" || (char === "\r" && source[at + 1] !== "\n")) line++
    } else if (char === '"' && fresh) {
      quoted = true
      wasQuoted = true
      fresh = false
      quoteLine = line
    } else if (char === separator) {
      endField()
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[at + 1] === "\n") at++
      endRow()
      line++
      rowLine = line
    } else {
      field += char
      fresh = false
    }
  }
  if (quoted) return { unclosedQuote: quoteLine }
  endRow()
  return table
}

// --------------------------------------------------------------------------------------------- Noms

/**
 * Le nom de colonne d'un en-tête (AC-b2) : minuscules, accents retirés, chaque suite hors `[a-z0-9]` devient `_`,
 * `_` retirés aux bords, `c_` devant un chiffre initial, 60 caractères au plus ; vide : `colonne_<rang>`.
 */
export function columnNameOf(header: string, rank: number): string {
  const slug = slugOf(header, IMPORT_NAME_MAX)
  if (slug === "") return `colonne_${rank}`
  return /^[0-9]/.test(slug) ? cutAtWord(`c_${slug}`, IMPORT_NAME_MAX) : slug
}

/** Un nom pris : `_2`, `_3`… jusqu'à un nom libre, sous 60 caractères, la base coupée au mot (E11-S18). */
function freeName(base: string, used: ReadonlySet<string>): string {
  let name = base
  for (let rank = 2; used.has(name); rank++) name = `${cutAtWord(base, IMPORT_NAME_MAX - String(rank).length - 1)}_${rank}`
  return name
}

/** Les noms de colonne d'une ligne d'en-tête : `columnNameOf`, une collision prend `_2`, `_3`… (AC-b2). */
export function columnNames(headers: readonly string[]): string[] {
  const used = new Set<string>()
  return headers.map((header, index) => {
    const name = freeName(columnNameOf(header, index + 1), used)
    used.add(name)
    return name
  })
}

/** Le nom d'un fichier sans son extension : `clients.csv` → `clients`. */
export function fileBaseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/** L'extension d'un fichier, en minuscules : `Notes.MD` → `md` ; `""` sans extension. */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ""
}

/** Le segment de l'adresse d'un fichier importé (AC-a3, AC-b3) : `Comptes rendus.md` → `comptes_rendus` ; `import` sans lettre ni chiffre. */
export function segmentOf(fileName: string): string {
  return slugOf(fileBaseName(fileName), IMPORT_NAME_MAX) || "import"
}


/**
 * Une colonne `ligne` générée quand aucune ne peut servir de clé (AC-b2, à l'écran seulement) : `0001`, `0002`…,
 * `ligne_2` si le nom est pris ; en tête des colonnes.
 */
export function withLineKey(names: readonly string[], rows: readonly (readonly string[])[]): { key: string; names: string[]; rows: string[][] } {
  const key = freeName("ligne", new Set(names))
  return { key, names: [key, ...names], rows: rows.map((row, index) => [String(index + 1).padStart(4, "0"), ...row]) }
}

// ------------------------------------------------------------------------------------------- Écriture

/** Une cellule qu'un tableur lirait comme une formule : `=`, `+`, `-`, `@`, une tabulation, un retour chariot (AC-b6). */
const FORMULA = /^[=+\-@\t\r]/

/** Une cellule entre guillemets quand elle porte le séparateur, un guillemet ou un saut de ligne (RFC 4180). */
function quoted(text: string, separator: string): string {
  return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Une valeur écrite : un nombre à la décimale de la langue, jamais gardé ; un texte gardé d'une apostrophe. */
function written(value: CellValue | undefined, language: "fr" | "en", separator: string): string {
  if (value === undefined) return ""
  if (typeof value === "number") return language === "fr" ? String(value).replace(".", ",") : String(value)
  if (typeof value === "boolean") return String(value)
  return quoted(FORMULA.test(value) ? `'${value}` : value, separator)
}

/**
 * Le texte d'un export (AC-b6) : BOM UTF-8, les noms des colonnes en en-tête dans l'ordre du schéma, une ligne par
 * ligne du tableau ; `fr` : `;` et virgule décimale, sinon `,` et point ; une valeur absente, une cellule vide ;
 * lignes séparées par CRLF (RFC 4180). `parseCsv` le relit tel quel, apostrophes retirées.
 */
export function toCsv(columns: readonly { name: string }[], rows: readonly ReadonlyMap<string, CellValue>[], language: "fr" | "en"): string {
  const separator = language === "fr" ? ";" : ","
  const header = columns.map((column) => quoted(column.name, separator)).join(separator)
  const lines = rows.map((row) => columns.map((column) => written(row.get(column.name), language, separator)).join(separator))
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`
}

// ------------------------------------------------------------------------------- Cellules d'une ligne

/**
 * Ce que la lecture d'une ligne demande d'un en-tête : la colonne clé et les colonnes, nom et type ; un en-tête
 * publié (`TableHeader`) comme le tableau d'une page publique (`PublicTable`, clé lue dans `meta`).
 */
export type RowShape = { key: string | null; columns: readonly { name: string; type: string }[] }

/** Une valeur de `data` servie : scalaire tel quel, tout autre JSON en texte (hors type) ; `null` : pas de valeur. */
function cellValue(raw: unknown): CellValue | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === "string" || typeof raw === "boolean") return raw
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : String(raw)
  return JSON.stringify(raw)
}

/** La clé dans le type de la colonne clé (AC7) : un nombre pour une clé `number` écrite en décimal. */
export function keyValue(key: string, header: RowShape): string | number {
  if (header.columns.find((column) => column.name === header.key)?.type !== "number" || !/^-?\d+(\.\d+)?$/.test(key)) return key
  const number = Number(key)
  return Number.isFinite(number) ? number : key
}

/**
 * Les cellules d'une ligne (N16) : les seules colonnes déclarées qui ont une valeur dans `data` ; la
 * colonne clé porte la clé du bloc. Une clé de `data` hors en-tête et un `null` rangé ne comptent pas.
 * Partagées par les services (`server/tables/meta.ts` les réexporte) et la page publique : un même tableau
 * s'exporte à l'identique, connecté ou par un lien (E11-S05, AC-d1).
 */
export function rowCells(row: { key: string; data: unknown }, header: RowShape): Map<string, CellValue> {
  const data = isRecord(row.data) ? row.data : {}
  const cells = new Map<string, CellValue>()
  for (const column of header.columns) {
    const value = column.name === header.key ? keyValue(row.key, header) : cellValue(data[column.name])
    if (value !== undefined) cells.set(column.name, value)
  }
  return cells
}
