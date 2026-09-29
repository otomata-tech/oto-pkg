// Les listes du markdown d'une opération de `write` (E03-S03, N44 ; E10-S04, AC-b1 : trois niveaux) et leur mode
// tolérant (E10-S01, AC-a2) : un élément et sa sous-liste, une `checklist`, la borne de 500 éléments. Séparées de
// `markdown-parse.ts`, qui les appelle, pour la borne de 300 lignes d'ESLint ; la clôture indentée qui suit une
// liste reste lue par `markdown-parse.ts`.
//
// Chaque ligne est lue trois fois au plus (un niveau par lecture) ; au-delà du troisième niveau, le mode tolérant
// lit le reste d'un élément en une passe (`flatItems`), jamais un niveau de plus : un texte hostile de lignes
// toujours plus indentées reste linéaire (`security-patterns.md § Validation des inputs`).
import { LIST_DEPTH_MAX, LIST_ITEMS_MAX, listItemTexts, type BlockInput, type ListItem } from "../../schemas/blocks"
import { openingFence } from "../../schemas/link-syntax"
import { formatCount } from "./document"
import { refuse, type ParseMode } from "./markdown-rich"

export const isBlank = (line: string) => /^\s*$/.test(line)

/** Une ligne faite d'un seul commentaire `<!-- … -->` : références et lignes résolues, ignorées (N8). */
export const isComment = (line: string) => /^\s*<!--(?:(?!-->)[\s\S])*-->\s*$/.test(line)

export const indentOf = (line: string) => /^ */.exec(line)?.[0].length ?? 0

/** `width` : la largeur de la marque (`-` 1, `12.` 3) ; sa sous-liste s'indente de cette largeur et d'un espace. */
export type Marker = { ordered: boolean; number: number; rest: string; width: number }

/** Une marque d'élément en début de ligne : `- `, `* `, `+ `, `N. ` ou `N) `. */
export function markerOf(line: string): Marker | null {
  const bullet = /^[-*+][ \t](.*)$/.exec(line)
  if (bullet) return { ordered: false, number: 1, rest: bullet[1], width: 1 }
  const ordered = /^(\d{1,9})[.)][ \t](.*)$/.exec(line)
  return ordered ? { ordered: true, number: Number(ordered[1]), rest: ordered[2], width: ordered[1].length + 1 } : null
}

/** Une ligne indentée qui ouvre une clôture sous un élément : elle coupe la liste (N44). */
export const indentedFence = (line: string) => indentOf(line) >= 2 && openingFence(line, Number.MAX_SAFE_INTEGER) !== null

/** Une ligne indentée d'au moins deux espaces continue l'élément (sauf une clôture). */
const continues = (line: string) => indentOf(line) >= 2 && !indentedFence(line)

function nextNonBlank(lines: string[], from: number): number {
  let at = from
  while (at < lines.length && isBlank(lines[at])) at++
  return at
}

/** Une ligne d'un élément, sans les deux espaces qui la rattachent à lui, et son numéro dans le texte. */
type Line = { text: string; number: number }

/** L'élément qui commence par `first` ; `ended` : la liste s'arrête après lui. */
function readItem(lines: string[], from: number, first: Line): { lines: Line[]; next: number; ended: boolean } {
  const item = [first]
  let at = from
  while (at < lines.length) {
    const line = lines[at]
    if (isComment(line)) {
      at++
    } else if (isBlank(line)) {
      const next = nextNonBlank(lines, at)
      if (next >= lines.length || !continues(lines[next])) return { lines: item, next: at, ended: true }
      for (; at < next; at++) item.push({ text: "", number: at + 1 })
    } else if (continues(line)) {
      item.push({ text: line.slice(2), number: at + 1 })
      at++
    } else {
      return { lines: item, next: at, ended: indentedFence(line) }
    }
  }
  return { lines: item, next: at, ended: true }
}

/** Un élément lu, sur autant de niveaux que le texte en porte : `nestedItem` en refuse un quatrième. */
type ParsedItem = string | { text: string; children: ParsedList }

