// Contrôle propre des six fonctions `table.*` à la publication d'une procédure (E07-S02, AC26 ; H60,
// N18) : le crochet `checkArgs` d'E03-S06 (`server/catalog/define.ts`), rejoué sur les arguments d'un bloc
// `call` que le schéma de la fonction accepte. Tableau connu et lisible par qui publie (`loadTable`),
// colonnes connues, valeurs littérales typées (`valueProblem`, `parseFilter`), états permis
// (`stateRule`), file de travail présente. Rend des phrases en anglais sans emplacement (E03-S06 les
// situe), n'écrit rien. Un chemin qu'`isPlaceholder` désigne n'est pas contrôlé ; un `table` réservé
// saute tout. Sans lui, une procédure se publie avec un appel que `call` refusera à chaque passage
// (banc E04, D4 : `state: "en cours"` sur `table.release`, neuf refus et deux tickets).
import { isRecord } from "../../schemas/tables"
import type { FunctionContext } from "../catalog/define"
import { isPlatformError } from "../errors"
import { parseFilter, unknownColumns } from "./filters"
import { columnOf } from "./header"
import { loadTable, valueProblem, type LoadedTable } from "./meta"
import { decisionNames, releaseStates, stateRule } from "./row-rules"
import { NULL_REFUSED, REAL_VALUE_NEEDED } from "./write-row"

type CheckContext = Pick<FunctionContext, "db" | "identity">
type Path = readonly PropertyKey[]

/** Le refus d'une valeur sans preuve dans un bloc `call` de `table.write` (fiche D100, HN-M53-10). */
const PROOF_REQUIRED = 'a new value needs its proof: write {"value": …, "comment": "…"} or {"value": …, "link": "…"}'

/** Le refus de `create_only` sur un tableau fermé (E11-S01, AC-a6) : aucune ligne ne s'y crée. */
const CREATE_ONLY_CLOSED = "create_only on a closed table: no row can be created"
type IsPlaceholder = (path: Path) => boolean
type Args = Readonly<Record<string, unknown>>

/** La première phrase d'un refus, sans son point (« ventes/x is a page, not a table »). */
function sentenceOf(message: string): string {
  const end = message.indexOf(". ")
  return (end === -1 ? message : message.slice(0, end)).replace(/\.$/, "")
}

/**
 * Le tableau d'un bloc, chargé pour qui publie (niveau 1 au moins, `loadTable`) : `null` quand `table`
 * est un espace réservé (rien à contrôler), ou le problème à dire. Une panne, ou un jeton que la base
 * refuse (`unauthorized`, M10), n'est pas un problème de la procédure : il remonte tel quel.
 */
async function checkedTable(context: CheckContext, args: Args, isPlaceholder: IsPlaceholder): Promise<LoadedTable | string[] | null> {
  if (isPlaceholder(["table"]) || typeof args.table !== "string") return null
  try {
    return await loadTable(context, args.table)
  } catch (error) {
    if (!isPlatformError(error) || error.code === "internal" || error.code === "unauthorized") throw error
    return [error.code === "not_found" ? `unknown table ${args.table.trim()} (or not visible to you)` : sentenceOf(error.message)]
  }
}

/** « unknown column « couleur »; columns: entreprise, contact, … », une fois par nom inconnu (`unknownColumns`, E07-S01). */
function unknownColumnProblems(table: LoadedTable, names: readonly string[]): string[] {
  const columns = table.header.columns.map((column) => column.name).join(", ")
  return unknownColumns(table.header, names).map((name) => `unknown column « ${name} »; columns: ${columns}`)
}

/** Les noms d'une liste d'arguments (`columns`, `clear`), hors espaces réservés. */
function namesAt(value: unknown, path: Path, isPlaceholder: IsPlaceholder): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((name, index) => (typeof name === "string" && !isPlaceholder([...path, index]) ? [name] : []))
}

