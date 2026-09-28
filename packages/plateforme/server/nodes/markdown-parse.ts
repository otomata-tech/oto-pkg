// Analyse du markdown d'une opération de `write` en blocs typés (E03-S03, N7, N8, N44) : l'inverse
// exact du rendu commun de M05 (`renderBlocks`), sur le tableau « Formes canoniques » de la story, qui
// fait foi. Propriété testée : pour tout bloc `b` que cette analyse peut produire,
// `parseMarkdown(renderBlocks([b]))` redonne `b`. Sans lui, aucun texte envoyé par le modèle ne devient
// bloc.
//
// Repris d'Oto (`oto_mcp/db/blocks.py` l. 13-27, 71-117) : une propriété d'aller-retour vérifiable en
// une ligne ; une clôture de code isolée en bloc, son info = la langue ; la fermeture sur le même
// caractère, au moins aussi longue. Retiré : le markdown comme source (ici les blocs typés font foi), la
// clôture jamais fermée qui court jusqu'à la fin (ici refusée), le titre qui reste du texte (ici
// `heading`), le rejeu au démarrage.
//
// Tout ce qui lit le texte est linéaire (`security-patterns.md § Validation des inputs`) : expressions
// ancrées dont chaque caractère n'a qu'une lecture, sinon un parcours à la main (titre, image, clôture).
import { blockInputSchema, NODE_PATH_PATTERN, type BlockInput } from "../../schemas"
import { cut } from "../journal"
import { charCount, formatCount } from "./document"
import { FUNCTION_NAME_MAX, HEADING_TEXT_MAX, IMAGE_SRC_MAX, LIST_ITEMS_MAX, REFERENCE_PATH_MAX } from "./limits"

/** Un refus de l'analyse : son texte est servi au modèle (AC3), sans le préfixe de l'opération. */
class ParseProblem extends Error {}

function refuse(message: string): never {
  throw new ParseProblem(message)
}

type Parsed = { block: BlockInput; line: number }

type Fence = { indent: number; marker: string; length: number; info: string }

/** `##`, `###`, `####` : les niveaux 1 à 3 d'un bloc `heading` (headingBase 2). */
const HEADING_LEVELS = [1, 2, 3] as const
const QUOTE_MAX = 100

/**
 * Les deux fins de ligne que `.` ne lit pas, hors `\n` et `\r` déjà coupés : une ligne qui en porte
 * n'est ni un titre, ni une image, ni une clôture ouvrante (N52, N70).
 */
const LINE_SEPARATORS = /[\u2028\u2029]/

/** Une ligne citée dans un refus : sans espaces de bord, coupée à 100 caractères (`cut`, jamais dans un emoji). */
function quoted(text: string): string {
  return cut(text.trim(), QUOTE_MAX)
}

/** Le texte sans espaces ni tabulations de bord, par boucle (` +$` repartirait de chaque espace). */
function trimBlanks(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && (text[start] === " " || text[start] === "\t")) start++
  while (end > start && (text[end - 1] === " " || text[end - 1] === "\t")) end--
  return text.slice(start, end)
}

const isBlank = (line: string) => /^\s*$/.test(line)

/** Une ligne faite d'un seul commentaire `<!-- … -->` : références et lignes résolues, ignorées (N8). */
const isComment = (line: string) => /^\s*<!--(?:(?!-->)[\s\S])*-->\s*$/.test(line)

const indentOf = (line: string) => /^ */.exec(line)?.[0].length ?? 0

