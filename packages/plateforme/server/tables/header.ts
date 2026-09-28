// En-tête d'un tableau (E07-S01, AC1, AC2 ; H90, H91) : forme par `tableHeaderSchema`, puis contrôles
// croisés (clé, options et longueur par type, noms uniques, cycle de travail, revue), chaque problème
// nommé par son chemin, la liste entière rendue en un appel. Partagé avec le `write` de l'en-tête
// (E07-S04). Sans lui, un attribut inconnu passerait en silence (`read_only`, `stricte` chez Oto).
//
// Repris d'Oto (`datastore/definition.py` l. 53-239, `schema_keys.py` l. 62-226) : type inconnu
// refusé, une seule colonne de clé. Retiré : l'attribut inconnu seulement signalé (refusé ici, H90),
// les types `formula`, `json`, `object`, `list` et les attributs d'affichage (`display`, `width`).
import type * as z from "zod/v4"
import {
  tableColumnSchema,
  tableHeaderSchema,
  tableLifecycleSchema,
  tableReviewSchema,
  type ColumnType,
  type TableColumn,
  type TableHeader,
  type TableLifecycle,
} from "../../schemas"
import { isRecord } from "../../schemas/tables"
import { boundedList } from "../errors"

type Problems = string[]

const ATTRIBUTES = {
  header: Object.keys(tableHeaderSchema.shape),
  column: Object.keys(tableColumnSchema.shape),
  lifecycle: Object.keys(tableLifecycleSchema.shape),
  review: Object.keys(tableReviewSchema.shape),
}

/** Types qui peuvent porter la clé d'une ligne (N1). */
const KEY_TYPES: readonly ColumnType[] = ["text", "email", "url", "number"]

/** Types qui prennent `max_length` (AC1). */
export const LENGTH_TYPES: readonly ColumnType[] = ["text", "email", "url"]

const OPTIONS_MAX = 100
const OPTION_CHARS_MAX = 100

/** « columns[2].read_only » : un chemin d'issue de Zod, indices entre crochets. */
function pathText(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, part) => {
    if (typeof part === "number") return `${text}[${part}]`
    return text ? `${text}.${String(part)}` : String(part)
  }, "")
}

/** Les attributs permis là où Zod a trouvé une clé inconnue. */
function allowedAt(path: readonly PropertyKey[]): string[] {
  if (path.length === 0) return ATTRIBUTES.header
  if (path[0] === "columns") return ATTRIBUTES.column
  if (path[0] === "lifecycle") return path.length === 1 ? ATTRIBUTES.lifecycle : ATTRIBUTES.review
  return []
}

function sentence(message: string): string {
  return /[.!?]$/.test(message) ? message : `${message}.`
}

function issueProblems(issue: z.core.$ZodIssue): Problems {
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => `${pathText([...issue.path, key])}: unknown attribute. Allowed: ${allowedAt(issue.path).join(", ")}.`)
  }
  const message = issue.code === "invalid_type" && issue.input === undefined ? "required" : issue.message
  return [`${pathText(issue.path) || "header"}: ${sentence(message)}`]
}

type IndexedColumn = { index: number; column: TableColumn }

/**
 * La valeur sans ses attributs inconnus, que la forme refuse déjà : les contrôles croisés portent
 * aussi sur elle, et la liste des problèmes reste complète (AC2).
 */
function knownAttributes(value: unknown, allowed: readonly string[]): unknown {
  return isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => allowed.includes(key))) : value
}

/** Les colonnes de forme valide (attributs inconnus mis à part), avec leur rang : les contrôles croisés ne portent que sur elles. */
function validColumns(raw: unknown): IndexedColumn[] {
  return (Array.isArray(raw) ? raw : []).flatMap((value, index) => {
    const parsed = tableColumnSchema.safeParse(knownAttributes(value, ATTRIBUTES.column))
    return parsed.success ? [{ index, column: parsed.data }] : []
  })
}

/**
 * Les noms portés par les colonnes, valides ou non : une clé qui nomme une colonne mal formée n'est
 * pas inconnue. Un en-tête refusé peut en porter plus de 100 : un refus les cite par `boundedList`.
 */
function declaredNames(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : []).flatMap((value) => (isRecord(value) && typeof value.name === "string" ? [value.name] : []))
}

function optionProblems({ index, column }: IndexedColumn): Problems {
  const at = `columns[${index}].options`
  if (column.type !== "enum") return column.options === undefined ? [] : [`${at}: options apply to enum columns only; ${column.name} is ${column.type}.`]
  const options = column.options ?? []
  if (options.length === 0 || options.length > OPTIONS_MAX) return [`${at}: an enum column lists 1 to ${OPTIONS_MAX} options (${options.length} given).`]
  return options.flatMap((option, rank) => {
    if (option.trim() === "" || option.length > OPTION_CHARS_MAX) return [`${at}[${rank}]: an option holds 1 to ${OPTION_CHARS_MAX} characters.`]
    return options.indexOf(option) < rank ? [`${at}[${rank}]: duplicate option « ${option} ».`] : []
  })
}

