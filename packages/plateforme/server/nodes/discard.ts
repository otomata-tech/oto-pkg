// Abandon du brouillon d'un nœud publié (E11-S02, lot d ; ADR-011 § 3 amendé) : `node.discard_draft`,
// derrière `call`, en deux temps (H86). Le service décide avant toute requête d'écriture (ADR-012 § 3) :
// le nœud lu, le niveau écriture (le brouillon est partagé, HN-E11S02-2), un brouillon ouvert, une révision
// publiée à laquelle revenir (HN-E11S02-4). Puis `platform.discard_draft`, atomique : blocs `draft` puis
// `node_drafts`, sous le verrou 7401 de `publish_node`, gardé par le tampon lu (HN-E11S02-13). Sans lui, un
// en-tête de tableau refusé à la publication bloquait chaque écriture d'en-tête suivante (FB-0007).
// Aucune route d'écran ne l'appelle (HN-E11S02-12) ; à part de `store.ts`, déjà long.
import { nodePathArgsSchema } from "../../schemas/node-gestures"
import { ACCESS_LEVELS, requireNodeLevel } from "../access"
import { defineFunction, type FunctionContext, type FunctionSummary } from "../catalog/define"
import type { PlatformDb } from "../db"
import { fromDatabaseError, PlatformError } from "../errors"
import type { Identity } from "../identity"
import { pendingHeaderChanges } from "../tables/evolution"
import { diffBlocks } from "./diff"
import { findNode, unknownNode, type NodeRow } from "./lookup"
import { day } from "./read-format"
import { draftSavedAt, loadBlocks, loadDraft, type DraftRow } from "./store"
import { ownerOf, teamOf } from "./view"

/** Ce que l'abandon a décidé : le nœud et son brouillon, lus après le niveau. */
type DiscardPlan = { node: NodeRow; draft: DraftRow }

/**
 * Les refus d'AC-d3, dans leur ordre, sans rien écrire : chemin inconnu ou illisible (`not_found`), niveau
 * lecture seule (`forbidden`, à qui demander), aucun brouillon, jamais publié (`invalid_arguments`).
 */
async function discardPlan(db: PlatformDb, identity: Identity, path: string): Promise<DiscardPlan> {
  const prefix = identity.org.prefix
  const found = await findNode(db, identity, path)
  if (!found) throw unknownNode(path, prefix)
  const { node } = found
  if (found.level < ACCESS_LEVELS.write) await requireNodeLevel(db, identity, { id: node.id, path: node.path }, "write")
  const draft = await loadDraft(db, node.id)
  if (!draft) throw new PlatformError("invalid_arguments", `Nothing to discard: ${node.path} has no pending draft.`)
  if (node.revision === 0) {
    throw new PlatformError(
      "invalid_arguments",
      `${node.path} has never been published: discarding its draft would leave it empty. To remove it, call ${prefix}_call node.trash {"path": "${node.path}"} (manage level).`,
    )
  }
  return { node, draft }
}

/** Titre et résumé en attente, nommés par le récapitulatif (HN-E11S02-3). */
function pendingHead(draft: DraftRow): string[] {
  return [
    ...(draft.title === null ? [] : [`title « ${draft.title} »`]),
    ...(draft.summary === null ? [] : [`summary « ${draft.summary} »`]),
  ]
}

/** Ce que le brouillon change aux blocs publiés (`diffBlocks`) : ajoutés, changés, déplacés, supprimés. */
async function blockCounts(db: PlatformDb, node: NodeRow): Promise<Record<"added" | "changed" | "moved" | "deleted", number>> {
  const [published, draft] = await Promise.all([loadBlocks(db, node.id, "published"), loadBlocks(db, node.id, "draft")])
  const { changes, deleted } = diffBlocks(published, draft)
  const count = (kind: "added" | "changed" | "moved") => changes.filter((change) => change.kind === kind).length
  return { added: count("added"), changed: count("changed"), moved: count("moved"), deleted: deleted.length }
}

