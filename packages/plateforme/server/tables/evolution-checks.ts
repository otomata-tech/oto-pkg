// Contrôles d'une publication d'en-tête sur les lignes déjà là (E07-S04, AC6 à AC10) : fonctions
// pures sur l'écart des deux en-têtes (`evolution.ts`) et les lignes lues. Refus, le brouillon gardé :
// type ou clé d'un tableau rempli (`conflict`), plus de 2 000 lignes à purger (`too_large`), retrait
// qui efface des valeurs sans `confirm_remove` (`needs_confirmation`). Sinon, des avertissements, qui
// ne réécrivent aucune ligne : « un format ne vaut que pour l'avenir ». Fichier à part d'`evolution.ts`
// pour la borne de 300 lignes (`coding-standards.md § Complexité`).
//
// Repris d'Oto (`datastore/schema_ops.py` l. 1-30, 531-617) : avertissements sur la donnée déjà là
// (valeurs trop longues, valeurs qu'un enum condamne), retrait confirmé qui dit ce qu'il touche.
// Retiré : `set_schema` qui remplace tout, la clé changée sur un tableau rempli.
import { isRecord, type TableColumn, type TableHeader } from "../../schemas/tables"
import { boundedList, PlatformError } from "../errors"
import { charCount, formatCount } from "../nodes/document"
import { plural } from "../nodes/op-kit"
import type { ColumnChange, HeaderDiff } from "./evolution"
import { keyValue, maxLengthOf, rowCells, type RowBlock } from "./meta"
import { leaseExpired } from "./rows"

/** Lignes au plus purgées par une publication (AC9) : au-delà, la requête dépasserait son temps. */
const PURGE_MAX_ROWS = 2_000

/** Clés au plus citées en échantillon (AC6). */
const SAMPLE_KEYS = 5

export type TableWarning = {
  kind: "missing_required" | "outside_options" | "too_long" | "working_rows" | "not_purged"
  column: string
  count: number
  sample_keys: (string | number)[]
}

/** Un avertissement et sa ligne de texte. */
export type Warned = { warning: TableWarning; text: string }

type Check = {
  path: string
  prefix: string
  /** Révision publiée : celle de l'appel qui confirme (AC8). */
  revision: number
  published: TableHeader | null
  target: TableHeader
  diff: HeaderDiff
  /** Les lignes du tableau, dans l'ordre naturel des clés (E07-S01) ; vide quand l'écart ne les lit pas. */
  rows: RowBlock[]
  confirmRemove: boolean
  now: number
}

/** Une ligne porte une colonne quand `data` ou `provenance` a une clé de ce nom : valeur, `verified_empty` ou trace. */
export function carries(row: Pick<RowBlock, "data" | "provenance">, column: string): boolean {
  return (isRecord(row.data) && Object.hasOwn(row.data, column)) || (isRecord(row.provenance) && Object.hasOwn(row.provenance, column))
}

/** « 12 rows », « 1 row ». */
export function rowsText(count: number): string {
  return `${formatCount(count)} ${plural(count, "row")}`
}

/** Le verbe accordé : « 1 row has », « 2 rows have ». */
function verb(count: number, one: string, many: string): string {
  return `${rowsText(count)} ${count === 1 ? one : many}`
}

/** « sample keys: Atelier 2, Atelier 10 » : les 5 premières clés, dans l'ordre des lignes. */
function sample(rows: readonly RowBlock[], header: TableHeader): { keys: (string | number)[]; text: string } {
  const keys = rows.slice(0, SAMPLE_KEYS).map((row) => keyValue(row.key, header))
  return { keys, text: `${keys.length === 1 ? "sample key" : "sample keys"}: ${keys.join(", ")}` }
}

function removedOptions(change: ColumnChange): string[] {
  if (change.before.type !== "enum" || change.after.type !== "enum") return []
  const kept = change.after.options ?? []
  return (change.before.options ?? []).filter((option) => !kept.includes(option))
}

/** Une longueur maximale plus courte, sur un texte, un email ou une URL de même type (AC6) ; `maxLengthOf` rend `null` pour les autres types. */
function shortened(change: ColumnChange): number | null {
  const { before, after } = change
  if (before.type !== after.type) return null
  const [was, now] = [maxLengthOf(before), maxLengthOf(after)]
  return was !== null && now !== null && now < was ? now : null
}

/** Une colonne requise qui refuse `verified_empty` (E11-S01, AC-b3) : seule une vraie valeur la remplit. */
function strict(column: TableColumn): boolean {
  return column.required === true && column.allow_verified_empty === false
}

/** Une colonne rendue requise, ou requise et rendue stricte (E11-S01, AC-b5) : des lignes peuvent n'y rien avoir. */
function madeRequired(change: ColumnChange): boolean {
  return (change.after.required === true && change.before.required !== true) || (strict(change.after) && !strict(change.before))
}

