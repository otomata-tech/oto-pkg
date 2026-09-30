// Les cinq opérations par section de `write` (E03-S01, H54 amendée ; ADR-011 § 5), appliquées aux
// plages de blocs de `splitSections` (M05) : une section est un titre et les blocs qui le suivent
// jusqu'au prochain titre de niveau inférieur ou égal, sous-sections comprises (N9). Fonctions pures,
// sur le document en mémoire : rien n'est écrit tant que toutes les opérations ne sont pas passées.
// E11-S18 : `replace_text`, qui vise aussi un bloc ou toute la page, part dans `replace-text.ts`.
//
// Repris de la maquette (`mcp-test/src/proto/services/sections.ts` l. 1-84) : les cinq opérations, le
// premier échec qui refuse tout, les titres cités par un refus. Retiré : les sections en objets
// `{title, body}` (→ plages de blocs). Repris d'Oto (`oto_mcp/doc_patch.py` l. 59-73, 132-146,
// 181-198 ; `db/blocks.py` l. 299-330) : section ambiguë refusée en nommant les candidats, titre propre
// absorbé, sous-sections emportées et annoncées, id gardé par la forme exacte, dans l'ordre, chaque
// ancien une fois. Retiré : `region=` et `prepend` (→ opérations par bloc), le markdown comme source.
import { findSections, normalizeTitle, type BlockInput, type WriteOpBody } from "../../schemas"
import { listItemTexts } from "../../schemas/blocks"
import { isUnknownBlock } from "../../schemas/blocks-render"
import { boundedList } from "../errors"
import { blockMarkdown, blocksSize, charCount, displayRefs, formatCount, headingLevel } from "./document"
import { HEADING_TEXT_MAX, LIST_ITEMS_MAX } from "./limits"
import { newBlock, OpProblem, parseOpText, plural, quotedList, type OpOutcome, type OpState, type WorkBlock } from "./op-kit"

type Parsed = { blocks: BlockInput[]; lines: number[] }

/** Une section trouvée par son titre : ses bornes dans le document, son titre et son niveau ; lue aussi par `replace-text.ts`. */
export type Located = { start: number; end: number; heading: WorkBlock; level: 1 | 2 | 3 | 4 | 5; title: string }

/** Le niveau de titre le plus bas (E10-S04, AC-b3) : sous lui, aucun sous-niveau à proposer. */
const DEEPEST_LEVEL = 5

function headingTitles(blocks: readonly WorkBlock[]): string[] {
  return blocks.flatMap((block) => (headingLevel(block) === null ? [] : [block.text ?? ""]))
}

/**
 * La section d'un titre (sans casse ni accent, H54) ; inconnue ou portée par deux titres : refus (N10).
 * Exportée pour `move_block` vers une section (E11-S03, AC-c1), qui refuse comme `append`.
 */
export function locate(state: OpState, title: string, role: "section" | "after"): Located {
  const found = findSections(state.blocks, title)
  if (found.length === 0) {
    const titles = headingTitles(state.blocks)
    const sections = titles.length > 0 ? quotedList(titles) : "none"
    throw new OpProblem("invalid_arguments", `unknown section « ${title} »${role === "after" ? " for after" : ""}. Sections: ${sections}.`)
  }
  if (found.length > 1) {
    const refs = displayRefs(state.blocks)
    // Autant d'homonymes que de titres dans la page : la liste est bornée (`boundedList`, `mcp-patterns.md § 4`).
    const list = boundedList(found.map((section) => (section.heading ? refs.get(section.heading) : undefined) ?? "new"))
    throw new OpProblem(
      "invalid_arguments",
      `section « ${title} » is ambiguous: ${found.length} headings have this title (refs ${list}); use block operations with one of these refs.`,
    )
  }
  // `findSections` ne rend jamais le début de page (seul sans titre) : `heading` est posé.
  const heading = found[0].heading as WorkBlock
  const start = state.blocks.indexOf(heading)
  return { start, end: start + found[0].blocks.length, heading, level: headingLevel(heading) ?? 1, title: heading.text ?? "" }
}

/**
 * Refus `conflict` quand `blocks`, que l'opération réécrirait ou supprimerait, portent un bloc d'une
 * version plus récente (M67, D122) : `read` ne le sert que par une ligne de commentaire, que
 * `parseMarkdown` ignore ; la section réécrite le perdrait. Lu aussi par `replace_text` (`replace-text.ts`).
 */