type ParsedList = { items: ParsedItem[]; ordered?: boolean; start?: number }

const joined = (lines: readonly Line[]) => lines.map((line) => line.text).join("\n")

/**
 * Les éléments d'un reste de liste au-delà du troisième niveau, en mode tolérant (E10-S01, AC-a2) : chaque ligne
 * qui porte une marque, à toute indentation, ouvre un élément du troisième niveau ; les autres continuent le
 * précédent. Une seule passe.
 */
function flatItems(lines: readonly Line[]): string[] {
  const items: string[][] = []
  for (const line of lines) {
    const text = line.text.slice(indentOf(line.text))
    const marker = markerOf(text)
    if (marker || items.length === 0) items.push([marker ? marker.rest : text])
    else items[items.length - 1].push(text)
  }
  for (const item of items) while (item.length > 1 && item[item.length - 1] === "") item.pop()
  return items.map((item) => item.join("\n"))
}

/**
 * Un élément de liste (E10-S04, AC-b1) : son texte, jusqu'à la première ligne qui porte une marque (indentée
 * de 0 à 3 espaces, ou de la largeur de la marque de l'élément moins un, sa forme canonique), qui ouvre sa
 * sous-liste ; l'indentation de cette ligne est retirée de chaque ligne de la sous-liste. Au troisième niveau, une
 * sous-liste est refusée, ou ramenée au troisième niveau en mode tolérant (E10-S01, AC-a2).
 */
function nestedItem(lines: readonly Line[], level: number, width: number, mode: ParseMode): ParsedItem[] {
  const reach = Math.max(3, width - 1)
  const open = lines.findIndex((line, index) => index > 0 && indentOf(line.text) <= reach && markerOf(line.text.slice(indentOf(line.text))) !== null)
  if (open === -1) return [joined(lines)]
  if (level === LIST_DEPTH_MAX && !mode.tolerant) refuse(`line ${lines[open].number}: lists go three levels deep at most.`)
  let end = open
  while (end > 1 && lines[end - 1].text === "") end--
  if (level === LIST_DEPTH_MAX) return [joined(lines.slice(0, end)), ...flatItems(lines.slice(open))]
  const strip = new RegExp(`^ {0,${indentOf(lines[open].text)}}`)
  const sub = lines.slice(open).map((line) => ({ text: line.text.replace(strip, ""), number: line.number }))
  return [{ text: joined(lines.slice(0, end)), children: subList(sub, level + 1, mode) }]
}

/** Les lignes suivantes d'un sous-élément : indentées de deux espaces, ou blanches avant une telle ligne. */
function subItemLines(lines: readonly Line[], from: number, first: Line): { lines: Line[]; next: number } {
  const item = [first]
  let at = from
  while (at < lines.length) {
    let next = at
    while (next < lines.length && isBlank(lines[next].text)) next++
    if (next >= lines.length || indentOf(lines[next].text) < 2) break
    for (; at < next; at++) item.push({ text: "", number: lines[at].number })
    item.push({ text: lines[at].text.slice(2), number: lines[at].number })
    at++
  }
  return { lines: item, next: at }
}

/**
 * Une sous-liste : chaque ligne y appartient à un élément ; puces et numéros ne s'y mêlent pas. Tolérant (E10-S01) :
 * une ligne sans marque devient un élément, un mélange garde la forme du premier élément.
 */
function subList(lines: readonly Line[], level: number, mode: ParseMode): ParsedList {
  const items: ParsedItem[] = []
  let first: Marker | null = null
  for (let at = 0; at < lines.length; ) {
    if (isBlank(lines[at].text)) {
      at++
      continue
    }
    const marker = markerOf(lines[at].text)
    if (!marker && !mode.tolerant) refuse(`line ${lines[at].number}: text after a sub-list belongs to no item; indent it under an item.`)
    if (!marker) {
      items.push(lines[at++].text)
      continue
    }
    first ??= marker
    if (marker.ordered !== first.ordered && !mode.tolerant) refuse(`line ${lines[at].number}: a sub-list mixes bullets and numbers.`)
    const item = subItemLines(lines, at + 1, { text: marker.rest, number: lines[at].number })
    items.push(...nestedItem(item.lines, level, marker.width, mode))
    at = item.next
  }
  if (!first?.ordered) return { items }
  return first.number > 1 ? { items, ordered: true, start: first.number } : { items, ordered: true }
}

