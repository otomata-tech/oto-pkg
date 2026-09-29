// Fusion d'une ligne écrite (E07-S02, AC3 à AC11, AC14 à AC17 ; H92, H94, H100, P10) : fonction
// pure, sans base. Elle reçoit la ligne actuelle (rien pour une création) et les opérations d'une ligne
// d'entrée, validées par le schéma de `table.write` (un `null` y passe : il refuse la ligne ici, AC4,
// fiche D49 B), et rend `data` et `provenance` après écriture, ce qui a changé, les valeurs détruites,
// les problèmes (un seul refuse toute la ligne, N1) et les notes. Sans elle, le service fusionnerait en
// même temps qu'il écrit, et aucun cas ne se testerait sans base.
//
// Repris de la maquette (`mcp-test/src/proto/functions/table.ts` l. 167-220, `applyRowWrite`) : forme
// pure, refus nommés par colonne, état de travail réservé à `claim`. Retiré : l'écriture partielle d'une
// ligne (→ ligne atomique, H92), la provenance sans `comment` ni `link`. Repris d'Oto
// (`datastore/couches.py` l. 53-124, `donnees_d_origine.py` l. 33-117, `validation.py` l. 247, 326-338,
// 400-415) : valeur changée → `comment` et `link` tombent, `imported` survit ; valeur identique → rien ;
// `required` jugé sur la ligne, une autre colonne hors format ne bloque pas. Retiré : `origine_override`,
// `force`, `readonly_override`, le marqueur `vide_assume`, `required_when`, `pattern`.
import type { CellValue, TableColumn, TableHeader } from "../../schemas"
import type { TableCellInput } from "../../schemas/table-write"
import { isRecord } from "../../schemas/tables"
import { columnOf } from "./header"
import { keyValue, rowCells, shown, valueProblem, normalizeValue, type RowBlock } from "./meta"
import { decisionNames, rowKey, stateRule } from "./row-rules"
import { describeValue, expectedOf, sameValue } from "./write-values"

/**
 * Qui écrit (H94, N21) : la personne, le code `ctx` de la conversation, l'instant de l'écriture ; `origin`, un
 * import (E10-S01, AC-b3 : l'origine de chaque cellule qu'il écrit, sa preuve avec le commentaire, D100) ;
 * `host`, le client MCP de la conversation (`ctx.host`, `nom@version`), et `worker`, le libellé du bail sous
 * lequel l'assistant écrit (E11-S01, AC-d2, AC-d3) : sans eux, la provenance ne dit pas quel assistant a écrit.
 */
export type RowActor = { userId: string; ctx: string | null; at: string; origin?: "import"; host?: string | null; worker?: string | null }

/** Refus d'un `null` (AC4) : vider se dit `clear`, « cherché, rien trouvé » se dit `verified_empty` ; repris par `checkWriteArgs`. */
export const NULL_REFUSED = "null is refused: use clear to empty a field, or verified_empty with a reason for 'searched, nothing found'"

/** Refus d'un `verified_empty` sur une colonne qui exige une vraie valeur (E11-S01, AC-b2) ; repris par `checkWriteArgs` (AC-b6). */
export const REAL_VALUE_NEEDED = "needs a real value; verified_empty is not allowed for this column"

/**
 * Une ligne d'entrée : clé normalisée par `rowKey`, opérations validées par `tableRowWriteSchema`
 * (forme d'une cellule, raison de 3 caractères au moins : un seul contrôle, `forms-patterns.md §
 * Principe`). Ce qui dépend du tableau (colonnes, types, états) se contrôle ici, et le `null` d'une
 * cellule, que le schéma laisse passer pour ne refuser que sa ligne (AC4, D49 B).
 */
export type RowWriteInput = {
  key: string
  set?: Readonly<Record<string, TableCellInput>>
  clear?: readonly string[]
  verified_empty?: readonly { column: string; reason: string }[]
}

/** La ligne actuelle ; `null` : elle est à créer. */
export type CurrentRow = Pick<RowBlock, "data" | "provenance" | "claimed_by"> | null