export function keepNewerBlocks(blocks: readonly WorkBlock[], title: string): void {
  const newer = blocks.find(isUnknownBlock)
  if (!newer) return
  throw new OpProblem(
    "conflict",
    `section « ${title} » holds a ${newer.type} block newer than this platform version, which this operation would lose: update the platform to change it, or edit the other blocks one by one with block operations (read with refs: true).`,
  )
}

/** Un texte qui rouvre le titre de sa propre section (même niveau, même titre) le voit absorbé (N11). */
function absorbOwnHeading(parsed: Parsed, title: string, level: number): Parsed {
  const [first] = parsed.blocks
  if (first?.type !== "heading" || first.data.level !== level || normalizeTitle(first.text) !== normalizeTitle(title)) return parsed
  return { blocks: parsed.blocks.slice(1), lines: parsed.lines.slice(1) }
}

/**
 * Aucun titre du niveau de la section ou plus haut dans son texte (N9) : on ajoute une section par add_section. Lu aussi
 * par `replace_text` (`replace-text.ts`).
 */
export function checkHeadings(parsed: Parsed, text: string, level: number, title: string): void {
  const source = text.replace(/\r\n?/g, "\n").split("\n")
  parsed.blocks.forEach((block, index) => {
    if (block.type !== "heading" || block.data.level > level) return
    const line = parsed.lines[index]
    const deeper = level < DEEPEST_LEVEL ? `, or use ${"#".repeat(level + 2)} for a sub-section` : ""
    throw new OpProblem(
      "invalid_arguments",
      `line ${line} « ${source[line - 1]?.trim() ?? ""} » is a heading at the level of « ${title} » or above; add a new section with add_section${deeper}.`,
    )
  })
}

/**
 * Les blocs neufs d'un texte, chacun apparié dans l'ordre à un ancien bloc de même forme canonique
 * (même markdown), chaque ancien une fois au plus : un bloc apparié garde son id, sa clé, sa révision
 * et sa provenance ; tout autre bloc est neuf (N12). Lu aussi par `set_markdown` (E11-S18, `ops.ts`).
 */
export function matchByForm(state: OpState, old: readonly WorkBlock[], fresh: readonly BlockInput[]): WorkBlock[] {
  const consumed = new Set<WorkBlock>()
  return fresh.map((input) => {
    const candidate = newBlock(state, input)
    const same = old.find((block) => !consumed.has(block) && blockMarkdown(block) === blockMarkdown(candidate))
    if (!same) return candidate
    consumed.add(same)
    return same
  })
}

function outcome(op: WriteOpBody, blocks: WorkBlock[], written: WorkBlock[], text: string): OpOutcome {
  return { blocks, touched: { op: op.op, uids: written.map((block) => block.uid), describe: () => text } }
}

function replaceSection(state: OpState, op: WriteOpBody, text: string): OpOutcome {
  const at = locate(state, op.section ?? "", "section")
  const oldBody = state.blocks.slice(at.start + 1, at.end)
  keepNewerBlocks(oldBody, at.title)
  const parsed = absorbOwnHeading(parseOpText(text, state), at.title, at.level)
  checkHeadings(parsed, text, at.level, at.title)
  const body = matchByForm(state, oldBody, parsed.blocks)
  const blocks = [...state.blocks.slice(0, at.start + 1), ...body, ...state.blocks.slice(at.end)]
  const removed = headingTitles(oldBody.filter((block) => !body.includes(block)))
  const size = formatCount(blocksSize([at.heading, ...body]))
  const lost = removed.length > 0 ? `; removed ${plural(removed.length, "sub-section")} ${quotedList(removed)}` : ""
  const fresh = body.filter((block) => !oldBody.includes(block))
  return outcome(op, blocks, fresh, `replaced « ${at.title} » (${size} characters${lost})`)
}

/** Les éléments d'une liste ou d'une `checklist` ; `null` pour tout autre bloc. */
function listItems(block: { type: string; data?: Record<string, unknown> }): unknown[] | null {
  if (block.type !== "list" && block.type !== "checklist") return null
  const items = block.data?.items
  return Array.isArray(items) ? items : null
}

/**
 * La liste qu'`append` prolonge (E11-S03, AC-c4, AC-c5) : le bloc qui précède le point d'insertion et le
 * premier bloc du texte sont deux listes du même genre (puces, numéros, ou deux `checklist`) ; les éléments
 * neufs, sous-éléments compris, rejoignent les siens, `start` gardé (HN-E11S03-9). Au-delà de
 * `LIST_ITEMS_MAX` ensemble : pas de fusion, et `full` le dit (HN-E11S03-8).
 */