/** Une clause de filtre sans ses valeurs réservées ; `undefined` quand il ne reste rien à contrôler. */
function literalClause(spec: unknown, path: Path, isPlaceholder: IsPlaceholder): unknown {
  if (isPlaceholder(path)) return undefined
  if (!isRecord(spec) || Object.keys(spec).length === 0) return spec
  const kept = Object.entries(spec).flatMap(([op, value]): [string, unknown][] => {
    if (isPlaceholder([...path, op])) return []
    if (!Array.isArray(value)) return [[op, value]]
    const values = value.filter((_, index) => !isPlaceholder([...path, op, index]))
    return values.length > 0 ? [[op, values]] : []
  })
  return kept.length > 0 ? Object.fromEntries(kept) : undefined
}

/** Un filtre (`filter`, `where`) : colonnes connues, puis la grammaire d'E07-S01 sur les valeurs littérales. */
function filterProblems(table: LoadedTable, filter: unknown, path: Path, isPlaceholder: IsPlaceholder): string[] {
  if (!isRecord(filter)) return []
  const unknown = unknownColumnProblems(table, Object.keys(filter))
  const literal = Object.fromEntries(
    Object.entries(filter).flatMap(([name, spec]) => {
      const clause = columnOf(table.header, name) ? literalClause(spec, [...path, name], isPlaceholder) : undefined
      return clause === undefined ? [] : [[name, clause]]
    }),
  )
  const parsed = parseFilter(literal, table.header)
  return [...unknown, ...("problems" in parsed ? parsed.problems.map((problem) => problem.replace(/\.$/, "")) : [])]
}

function noQueue(table: LoadedTable): string {
  return `${table.node.path} has no work queue (no lifecycle)`
}

/** Les problèmes d'une ligne de `table.write` : colonnes, valeurs, état (AC26) ; un `null`, avec la consigne d'AC4 (D49 B). */
function rowProblems(table: LoadedTable, row: Record<string, unknown>, path: Path, isPlaceholder: IsPlaceholder): string[] {
  const { header } = table
  const set = isRecord(row.set) ? row.set : {}
  const empties = Array.isArray(row.verified_empty)
    ? row.verified_empty.flatMap((entry, index) => (isRecord(entry) && typeof entry.column === "string" && !isPlaceholder([...path, "verified_empty", index, "column"]) ? [entry.column] : []))
    : []
  const unknown = unknownColumnProblems(table, [...Object.keys(set), ...namesAt(row.clear, [...path, "clear"], isPlaceholder), ...empties])
  // Une colonne qui exige une vraie valeur refuse `verified_empty` à chaque passage (E11-S01, AC-b6) : refusé ici.
  const strict = empties.flatMap((name) => (columnOf(header, name)?.allow_verified_empty === false ? [`${name}: ${REAL_VALUE_NEEDED}`] : []))
  const values = Object.entries(set).flatMap(([name, raw]) => {
    const column = columnOf(header, name)
    const valuePath = isRecord(raw) ? [...path, "set", name, "value"] : [...path, "set", name]
    const value = isRecord(raw) ? raw.value : raw
    if (!column || value === undefined || isPlaceholder([...path, "set", name])) return []
    // Un `null`, que le schéma laisse passer, refuserait sa ligne à chaque passage (AC4, D49 B) : refusé ici, colonne clé comprise.
    if (value === null) return [`${name}: ${NULL_REFUSED}`]
    if (name === header.key) return []
    const state = name === header.lifecycle?.column
    // Fiche D100 (HN-M53-10) : dans un tableau qui exige la preuve (`proof`, fiche D133), une valeur nouvelle
    // d'une colonne de valeur la porte ; une valeur nue n'est admise que si elle égale la valeur rangée, ce que
    // la publication ne peut savoir : refusée ici, valeur réservée comprise. La colonne d'état s'écrit nue.
    const unproved = header.proof && !state && !(isRecord(raw) && (raw.comment !== undefined || raw.link !== undefined))
    const proof = unproved ? [`${name}: ${PROOF_REQUIRED}`] : []
    if (isPlaceholder(valuePath)) return proof
    const problem = valueProblem(column, value)
    if (problem !== null) return [...proof, `${name}: ${problem}`]
    if (proof.length > 0) return proof
    const rule = state && typeof value === "string" ? stateRule(header, value) : null
    if (rule === "working") return [`${name}: « ${value} » is set only by table.claim, with a lease`]
    return rule === "decision" ? [`${name}: ${decisionNames(header)} are decided by a person in the review queue`] : []
  })
  return [...unknown, ...strict, ...values]
}

