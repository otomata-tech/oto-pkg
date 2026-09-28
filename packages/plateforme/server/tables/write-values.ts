// Valeurs d'une ligne écrite (E07-S02, AC9, AC10, AC15 ; H94, N15) : l'égalité d'une valeur envoyée à
// la valeur rangée, la forme d'une valeur détruite, ce qu'attend une colonne. Fonctions pures, à part de
// `write-row.ts` pour la borne de 300 lignes d'ESLint. Sans elles, une date réécrite dans un autre fuseau
// ferait avancer la révision, et une valeur détruite ou hors format ne se nommerait pas.
import type { CellValue, TableColumn } from "../../schemas"
import { formatCount } from "../nodes/document"
import { instantOf, maxLengthOf } from "./meta"

/**
 * Une valeur envoyée égale à la valeur rangée (AC9, AC29) : la même, ou le même instant pour une date
 * et heure (`2026-09-30T10:00:00+02:00` et `2026-09-30T08:00:00Z`). Une valeur rangée hors format,
 * renvoyée telle quelle, est égale : la lecture a la forme de l'écriture (H93).
 */
export function sameValue(column: TableColumn, stored: unknown, next: CellValue): boolean {
  if (stored === next) return true
  if (column.type !== "datetime" || typeof stored !== "string" || typeof next !== "string") return false
  const instant = instantOf(stored)
  return instant !== null && instant === instantOf(next)
}

/** Une valeur rangée telle qu'on la nomme (N15) : un scalaire tel quel, tout autre JSON en texte. */
export function describeValue(stored: unknown): CellValue {
  if (typeof stored === "string" || typeof stored === "boolean" || (typeof stored === "number" && Number.isFinite(stored))) return stored
  return JSON.stringify(stored) ?? String(stored)
}

const EXPECTED: Record<Exclude<TableColumn["type"], "text">, string> = {
  number: "a number",
  bool: "true or false",
  date: "a date YYYY-MM-DD",
  datetime: "a date and time with a time zone",
  enum: "one of its options",
  email: "an email address",
  url: "a URL",
}

/** Ce qu'attend une colonne, pour la note d'une valeur hors format (AC15) : « a number », « a text of 200 characters at most ». */
export function expectedOf(column: TableColumn, value: CellValue): string {
  if (column.type !== "text") return EXPECTED[column.type]
  return typeof value === "string" ? `a text of ${formatCount(maxLengthOf(column) ?? 0)} characters at most` : "a text"
}

/** Une valeur dans une ligne de réponse (N15) : telle quelle, coupée à 50 caractères (par point de code). */
export function brief(value: CellValue): string {
  const points = Array.from(String(value))
  return points.length > 50 ? `${points.slice(0, 49).join("")}…` : points.join("")
}