/** Une valeur détruite (N15) : remplacée (`now`), vidée ou remplacée par `verified_empty`. */
export type Destroyed = { column: string; by: "set" | "clear" | "verified_empty"; was: CellValue; now?: CellValue }

export type RowChanges = {
  set: string[]
  cleared: string[]
  verified_empty: string[]
  /** Commentaire ou lien posés sur une valeur inchangée (AC10). */
  annotated: string[]
  /** L'état d'entrée de la file, posé à la création quand elle ne le nomme pas (AC1). */
  entry: { column: string; state: string } | null
}

export type RowWrite = {
  problems: string[]
  notes: string[]
  data: Record<string, unknown>
  provenance: Record<string, unknown>
  changes: RowChanges
  destroyed: Destroyed[]
  /** Faux : rien ne change, rien n'est envoyé à la base (AC9). */
  effective: boolean
}

export type RowWriteRequest = {
  header: TableHeader
  /** Le chemin du tableau, cité par le refus d'une colonne inconnue (AC5). */
  path: string
  /** Le chemin de la ligne dans les arguments de l'appel (`rows.1`), cité par le refus d'un `null` (AC4, D49 B). */
  argPath: string
  /** L'adresse de la file de revue du tableau (`<origine>/n/<chemin>`), citée par AC17. */
  reviewQueue: string
  current: CurrentRow
  input: RowWriteInput
  actor: RowActor
}

type Cell = { value: CellValue | null; comment?: string; link?: string }

/** Le travail d'une ligne : état en cours de fusion, problèmes et changements accumulés. */
type Work = RowWrite & { request: RowWriteRequest }

const OPS = ["set", "clear", "verified_empty"] as const

/** Les colonnes nommées par chaque opération, dans l'ordre. */
function namesByOp(input: RowWriteInput): Record<(typeof OPS)[number], string[]> {
  return {
    set: Object.keys(input.set ?? {}),
    clear: [...(input.clear ?? [])],
    verified_empty: (input.verified_empty ?? []).map((entry) => entry.column),
  }
}

/** « a and b », « a, b and c ». */
function listed(items: readonly string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items.join("")
}

/** AC3 et AC5 : une colonne nommée une fois par ligne, et déclarée ; rend les colonnes à écarter. En une passe : les noms viennent du client. */
function namingProblems(work: Work): Set<string> {
  const { header, path } = work.request
  const byOp = namesByOp(work.request.input)
  const opsByName = new Map<string, string[]>()
  for (const op of OPS) for (const name of byOp[op]) opsByName.set(name, [...(opsByName.get(name) ?? []), op])
  const columns = header.columns.map((column) => column.name).join(", ")
  const skipped = new Set<string>()
  for (const [name, ops] of opsByName) {
    const distinct = [...new Set(ops)]
    if (distinct.length > 1) work.problems.push(`${name}: named in ${distinct.length === 2 ? "both " : ""}${listed(distinct)}; name each column once per row.`)
    else if (ops.length > 1) work.problems.push(`${name}: named twice in ${ops[0]}; name each column once per row.`)
    const known = columnOf(header, name) !== undefined
    if (!known) work.problems.push(`${name}: unknown column. Columns of ${path}: ${columns}. Do not retry under a variant of the name.`)
    if (ops.length > 1 || !known) skipped.add(name)
  }
  return skipped
}

/**
 * La valeur d'une colonne dans `data` ou `provenance` : une propriété propre seulement. Une colonne
 * nommée `constructor`, que le motif des noms admet, lirait sinon le prototype d'un objet.
 */
function own(record: Readonly<Record<string, unknown>>, name: string): unknown {
  return Object.hasOwn(record, name) ? record[name] : undefined
}

/** Ce qu'une écriture ajoute à la provenance d'une cellule : son origine, un commentaire, un lien, une raison, la révision posée par une réservation (N24). */
type ProvenanceExtra = { origin?: "agent" | "human" | "import" | "verified_empty"; comment?: string; link?: string; reason?: string; claim_revision?: number }