function columnProblems(columns: readonly IndexedColumn[]): Problems {
  const seen = new Set<string>()
  return columns.flatMap((indexed) => {
    const { index, column } = indexed
    const problems = optionProblems(indexed)
    if (column.max_length !== undefined && !LENGTH_TYPES.includes(column.type)) {
      problems.push(`columns[${index}].max_length: max_length applies to text, email and url columns; ${column.name} is ${column.type}.`)
    }
    if (seen.has(column.name)) problems.push(`columns[${index}].name: duplicate column ${column.name}.`)
    seen.add(column.name)
    return problems
  })
}

function keyProblems(key: unknown, columns: readonly IndexedColumn[], names: readonly string[]): Problems {
  if (typeof key !== "string") return []
  if (!names.includes(key)) return [`key: unknown column ${key}. Columns: ${boundedList(names)}.`]
  const column = columns.find((candidate) => candidate.column.name === key)?.column
  if (column && !KEY_TYPES.includes(column.type)) return [`key: the key column must be text, email, url or number; ${key} is ${column.type}.`]
  return []
}

function reviewProblems(lifecycle: TableLifecycle): Problems {
  const { review, states, working, column } = lifecycle
  if (!review) return []
  const unknown = (["state", "approve", "reject"] as const).flatMap((field) =>
    states.includes(review[field]) ? [] : [`lifecycle.review.${field}: ${review[field]} is not one of the states of ${column}.`],
  )
  if (unknown.length > 0) return unknown
  const picked = [review.state, review.approve, review.reject]
  if (new Set(picked).size < 3 || picked.includes(working)) {
    return [`lifecycle.review: state, approve and reject are three different states, none of them ${working}.`]
  }
  return []
}

/** Le cycle sans ses attributs inconnus ni ceux de sa revue, refusés par la forme. */
function knownLifecycle(raw: unknown): unknown {
  const lifecycle = knownAttributes(raw, ATTRIBUTES.lifecycle)
  if (!isRecord(raw) || !isRecord(lifecycle) || raw.review === undefined) return lifecycle
  return { ...lifecycle, review: knownAttributes(raw.review, ATTRIBUTES.review) }
}

function lifecycleProblems(raw: unknown, columns: readonly IndexedColumn[], names: readonly string[]): Problems {
  const parsed = tableLifecycleSchema.safeParse(knownLifecycle(raw))
  if (!parsed.success) return []
  const lifecycle = parsed.data
  const { column: name, states, working } = lifecycle
  if (!names.includes(name)) return [`lifecycle.column: unknown column ${name}. Columns: ${boundedList(names)}.`]
  const column = columns.find((candidate) => candidate.column.name === name)?.column
  if (!column) return []
  if (column.type !== "enum") return [`lifecycle.column: the state column must be an enum column; ${name} is ${column.type}.`]
  const options = column.options ?? []
  const problems: Problems = []
  if (states.length !== options.length || states.some((state, rank) => state !== options[rank])) {
    problems.push(`lifecycle.states must list exactly the options of ${name}, in the same order.`)
  }
  if (states.length < 2) problems.push("lifecycle.states: two states at least.")
  if (!states.includes(working)) problems.push(`lifecycle.working: ${working} is not one of the states of ${name}.`)
  else if (working === states[0]) problems.push(`lifecycle.working: ${working} is the first state, where rows enter; the working state comes after it.`)
  return [...problems, ...reviewProblems(lifecycle)]
}

/**
 * L'en-tête validé, ou la liste complète de ses problèmes, chacun avec son chemin (AC1, AC2) : la
 * forme par `tableHeaderSchema`, puis les contrôles croisés sur les parties de forme valide.
 */
export function parseTableHeader(meta: unknown): { header: TableHeader } | { problems: string[] } {
  if (!isRecord(meta)) return { problems: ["header: expected an object {columns, key, lifecycle?, closed?}."] }
  const parsed = tableHeaderSchema.safeParse(meta, { reportInput: true })
  const columns = validColumns(meta.columns)
  const names = declaredNames(meta.columns)
  const problems = [
    ...(parsed.success ? [] : parsed.error.issues.flatMap(issueProblems)),
    ...columnProblems(columns),
    ...keyProblems(meta.key, columns, names),
    ...lifecycleProblems(meta.lifecycle, columns, names),
  ]
  if (problems.length > 0 || !parsed.success) return { problems }
  return { header: parsed.data }
}

/** La colonne d'un nom, ou `undefined`. */
export function columnOf(header: TableHeader, name: string): TableColumn | undefined {
  return header.columns.find((column) => column.name === name)
}

/** La colonne clé (N1) : `parseTableHeader` garantit qu'elle existe. */
export function keyColumn(header: TableHeader): TableColumn {
  const column = columnOf(header, header.key)
  if (!column) throw new Error(`table header without its key column ${header.key}`)
  return column
}
