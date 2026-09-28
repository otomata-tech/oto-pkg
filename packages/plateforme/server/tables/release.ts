// `table.release` (E07-S02, AC24, AC25 ; H98, P10, N10, N13, N16) : une ligne réservée rendue par son
// titulaire. Le tableau est chargé et l'écriture décidée avant toute lecture de lignes (`loadTable`,
// `requireWrite`) ; l'état demandé est contrôlé avant de lire la ligne (ni l'état de travail, que seule
// une réservation pose, ni une décision de la revue, que seule une personne pose) ; la ligne n'est
// rendue que par la même personne et le même travailleur ; le bail est vidé d'un coup, sous la garde de
// la révision lue et du travailleur. Sans lui, une ligne réservée ne sortirait de la file qu'à la fin
// de son bail, et la revue ne se remplirait pas.
//
// Repris de la maquette (`mcp-test/src/proto/functions/table.ts` l. 330-376) : libération gardée par le
// travailleur et la révision, « changed meanwhile (another worker may hold it now) », « released → ».
// Retiré : le bail tenu par le seul libellé. Repris d'Oto (`datastore/outils.py` l. 127-129 ;
// `tools/datastore.py` l. 1112-1146 ; `datastore/file_de_travail.py` l. 140-237, 255-292, 346-373) :
// libérer une ligne sans bail n'est pas un échec, le livelock de la file est dit, libération gardée par
// le travailleur. Retiré : la titularité par `run`, la libération en fin de `run`, l'en-tête `X-Oto-Run`.
import { tableReleaseArgsSchema, type TableReleaseArgs } from "../../schemas/table-write"
import { isRecord } from "../../schemas/tables"
import { defineFunction, type FunctionContext, type FunctionOutput } from "../catalog/define"
import { changedMeanwhile, PlatformError } from "../errors"
import { wellFormed } from "../journal"
import { memberNames } from "../nodes/view"
import { checkReleaseArgs } from "./check"
import { queueOf } from "./claim"
import { loadTable, type LoadedTable } from "./meta"
import { requireWrite, tableResult, tableTeamId } from "./output"
import { decisionNames, releaseStates, rowKey, stateRule } from "./row-rules"
import { asJson, rowByKey, updateRow, type StoredRow } from "./row-store"
import { FORMER_MEMBER } from "./rows"
import { cellProvenance } from "./write-row"

/** L'état demandé (AC24) : ni l'état de travail, ni une décision de la revue, ni un état inconnu ; refusé avant toute lecture de ligne. */
function checkState(table: LoadedTable, state: string): void {
  const accepted = releaseStates(table.header).join(", ")
  const rule = stateRule(table.header, state)
  if (rule === "working") throw new PlatformError("invalid_arguments", `« ${state} » is set by table.claim, with a lease; release to another state: ${accepted}.`)
  if (rule === "decision") {
    throw new PlatformError("invalid_arguments", `${decisionNames(table.header)} are decided by a person in the review queue; release to: ${accepted}.`)
  }
  if (rule === "unknown") throw new PlatformError("invalid_arguments", `Unknown state ${state}. States you can release to: ${accepted}.`)
}

/** « claude-claire (Claire Morel) » : le libellé et le nom de la personne (`memberNames`). */
async function holders(context: FunctionContext, row: StoredRow, worker: string): Promise<{ holder: string; caller: string }> {
  const names = await memberNames(context.db, context.identity.org.id)
  const name = (userId: string | null) => (userId ? names.get(userId) : undefined) ?? FORMER_MEMBER
  return { holder: `${row.claimed_by} (${name(row.claimed_by_user)})`, caller: `${worker} (${name(context.identity.user.id)})` }
}

/**
 * La ligne rendue (AC24) : l'état posé, sa provenance, le bail vidé (`claimed_by`, `claimed_by_user`,
 * `lease_until` ensemble), révision + 1, sous la garde de la révision lue et du travailleur ; `null`
 * quand elle a changé entre-temps (reprise par un autre travailleur, écrite).
 */