/**
 * La provenance d'une cellule écrite par un assistant (H94, N21), seule construction pour l'écriture,
 * la réservation, la libération et la décision d'une personne dans la file de revue (`human`,
 * E07-S03) : `{ origin, by, ctx, at }` (`ctx` nul sans code, comme `provenanceOf` d'E03-S03), ce
 * qu'ajoute l'écriture, puis `imported`, qui survit (AC10).
 */
export function cellProvenance(actor: RowActor, previous: unknown, extra: ProvenanceExtra = {}): Record<string, unknown> {
  const imported = isRecord(previous) && previous.imported !== undefined ? { imported: previous.imported } : {}
  // `host` et `worker` rangés seulement connus (AC-d2, AC-d3) : une décision d'une personne n'en a pas (AC-d5).
  const assistant = { ...(actor.host ? { host: actor.host } : {}), ...(actor.worker ? { worker: actor.worker } : {}) }
  return { origin: actor.origin ?? "agent", by: actor.userId, ctx: actor.ctx, at: actor.at, ...assistant, ...extra, ...imported }
}

/** AC16, AC17 : la colonne clé suit `key` ; l'état se change hors du travail, de la revue et d'un bail. */
function ruleProblem(work: Work, column: TableColumn, value: CellValue): string | null {
  const { header, reviewQueue, input, current } = work.request
  const name = column.name
  if (name === header.key) {
    const same = rowKey(header, typeof value === "boolean" ? String(value) : value)
    return "key" in same && same.key === input.key ? null : `${name}: this is the key column; it is set by key. Renaming a row's key is not possible in this version.`
  }
  if (name !== header.lifecycle?.column || typeof value !== "string") return null
  const rule = stateRule(header, value)
  if (rule === "working") return `${name}: « ${value} » is set by table.claim, with a lease.`
  if (rule === "decision") return `${name}: ${decisionNames(header)} are decided by a person in the review queue of this table (${reviewQueue}).`
  return current?.claimed_by ? `${name}: the row is claimed: change its state with table.release.` : null
}

/** Une opération `set` (AC3, AC4, AC6, AC9, AC10, AC16, AC17) : une valeur, ou `{ value, comment?, link? }`. */
function applySet(work: Work, column: TableColumn, raw: TableCellInput): void {
  const name = column.name
  const { value, comment, link }: Cell = typeof raw === "object" && raw !== null ? raw : { value: raw }
  // Un `null`, seul ou en `value`, refuse la ligne, nommé à son chemin dans l'appel (D49 B) ; les autres lignes du lot s'écrivent.
  if (value === null) {
    work.problems.push(`${work.request.argPath}.set.${name}: ${NULL_REFUSED}.`)
    return
  }
  const stored = own(work.data, name)
  // Une valeur identique ne change rien, même hors format (AC9, AC29) ; la colonne clé égale à `key` non plus (AC16).
  const isKey = name === work.request.header.key
  if (sameValue(column, stored, value) || (isKey && ruleProblem(work, column, value) === null)) {
    annotate(work, name, comment, link)
    return
  }
  const typeProblem = valueProblem(column, value)
  const problem = typeProblem === null ? ruleProblem(work, column, value) : `${name}: ${typeProblem}.`
  if (problem !== null) {
    work.problems.push(problem)
    return
  }
  const next = normalizeValue(column, value)
  if (stored !== undefined && stored !== null) work.destroyed.push({ column: name, by: "set", was: describeValue(stored), now: next })
  work.data[name] = next
  work.provenance[name] = cellProvenance(work.request.actor, own(work.provenance, name), { ...(comment === undefined ? {} : { comment }), ...(link === undefined ? {} : { link }) })
  work.changes.set.push(name)
}

