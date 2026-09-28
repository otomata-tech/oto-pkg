// Les cinq opérations par section de `write` (E03-S01, H54 amendée ; ADR-011 § 5), appliquées aux
// plages de blocs de `splitSections` (M05) : une section est un titre et les blocs qui le suivent
// jusqu'au prochain titre de niveau inférieur ou égal, sous-sections comprises (N9). Fonctions pures,
// sur le document en mémoire : rien n'est écrit tant que toutes les opérations ne sont pas passées.
//
// Repris de la maquette (`mcp-test/src/proto/services/sections.ts` l. 1-84) : les cinq opérations, le
// premier échec qui refuse tout, les titres cités par un refus. Retiré : les sections en objets
// `{title, body}` (→ plages de blocs). Repris d'Oto (`oto_mcp/doc_patch.py` l. 59-73, 132-146,
// 181-198 ; `db/blocks.py` l. 299-330) : section ambiguë refusée en nommant les candidats, titre propre
// absorbé, sous-sections emportées et annoncées, id gardé par la forme exacte, dans l'ordre, chaque
// ancien une fois. Retiré : `region=` et `prepend` (→ opérations par bloc), le markdown comme source.
import { findSections, normalizeTitle, type BlockInput, type WriteOpBody } from "../../schemas"
import { isUnknownBlock } from "../../schemas/blocks-render"
import { boundedList } from "../errors"
import { cut } from "../journal"
import { blockMarkdown, blocksSize, charCount, displayRefs, formatCount, headingLevel } from "./document"
import { HEADING_TEXT_MAX } from "./limits"
import { newBlock, OpProblem, parseOpText, plural, quotedList, type OpOutcome, type OpState, type WorkBlock } from "./op-kit"

type Parsed = { blocks: BlockInput[]; lines: number[] }

type Located = { start: number; end: number; heading: WorkBlock; level: 1 | 2 | 3; title: string }

function headingTitles(blocks: readonly WorkBlock[]): string[] {
  return blocks.flatMap((block) => (headingLevel(block) === null ? [] : [block.text ?? ""]))
}

