// Les quatre opérations par bloc de `write` (ADR-011 § 5, N15) : un bloc visé par sa référence courte
// (sa clé, sinon le début de son id, lus avec `refs: true`). Le bloc visé garde son id (le premier bloc
// du texte en prend la place, N12) ; un déplacement seul ne change ni sa révision ni sa provenance
// (N20). Fonctions pures, sur le document en mémoire.
//
// Repris d'oto-frontend (`src/schemas/block.ts` l. 1-60, `use-editing-model.ts` l. 176-186) : édition
// au bloc, id fabriqué par le serveur, jamais par le client. Retiré : `ordered` posé sur n'importe quel
// bloc (ici `list.data.ordered`) et les `refs` servies par bloc.
import type { BlockInput, WriteOpBody } from "../../schemas"
import { isUnknownBlock } from "../../schemas/blocks-render"
import { displayRefs, headingLevel, resolveBlockRef } from "./document"
import { newBlock, OpProblem, parseOpText, plural, type OpOutcome, type OpState, type WorkBlock } from "./op-kit"

/** Le bloc d'une référence (N13) ; inconnue, trop courte ou partagée par plusieurs blocs : refus. */
function target(state: OpState, ref: string, role: "block" | "after_block"): WorkBlock {
  const found = resolveBlockRef(state.blocks, ref)
  if ("block" in found) return found.block
  if ("matches" in found) {
    throw new OpProblem("invalid_arguments", `« ${ref} » matches ${found.matches} blocks; give the whole reference read with refs: true.`)
  }
  throw new OpProblem(
    "invalid_arguments",
    role === "block"
      ? `unknown block « ${ref} ». Read the page with refs: true (the draft: draft: true, refs: true) to get the references.`
      : `unknown block « ${ref} » for after_block. Read the page with refs: true to get the references.`,
  )
}

/**
 * La révision lue du bloc visé, quand l'écran la donne (N45) : un écart est un refus de révision, qui
 * porte la révision du nœud (`details.revision`, AC37).
 */
function checkRevision(state: OpState, block: WorkBlock, op: WriteOpBody): void {
  if (op.revision === undefined || op.revision === block.revision) return
  const ref = displayRefs(state.blocks).get(block) ?? op.block
  throw new OpProblem(
    "stale_revision",
    `stale revision: block ${ref} of ${state.path} is at revision ${block.revision}, not ${op.revision}. Nothing was written. Read it again, then retry.`,
    true,
    state.revision === undefined ? undefined : { revision: state.revision },
  )
}

/**
 * Refus `conflict` d'un remplacement, d'une suppression ou d'un déplacement d'un bloc d'une version plus
 * récente (M67, D122) : `read` ne sert de lui qu'une ligne de commentaire ; ce qu'il porte, et sa place
 * parmi ses voisins, seule une version à jour le lit.
 */
function keepNewerBlock(block: WorkBlock, op: WriteOpBody): void {
  if (!isUnknownBlock(block)) return
  throw new OpProblem(
    "conflict",
    `block ${op.block} is a ${block.type} block newer than this platform version: only an updated platform can replace, delete or move it. Update the platform to change it.`,
  )
}

/** Une clé posée par un bloc structuré (`input`) : unique dans le brouillon (N8). */
function checkKey(state: OpState, key: string | null | undefined, except: WorkBlock | null): void {
  if (!key || !state.blocks.some((block) => block !== except && block.key === key)) return
  throw new OpProblem("conflict", `key « ${key} » is already used by another block of ${state.path}.`)
}

/** Les blocs d'une opération : un bloc structuré (`input`, API) ou le texte analysé ; vide : refus. */
function contentOf(op: WriteOpBody, empty: string): BlockInput[] {
  if (op.input) {
    if (op.input.type === "row") throw new OpProblem("invalid_arguments", "a row block belongs to a table, not to a page.")
    return [op.input]
  }
  const text = op.text ?? ""
  const blocks = text.trim() === "" ? [] : parseOpText(text).blocks
  if (blocks.length === 0) throw new OpProblem("invalid_arguments", empty)
  return blocks
}

function refsOf(fresh: readonly WorkBlock[], refOf: (uid: number) => string): string {
  return fresh.map((block) => refOf(block.uid)).join(", ")
}

