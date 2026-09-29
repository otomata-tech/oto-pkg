// Les opérations de `write` sur le brouillon en mémoire (E03-S03 ; H54 amendée, N6, N15, N17) :
// répartition entre opérations par section (`section-ops.ts`) et par bloc (`block-ops.ts`), champs
// propres à chaque opération, bornes chiffrées. Elles s'appliquent dans l'ordre ; la première qui
// échoue refuse tout le lot, avant toute écriture. Sans elles, rien ne s'écrit par opérations.
//
// Repris d'Oto (`oto_mcp/doc_patch.py` l. 232-245) : un argument inutilisé est refusé en le nommant
// (un argument avalé ne se voit pas). Retiré : les modes `region=` et `prepend`.
import { SECTION_OPS, splitSections, type WriteOpBody } from "../../schemas"
import { PlatformError } from "../errors"
import { cut } from "../journal"
import { applyBlockOp } from "./block-ops"
import { blocksSize, charCount, formatCount, sectionSizes, type DocBlock } from "./document"
import { BLOCKS_MAX, OP_TEXT_MAX, OPS_MAX, PAGE_MAX, SECTION_MAX } from "./limits"
import { OpProblem, type OpState, type Touched, type WorkBlock } from "./op-kit"
import { applySectionOp } from "./section-ops"

type Op = WriteOpBody["op"]

type Field = "section" | "text" | "find" | "after" | "block" | "after_block" | "revision" | "input"

/** Les champs d'une opération, dans l'ordre où un champ inutilisé est nommé (AC22, AC24, N17). */
const FIELDS: readonly Field[] = ["section", "text", "find", "after", "block", "after_block", "revision", "input"]

const USES: Record<Op, readonly Field[]> = {
  replace_section: ["section", "text"],
  append: ["section", "text"],
  add_section: ["section", "text", "after"],
  delete_section: ["section"],
  replace_text: ["section", "text", "find"],
  replace_block: ["block", "text", "revision", "input"],
  insert_after: ["block", "text", "input"],
  delete_block: ["block", "revision"],
  move_block: ["block", "after_block", "section", "revision"],
}

const SECTION_OP_NAMES: ReadonlySet<string> = new Set(SECTION_OPS)

/** Le bloc visé est obligatoire, sauf pour `insert_after` (en tête sans lui). */
const NEEDS_BLOCK: ReadonlySet<Op> = new Set(["replace_block", "delete_block", "move_block"])

const isSectionOp = (op: WriteOpBody) => SECTION_OP_NAMES.has(op.op)

/** Un titre cité dans le préfixe d'un refus : sur une ligne, coupé à 60 caractères (`cut`, jamais dans un emoji). */
function shown(title: string): string {
  return cut(title.replace(/\s+/g, " ").trim(), 60)
}

/** « Op 2 (append « Corps »): », « Op 1 (insert_after 3f9a2c1b): », « Op 2 (append): ». */
function prefixOf(rank: number, op: WriteOpBody): string {
  if (isSectionOp(op)) return `Op ${rank} (${op.op}${op.section === undefined ? "" : ` « ${shown(op.section)} »`}): `
  return `Op ${rank} (${op.op}${op.block === undefined ? "" : ` ${op.block}`}): `
}

/** Champs requis, champs inutilisés, texte ou bloc structuré, borne du texte (AC22 à AC24). */
function checkFields(op: WriteOpBody): void {
  if (isSectionOp(op) && op.section === undefined) throw new OpProblem("invalid_arguments", "section is required (the title of a section).")
  if (NEEDS_BLOCK.has(op.op) && op.block === undefined) {
    throw new OpProblem("invalid_arguments", "block is required (a reference from read with refs: true).")
  }
  const unused = FIELDS.find((field) => op[field] !== undefined && !USES[op.op].includes(field))
  if (unused) throw new OpProblem("invalid_arguments", `${unused} is not used by ${op.op}; remove it.`)
  if (op.text !== undefined && op.input !== undefined) throw new OpProblem("invalid_arguments", "give text or input, not both.")
  // `move_block` (E11-S03, AC-c1) : après un bloc, ou à la fin d'une section ; les deux destinations ensemble se contredisent.
  if (op.after_block !== undefined && op.section !== undefined) throw new OpProblem("invalid_arguments", "give after_block or section, not both.")
  if (USES[op.op].includes("text") && op.text === undefined && op.input === undefined) throw new OpProblem("invalid_arguments", "text is required.")
  if (op.op === "replace_text" && op.find === undefined) throw new OpProblem("invalid_arguments", "find is required (the exact words to replace).")
  if (op.text !== undefined && charCount(op.text) > OP_TEXT_MAX) {
    throw new OpProblem(
      "too_large",
      `text is ${formatCount(charCount(op.text))} characters; ${formatCount(OP_TEXT_MAX)} at most per operation: send it in parts of about 20,000 with append.`,
    )
  }
}