/** Le récapitulatif d'AC-d1 : rien ne change ; `calls.ts` ajoute la phrase commune de l'accord. */
async function summarizeDiscard(context: FunctionContext, args: { path: string }): Promise<FunctionSummary> {
  const { db, identity } = context
  const { node, draft } = await discardPlan(db, identity, args.path)
  const savedAt = await draftSavedAt(db, node.id, draft.stamp)
  const head = pendingHead(draft)
  const table = node.kind === "table" ? pendingHeaderChanges(node, draft).line : null
  const blocks = node.kind === "table" ? null : await blockCounts(db, node)
  const lines = [
    `About to discard the draft of ${node.path} (${node.kind} « ${node.title} »): opened on revision ${draft.baseRevision}, last saved ${day(savedAt)}.`,
    ...(table === null ? [] : [table[0].toUpperCase() + table.slice(1)]),
    ...(head.length > 0 ? [`Pending ${head.join(", ")}.`] : []),
    ...(blocks === null ? [] : [`Blocks: ${blocks.added} added, ${blocks.changed} changed, ${blocks.moved} moved, ${blocks.deleted} deleted.`]),
    `The published revision ${node.revision} stays as it is. This cannot be undone.`,
  ]
  const data = {
    path: node.path,
    kind: node.kind,
    title: node.title,
    revision: node.revision,
    base_revision: draft.baseRevision,
    saved_at: savedAt,
    pending: { title: draft.title, summary: draft.summary, ...(table === null ? {} : { header: table }) },
    ...(blocks === null ? {} : { blocks }),
  }
  return { text: lines.join("\n"), data }
}

/**
 * `platform.discard_draft` sur le tampon lu : `55000` → plus de brouillon (publié entre-temps) ;
 * `stale_revision` (un `PT409`, lu par `errors.ts`) → le brouillon a bougé depuis la lecture, journalisé
 * d'abord (`security-patterns.md § Idempotence et mutations concurrentes`).
 */
async function discard(db: PlatformDb, plan: DiscardPlan): Promise<number> {
  const { node, draft } = plan
  const [row] = await db
    .tx((sql) => sql<{ revision: number }[]>`
      select platform.discard_draft(p_node => ${node.id}, p_draft_stamp => ${draft.stamp}::text::timestamptz) as revision`)
    .catch((error: { code?: string }) => {
      if (error.code === "55000") throw new PlatformError("invalid_arguments", `Nothing to discard: ${node.path} has no pending draft.`)
      const translated = fromDatabaseError(error, "discard_draft")
      if (translated.code !== "stale_revision") throw translated
      console.error(`[platform] nodes: draft of ${node.id} changed while discarding`)
      throw new PlatformError(
        "stale_revision",
        `stale revision: ${node.path} changed while discarding (its draft was saved meanwhile). Nothing was discarded. Read it again with draft: true, then retry.`,
        { revision: node.revision },
      )
    })
  if (!row) throw new PlatformError("internal", "Internal error.")
  return row.revision
}

/**
 * Abandonne le brouillon d'un nœud publié (AC-d2) : les décisions d'AC-d3 rejouées, puis la fonction
 * atomique ; `nodes` et les blocs publiés ne bougent pas.
 */
export async function discardDraft(db: PlatformDb, identity: Identity, path: string): Promise<{ path: string; revision: number; teamId: string | null }> {
  const plan = await discardPlan(db, identity, path)
  const teamId = teamOf(await ownerOf(db, plan.node.id))
  const revision = await discard(db, plan)
  return { path: plan.node.path, revision, teamId }
}

export const nodeDiscardDraft = defineFunction({
  name: "node.discard_draft",
  connector: "node",
  class: "sensitive",
  origin: "paquet",
  description:
    "Discards the pending draft of a published page, procedure, Contexte or table: its draft blocks, pending title and summary, and a pending table header go; the published revision stays as it is. Use it when a publication was refused and the user wants to go back to the published version, e.g. a table header change refused on publish. Two steps: a summary of what would be lost, then confirm: true after the user agreed. Cannot be undone.",
  schema: nodePathArgsSchema,
  examples: [{ path: "ventes/salons" }],
  refusals: [
    "Unknown path: not a node you can read.",
    "Writing is reserved to the owner of the node: the refusal says whom to ask.",
    "Nothing to discard: the node has no pending draft.",
    "A node never published: discarding would leave it empty; move it to the trash with node.trash instead (manage level).",
    "stale revision: the draft was saved while discarding; read it again with draft: true, then retry.",
  ],
  summarize: summarizeDiscard,
  run: async ({ db, identity }, args) => {
    const done = await discardDraft(db, identity, args.path)
    return {
      text: `Draft of ${done.path} discarded: ${done.path} is back to its published revision ${done.revision}.`,
      data: { path: done.path, revision: done.revision, status: "published", has_draft: false },
      teamId: done.teamId,
    }
  },
})
