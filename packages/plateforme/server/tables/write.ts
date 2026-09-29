// `table.write` (E07-S02, AC1, AC2, AC7, AC8, AC12, AC13, AC18, AC19, AC29 ; H92, H94, H98, H100 ; N1 à
// N4) : les lignes d'un appel écrites une à une, dans l'ordre, chacune atomique. Le tableau est chargé
// et l'écriture décidée avant toute lecture de lignes (`loadTable`, `requireWrite`) ; les lignes des
// clés du lot sont lues en une fois ; chaque ligne est fusionnée par `applyRowWrite`, puis insérée ou
// mise à jour sous garde de révision. Une écriture sans `revision` qui croise une autre est relue et
// réappliquée deux fois au plus ; une création qui croise une autre création de la même clé (écartée
// par `uq_blocks_node_id_state_key`) est relue et appliquée en mise à jour ; jamais d'upsert. Sans lui,
// rien ne s'écrit dans un tableau.
// Face SQL (E01-S10, lot c1) : les lignes d'un appel s'écrivent en une transaction (AC-x4) ; une panne
// de la base au milieu n'en laisse aucune, une ligne refusée n'en est pas une. Les noms des membres
// qu'un refus cite se lisent après elle, qui ne tient que ses requêtes.
// Une valeur nue d'une colonne de valeur est jugée dans la transaction, sur les lignes lues et avant toute
// écriture : égale à la valeur rangée, ignorée ; différente, écrite, sauf dans un tableau qui exige la preuve
// (`proof`, fiche D133), où l'appel entier est refusé (`withoutBareValues`, fiche D99, HN-M53-5). La colonne
// d'état et la colonne clé n'ont pas de preuve : leurs propres règles jugent la ligne. Avec `create_only`
// (E11-S01, lot a), une clé qui a déjà sa ligne est refusée avec elle, sans rien écrire.
//
// Repris de la maquette (`mcp-test/src/proto/functions/table.ts` l. 222-284) : garde `.eq("revision", …)`,
// « changed meanwhile », ligne actuelle rendue sur une révision périmée. Retiré : la table `rows` à part
// (→ blocs `row`, ADR-011), `values` (→ `data`), `by` = slug d'URL (→ identifiant de la personne). Repris
// d'Oto (`datastore/lots.py` l. 41-61, 204-243 ; `cle_metier.py` l. 29-90 ; `guides/datastore-semantics.md`
// l. 84-119) : la ligne fautive désignée, deux insertions concurrentes → une ligne, deux écritures sur des
// colonnes différentes ne s'écrasent jamais, une ligne réservée par un autre est refusée. Retiré : le
// lot qui s'arrête au premier refus, le lot sans plafond, `key=` d'appel.
import type { CellValue, TableHeader, TableRowRead } from "../../schemas"
import { CREATE_ONLY_HELP, tableWriteArgsSchema, type TableCellInput, type TableRowWrite, type TableWriteArgs } from "../../schemas/table-write"
import { isRecord } from "../../schemas/tables"
import { defineFunction, type FunctionContext, type FunctionOutput } from "../catalog/define"
import { changedMeanwhile, inTransaction, issuesText, PlatformError } from "../errors"
import { wellFormed } from "../journal"
import { memberNames } from "../nodes/view"
import { checkWriteArgs } from "./check"
import { columnOf } from "./header"
import { keyValue, loadTable, type LoadedTable } from "./meta"
import { requireWrite, tableResult, tableTeamId, utcClock } from "./output"
import { EMPTY_KEY, rowKey } from "./row-rules"
import { asJson, insertRow, leaseActive, rowByKey, rowsByKey, updateRow, type StoredRow } from "./row-store"
import { FORMER_MEMBER, toReadRow } from "./rows"
import { applyRowWrite, type RowActor, type RowWrite } from "./write-row"
import { writeReport, type RowOutcome, type RowRefusalCode } from "./write-report"
import { sameValue } from "./write-values"

/** Réapplications au plus d'une écriture sans `revision` qui croise une autre écriture (N2). */
const REAPPLY_MAX = 2

/** Refus d'un appel qui porte une valeur nouvelle sans preuve (fiche D99, M53 ; HN-M53-5). */
const BARE_CALL_REFUSED = "Nothing was written: a bare value equal to the stored one is ignored; any new value needs its proof."

/** Le problème d'une valeur nouvelle sans preuve, dit à son chemin dans l'appel. */
const NEW_VALUE_UNPROVED =
  'new value without its proof: write {"value": …, "comment": "…"} (where you found it) or {"value": …, "link": "https://…"} (the source); a column searched without result goes in verified_empty with a reason'