/** Le cycle de vie change d'état de travail (ou de colonne) : des lignes peuvent y être sous bail (AC6). */
function workingMoved(diff: HeaderDiff): NonNullable<HeaderDiff["lifecycle"]>["before"] {
  const { lifecycle } = diff
  if (!lifecycle?.before) return null
  const { before, after } = lifecycle
  return before.working !== after?.working || before.column !== after?.column ? before : null
}

/**
 * Les changements dont les contrôles lisent les lignes (AC9) : colonne ajoutée ou retirée, clé, type,
 * colonne rendue requise, option retirée, longueur raccourcie, état de travail. Fermer, rouvrir ou
 * élargir ne les lit pas.
 */
export function readsRows(diff: HeaderDiff): boolean {
  const narrowed = diff.changed.some((change) => change.attributes.includes("type") || madeRequired(change) || removedOptions(change).length > 0 || shortened(change) !== null)
  return diff.added.length > 0 || diff.removed.length > 0 || diff.key !== null || narrowed || workingMoved(diff) !== null
}

function refused(check: Check, reasons: string): string {
  return `Publication of ${check.path} refused: ${reasons} The draft is kept; nothing was published.`
}

/**
 * Un type changé sur une colonne qui a des valeurs, une clé changée sur un tableau qui a des lignes
 * (AC7, AC10) : chaque raison en une phrase, la première en minuscule après « refused: ».
 */
function conflictReasons(check: Check): string[] {
  const { diff, rows, published, prefix } = check
  if (!published) return []
  const types = diff.changed.flatMap((change) => {
    if (!change.attributes.includes("type")) return []
    const holding = change.name === published.key ? rows : rows.filter((row) => rowCells(row, published).has(change.name))
    if (holding.length === 0) return []
    const values = holding.length === 1 ? "a value on 1 row" : `values on ${rowsText(holding.length)}`
    return [
      `column « ${change.name} » holds ${values} (${sample(holding, published).text}); its type cannot change from ${change.before.type} to ${change.after.type}. Add a new column of type ${change.after.type}, copy the values with ${prefix}_call table.write, then remove « ${change.name} ».`,
    ]
  })
  const key = diff.key && rows.length > 0 ? [`its key cannot change from « ${diff.key.before} » to « ${diff.key.after} » while it has rows (${formatCount(rows.length)}). Create a new table keyed by ${diff.key.after} and copy the rows (${prefix}_call table.rows, then table.write).`] : []
  return [...types, ...key].map((reason, index) => (index === 0 ? reason : `${reason[0].toUpperCase()}${reason.slice(1)}`))
}

/** Les colonnes retirées et les lignes qui les portent (AC8). */
function removals(check: Check): { column: string; rows: RowBlock[] }[] {
  return check.diff.removed.map((column) => ({ column: column.name, rows: check.rows.filter((row) => carries(row, column.name)) }))
}

/** Refus d'un retrait trop grand (AC9) ou à confirmer (AC8, AC4). */
function checkRemovals(check: Check): void {
  const { path, prefix } = check
  const removed = removals(check)
  const erased = new Set(removed.flatMap((removal) => removal.rows)).size
  if (erased > PURGE_MAX_ROWS) {
    const names = boundedList(removed.map((removal) => `« ${removal.column} »`))
    const reason = `removing ${names} would erase values on ${rowsText(erased)}; ${formatCount(PURGE_MAX_ROWS)} at most per publication: clear them in batches with ${prefix}_call table.write, then remove the ${plural(removed.length, "column")}.`
    throw new PlatformError("too_large", refused(check, reason))
  }
  const held = removed.filter((removal) => removal.rows.length > 0)
  if (held.length === 0 || check.confirmRemove) return
  const header = check.published ?? check.target
  const clauses = boundedList(
    held.map((removal) => `removing column « ${removal.column} » erases its values on ${rowsText(removal.rows.length)} (${sample(removal.rows, header).text})`),
    "; ",
  )
  throw new PlatformError(
    "needs_confirmation",
    `Publication of ${path} needs confirmation: ${clauses}. Columns cannot be renamed: to rename one, add the new column, copy the values with ${prefix}_call table.write, then remove the old one. The draft is kept; nothing was published. If the user agrees to erase them, call ${prefix}_write {"path": "${path}", "base_revision": ${check.revision}, "header": {"confirm_remove": true}, "publish": true}.`,
  )
}

/** Les lignes d'un avertissement : son genre, sa colonne, et l'en-tête qui type leurs clés. */
type WarnedRows = { kind: TableWarning["kind"]; column: string; rows: readonly RowBlock[]; header: TableHeader }