/** Une clôture ouvrante d'accents graves ou de tildes, indentée de `maxIndent` espaces au plus. */
function openingFence(line: string, maxIndent: number): Fence | null {
  const match = /^( *)(`{3,}|~{3,})/.exec(line)
  if (!match || match[1].length > maxIndent) return null
  const info = line.slice(match[0].length)
  if (LINE_SEPARATORS.test(info)) return null
  // CommonMark : l'info d'une clôture d'accents graves n'en contient aucun (sinon, du code en ligne).
  if (match[2][0] === "`" && info.includes("`")) return null
  return { indent: match[1].length, marker: match[2][0], length: match[2].length, info: info.trim() }
}

function closes(line: string, fence: Fence): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
  return match !== null && match[1][0] === fence.marker && match[1].length >= fence.length
}

/** Un objet JSON (jamais un tableau ni `null`), ou `null`. */
function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text)
    // Un objet non tableau rendu par `JSON.parse` : ses clés sont des chaînes, TypeScript ne le déduit pas.
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    // Pas du JSON : l'appelant le refuse en citant le texte.
    return null
  }
}

/** Nom de fonction puis objet JSON facultatif, sur une ou plusieurs lignes (nom seul = `{}`, N44). */
function callBlock(content: string, line: number): BlockInput {
  const body = content.trim()
  const match = /^(\S+)\s*([\s\S]*)$/.exec(body)
  if (!match) refuse(`line ${line}: a call block holds <function> {"argument": …}; this one is empty.`)
  const [, name, rest] = match
  if (charCount(name) > FUNCTION_NAME_MAX) {
    refuse(`line ${line}: a call block names a function of ${formatCount(FUNCTION_NAME_MAX)} characters at most (${formatCount(charCount(name))}).`)
  }
  const args = rest.trim() === "" ? {} : jsonObject(rest)
  if (!args) refuse(`line ${line}: a call block holds <function> {"argument": …}; « ${quoted(body)} » is not followed by a JSON object.`)
  return { type: "call", text: null, data: { function: name, args } }
}

/** Un chemin (H51), puis une vue JSON facultative, contrôlée comme un objet seulement (N42). */
function referenceBlock(content: string, line: number): BlockInput {
  const body = content.trim()
  const [, path = "", rest = ""] = /^(\S*)\s*([\s\S]*)$/.exec(body) ?? []
  const shape = `line ${line}: a reference block holds a path such as ventes/relance_devis, then an optional JSON view;`
  if (charCount(path) > REFERENCE_PATH_MAX || !NODE_PATH_PATTERN.test(path)) refuse(`${shape} « ${quoted(path)} » is not a path.`)
  if (rest.trim() === "") return { type: "reference", text: null, data: { path } }
  const view = jsonObject(rest)
  if (!view) refuse(`${shape} « ${quoted(rest)} » is not a JSON object.`)
  return { type: "reference", text: null, data: { path, view } }
}

function fenceBlock(fence: Fence, content: string, line: number): BlockInput {
  const word = fence.info.split(/\s+/)[0] ?? ""
  if (word === "call") return callBlock(content, line)
  if (word === "reference") return referenceBlock(content, line)
  if (word === "mermaid") {
    if (isBlank(content)) refuse(`line ${line}: a mermaid block holds a diagram; this one is empty.`)
    return { type: "mermaid", text: content, data: {} }
  }
  return { type: "code", text: content, data: word ? { language: word } : {} }
}

/** Le bloc d'une clôture ouverte à la ligne `start` ; `fence.indent` espaces retirés de chaque ligne (N44). */
function parseFence(lines: string[], start: number, fence: Fence, out: Parsed[]): number {
  const content: string[] = []
  let at = start + 1
  const strip = new RegExp(`^ {0,${fence.indent}}`)
  while (at < lines.length && !closes(lines[at].replace(strip, ""), fence)) {
    content.push(lines[at].replace(strip, ""))
    at++
  }
  if (at >= lines.length) refuse(`a code fence opened on line ${start + 1} (${quoted(lines[start])}) is never closed.`)
  out.push({ block: fenceBlock(fence, content.join("\n"), start + 1), line: start + 1 })
  return at + 1
}

/**
 * Un titre `##` à `####` (niveaux 1 à 3) ; `#` et `#####` refusés ; `null` : pas un titre. Le texte suit
 * les espaces et tabulations qui suivent les `#`, sans ceux de fin.
 */
function headingAt(line: string, number: number): BlockInput | null {
  const match = /^ {0,3}(#+)[ \t]/.exec(line)
  if (!match) return null
  const rest = line.slice(match[0].length)
  const text = trimBlanks(rest)
  if (text === "" || LINE_SEPARATORS.test(rest)) return null
  const hashes = match[1].length
  if (hashes === 1) refuse(`line ${number} « ${quoted(line)} » is the level of the page title; headings start at ##.`)
  if (hashes > 4) refuse(`line ${number} « ${quoted(line)} »: headings go down to #### (three levels).`)
  if (charCount(text) > HEADING_TEXT_MAX) {
    refuse(`line ${number}: a heading holds ${formatCount(HEADING_TEXT_MAX)} characters at most (${formatCount(charCount(text))}).`)
  }
  return { type: "heading", text, data: { level: HEADING_LEVELS[hashes - 2] } }
}

/**
 * `![alt](src)` ou `![alt](src "légende")` sur une ligne sans espaces de bord : le `](` le plus à
 * gauche après lequel la suite a cette forme, `src` sans blanc et non vide, `alt` et légende sans
 * séparateur de ligne. Un parcours à la main, en temps linéaire : la position du premier blanc est
 * connue pour chaque `](` (N70).
 */
function imageParts(line: string): { alt: string; src: string; caption: string | null } | null {
  if (!line.startsWith("![") || !line.endsWith(")")) return null
  const size = line.length
  const blankFrom = new Array<number>(size + 1).fill(size)
  for (let at = size - 1; at >= 0; at--) blankFrom[at] = /\s/.test(line[at]) ? at : blankFrom[at + 1]
  const firstSeparator = line.search(LINE_SEPARATORS)
  const lastSeparator = Math.max(line.lastIndexOf("\u2028"), line.lastIndexOf("\u2029"))
  for (let bracket = line.indexOf("](", 2); bracket !== -1; bracket = line.indexOf("](", bracket + 1)) {
    if (firstSeparator !== -1 && firstSeparator < bracket) return null
    const start = bracket + 2
    const blank = blankFrom[start]
    if (blank === size && size - 1 > start) return { alt: line.slice(2, bracket), src: line.slice(start, size - 1), caption: null }
    const captioned = blank > start && blank < size && line[blank] === " " && line[blank + 1] === '"' && line.endsWith('")') && blank + 2 <= size - 2
    if (captioned && lastSeparator < blank + 2) return { alt: line.slice(2, bracket), src: line.slice(start, blank), caption: line.slice(blank + 2, size - 2) }
  }
  return null
}

/** Une image seule sur sa ligne : `![alt](src)` ou `![alt](src "légende")`. */
function imageAt(line: string, number: number): BlockInput | null {
  const image = imageParts(line.trim())
  if (!image) return null
  const { alt, src, caption } = image
  if (charCount(src) > IMAGE_SRC_MAX) {
    refuse(`line ${number}: an image source holds ${formatCount(IMAGE_SRC_MAX)} characters at most (${formatCount(charCount(src))}).`)
  }
  return { type: "image", text: caption, data: { src, alt } }
}

type Marker = { ordered: boolean; number: number; rest: string }

/** Une marque d'élément en début de ligne : `- `, `* `, `+ `, `N. ` ou `N) `. */
function markerOf(line: string): Marker | null {
  const bullet = /^[-*+][ \t](.*)$/.exec(line)
  if (bullet) return { ordered: false, number: 1, rest: bullet[1] }
  const ordered = /^(\d{1,9})[.)][ \t](.*)$/.exec(line)
  return ordered ? { ordered: true, number: Number(ordered[1]), rest: ordered[2] } : null
}

/** Une ligne indentée qui ouvre une clôture sous un élément : elle coupe la liste (N44). */
const indentedFence = (line: string) => indentOf(line) >= 2 && openingFence(line, Number.MAX_SAFE_INTEGER) !== null

/** Une ligne indentée d'au moins deux espaces continue l'élément (sauf une clôture). */
const continues = (line: string) => indentOf(line) >= 2 && !indentedFence(line)

function nextNonBlank(lines: string[], from: number): number {
  let at = from
  while (at < lines.length && isBlank(lines[at])) at++
  return at
}

/** L'élément qui commence par `first` ; `ended` : la liste s'arrête après lui. */
function readItem(lines: string[], from: number, first: string): { text: string; next: number; ended: boolean } {
  const text = [first]
  let at = from
  while (at < lines.length) {
    const line = lines[at]
    if (isComment(line)) {
      at++
    } else if (isBlank(line)) {
      const next = nextNonBlank(lines, at)
      if (next >= lines.length || !continues(lines[next])) return { text: text.join("\n"), next: at, ended: true }
      text.push(...lines.slice(at, next).map(() => ""))
      at = next
    } else if (continues(line)) {
      text.push(line.slice(2))
      at++
    } else {
      return { text: text.join("\n"), next: at, ended: indentedFence(line) }
    }
  }
  return { text: text.join("\n"), next: at, ended: true }
}

/** Une liste, ou une `checklist` quand chaque élément à puces porte `[ ]`, `[x]` ou `[X]`. */
function listBlock(items: string[], first: Marker): BlockInput {
  const boxes = items.map((item) => /^\[([ xX])\](?: |$)/.exec(item))
  if (!first.ordered && boxes.every((box) => box !== null)) {
    return {
      type: "checklist",
      text: null,
      data: { items: items.map((item, index) => ({ text: item.slice(boxes[index]?.[0].length ?? 0), checked: boxes[index]?.[1] !== " " })) },
    }
  }
  if (!first.ordered) return { type: "list", text: null, data: { items } }
  return { type: "list", text: null, data: first.number > 1 ? { items, ordered: true, start: first.number } : { items, ordered: true } }
}

function parseList(lines: string[], start: number, first: Marker, out: Parsed[]): number {
  const items: string[] = []
  let at = start
  let ended = false
  while (!ended && at < lines.length) {
    const marker = markerOf(lines[at])
    if (!marker || marker.ordered !== first.ordered) break
    const item = readItem(lines, at + 1, marker.rest)
    items.push(item.text)
    at = item.next
    ended = item.ended
  }
  if (items.length > LIST_ITEMS_MAX) refuse(`line ${start + 1}: a list holds ${formatCount(LIST_ITEMS_MAX)} items at most (${formatCount(items.length)}).`)
  out.push({ block: listBlock(items, first), line: start + 1 })
  const fence = at < lines.length && indentedFence(lines[at]) ? openingFence(lines[at], Number.MAX_SAFE_INTEGER) : null
  return fence ? parseFence(lines, at, fence, out) : at
}

function parseCallout(lines: string[], start: number, out: Parsed[]): number {
  const body: string[] = []
  let at = start
  while (at < lines.length && /^ {0,3}>/.test(lines[at])) body.push(lines[at++].replace(/^ {0,3}> ?/, ""))
  const tone = /^\[!([A-Za-z]+)\]\s*$/.exec(body[0] ?? "")
  if (tone) body.shift()
  out.push({ block: { type: "callout", text: body.join("\n"), data: tone ? { tone: tone[1].toLowerCase() } : {} }, line: start + 1 })
  return at
}

/** Une ligne qui ouvre un autre bloc interrompt un paragraphe ; une liste numérotée seulement à 1. */
function interrupts(line: string, number: number): boolean {
  if (openingFence(line, 3) || /^ {0,3}>/.test(line) || headingAt(line, number) || imageAt(line, number)) return true
  const marker = markerOf(line)
  return marker !== null && (!marker.ordered || marker.number === 1)
}

function parseParagraph(lines: string[], start: number, out: Parsed[]): number {
  const text = [lines[start]]
  let at = start + 1
  while (at < lines.length && !isBlank(lines[at]) && !interrupts(lines[at], at + 1)) {
    if (!isComment(lines[at])) text.push(lines[at])
    at++
  }
  out.push({ block: { type: "paragraph", text: text.join("\n"), data: {} }, line: start + 1 })
  return at
}

function parseBlockAt(lines: string[], at: number, out: Parsed[]): number {
  const line = lines[at]
  if (isBlank(line) || isComment(line)) return at + 1
  const fence = openingFence(line, 3)
  if (fence) return parseFence(lines, at, fence, out)
  const single = headingAt(line, at + 1) ?? imageAt(line, at + 1)
  if (single) {
    out.push({ block: single, line: at + 1 })
    return at + 1
  }
  if (/^ {0,3}>/.test(line)) return parseCallout(lines, at, out)
  const marker = markerOf(line)
  if (marker) return parseList(lines, at, marker, out)
  return parseParagraph(lines, at, out)
}

/**
 * Les blocs d'un texte markdown (tableau « Formes canoniques », N8, N44), avec la ligne où chacun
 * commence (1 pour la première du texte) ; ou le refus de l'AC3, sans préfixe ni fin. `\r\n` devient
 * `\n` ; les lignes vides de bord et les lignes faites d'un seul commentaire hors d'une clôture sont
 * ignorées. Chaque bloc rendu passe `blockInputSchema`.
 */
export function parseMarkdown(text: string): { blocks: BlockInput[]; lines: number[] } | { problem: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const parsed: Parsed[] = []
  try {
    for (let at = 0; at < lines.length; ) at = parseBlockAt(lines, at, parsed)
  } catch (error) {
    if (error instanceof ParseProblem) return { problem: error.message }
    throw error
  }
  for (const { block, line } of parsed) {
    const valid = blockInputSchema.safeParse(block)
    if (!valid.success) return { problem: `line ${line}: this block is not valid (${valid.error.issues[0]?.message ?? "invalid"}).` }
  }
  return { blocks: parsed.map(({ block }) => block), lines: parsed.map(({ line }) => line) }
}
