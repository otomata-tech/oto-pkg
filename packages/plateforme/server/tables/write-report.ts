// Compte rendu de `table.write` (E07-S02, AC1, AC2, AC9 à AC12 ; H92, N15) : un bilan, puis une ligne
// par ligne d'entrée, dans l'ordre, qui dit ce qui a été écrit, ce qui a été détruit, ce qui a été
// refusé et pourquoi ; les mêmes faits en champs. À part du service pour la borne de 300 lignes
// d'ESLint. Sans lui, une écriture de 50 lignes ne dirait ni lesquelles sont passées ni ce qu'elle a
// effacé.
import type { TableRowRead } from "../../schemas"
import type { FunctionOutput } from "../catalog/define"
import { boundedList } from "../errors"
import { formatCount } from "../nodes/document"
import type { RowWrite } from "./write-row"
import { brief } from "./write-values"

/** Le code H04 d'une ligne refusée : ce qu'elle a de faux, une révision périmée, un bail ou une course. */
export type RowRefusalCode = "invalid_arguments" | "stale_revision" | "conflict"

/** Ce qu'une ligne d'entrée est devenue. */
export type RowOutcome =
  | { status: "created" | "updated"; key: string | number; revision: number; write: RowWrite }
  | { status: "unchanged"; key: string | number; revision: number; notes: string[] }
  | {
      status: "refused"
      key: unknown
      /** La clé, ou « row 7 » quand la clé elle-même est refusée (AC7). */
      label: string
      code: RowRefusalCode
      problems: string[]
      /** La phrase entière d'un refus de ligne (AC7, AC8, AC12, AC18) ; sinon la liste des problèmes. */
      sentence?: string
      current?: TableRowRead
    }

/** Les parties d'une ligne écrite (AC1, AC10, AC11) : valeurs posées, détruites, vidées, et l'entrée dans la file. */
function changeParts(write: RowWrite): string[] {
  const { changes, destroyed } = write
  const hadValue = new Set(destroyed.map((item) => item.column))
  const parts: string[] = []
  const fresh = changes.set.filter((name) => !hadValue.has(name))
  if (fresh.length > 0) parts.push(`set ${fresh.join(", ")}`)
  for (const item of destroyed) {
    if (item.by === "set") parts.push(`${item.column}: ${brief(item.was)} → ${brief(item.now ?? "")}`)
    else parts.push(`${item.column}: ${item.by === "clear" ? "cleared" : "verified_empty"} (was « ${brief(item.was)} »)`)
  }
  for (const name of changes.cleared.filter((column) => !hadValue.has(column))) parts.push(`${name}: cleared (was verified_empty)`)
  const emptied = changes.verified_empty.filter((name) => !hadValue.has(name))
  if (emptied.length > 0) parts.push(`verified_empty ${emptied.join(", ")}`)
  if (changes.annotated.length > 0) parts.push(`comment or link on ${changes.annotated.join(", ")}`)
  if (changes.entry) parts.push(`${changes.entry.column} = « ${changes.entry.state} » (queue entry)`)
  return parts
}

function withNotes(line: string, notes: readonly string[]): string {
  return notes.length > 0 ? `${line} ${notes.join(" ")}` : line
}

/** La ligne de réponse d'une ligne d'entrée. */
function outcomeLine(outcome: RowOutcome): string {
  if (outcome.status === "refused") return `${outcome.label}: ${outcome.sentence ?? `refused, nothing written: ${boundedList(outcome.problems, " ")}`}`
  if (outcome.status === "unchanged") return withNotes(`${outcome.key}: unchanged (revision ${outcome.revision}): same values.`, outcome.notes)
  // Une ligne créée par sa seule clé, dans un tableau sans file, n'a rien d'autre à dire.
  const parts = changeParts(outcome.write)
  return withNotes(`${outcome.key}: ${outcome.status} (revision ${outcome.revision})${parts.length > 0 ? `: ${parts.join("; ")}` : ""}.`, outcome.write.notes)
}

/** Problèmes d'une ligne gardés en champs, comme dans le texte (`boundedList`) : 20, puis leur nombre restant. */
const PROBLEMS_KEPT = 20

/** Les données d'une ligne d'entrée (AC2) : `{ key, status, revision?, changes?, destroyed?, problems?, notes?, current? }`. */
function outcomeData(outcome: RowOutcome): Record<string, unknown> {
  if (outcome.status === "refused") {
    const { key, status, code, current } = outcome
    const more = outcome.problems.length - PROBLEMS_KEPT
    const problems = more > 0 ? [...outcome.problems.slice(0, PROBLEMS_KEPT), `… and ${more} more`] : outcome.problems
    return { key, status, code, problems, ...(current ? { current } : {}) }
  }
  if (outcome.status === "unchanged") {
    const { key, status, revision, notes } = outcome
    return { key, status, revision, ...(notes.length > 0 ? { notes } : {}) }
  }
  const { key, status, revision, write } = outcome
  return {
    key,
    status,
    revision,
    changes: write.changes,
    ...(write.destroyed.length > 0 ? { destroyed: write.destroyed } : {}),
    ...(write.notes.length > 0 ? { notes: write.notes } : {}),
  }
}

/** Le compte rendu d'un appel (AC2) : « ventes/suivi_prospects: 49 row(s) written (49 created, 0 updated), 0 unchanged, 1 refused. », puis une ligne par ligne. */
export function writeReport(path: string, outcomes: readonly RowOutcome[]): FunctionOutput {
  const count = (status: RowOutcome["status"]) => outcomes.filter((outcome) => outcome.status === status).length
  const [created, updated, unchanged, refused] = [count("created"), count("updated"), count("unchanged"), count("refused")]
  const written = created + updated
  const summary = `${path}: ${formatCount(written)} row(s) written (${formatCount(created)} created, ${formatCount(updated)} updated), ${formatCount(unchanged)} unchanged, ${formatCount(refused)} refused.`
  return {
    text: [summary, ...outcomes.map(outcomeLine)].join("\n"),
    data: { table: path, written, refused, rows: outcomes.map(outcomeData) },
  }
}
