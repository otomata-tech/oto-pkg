// La revue humaine d'un tableau (E07-S03, AC11 à AC13 ; H99, H100, P10, HN-E07S03-3) : une personne
// décide d'une ligne à l'état `review.state`, qui passe à `review.approve` ou `review.reject`. Trois
// décisions avant toute lecture ou écriture du bloc `row` : tableau lisible (`loadTable`), revue
// déclarée, écriture (`requireWrite`, donc `requireNodeLevel` et son « à qui demander »). Puis la ligne
// par sa clé : lue à une autre révision, ou dans un autre état, elle est sautée sans rien écrire ;
// sinon une seule mise à jour, gardée par `id`, `state`, la révision envoyée et l'état attendu ; zéro
// ligne écrite, elle a changé entre-temps : relue, puis sautée, jamais écrasée. La provenance de la
// colonne d'état passe à `human` (qui, quand, raison) et la révision avance. Sans lui, la revue se
// ferait par `table.write`, qui refuse les états de décision (P10) et ne garde pas l'état attendu.
//
// Repris de la maquette (`mcp-test/src/proto/functions/table.ts` l. 336-376, `table.release`) : la
// mise à jour gardée par la révision lue, « changed meanwhile » sur zéro ligne ; l. 169-220
// (`applyRowWrite`) : la provenance par cellule. Retiré : `canWrite` (→ `access.ts`), la table `rows`
// à part (→ blocs `row`, ADR-011). Repris d'Oto (`tools/datastore_review_app.py` l. 341-378, `_decider`) :
// une colonne, deux valeurs bornées par les états déclarés, une ligne passée ailleurs sautée, jamais
// écrasée. Retiré : la carte MCP App, « Continue in chat », l'outil caché au nom haché, la relecture
// puis l'écriture en deux temps (ici une seule requête gardée).
import { reviewDecisionSchema, type ReviewOutcome } from "../../schemas/table-screen"
import { isRecord } from "../../schemas/tables"
import type { PlatformDb } from "../db"
import { databaseFailure, invalidInput, PlatformError } from "../errors"
import type { Identity } from "../identity"
import { wellFormed } from "../journal"
import { loadTable } from "./meta"
import { requireWrite, tableTeamId } from "./output"
import { rowKey } from "./row-rules"
import { asJson, rowByKey, type StoredRow } from "./row-store"
import { cellProvenance } from "./write-row"

/** Ce que la porte de l'API reçoit : l'issue, puis la cible et l'équipe de sa ligne de journal (H07). */
export type ReviewResult = { outcome: ReviewOutcome; target: string; teamId: string | null }

/** Ce qu'écrit une décision : la colonne d'état, l'état attendu et celui posé, la révision lue, qui, pourquoi. */
type Decision = { column: string; expected: string; state: string; revision: number; userId: string; reason: string | undefined }

function stateOf(row: StoredRow, column: string): string | null {
  const value = isRecord(row.data) ? row.data[column] : undefined
  return typeof value === "string" ? value : null
}

function skipped(key: string, row: StoredRow, column: string): ReviewOutcome {
  return { outcome: "skipped", key, currentState: stateOf(row, column), currentRevision: row.revision }
}

/**
 * La décision écrite en une requête (AC11) : `data` et `provenance` réécrits entiers, sans risque sous
 * la garde de la révision et de l'état ; `null` quand aucune ligne n'est écrite. Face SQL (E01-S10,
 * lot c1) : toute valeur liée, gardes comprises.
 */
async function writeDecision(db: PlatformDb, row: StoredRow, decision: Decision): Promise<{ revision: number } | null> {
  const provenance = isRecord(row.provenance) ? row.provenance : {}
  const actor = { userId: decision.userId, ctx: null, at: new Date().toISOString() }
  const stateProvenance = cellProvenance(actor, provenance[decision.column], { origin: "human", ...(decision.reason ? { comment: decision.reason } : {}) })
  const data = asJson({ ...(isRecord(row.data) ? row.data : {}), [decision.column]: decision.state })
  const written = await db
    .tx(
      (sql) => sql<{ revision: number }[]>`
        update platform.blocks
           set data = ${sql.json(data)}, provenance = ${sql.json(asJson({ ...provenance, [decision.column]: stateProvenance }))},
               revision = ${decision.revision + 1}, updated_by = ${decision.userId}
         where id = ${row.id} and state = ${"published"} and revision = ${decision.revision}
           and data ->> ${decision.column} = ${decision.expected}
        returning revision`,
    )
    .catch((error) => {
      throw databaseFailure(error, "tables: review", "Internal error.")
    })
  return written[0] ?? null
}

/**
 * La décision d'une personne sur une ligne de la file de revue (AC11 à AC13) : `decided` avec l'état
 * posé et la révision nouvelle, ou `skipped` avec l'état et la révision actuels ; refus `forbidden`
 * sous l'écriture, `not_found` d'un tableau invisible ou d'une ligne partie, `invalid_arguments` d'un
 * tableau sans revue ou d'une entrée refusée par `reviewDecisionSchema`.
 */
export async function decideReview(db: PlatformDb, identity: Identity, input: unknown): Promise<ReviewResult> {
  const parsed = reviewDecisionSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  // Aucune moitié de paire de substitution vers la base, raison écrite comprise (`supabase-patterns.md § Error Handling`).
  const args = wellFormed(parsed.data)
  const context = { db, identity }
  const table = await loadTable(context, args.table)
  const { lifecycle } = table.header
  if (!lifecycle?.review) throw new PlatformError("invalid_arguments", `Table ${table.node.path} has no review queue (no lifecycle.review in its header).`)
  const { review } = lifecycle
  await requireWrite(context, table)
  const keyed = rowKey(table.header, args.key)
  if ("problem" in keyed) throw new PlatformError("invalid_arguments", keyed.problem)
  const { key } = keyed
  const path = table.node.path
  // L'équipe du journal, lue avant l'écriture : une panne de cette lecture ne suit jamais l'effet (E07-S02).
  const teamId = await tableTeamId(db, table)
  const done = (outcome: ReviewOutcome): ReviewResult => ({ outcome, target: path, teamId })
  const gone = () => new PlatformError("not_found", `Row ${key} no longer exists in ${path}.`)
  const row = await rowByKey(db, table.node.id, key)
  if (!row) throw gone()
  if (row.revision !== args.revision || stateOf(row, lifecycle.column) !== review.state) return done(skipped(key, row, lifecycle.column))
  const state = args.decision === "approve" ? review.approve : review.reject
  const decision = { column: lifecycle.column, expected: review.state, state, revision: args.revision, userId: identity.user.id, reason: args.reason }
  const written = await writeDecision(db, row, decision)
  if (written) return done({ outcome: "decided", key, state, revision: written.revision })
  // Une écriture gardée sans ligne après la décision de droit : la ligne a changé entre-temps, un
  // conflit dit par `skipped`, jamais un refus (HN-E01S07-6), et tracé au serveur.
  console.error("[platform] tables: review: no row written", `${table.node.id}#${key}`)
  const current = await rowByKey(db, table.node.id, key)
  if (!current) throw gone()
  return done(skipped(key, current, lifecycle.column))
}