/** Un commentaire ou un lien sur une valeur inchangée (AC10) : posés, rien d'autre ne tombe. */
function annotate(work: Work, name: string, comment: string | undefined, link: string | undefined): void {
  const previous = own(work.provenance, name)
  const old = isRecord(previous) ? previous : null
  const changed = (comment !== undefined && old?.comment !== comment) || (link !== undefined && old?.link !== link)
  if (!changed) return
  const base = old ?? cellProvenance(work.request.actor, null)
  work.provenance[name] = { ...base, ...(comment !== undefined ? { comment } : {}), ...(link !== undefined ? { link } : {}) }
  work.changes.annotated.push(name)
}

/** Une colonne qui admet `verified_empty` (E11-S01, AC-b4) : toutes, sauf `allow_verified_empty: false`. */
function allowsVerifiedEmpty(column: TableColumn): boolean {
  return column.allow_verified_empty !== false
}

/**
 * Une colonne que `clear` et `verified_empty` ne touchent pas : la clé ; l'état d'une file ; une colonne requise
 * pour `clear` (AC11, AC14) ; une colonne qui exige une vraie valeur pour `verified_empty` (E11-S01, AC-b2).
 */
function reservedProblem(header: TableHeader, column: TableColumn, op: "clear" | "verified_empty"): string | null {
  const verb = op === "clear" ? "cleared" : "verified_empty"
  if (column.name === header.key) return `${column.name}: this is the key column; it cannot be ${verb}.`
  if (op === "clear" && column.required) return `${column.name}: required: it cannot be cleared.`
  if (column.name === header.lifecycle?.column) return `${column.name}: this is the state column of the work queue; it cannot be ${verb}.`
  if (op === "verified_empty" && !allowsVerifiedEmpty(column)) return `${column.name}: ${REAL_VALUE_NEEDED}.`
  return null
}

/** Une opération `clear` (AC11, AC14) : la valeur et sa provenance partent ; la valeur détruite est nommée. */
function applyClear(work: Work, column: TableColumn): void {
  const problem = reservedProblem(work.request.header, column, "clear")
  if (problem !== null) {
    work.problems.push(problem)
    return
  }
  const name = column.name
  const stored = own(work.data, name)
  const hasValue = stored !== undefined && stored !== null
  if (!hasValue && own(work.provenance, name) === undefined) return
  if (hasValue) work.destroyed.push({ column: name, by: "clear", was: describeValue(stored) })
  delete work.data[name]
  delete work.provenance[name]
  work.changes.cleared.push(name)
}

/** Une opération `verified_empty` (AC11) : la valeur part, la provenance dit qui a cherché et pourquoi rien ; raison rognée par le schéma. */
function applyVerifiedEmpty(work: Work, column: TableColumn, reason: string): void {
  const problem = reservedProblem(work.request.header, column, "verified_empty")
  if (problem !== null) {
    work.problems.push(problem)
    return
  }
  const name = column.name
  const stored = own(work.data, name)
  const previous = own(work.provenance, name)
  const hasValue = stored !== undefined && stored !== null
  if (!hasValue && isRecord(previous) && previous.origin === "verified_empty" && previous.reason === reason) return
  if (hasValue) work.destroyed.push({ column: name, by: "verified_empty", was: describeValue(stored) })
  delete work.data[name]
  work.provenance[name] = cellProvenance(work.request.actor, previous, { origin: "verified_empty", reason })
  work.changes.verified_empty.push(name)
}

/** Une colonne sans valeur ni `verified_empty` (AC14) ; sans valeur, pour une colonne qui refuse `verified_empty` (E11-S01, AC-b3). */
function missing(work: Work, column: TableColumn): boolean {
  const provenance = own(work.provenance, column.name)
  const value = own(work.data, column.name)
  const verifiedEmpty = allowsVerifiedEmpty(column) && isRecord(provenance) && provenance.origin === "verified_empty"
  return (value === undefined || value === null) && !verifiedEmpty
}

/** Refus d'une ligne créée sans une colonne requise (AC14 ; E11-S01, AC-b3) : « with its proof » dans un tableau qui l'exige seulement. */
function requiredAtCreation(column: TableColumn, proof: boolean): string {
  const how = allowsVerifiedEmpty(column) ? "set it, or verified_empty with a reason." : `set it${proof ? " with its proof" : ""}; verified_empty is not allowed for this column.`
  return `${column.name}: required when creating a row: ${how}`
}