/** Une liste, ou une `checklist` quand chaque élément à puces porte `[ ]`, `[x]` ou `[X]` (sans sous-liste, HN-E10S04-2). */
function listBlock(items: readonly { lines: Line[]; width: number }[], first: Marker, mode: ParseMode): BlockInput {
  const texts = items.map((item) => joined(item.lines))
  const boxes = texts.map((text) => /^\[([ xX])\](?: |$)/.exec(text))
  if (!first.ordered && boxes.every((box) => box !== null)) {
    return {
      type: "checklist",
      text: null,
      data: { items: texts.map((text, index) => ({ text: text.slice(boxes[index]?.[0].length ?? 0), checked: boxes[index]?.[1] !== " " })) },
    }
  }
  // Trois niveaux au plus (`nestedItem`) : la forme de `ListItem`, que `parseMarkdown` revalide par `blockInputSchema`.
  const nested = items.flatMap((item) => nestedItem(item.lines, 1, item.width, mode)) as ListItem[]
  if (!first.ordered) return { type: "list", text: null, data: { items: nested } }
  return { type: "list", text: null, data: first.number > 1 ? { items: nested, ordered: true, start: first.number } : { items: nested, ordered: true } }
}

/** Les éléments en groupes de 500 au plus, comptés par `size` (sous-éléments compris). */
function groups<T>(items: readonly T[], size: (item: T) => number): T[][] {
  const grouped: T[][] = []
  let total = LIST_ITEMS_MAX
  for (const item of items) {
    const count = size(item)
    if (total + count > LIST_ITEMS_MAX) {
      grouped.push([])
      total = 0
    }
    grouped[grouped.length - 1].push(item)
    total += count
  }
  return grouped
}

/**
 * Une liste de plus de 500 éléments en mode tolérant (E10-S01, AC-a2) : plusieurs listes de 500 au plus, à la
 * suite ; une liste numérotée continue ses numéros d'une liste à l'autre.
 */
function splitList(block: BlockInput): BlockInput[] {
  if (block.type === "checklist") return groups(block.data.items, () => 1).map((items) => ({ ...block, data: { ...block.data, items } }))
  if (block.type !== "list") return [block]
  let start = block.data.start ?? 1
  return groups(block.data.items, (item) => listItemTexts([item]).length).map((items) => {
    const at = start
    start += items.length
    if (!block.data.ordered) return { type: "list", text: null, data: { items } }
    return { type: "list", text: null, data: at > 1 ? { items, ordered: true, start: at } : { items, ordered: true } }
  })
}

/** Une liste qui commence à la ligne `start` : ses blocs, et la ligne qui la suit. */
export function parseList(lines: string[], start: number, first: Marker, mode: ParseMode): { blocks: BlockInput[]; next: number } {
  const items: { lines: Line[]; width: number }[] = []
  let at = start
  let ended = false
  while (!ended && at < lines.length) {
    const marker = markerOf(lines[at])
    if (!marker || marker.ordered !== first.ordered) break
    const item = readItem(lines, at + 1, { text: marker.rest, number: at + 1 })
    items.push({ lines: item.lines, width: marker.width })
    at = item.next
    ended = item.ended
  }
  const block = listBlock(items, first, mode)
  const count = block.type === "list" || block.type === "checklist" ? listItemTexts(block.data.items).length : 0
  if (count <= LIST_ITEMS_MAX) return { blocks: [block], next: at }
  if (!mode.tolerant) refuse(`line ${start + 1}: a list holds ${formatCount(LIST_ITEMS_MAX)} items at most, sub-items included (${formatCount(count)}).`)
  return { blocks: splitList(block), next: at }
}