/** Contrôle d'un appel : le tableau d'abord, puis ce qui lui est propre ; les problèmes, sans doublon. */
function check(own: (table: LoadedTable, args: Args, isPlaceholder: IsPlaceholder) => string[]) {
  return async (context: CheckContext, args: Args, isPlaceholder: IsPlaceholder): Promise<string[]> => {
    const table = await checkedTable(context, args, isPlaceholder)
    if (table === null || Array.isArray(table)) return table ?? []
    return [...new Set(own(table, args, isPlaceholder))]
  }
}

/** `table.schema` : le tableau seul. */
export const checkSchemaArgs = check(() => [])

/** `table.rows` : colonnes de `filter`, `columns` et `sort`, valeurs du filtre. */
export const checkRowsArgs = check((table, args, isPlaceholder) => {
  const sort = isRecord(args.sort) && typeof args.sort.column === "string" && !isPlaceholder(["sort", "column"]) ? [args.sort.column] : []
  return [...unknownColumnProblems(table, [...namesAt(args.columns, ["columns"], isPlaceholder), ...sort]), ...filterProblems(table, args.filter, ["filter"], isPlaceholder)]
})

/**
 * `table.aggregate` : colonnes de `where`, `group_by` et `metrics`, valeurs du filtre (AC26). Le type
 * d'une métrique reste la règle de `parseMetrics` (E07-S01), dite à l'appel : AC26 ne la demande pas,
 * et la recopier ici en ferait deux textes.
 */
export const checkAggregateArgs = check((table, args, isPlaceholder) => {
  const groupBy = typeof args.group_by === "string" && !isPlaceholder(["group_by"]) ? [args.group_by] : []
  const metrics = Array.isArray(args.metrics) ? args.metrics : []
  const named = metrics.flatMap((metric, index) => (isRecord(metric) && typeof metric.column === "string" && !isPlaceholder(["metrics", index, "column"]) ? [metric.column] : []))
  return [...unknownColumnProblems(table, [...groupBy, ...named]), ...filterProblems(table, args.where, ["where"], isPlaceholder)]
})

/** `table.write` : colonnes de `set`, `clear` et `verified_empty`, valeurs typées, ni état de travail ni décision de revue. */
export const checkWriteArgs = check((table, args, isPlaceholder) => {
  const rows = Array.isArray(args.rows) ? args.rows : []
  const closed = args.create_only === true && table.header.closed ? [CREATE_ONLY_CLOSED] : []
  return [...closed, ...rows.flatMap((row, index) => (isRecord(row) && !isPlaceholder(["rows", index]) ? rowProblems(table, row, ["rows", index], isPlaceholder) : []))]
})

/** `table.claim` : une file de travail, puis les colonnes et valeurs du filtre. */
export const checkClaimArgs = check((table, args, isPlaceholder) =>
  table.header.lifecycle ? filterProblems(table, args.filter, ["filter"], isPlaceholder) : [noQueue(table)],
)

/** `table.release` : une file de travail, et un état qu'une libération pose (AC26, AC27 : le cas D4). */
export const checkReleaseArgs = check((table, args, isPlaceholder) => {
  if (!table.header.lifecycle) return [noQueue(table)]
  const { state } = args
  if (typeof state !== "string" || isPlaceholder(["state"])) return []
  const rule = stateRule(table.header, state)
  const accepted = `states accepted by table.release: ${releaseStates(table.header).join(", ")}`
  if (rule === "unknown") return [`unknown state « ${state} »; ${accepted}`]
  if (rule === "working") return [`state « ${state} » is set only by table.claim; ${accepted}`]
  return rule === "decision" ? [`state « ${state} » is decided by a person in the review queue; ${accepted}`] : []
})