/**
 * La valeur d'une cellule sans preuve (fiche D99, P1) : une valeur nue, ou `{ value }` sans commentaire
 * écrit ni lien ; `undefined` pour une cellule prouvée ou un `null`, que sa ligne refuse (AC4, D49 B).
 */
function bareValue(cell: TableCellInput): CellValue | undefined {
  if (cell === null) return undefined
  if (typeof cell !== "object") return cell
  if (cell.value === null) return undefined
  const proved = (cell.comment !== undefined && cell.comment.trim() !== "") || cell.link !== undefined
  return proved ? undefined : cell.value
}

/**
 * Une colonne de valeur, seule à exiger sa preuve (décision de JB du 2026-09-27) : ni la colonne clé,
 * que `key` pose et qu'une écriture ne renomme pas (AC16), ni la colonne d'état, dont les transitions
 * suivent `stateRule` (AC17). Une valeur nue de ces deux colonnes va à sa ligne, qui la refuse avec son
 * vrai motif, jamais « new value without its proof ».
 */
function provedColumn(header: TableHeader, name: string): boolean {
  return name !== header.key && name !== header.lifecycle?.column
}

/**
 * Les valeurs nues d'un appel, jugées sur les lignes lues avant toute écriture (décision de JB du
 * 2026-09-27, HN-M53-5) : sur une colonne de valeur (`provedColumn`), égale à la valeur rangée
 * (`sameValue`, dans le type de la colonne), une valeur nue sort de `set` sans rien changer ni annoter ;
 * différente, ou sur une ligne à créer, elle s'écrit, sauf si le tableau exige la preuve (`proof`, fiche
 * D133) : elle refuse alors l'appel entier, nommée à son chemin. Une clé mal formée et une colonne inconnue
 * restent aux refus de leur ligne (N19, AC5). Sans elle, une ligne lue puis renvoyée telle quelle serait
 * refusée (AC29), ou remplacerait une provenance prouvée par une provenance nue (HN-E11S01-15).
 */
export function withoutBareValues(
  header: TableHeader,
  rows: readonly TableRowWrite[],
  stored: ReadonlyMap<string, { data: unknown }>,
): { rows: TableRowWrite[] } | { issues: { path: string[]; message: string }[] } {
  const issues: { path: string[]; message: string }[] = []
  const kept = rows.map((row, index) => {
    const keyed = rowKey(header, row.key)
    if (!row.set || !("key" in keyed)) return row
    const data = stored.get(keyed.key)?.data
    const set = Object.entries(row.set).filter(([name, cell]) => {
      const value = bareValue(cell)
      const column = columnOf(header, name)
      if (value === undefined || column === undefined || !provedColumn(header, name)) return true
      const current = isRecord(data) && Object.hasOwn(data, name) ? data[name] : undefined
      if (sameValue(column, current, value)) return false
      if (header.proof) issues.push({ path: ["rows", String(index), "set", name], message: NEW_VALUE_UNPROVED })
      return true
    })
    return { ...row, set: Object.fromEntries(set) }
  })
  return issues.length > 0 ? { issues } : { rows: kept }
}

type Scope = {
  context: FunctionContext
  table: LoadedTable
  actor: RowActor
  /** `create_only` (E11-S01, AC-a1) : une clé qui a déjà sa ligne est refusée avec elle. */
  createOnly: boolean
  reviewQueue: string
  now: number
  /** Les lignes connues, par clé : lues en une fois, puis tenues à jour après chaque écriture. */
  rows: Map<string, StoredRow>
}

/**
 * Une ligne d'entrée en cours d'écriture : la portée de l'appel, et le chemin de la ligne dans ses
 * arguments (`rows.1`), que cite le refus d'un `null` (AC4, D49 B).
 */
type RowScope = Scope & { argPath: string }

/**
 * Ce qu'une ligne d'entrée est devenue, ou le refus qui cite un titulaire ou la ligne telle qu'elle est :
 * rendu avec les noms des membres (`memberNames`), lus une fois après la transaction, et seulement s'il
 * en faut.
 */
type Pending = RowOutcome | ((names: ReadonlyMap<string, string>) => RowOutcome)

/** Une tentative : faite (ligne écrite ou refusée), ou à reprendre sur une ligne relue (N2, N3). */
type Attempt = { kind: "done"; outcome: Pending; row?: StoredRow } | { kind: "again" }