function continuedList(previous: WorkBlock | undefined, first: BlockInput | undefined): { list: WorkBlock; added: number } | "full" | null {
  if (!previous || !first || previous.type !== first.type) return null
  const old = listItems(previous)
  const fresh = listItems(first)
  if (!old || !fresh) return null
  if (previous.type === "list" && (previous.data.ordered === true) !== (first.data?.ordered === true)) return null
  const added = listItemTexts(fresh).length
  if (listItemTexts(old).length + added > LIST_ITEMS_MAX) return "full"
  return { list: { ...previous, data: { ...previous.data, items: [...old, ...fresh] } }, added }
}

function append(state: OpState, op: WriteOpBody, text: string): OpOutcome {
  const at = locate(state, op.section ?? "", "section")
  const parsed = parseOpText(text, state)
  checkHeadings(parsed, text, at.level, at.title)
  const continued = continuedList(state.blocks[at.end - 1], parsed.blocks[0])
  const merged = continued === "full" ? null : continued
  const fresh = parsed.blocks.slice(merged ? 1 : 0).map((input) => newBlock(state, input))
  // La liste prolongée garde sa place, son id et sa clé ; sa révision de bloc et sa provenance suivent à l'écriture.
  const written = merged ? [merged.list, ...fresh] : fresh
  const from = merged ? at.end - 1 : at.end
  const blocks = [...state.blocks.slice(0, from), ...written, ...state.blocks.slice(at.end)]
  const size = blocksSize(blocks.slice(at.start, from + written.length))
  const added = merged ? size - blocksSize(state.blocks.slice(at.start, at.end)) : blocksSize(fresh)
  const list = merged
    ? `; the list continues with ${formatCount(merged.added)} more ${plural(merged.added, "item")}`
    : continued === "full"
      ? `; a new list starts: a list holds ${formatCount(LIST_ITEMS_MAX)} items at most`
      : ""
  return outcome(op, blocks, written, `appended to « ${at.title} » (+${formatCount(added)} → ${formatCount(size)} characters${list})`)
}

function addSection(state: OpState, op: WriteOpBody, text: string): OpOutcome {
  const title = op.section ?? ""
  if (/[\r\n]/.test(title) || charCount(title) > HEADING_TEXT_MAX) {
    throw new OpProblem("invalid_arguments", `a section title holds on one line, ${formatCount(HEADING_TEXT_MAX)} characters at most.`)
  }
  if (findSections(state.blocks, title).length > 0) {
    throw new OpProblem("invalid_arguments", `section « ${title} » already exists; use replace_section or append.`)
  }
  const anchor = op.after === undefined ? null : locate(state, op.after, "after")
  const level = anchor?.level ?? 1
  const parsed = absorbOwnHeading(parseOpText(text, state), title, level)
  checkHeadings(parsed, text, level, title)
  const fresh = [newBlock(state, { type: "heading", text: title, data: { level } }), ...parsed.blocks.map((input) => newBlock(state, input))]
  const at = anchor ? anchor.end : state.blocks.length
  const blocks = [...state.blocks.slice(0, at), ...fresh, ...state.blocks.slice(at)]
  return outcome(op, blocks, fresh, `added « ${title} » (${formatCount(blocksSize(fresh))} characters)`)
}

function deleteSection(state: OpState, op: WriteOpBody): OpOutcome {
  const at = locate(state, op.section ?? "", "section")
  const body = state.blocks.slice(at.start + 1, at.end)
  keepNewerBlocks(body, at.title)
  const subs = headingTitles(body)
  const blocks = [...state.blocks.slice(0, at.start), ...state.blocks.slice(at.end)]
  const also = subs.length > 0 ? ` and its ${plural(subs.length, "sub-section")} ${quotedList(subs)}` : ""
  return outcome(op, blocks, [], `deleted « ${at.title} »${also}`)
}

/**
 * Une opération par section, sur le document en mémoire (champs déjà contrôlés par `applyOps`) ; `replace_text`, qui
 * vise aussi un bloc ou toute la page, est dans `replace-text.ts` (E11-S18).
 */
export function applySectionOp(state: OpState, op: WriteOpBody): OpOutcome {
  const text = op.text ?? ""
  switch (op.op) {
    case "replace_section":
      return replaceSection(state, op, text)
    case "append":
      return append(state, op, text)
    case "add_section":
      return addSection(state, op, text)
    default:
      return deleteSection(state, op)
  }
}