/** La section d'un titre (sans casse ni accent, H54) ; inconnue ou portée par deux titres : refus (N10). */
function locate(state: OpState, title: string, role: "section" | "after"): Located {
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
 * `parseMarkdown` ignore ; la section réécrite le perdrait.
 */
function keepNewerBlocks(blocks: readonly WorkBlock[], title: string): void {
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

/** Aucun titre du niveau de la section ou plus haut dans son texte (N9) : on ajoute une section par add_section. */
function checkHeadings(parsed: Parsed, text: string, level: number, title: string): void {
  const source = text.replace(/\r\n?/g, "\n").split("\n")
  parsed.blocks.forEach((block, index) => {
    if (block.type !== "heading" || block.data.level > level) return
    const line = parsed.lines[index]
    const deeper = level < 3 ? `, or use ${"#".repeat(level + 2)} for a sub-section` : ""
    throw new OpProblem(
      "invalid_arguments",
      `line ${line} « ${source[line - 1]?.trim() ?? ""} » is a heading at the level of « ${title} » or above; add a new section with add_section${deeper}.`,
    )
  })
}

/**
 * Les blocs neufs d'un texte, chacun apparié dans l'ordre à un ancien bloc de même forme canonique
 * (même markdown), chaque ancien une fois au plus : un bloc apparié garde son id, sa clé, sa révision
 * et sa provenance ; tout autre bloc est neuf (N12).
 */
function matchByForm(state: OpState, old: readonly WorkBlock[], fresh: readonly BlockInput[]): WorkBlock[] {
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
  const parsed = absorbOwnHeading(parseOpText(text), at.title, at.level)
  checkHeadings(parsed, text, at.level, at.title)
  const body = matchByForm(state, oldBody, parsed.blocks)
  const blocks = [...state.blocks.slice(0, at.start + 1), ...body, ...state.blocks.slice(at.end)]
  const removed = headingTitles(oldBody.filter((block) => !body.includes(block)))
  const size = formatCount(blocksSize([at.heading, ...body]))
  const lost = removed.length > 0 ? `; removed ${plural(removed.length, "sub-section")} ${quotedList(removed)}` : ""
  const fresh = body.filter((block) => !oldBody.includes(block))
  return outcome(op, blocks, fresh, `replaced « ${at.title} » (${size} characters${lost})`)
}

function append(state: OpState, op: WriteOpBody, text: string): OpOutcome {
  const at = locate(state, op.section ?? "", "section")
  const parsed = parseOpText(text)
  checkHeadings(parsed, text, at.level, at.title)
  const fresh = parsed.blocks.map((input) => newBlock(state, input))
  const blocks = [...state.blocks.slice(0, at.end), ...fresh, ...state.blocks.slice(at.end)]
  const size = blocksSize(blocks.slice(at.start, at.end + fresh.length))
  return outcome(op, blocks, fresh, `appended to « ${at.title} » (+${formatCount(blocksSize(fresh))} → ${formatCount(size)} characters)`)
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
  const parsed = absorbOwnHeading(parseOpText(text), title, level)
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

/** Le markdown de la section, et l'étendue (indices de chaîne) du rendu de chacun de ses blocs. */
function spansOf(section: readonly WorkBlock[]): { markdown: string; spans: { block: WorkBlock; start: number; end: number }[] } {
  const spans: { block: WorkBlock; start: number; end: number }[] = []
  let markdown = ""
  for (const block of section) {
    const rendered = blockMarkdown(block)
    if (rendered === "") continue
    if (markdown !== "") markdown += "\n\n"
    spans.push({ block, start: markdown.length, end: markdown.length + rendered.length })
    markdown += rendered
  }
  return { markdown, spans }
}

/** Le bloc dont le rendu contient l'occurrence : ses blocs après remplacement (un seul garde l'id, N12). */
function editInBlock(state: OpState, at: Located, span: { block: WorkBlock; start: number }, edit: { index: number; find: string; text: string }): WorkBlock[] {
  const rendered = blockMarkdown(span.block)
  const offset = edit.index - span.start
  const markdown = rendered.slice(0, offset) + edit.text + rendered.slice(offset + edit.find.length)
  const parsed = parseOpText(markdown)
  if (span.block === at.heading) {
    const [first] = parsed.blocks
    if (parsed.blocks.length !== 1 || first.type !== "heading" || first.data.level !== at.level) {
      throw new OpProblem("invalid_arguments", `the title of « ${at.title} » must stay a heading of its level; use replace_block to change it.`)
    }
  } else {
    checkHeadings(parsed, markdown, at.level, at.title)
  }
  if (parsed.blocks.length !== 1) return parsed.blocks.map((input) => newBlock(state, input))
  const [only] = parsed.blocks
  return [{ ...span.block, type: only.type, text: only.text ?? null, data: { ...(only.data ?? {}) } }]
}

function replaceText(state: OpState, op: WriteOpBody, text: string): OpOutcome {
  const at = locate(state, op.section ?? "", "section")
  const find = op.find ?? ""
  const section = state.blocks.slice(at.start, at.end)
  const { markdown, spans } = spansOf(section)
  const count = markdown.split(find).length - 1
  if (count !== 1) {
    throw new OpProblem("invalid_arguments", `« ${cut(find, 100)} » appears ${count} times in « ${at.title} »; quote words that appear exactly once.`)
  }
  const index = markdown.indexOf(find)
  const span = spans.find((candidate) => candidate.start <= index && index + find.length <= candidate.end)
  let replaced: WorkBlock[]
  let edited: WorkBlock[]
  // Un remplacement dans un bloc ne réécrit que lui ; à cheval sur plusieurs blocs, tout le corps (M67).
  keepNewerBlocks(span ? [span.block] : section.slice(1), at.title)
  if (span) {
    edited = editInBlock(state, at, span, { index, find, text })
    replaced = section.flatMap((block) => (block === span.block ? edited : [block]))
  } else {
    const bodyStart = (spans[1]?.start ?? markdown.length) - 2
    if (index < bodyStart + 2) throw new OpProblem("invalid_arguments", `« find » spans the title of « ${at.title} »; use replace_section.`)
    const body = markdown.slice(bodyStart + 2)
    const offset = index - bodyStart - 2
    const newBody = body.slice(0, offset) + text + body.slice(offset + find.length)
    const parsed = parseOpText(newBody)
    checkHeadings(parsed, newBody, at.level, at.title)
    const oldBody = section.slice(1)
    const matched = matchByForm(state, oldBody, parsed.blocks)
    edited = matched.filter((block) => !oldBody.includes(block))
    replaced = [at.heading, ...matched]
  }
  const blocks = [...state.blocks.slice(0, at.start), ...replaced, ...state.blocks.slice(at.end)]
  const title = replaced[0]?.text ?? at.title
  return outcome(op, blocks, edited, `edited « ${title} » (${formatCount(blocksSize(replaced))} characters)`)
}

/** Une opération par section, sur le document en mémoire (champs déjà contrôlés par `applyOps`). */
export function applySectionOp(state: OpState, op: WriteOpBody): OpOutcome {
  const text = op.text ?? ""
  switch (op.op) {
    case "replace_section":
      return replaceSection(state, op, text)
    case "append":
      return append(state, op, text)
    case "add_section":
      return addSection(state, op, text)
    case "delete_section":
      return deleteSection(state, op)
    default:
      return replaceText(state, op, text)
  }
}