/**
 * Une ligne refusée, rien d'écrit pour elle : ses problèmes (AC3 à AC17), ou la phrase entière d'un
 * refus de la ligne (AC8, AC12, AC18), sous son code H04 ; la clé servie dans le type de la colonne clé.
 */
function refusedRow(scope: Scope, key: string, refusal: { code: RowRefusalCode; problems?: string[]; sentence?: string; current?: TableRowRead }): RowOutcome {
  const { code, sentence, current } = refusal
  const problems = refusal.problems ?? (sentence ? [sentence] : [])
  return { status: "refused", key: keyValue(key, scope.table.header), label: key, code, problems, ...(sentence ? { sentence } : {}), ...(current ? { current } : {}) }
}

function done(outcome: Pending, row?: StoredRow): Attempt {
  return { kind: "done", outcome, ...(row ? { row } : {}) }
}

/** AC12 : la ligne telle qu'elle est, en forme de lecture, et la révision à reprendre. */
function staleRevision(scope: Scope, key: string, given: number, current: StoredRow): Pending {
  return (names) => {
    const read = toReadRow(current, scope.table.header, names, { now: scope.now })
    const sentence = `refused (stale_revision): you read revision ${given}, the row is at revision ${current.revision}; nothing written. Current row: ${JSON.stringify(read)}. Read it again, recompute, then write with revision ${current.revision}.`
    return refusedRow(scope, key, { code: "stale_revision", sentence, current: read })
  }
}

/** AC-a1 : `create_only` sur une clé qui a déjà sa ligne ; la ligne telle qu'elle est, rien d'écrit. */
function existingRow(scope: Scope, key: string, current: StoredRow): Pending {
  return (names) => {
    const read = toReadRow(current, scope.table.header, names, { now: scope.now })
    const sentence = `refused (conflict): a row with this key already exists (revision ${current.revision}); nothing written (create_only). Current row: ${JSON.stringify(read)}. Pick another key, or write without create_only to update it.`
    return refusedRow(scope, key, { code: "conflict", sentence, current: read })
  }
}

/** N26 : une écriture avec `revision` sur une clé qui n'a plus de ligne. */
function noRowNow(scope: Scope, key: string, given: number): RowOutcome {
  const sentence = `refused (stale_revision): you read revision ${given}, but no row has this key now; nothing written. Read the table again with table.rows.`
  return refusedRow(scope, key, { code: "stale_revision", sentence })
}

/** AC18 : une ligne sous le bail actif d'une autre personne ; `claimed_by_user` fait foi, pas le libellé (N4). */
function claimedByOther(scope: Scope, key: string, current: StoredRow): Pending | null {
  if (!leaseActive(current, scope.now) || current.claimed_by_user === scope.actor.userId) return null
  return (names) => {
    const holder = (current.claimed_by_user ? names.get(current.claimed_by_user) : undefined) ?? FORMER_MEMBER
    const sentence = `claimed by ${holder} (worker ${current.claimed_by}) until ${utcClock(current.lease_until ?? "")}; nothing written. Wait for its release or the end of the lease.`
    return refusedRow(scope, key, { code: "conflict", sentence })
  }
}

/** Qui écrit la ligne : avec le travailleur de son bail actif, s'il est à la même personne (AC-d3, HN-E11S01-6 ; `claimed_by_user` fait foi, N4). */
function rowActor(scope: Scope, current: StoredRow | null): RowActor {
  const held = current !== null && leaseActive(current, scope.now) && current.claimed_by_user === scope.actor.userId
  return held ? { ...scope.actor, worker: current.claimed_by } : scope.actor
}

function merged(scope: RowScope, current: StoredRow | null, input: TableRowWrite, key: string): RowWrite {
  const { header, node } = scope.table
  const { set, clear, verified_empty } = input
  const actor = rowActor(scope, current)
  return applyRowWrite({ header, path: node.path, argPath: scope.argPath, reviewQueue: scope.reviewQueue, current, input: { key, set, clear, verified_empty }, actor })
}

/** Une ligne à créer (AC1, AC8, AC13, AC14) ; une clé prise entre-temps par une autre création : à relire (N3). */
async function create(scope: RowScope, input: TableRowWrite, key: string): Promise<Attempt> {
  if (input.revision !== undefined) return done(noRowNow(scope, key, input.revision))
  if (scope.table.header.closed) {
    const sentence = "this table is closed: only existing rows can be written; nothing was created. Check the key: an invented key would create a row that nothing matches."
    return done(refusedRow(scope, key, { code: "invalid_arguments", sentence }))
  }
  const write = merged(scope, null, input, key)
  if (write.problems.length > 0) return done(refusedRow(scope, key, { code: "invalid_arguments", problems: write.problems }))
  const { userId } = scope.actor
  const row = await insertRow(scope.context.db, { nodeId: scope.table.node.id, key, data: write.data, provenance: write.provenance, userId })
  if (row === "duplicate") return { kind: "again" }
  return done({ status: "created", key: keyValue(key, scope.table.header), revision: row.revision, write }, row)
}

