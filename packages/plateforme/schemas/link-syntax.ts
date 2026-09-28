// Syntaxe des liens `[[…]]` d'un texte de bloc et du code en ligne qui les cache (E03-S07 AC1 ; E03-S03
// N23, N70), en un seul lecteur : la publication (`server/nodes/links.ts`) et l'écran
// (`ui/noeud/en-ligne.ts`) la lisent ici, et un `[[…]]` est un lien à l'écran si et seulement si la
// publication l'extrait (HN-E05S02-26). Fonctions pures, en balayages linéaires : un rédacteur écrit ces
// textes (`security-patterns.md § Validation des inputs`). Sans lui, deux lecteurs de la même syntaxe
// divergent : l'écran lisait encore le code en ligne à l'ancienne expression du service (M15).
import { chars } from "./blocks"
import { NODE_PATH_PATTERN } from "./nodes"

const PATH_MAX = 200
const KEY_MAX = 500
const LABEL_MAX = 200

/** Un span de code en ligne : ses bornes dans le texte, accents graves compris, et le code entre eux. */
export type CodeSpan = { start: number; end: number; content: string }

/** Un `[[…]]` hors du code en ligne. */
type FoundLink = {
  /** Le premier crochet ouvrant, et la position qui suit le dernier crochet fermant. */
  start: number
  end: number
  /** Le `[[…]]` que lit la publication, spans de code blanchis : ce qu'elle cite quand ce n'est pas un lien. */
  raw: string
  /** Le chemin, la clé et le libellé tel qu'il est écrit (vide sans `|`) ; `null` sans la forme d'un lien. */
  link: { path: string; key: string | null; label: string } | null
}

/** Les suites d'accents graves d'un texte (maximales), dans l'ordre : début et longueur. */
function backtickRuns(text: string): { start: number; length: number }[] {
  const runs: { start: number; length: number }[] = []
  for (let at = text.indexOf("`"); at !== -1; ) {
    let end = at
    while (end < text.length && text[end] === "`") end++
    runs.push({ start: at, length: end - at })
    at = text.indexOf("`", end)
  }
  return runs
}

/**
 * Les spans de code en ligne d'un texte (CommonMark, sans échappement, N70) : une suite d'accents graves
 * ouvre un span que ferme la suite suivante de même longueur ; sans elle, elle reste du texte. En temps
 * linéaire : les suites sont rangées par longueur, et la recherche de chaque longueur ne revient jamais
 * en arrière.
 */
export function codeSpans(text: string): CodeSpan[] {
  const runs = backtickRuns(text)
  const byLength = new Map<number, number[]>()
  runs.forEach((run, index) => {
    const same = byLength.get(run.length)
    if (same) same.push(index)
    else byLength.set(run.length, [index])
  })
  const cursors = new Map<number, number>()
  const spans: CodeSpan[] = []
  for (let index = 0; index < runs.length; index++) {
    const { start, length } = runs[index]
    const same = byLength.get(length) ?? []
    let at = cursors.get(length) ?? 0
    while (at < same.length && same[at] <= index) at++
    cursors.set(length, at)
    if (at === same.length) continue
    const close = runs[same[at]]
    spans.push({ start, end: close.start + length, content: text.slice(start + length, close.start) })
    index = same[at]
  }
  return spans
}

/** Le texte sans ses spans de code en ligne, remplacés par autant d'espaces (les positions ne bougent pas). */
function withoutInlineCode(text: string): string {
  let masked = ""
  let from = 0
  for (const { start, end } of codeSpans(text)) {
    masked += text.slice(from, start) + " ".repeat(end - start)
    from = end
  }
  return masked + text.slice(from)
}

/** Le premier `]` ou saut de ligne à partir de `from`, sinon la fin du texte. */
function firstStop(text: string, from: number): number {
  for (let at = from; at < text.length; at++) if (text[at] === "]" || text[at] === "\n") return at
  return text.length
}

/**
 * Chaque `[[…]]` d'un texte, dans l'ordre, sans `]` ni saut de ligne entre les crochets (ce que lisait
 * `/\[\[([^\]\n]*)\]\]/g`) : ses bornes. En temps linéaire : la fin cherchée pour un `[[` sert aux
 * suivants tant qu'elle est devant eux.
 */
function bracketed(text: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = []
  let stop = -1
  for (let at = text.indexOf("[["); at !== -1; ) {
    if (stop < at + 2) stop = firstStop(text, at + 2)
    if (text.startsWith("]]", stop)) {
      found.push({ start: at, end: stop + 2 })
      at = text.indexOf("[[", stop + 2)
    } else {
      at = text.indexOf("[[", at + 1)
    }
  }
  return found
}

/**
 * Le lien d'un `[[…]]`, ou `null` s'il n'en a pas la forme. La découpe au premier `|`, puis au premier
 * `#`, se fait sur l'intérieur que lit la publication (`inner` : entre les crochets, spans de code
 * blanchis) ; le libellé est pris dans le même intérieur tel qu'il est écrit (`written`), et compté
 * comme la publication le compte, blanchi et avant d'être rogné.
 */
function parseLink(inner: string, written: string): FoundLink["link"] {
  const bar = inner.indexOf("|")
  const target = bar === -1 ? inner : inner.slice(0, bar)
  if (bar !== -1 && chars(inner.slice(bar + 1)) > LABEL_MAX) return null
  const hash = target.indexOf("#")
  const path = (hash === -1 ? target : target.slice(0, hash)).trim()
  if (path === "" || chars(path) > PATH_MAX || !NODE_PATH_PATTERN.test(path)) return null
  const key = hash === -1 ? null : target.slice(hash + 1).trim()
  if (key !== null && (key === "" || chars(key) > KEY_MAX)) return null
  return { path, key, label: bar === -1 ? "" : written.slice(bar + 1) }
}

/**
 * Chaque `[[…]]` d'un texte hors de son code en ligne, dans l'ordre (E03-S07 AC1) : `[[`, un chemin (H51,
 * 200 caractères au plus, espaces de bord retirés), un `#` et une clé facultatifs (1 à 500 caractères,
 * espaces de bord retirés), un `|` et un libellé facultatifs (200 caractères au plus), `]]`, sans `]` ni
 * saut de ligne entre les crochets. Un `[[…]]` hors de ces bornes, ou sans chemin valide, vient avec
 * `link: null`.
 */
export function linksIn(text: string): FoundLink[] {
  const masked = withoutInlineCode(text)
  return bracketed(masked).map(({ start, end }) => ({
    start,
    end,
    raw: masked.slice(start, end),
    link: parseLink(masked.slice(start + 2, end - 2), text.slice(start + 2, end - 2)),
  }))
}