/** Création (AC1, AC14) : la clé et l'état d'entrée posés d'office ; les colonnes requises exigées. */
function create(work: Work): void {
  const { header, input, actor } = work.request
  work.data[header.key] = keyValue(input.key, header)
  if (own(work.provenance, header.key) === undefined) work.provenance[header.key] = cellProvenance(actor, null)
  const lifecycle = header.lifecycle
  if (lifecycle && own(work.data, lifecycle.column) === undefined && !work.changes.verified_empty.includes(lifecycle.column)) {
    const [entry] = lifecycle.states
    work.data[lifecycle.column] = entry
    work.provenance[lifecycle.column] = cellProvenance(actor, null)
    work.changes.entry = { column: lifecycle.column, state: entry }
  }
  for (const column of header.columns) {
    if (column.required && missing(work, column)) work.problems.push(requiredAtCreation(column, header.proof))
  }
}

/** Notes d'une ligne existante (AC14, AC15) : une colonne requise sans valeur, une valeur hors format hors de l'écriture. */
function notesOf(work: Work, touched: ReadonlySet<string>): string[] {
  const { header } = work.request
  const cells = rowCells({ key: work.request.input.key, data: work.data }, header)
  return header.columns.flatMap((column) => {
    if (column.name === header.key) return []
    if (column.required && missing(work, column)) return [`note: ${column.name} is required and has no value on this row.`]
    const value = cells.get(column.name)
    if (touched.has(column.name) || value === undefined || valueProblem(column, value) === null) return []
    return [`note: ${column.name} holds a value that is not ${expectedOf(column, value)} (${shown(value)}); fix it with set.`]
  })
}

function noChanges(): RowChanges {
  return { set: [], cleared: [], verified_empty: [], annotated: [], entry: null }
}

function hasChanges(changes: RowChanges): boolean {
  return changes.set.length + changes.cleared.length + changes.verified_empty.length + changes.annotated.length > 0 || changes.entry !== null
}

/** Les opérations d'une ligne appliquées dans l'ordre `set`, `clear`, `verified_empty`, hors des colonnes écartées. */
function applyOps(work: Work, skipped: ReadonlySet<string>): void {
  const { header, input } = work.request
  const column = (name: string) => (skipped.has(name) ? undefined : columnOf(header, name))
  for (const [name, raw] of Object.entries(input.set ?? {})) {
    const found = column(name)
    if (found) applySet(work, found, raw)
  }
  for (const name of input.clear ?? []) {
    const found = column(name)
    if (found) applyClear(work, found)
  }
  for (const { column: name, reason } of input.verified_empty ?? []) {
    const found = column(name)
    if (found) applyVerifiedEmpty(work, found, reason)
  }
}

/**
 * Une ligne écrite (H92) : les opérations appliquées à la ligne actuelle, ou à une ligne neuve.
 * Tout problème refuse la ligne entière (N1) : `data` et `provenance` rendus sont alors ceux d'avant,
 * sans changement ni note.
 */
export function applyRowWrite(request: RowWriteRequest): RowWrite {
  const { current, input } = request
  const before = { data: isRecord(current?.data) ? current.data : {}, provenance: isRecord(current?.provenance) ? current.provenance : {} }
  const work: Work = {
    request,
    problems: [],
    notes: [],
    data: structuredClone(before.data),
    provenance: structuredClone(before.provenance),
    changes: noChanges(),
    destroyed: [],
    effective: false,
  }
  applyOps(work, namingProblems(work))
  if (current === null) create(work)
  if (work.problems.length > 0) return { problems: work.problems, notes: [], ...before, changes: noChanges(), destroyed: [], effective: false }
  const touched = new Set(Object.values(namesByOp(input)).flat())
  const notes = current === null ? [] : notesOf(work, touched)
  const { data, provenance, changes, destroyed } = work
  return { problems: [], notes, data, provenance, changes, destroyed, effective: current === null || hasChanges(changes) }
}