/** Une ligne existante (AC9, AC12, AC18) : bail d'un autre, révision périmée, fusion, puis mise à jour gardée. */
async function update(scope: RowScope, input: TableRowWrite, key: string, current: StoredRow): Promise<Attempt> {
  if (scope.createOnly) return done(existingRow(scope, key, current))
  const other = claimedByOther(scope, key, current)
  if (other) return done(other)
  if (input.revision !== undefined && input.revision !== current.revision) return done(staleRevision(scope, key, input.revision, current))
  const write = merged(scope, current, input, key)
  const served = keyValue(key, scope.table.header)
  if (write.problems.length > 0) return done(refusedRow(scope, key, { code: "invalid_arguments", problems: write.problems }))
  // Une écriture sans effet n'envoie rien et ne fait pas avancer la révision (AC9, H100).
  if (!write.effective) return done({ status: "unchanged", key: served, revision: current.revision, notes: write.notes })
  const values = { data: asJson(write.data), provenance: asJson(write.provenance), revision: current.revision + 1, updated_by: scope.actor.userId }
  const row = await updateRow(scope.context.db, current, values)
  if (!row) return { kind: "again" }
  return done({ status: "updated", key: served, revision: row.revision, write }, row)
}

/**
 * Une ligne d'entrée (H92, N1 à N3) : clé normalisée (N19), puis création ou mise à jour ; relue et
 * réappliquée deux fois au plus quand elle croise une autre écriture ; une écriture avec `revision`
 * relue sur une autre révision, ou sans ligne, est périmée (AC12, N26) ; au-delà, un conflit. Chaque
 * course qui refuse la ligne est journalisée (`security-patterns.md § Idempotence et mutations concurrentes`).
 */
async function writeRow(scope: Scope, input: TableRowWrite, index: number): Promise<Pending> {
  const keyed = rowKey(scope.table.header, input.key)
  if ("problem" in keyed) {
    const sentence = keyed.problem === EMPTY_KEY ? { sentence: EMPTY_KEY } : {}
    return { status: "refused", key: input.key, label: `row ${index + 1}`, code: "invalid_arguments", problems: [keyed.problem], ...sentence }
  }
  const { key } = keyed
  const target = `${scope.table.node.id}#${key}`
  const rowScope: RowScope = { ...scope, argPath: `rows.${index}` }
  let current = scope.rows.get(key) ?? null
  for (let attempt = 0; attempt <= REAPPLY_MAX; attempt++) {
    const creating = current === null
    const tried = current === null ? await create(rowScope, input, key) : await update(rowScope, input, key, current)
    if (tried.kind === "done") {
      if (tried.row) scope.rows.set(key, tried.row)
      return tried.outcome
    }
    current = await rowByKey(scope.context.db, scope.table.node.id, key)
    // Une création croisée sous `create_only` (AC-a2) : la ligne relue est refusée, jamais mise à jour ; gardée
    // pour qu'une seconde occurrence de la clé dans l'appel soit refusée aussi, sans nouvelle insertion.
    if (scope.createOnly && creating && current) {
      scope.rows.set(key, current)
      console.error("[platform] tables: write: create_only key taken meanwhile", target)
      return existingRow(scope, key, current)
    }
    // Avec `revision`, seule une mise à jour gardée finit ici : la ligne a changé avant elle, ou est partie.
    if (input.revision !== undefined && current?.revision !== input.revision) {
      console.error("[platform] tables: write: row changed before its update", target)
      return current ? staleRevision(scope, key, input.revision, current) : noRowNow(scope, key, input.revision)
    }
  }
  const message = `changed meanwhile by other writes (${REAPPLY_MAX + 1} tries); nothing written. Read it again with table.rows, then retry.`
  const conflict = changedMeanwhile("tables: write", target, message)
  return refusedRow(scope, key, { code: "conflict", sentence: conflict.message })
}