function replaceBlock(state: OpState, op: WriteOpBody): OpOutcome {
  const block = target(state, op.block ?? "", "block")
  checkRevision(state, block, op)
  keepNewerBlock(block, op)
  const [first, ...rest] = contentOf(op, "text is empty; to remove the block use delete_block.")
  // Un bloc structuré remplace aussi la clé (absente : retirée, N45) ; un texte la garde.
  const key = op.input ? (op.input.key ?? null) : block.key
  checkKey(state, key, block)
  const replaced: WorkBlock = { ...block, type: first.type, text: first.text ?? null, data: { ...(first.data ?? {}) }, key }
  const fresh = rest.map((input) => newBlock(state, input))
  const blocks = state.blocks.flatMap((candidate) => (candidate === block ? [replaced, ...fresh] : [candidate]))
  const describe = (refOf: (uid: number) => string) =>
    `replaced block ${op.block}${fresh.length > 0 ? ` (+${fresh.length} ${plural(fresh.length, "block")}: ${refsOf(fresh, refOf)})` : ""}`
  return { blocks, touched: { op: op.op, uids: [replaced.uid, ...fresh.map((one) => one.uid)], describe } }
}

function insertAfter(state: OpState, op: WriteOpBody): OpOutcome {
  const anchor = op.block === undefined ? null : target(state, op.block, "block")
  const inputs = contentOf(op, "text is empty; nothing to insert.")
  checkKey(state, op.input?.key, null)
  const fresh = inputs.map((input) => newBlock(state, input))
  const at = anchor ? state.blocks.indexOf(anchor) + 1 : 0
  const blocks = [...state.blocks.slice(0, at), ...fresh, ...state.blocks.slice(at)]
  const where = anchor ? `after ${op.block}` : "at the start"
  const describe = (refOf: (uid: number) => string) =>
    `inserted ${fresh.length} ${plural(fresh.length, "block")} ${where} (${refsOf(fresh, refOf)})`
  return { blocks, touched: { op: op.op, uids: fresh.map((one) => one.uid), describe } }
}

function deleteBlock(state: OpState, op: WriteOpBody): OpOutcome {
  const block = target(state, op.block ?? "", "block")
  checkRevision(state, block, op)
  keepNewerBlock(block, op)
  const index = state.blocks.indexOf(block)
  let moved = ""
  // Un titre retiré seul : ses blocs rejoignent la section précédente (N15).
  if (headingLevel(block) !== null && index < state.blocks.length - 1) {
    const previous = state.blocks.slice(0, index).findLast((candidate) => headingLevel(candidate) !== null)
    moved = ` (its blocks now belong to ${previous ? `« ${previous.text} »` : "the start of the page"})`
  }
  const blocks = state.blocks.filter((candidate) => candidate !== block)
  return { blocks, touched: { op: op.op, uids: [], describe: () => `deleted block ${op.block}${moved}` } }
}

function moveBlock(state: OpState, op: WriteOpBody): OpOutcome {
  const block = target(state, op.block ?? "", "block")
  checkRevision(state, block, op)
  keepNewerBlock(block, op)
  const anchor = op.after_block === undefined ? null : target(state, op.after_block, "after_block")
  if (anchor === block) throw new OpProblem("invalid_arguments", "a block cannot move after itself.")
  const without = state.blocks.filter((candidate) => candidate !== block)
  const at = anchor ? without.indexOf(anchor) + 1 : 0
  // Sans position, le bloc est replacé entre ses nouveaux voisins (`placeBlocks`) ; son contenu ne change pas.
  const moved: WorkBlock = { ...block, position: null }
  const blocks = [...without.slice(0, at), moved, ...without.slice(at)]
  const where = anchor ? `after ${op.after_block}` : "to the start"
  return { blocks, touched: { op: op.op, uids: [moved.uid], describe: () => `moved block ${op.block} ${where}` } }
}

/** Une opération par bloc, sur le document en mémoire (champs déjà contrôlés par `applyOps`). */
export function applyBlockOp(state: OpState, op: WriteOpBody): OpOutcome {
  switch (op.op) {
    case "replace_block":
      return replaceBlock(state, op)
    case "insert_after":
      return insertAfter(state, op)
    case "delete_block":
      return deleteBlock(state, op)
    default:
      return moveBlock(state, op)
  }
}