/** Un avertissement sur des lignes, avec son échantillon de clés ; aucun sans ligne. */
export function warned(spec: WarnedRows, text: (count: number, sampled: string) => string): Warned[] {
  const { kind, column, rows, header } = spec
  if (rows.length === 0) return []
  const sampled = sample(rows, header)
  return [{ warning: { kind, column, count: rows.length, sample_keys: sampled.keys }, text: text(rows.length, sampled.text) }]
}

/** Une cellule renseignée : une valeur, ou `verified_empty` si la colonne publiée l'admet (AC6 ; E11-S01, AC-b5). */
function filled(row: RowBlock, column: TableColumn, header: TableHeader): boolean {
  const provenance = isRecord(row.provenance) ? row.provenance[column.name] : undefined
  const verifiedEmpty = column.allow_verified_empty !== false && isRecord(provenance) && provenance.origin === "verified_empty"
  return rowCells(row, header).has(column.name) || verifiedEmpty
}

function missingRequired(check: Check, header: TableHeader): Warned[] {
  const { diff, rows } = check
  const missing = (column: string, lacking: readonly RowBlock[]) =>
    warned({ kind: "missing_required", column, rows: lacking, header }, (count, sampled) => `${verb(count, "has", "have")} no value for required column ${column} (${sampled}).`)
  return [
    // Une colonne ajoutée n'a aucune valeur : ce qui restait sous son nom est purgé avant la publication (AC9).
    ...diff.added.filter((column) => column.required).flatMap((column) => missing(column.name, rows)),
    ...diff.changed
      .filter((change) => madeRequired(change) && change.name !== check.target.key)
      // Une colonne déjà requise, rendue stricte : seules les lignes qui n'y ont qu'un `verified_empty` (AC-b5).
      .flatMap((change) => missing(change.name, rows.filter((row) => !filled(row, change.after, header) && (change.before.required !== true || filled(row, change.before, header))))),
  ]
}

/** Une option retirée encore portée par des lignes (AC6). */
function outsideOptions(check: Check, header: TableHeader): Warned[] {
  return check.diff.changed.flatMap((change) =>
    removedOptions(change).flatMap((option) => {
      const holding = check.rows.filter((row) => rowCells(row, header).get(change.name) === option)
      return warned({ kind: "outside_options", column: change.name, rows: holding, header }, (count, sampled) => `${verb(count, "holds", "hold")} « ${option} », no longer an option of ${change.name} (${sampled}).`)
    }),
  )
}

/** Des valeurs plus longues que la nouvelle borne (AC6). */
function tooLong(check: Check, header: TableHeader): Warned[] {
  return check.diff.changed.flatMap((change) => {
    const max = shortened(change)
    if (max === null) return []
    const over = check.rows.filter((row) => {
      const value = rowCells(row, header).get(change.name)
      return typeof value === "string" && charCount(value) > max
    })
    return warned({ kind: "too_long", column: change.name, rows: over, header }, (count, sampled) => `${verb(count, "holds", "hold")} a value longer than ${formatCount(max)} characters in ${change.name} (${sampled}).`)
  })
}

/** Des lignes sous bail dans l'ancien état de travail : elles le gardent jusqu'à leur libération (AC6). */
function workingRows(check: Check, header: TableHeader): Warned[] {
  const working = workingMoved(check.diff)
  if (!working) return []
  const leased = check.rows.filter(
    (row) => rowCells(row, header).get(working.column) === working.working && row.claimed_by !== null && row.lease_until !== null && !leaseExpired(row, check.now),
  )
  return warned({ kind: "working_rows", column: working.column, rows: leased, header }, (count) => `${verb(count, "is", "are")} in « ${working.working} » under lease; ${count === 1 ? "it keeps" : "they keep"} it until released.`)
}

/**
 * Les avertissements d'une publication (AC6), dans cet ordre : colonne requise sans valeur, option
 * retirée encore portée, valeur plus longue que la nouvelle borne, lignes sous bail dans l'ancien état
 * de travail. Aucune ligne n'est réécrite.
 */
function warningsOf(check: Check): Warned[] {
  const header = check.published ?? check.target
  return [...missingRequired(check, header), ...outsideOptions(check, header), ...tooLong(check, header), ...workingRows(check, header)]
}

/**
 * Les contrôles d'une publication (AC6 à AC10), sur les lignes lues : refus, le brouillon gardé, ou
 * les avertissements et les colonnes ajoutées sous le nom desquelles restent des valeurs (AC9).
 */
export function checkEvolution(check: Check): { warnings: Warned[]; stale: string[] } {
  const reasons = conflictReasons(check)
  if (reasons.length > 0) throw new PlatformError("conflict", refused(check, boundedList(reasons, " ")))
  checkRemovals(check)
  const stale = check.diff.added.filter((column) => check.rows.some((row) => carries(row, column.name))).map((column) => column.name)
  return { warnings: warningsOf(check), stale }
}
