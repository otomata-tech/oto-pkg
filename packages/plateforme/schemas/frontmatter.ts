// Le frontmatter YAML en tête d'un `.md` venu d'un autre outil (E11-S18, AC-9 ; HN-E11S18-9) : `---`, des lignes
// `clé: valeur`, `---`. Il n'est jamais du contenu : `readPageMarkdown` (import de l'écran, `upload.link`) en tire le
// titre et le résumé de la page, `set_markdown` de `write` l'écarte du corps. Fonctions pures, lues en temps linéaire
// (`security-patterns.md § Validation des inputs`). Fichier à part de `blocks-render.ts`, pour sa borne de 300 lignes.
import { isBlankLine } from "./blocks"
import { normalizeTitle } from "./nodes"

/** Lignes au plus lues pour fermer un frontmatter : au-delà, la ligne `---` de tête est un séparateur. */
const FRONTMATTER_LINES_MAX = 100

/** La clé d'une ligne `clé: valeur` : sans `:`, chaque caractère lu une fois ; la valeur se coupe à la main. */
const YAML_KEY = /^([\p{L}_][\p{L}\p{N}_ -]*):/u

/** Les clés lues pour le titre et le résumé d'une page, sans casse ni accent. */
const TITLE_KEYS = ["title", "titre"]
const SUMMARY_KEYS = ["summary", "resume", "description"]

/** Un frontmatter lu : ses champs `clé: valeur` (clé sans casse ni accent) et l'indice de la ligne qui le suit. */
export type FrontMatter = { fields: ReadonlyMap<string, string>; end: number }

/**
 * La valeur d'une ligne `clé: valeur` (HN-E11S18-9) : entre guillemets, ce qu'ils entourent ; sinon jusqu'à un
 * commentaire (` #`) ; un bloc littéral ou replié (`|`, `>`), écrit sur les lignes suivantes, n'est pas lu (vide).
 */
function scalar(value: string): string {
  const text = value.trim()
  if (/^[|>][+-]?[0-9]?$/.test(text)) return ""
  const quote = text[0]
  if (quote === '"' || quote === "'") {
    const close = text.indexOf(quote, 1)
    return close === -1 ? text : text.slice(1, close)
  }
  const comment = text.search(/\s#/)
  return (comment === -1 ? text : text.slice(0, comment)).trim()
}

/**
 * Le frontmatter en tête des lignes d'un texte : une première ligne `---`, des lignes YAML simples (`clé: valeur`,
 * élément de liste, ligne indentée, ligne vide), puis `---` ou `...` ; `null` sinon, et la ligne `---` reste un
 * séparateur. Chaque ligne est lue une fois.
 */
export function splitFrontmatter(lines: readonly string[]): FrontMatter | null {
  if (lines.length === 0 || lines[0].trimEnd() !== "---") return null
  const fields = new Map<string, string>()
  for (let at = 1; at < Math.min(lines.length, FRONTMATTER_LINES_MAX); at++) {
    const line = lines[at]
    const bare = line.trimEnd()
    if (bare === "---" || bare === "...") return { fields, end: at + 1 }
    if (isBlankLine(line) || /^[ \t]/.test(line) || /^-(?:[ \t]|$)/.test(line)) continue
    const key = YAML_KEY.exec(line)
    const value = key ? line.slice(key[0].length) : ""
    if (!key || (value !== "" && value[0] !== " " && value[0] !== "\t")) return null
    fields.set(normalizeTitle(key[1]), scalar(value))
  }
  return null
}

/** La première valeur non vide parmi `keys`, ou `undefined`. */
function firstValue(front: FrontMatter | null, keys: readonly string[]): string | undefined {
  return keys.map((key) => front?.fields.get(key)?.trim() ?? "").find((value) => value !== "")
}

/** Le titre et le résumé qu'un frontmatter porte, chacun `undefined` sans lui. */
export function frontmatterHead(front: FrontMatter | null): { title?: string; summary?: string } {
  return { title: firstValue(front, TITLE_KEYS), summary: firstValue(front, SUMMARY_KEYS) }
}