/** Taille de chaque section, par le `uid` de son titre (−1 : le début de page). */
function sizesByHeading(blocks: readonly WorkBlock[]): Map<number, { size: number; title: string | null }> {
  const sections = splitSections(blocks)
  const sizes = sectionSizes(blocks, sections)
  return new Map(sections.map((section, index) => [section.heading?.uid ?? -1, { size: sizes[index], title: section.heading?.text ?? null }]))
}

/**
 * Bornes d'une page après une opération (N6) : section, page, nombre de blocs. Seule une opération
 * qui fait grandir au-delà est refusée : un document déjà trop grand reste modifiable.
 */
function checkBounds(before: readonly WorkBlock[], after: readonly WorkBlock[], path: string): void {
  const previous = sizesByHeading(before)
  for (const [uid, { size, title }] of sizesByHeading(after)) {
    if (size <= SECTION_MAX || size <= (previous.get(uid)?.size ?? 0)) continue
    const which = title === null ? "the start of the page" : `section « ${title} »`
    throw new OpProblem(
      "too_large",
      `${which} would reach ${formatCount(size)} characters; a section holds at most ${formatCount(SECTION_MAX)}: continue in a new section with add_section.`,
    )
  }
  const size = blocksSize(after)
  if (size > PAGE_MAX && size > blocksSize(before)) {
    throw new OpProblem("too_large", `${path} would reach ${formatCount(size)} characters; a page holds at most ${formatCount(PAGE_MAX)}.`)
  }
  if (after.length > BLOCKS_MAX && after.length > before.length) {
    throw new OpProblem("too_large", `${path} would hold ${formatCount(after.length)} blocks; a page holds at most ${formatCount(BLOCKS_MAX)}.`)
  }
}

/**
 * Le brouillon après les opérations, dans l'ordre, et ce que chacune a touché (AC22 à AC24). Les
 * blocs gardés gardent leur id ; un bloc neuf n'a ni id ni position ; un bloc déplacé perd sa position
 * (`placeBlocks` les pose). Lève les refus des AC, préfixés de « Op <rang> (…): » et finis par
 * « Nothing was written. » : rien n'est écrit. `revision`, celle du nœud, que porte un refus de révision
 * de bloc (`details.revision`, AC37). `tolerant` (E10-S01, AC-a2) : les textes se lisent en mode tolérant, et
 * `keptAsText` compte ce qu'ils ont gardé en texte (0 sans lui).
 */
export function applyOps(
  blocks: readonly DocBlock[],
  ops: readonly WriteOpBody[],
  options: { path: string; revision?: number; tolerant?: boolean },
): { blocks: WorkBlock[]; touched: Touched[]; keptAsText: number } {
  if (ops.length > OPS_MAX) {
    throw new PlatformError("invalid_arguments", `${formatCount(ops.length)} operations; ${OPS_MAX} at most per call: split them over several calls.`)
  }
  const state: OpState = {
    blocks: blocks.map((block, uid) => ({ ...block, uid })),
    path: options.path,
    nextUid: blocks.length,
    revision: options.revision,
    tolerant: options.tolerant,
    keptAsText: 0,
  }
  const touched: Touched[] = []
  ops.forEach((op, index) => {
    try {
      checkFields(op)
      const outcome = isSectionOp(op) ? applySectionOp(state, op) : applyBlockOp(state, op)
      checkBounds(state.blocks, outcome.blocks, state.path)
      state.blocks = outcome.blocks
      touched.push(outcome.touched)
    } catch (error) {
      if (!(error instanceof OpProblem)) throw error
      throw new PlatformError(error.code, error.bare ? error.message : `${prefixOf(index + 1, op)}${error.message} Nothing was written.`, error.details)
    }
  })
  return { blocks: state.blocks, touched, keptAsText: state.keptAsText ?? 0 }
}