async function writeRows(context: FunctionContext, validated: TableWriteArgs): Promise<FunctionOutput> {
  // Aucune moitié de paire de substitution vers la base (`supabase-patterns.md § Error Handling`) :
  // la clé lue et la clé écrite restent la même (U+FFFD).
  const args = wellFormed(validated)
  const table = await loadTable(context, args.table)
  await requireWrite(context, table)
  const teamId = await tableTeamId(context.db, table)
  const keys = args.rows.flatMap((row) => {
    const keyed = rowKey(table.header, row.key)
    return "key" in keyed ? [keyed.key] : []
  })
  const now = Date.now()
  const actor = { userId: context.identity.user.id, ctx: context.ctx ?? null, at: new Date(now).toISOString(), host: context.host ?? null }
  const reviewQueue = `${context.origin ?? ""}/n/${table.node.path}`
  // Les lignes de l'appel en une transaction (AC-x4 d'E01-S10) : une panne de la base au milieu les annule
  // toutes ; une panne de son ouverture ou de sa validation se traduit comme les autres (HN-E01S10-15).
  const pending = await inTransaction(context.db, "tables: write", async () => {
    const scope: Scope = { context, table, actor, createOnly: args.create_only === true, reviewQueue, now, rows: await rowsByKey(context.db, table.node.id, keys) }
    // Les valeurs nues jugées sur les lignes lues, avant toute écriture : sur un tableau `proof`, une seule nouvelle refuse l'appel entier (HN-M53-5).
    const sorted = withoutBareValues(table.header, args.rows, scope.rows)
    if ("issues" in sorted) throw new PlatformError("invalid_arguments", `${BARE_CALL_REFUSED} ${issuesText(sorted.issues)}.`)
    const written: Pending[] = []
    // Une à une, dans l'ordre : une clé écrite deux fois dans l'appel voit la première écriture.
    for (const [index, row] of sorted.rows.entries()) written.push(await writeRow(scope, row, index))
    return written
  })
  const named = pending.some((outcome) => typeof outcome === "function")
  const names = named ? await memberNames(context.db, context.identity.org.id) : new Map<string, string>()
  const outcomes = pending.map((outcome) => (typeof outcome === "function" ? outcome(names) : outcome))
  return tableResult(table, writeReport(table.node.path, outcomes), teamId)
}

export const tableWrite = defineFunction({
  name: "table.write",
  connector: "table",
  class: "write",
  origin: "paquet",
  description:
    `Writes rows of a table by key: set {column: value}, or {column: {value, comment | link}} with a comment saying where you found it or the link of the source; a new value needs its proof when the table requires it (table.schema says it), except the state column, set bare within its allowed changes; a bare value equal to the stored one is ignored. Other operations: clear columns, or verified_empty with the reason for 'searched, nothing found'. Use it to create or complete rows; null is refused and columns you do not name stay unchanged. Pass the revision you read to refuse a stale write. ${CREATE_ONLY_HELP}. 50 rows at most per call; each row is written or refused on its own, except a new value without its proof on a table that requires it, which refuses the whole call; the answer says which and why.`,
  schema: tableWriteArgsSchema,
  examples: [
    {
      table: "ventes/suivi_prospects",
      rows: [
        {
          key: "Boulangerie du Pont",
          set: { contact: { value: "Anne Roy", link: "https://boulangeriedupont.test/equipe" }, ville: { value: "Valbrune", comment: "Adresse du site officiel" } },
          verified_empty: [{ column: "email", reason: "Aucune adresse sur le site ni à l'annuaire" }],
        },
      ],
    },
    { table: "ventes/suivi_prospects", rows: [{ key: "Atelier 2", revision: 3, set: { montant_estime: { value: 18000, comment: "Grille tarifaire : étude complète" } }, clear: ["notes"] }] },
  ],
  refusals: [
    "Unknown table: not a table you can read; the refusal lists the tables you can read.",
    "Writing is reserved to the team that owns the table: the refusal says whom to ask.",
    "A new value without its proof on a table that requires it (a bare value that differs from the stored one, or on a new row): nothing is written in the whole call; add the comment or the link, then call again.",
    "No row or more than 50 rows; a verified_empty reason of fewer than 3 characters.",
    "A row refused on its own, nothing written for it: null in set (use clear, or verified_empty with a reason), unknown column, a value of the wrong type, a column named twice, the key column changed, a required column missing at creation, a state set only by table.claim or by the review, a new key in a closed table.",
    "A stale revision: the row comes back as it is now; read it again, then write with its revision.",
    "With create_only, a key that already has its row: refused (conflict), the row comes back as it is; a row with revision and create_only is refused.",
    "A row claimed by someone else: wait for its release or the end of the lease.",
  ],
  next: ["table.rows"],
  checkArgs: checkWriteArgs,
  run: writeRows,
})