async function release(context: FunctionContext, row: StoredRow, change: { column: string; state: string; worker: string }): Promise<StoredRow | null> {
  const userId = context.identity.user.id
  const data = { ...(isRecord(row.data) ? row.data : {}), [change.column]: change.state }
  const provenance = isRecord(row.provenance) ? row.provenance : {}
  const stateProvenance = cellProvenance({ userId, ctx: context.ctx ?? null, at: new Date().toISOString() }, provenance[change.column])
  const values = {
    data: asJson(data),
    provenance: asJson({ ...provenance, [change.column]: stateProvenance }),
    claimed_by: null,
    claimed_by_user: null,
    lease_until: null,
    revision: row.revision + 1,
    updated_by: userId,
  }
  return updateRow(context.db, row, values, { claimedBy: change.worker })
}

/** Rendue au premier état sans rien d'écrit depuis sa réservation (AC25, N13) : la révision posée par la réservation n'a pas bougé. */
function livelock(row: StoredRow, column: string): boolean {
  const provenance = isRecord(row.provenance) ? row.provenance[column] : undefined
  return isRecord(provenance) && provenance.claim_revision === row.revision
}

async function releaseRow(context: FunctionContext, validated: TableReleaseArgs): Promise<FunctionOutput> {
  // Aucune moitié de paire de substitution vers la base (`supabase-patterns.md § Error Handling`) :
  // la clé et le libellé comparés sont ceux que `table.write` et `table.claim` ont écrits.
  const args = wellFormed(validated)
  const table = await loadTable(context, args.table)
  await requireWrite(context, table)
  const lifecycle = queueOf(table, "table.release")
  const state = args.state ?? lifecycle.states[0]
  checkState(table, state)
  const keyed = rowKey(table.header, args.key)
  if ("problem" in keyed) throw new PlatformError("invalid_arguments", keyed.problem)
  const { key } = keyed
  const path = table.node.path
  const teamId = await tableTeamId(context.db, table)
  const row = await rowByKey(context.db, table.node.id, key)
  if (!row) throw new PlatformError("not_found", `Unknown row ${key} in ${path}.`)
  // Une ligne sans bail n'est pas un échec (N10) : rien à rendre.
  if (!row.claimed_by) return tableResult(table, { text: `${key} is not claimed: nothing to release. This is not a failure.`, data: { table: path, key, released: false } }, teamId)
  if (row.claimed_by !== args.worker || row.claimed_by_user !== context.identity.user.id) {
    const { holder, caller } = await holders(context, row, args.worker)
    throw new PlatformError("conflict", `${key} is claimed by ${holder}, not ${caller}.`)
  }
  const unchanged = state === lifecycle.states[0] && livelock(row, lifecycle.column)
  const released = await release(context, row, { column: lifecycle.column, state, worker: args.worker })
  if (!released) throw changedMeanwhile("tables: release", `${table.node.id}#${key}`, `${key} changed meanwhile (another worker may hold it now): read it with table.rows.`)
  const note = unchanged
    ? [`Note: ${key} goes back to « ${state} » unchanged; a claim with the same filter will serve it again. Release it to another state if you are done with it.`]
    : []
  const text = [`${key} released → « ${state} » (revision ${released.revision}).`, ...note].join("\n")
  return tableResult(table, { text, data: { table: path, key, state, revision: released.revision, released: true } }, teamId)
}

export const tableRelease = defineFunction({
  name: "table.release",
  connector: "table",
  class: "write",
  origin: "paquet",
  description:
    "Frees a row you claimed with table.claim and sets its next state (default: the first state of the work queue). Use it when you are done with a claimed row, with the same worker name; the working state is set only by table.claim, and the decisions of a review only by a person.",
  schema: tableReleaseArgsSchema,
  examples: [{ table: "ventes/suivi_prospects", key: "Mairie de Valbrune", worker: "claude-claire", state: "à revoir" }],
  refusals: [
    "Unknown table: not a table you can read; the refusal lists the tables you can read.",
    "Writing is reserved to the team that owns the table: the refusal says whom to ask.",
    "The working state (set only by table.claim) or a decision of the review (made by a person); an unknown state, with the states you can release to.",
    "An unknown row.",
    "A row claimed by another worker or another person.",
    "A row changed meanwhile: read it with table.rows.",
  ],
  next: ["table.claim"],
  checkArgs: checkReleaseArgs,
  run: releaseRow,
})
