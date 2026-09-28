// Liens `[[…]]` et blocs `reference` d'un document (E03-S03 N23 ; syntaxe de l'AC1 d'E03-S07, lue par
// `schemas/link-syntax.ts` comme l'écran la lit, M15) : extraits à la publication et passés à
// `publish_node` (`p_links`). E03-S07 ajoute ici `prepareLinks`
// (borne, résolution sous les droits du publieur, avertissements), sans réécrire cette extraction ; la
// résolution est dans `link-resolution.ts`, les lignes de `read` dans `link-lines.ts`. Sans lui,
// `links` ne suit pas le contenu publié.
//
// Repris d'Oto (`oto_mcp/db/backlinks.py` l. 1-60) : extraction bornée et dédupliquée, espaces de bord
// retirées, liens sans cible gardés et signalés, extraction sur tout chemin d'écriture (ici la
// publication, seule voie). Retiré : la résolution par titre, la portée par projet, l'ambiguïté entre titres.
import { linksIn } from "../../schemas/link-syntax"
import type { Json } from "../database"
import type { PlatformDb } from "../db"
import { PlatformError } from "../errors"
import type { Identity } from "../identity"
import { formatCount, type DocBlock } from "./document"
import { LINKS_MAX } from "./limits"
import { resolveTargets, targetKey, type LinkTarget, type TargetResolution } from "./link-resolution"
import { extractReferences, referenceWarnings, resolvedReferences } from "./references"

export type ExtractedLink = { blockId: string; path: string; key: string | null }

export type NotLink = { text: string; blockId: string }

/** Les textes humains d'un bloc (N23) : jamais le code, `mermaid` ni `call`. */
function humanTexts(block: DocBlock): string[] {
  const texts = (value: unknown) => (typeof value === "string" ? [value] : [])
  const items = Array.isArray(block.data.items) ? block.data.items : []
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "callout":
    case "image":
      return texts(block.text)
    case "list":
      return items.flatMap(texts)
    case "checklist":
      return items.flatMap((item) => texts(item !== null && typeof item === "object" && "text" in item ? item.text : null))
    default:
      return []
  }
}

/**
 * Les liens d'un document (AC31 ; E03-S07 AC1) : `[[`, un chemin (H51, 200 caractères au plus, espaces
 * de bord retirés), un `#` et une clé facultatifs (1 à 500 caractères, ni `]`, ni `|`, ni saut de
 * ligne), un `|` et un libellé facultatifs (200 caractères au plus, ni `]` ni saut de ligne), `]]`,
 * dans les blocs de texte humain hors code en ligne ; chaque bloc `reference` donne un lien vers son
 * chemin, sans clé. Un lien par bloc, chemin et clé, dans l'ordre du document ; ce qui a la forme
 * `[[…]]` sans chemin valide va dans `notLinks`. Un bloc sans id (pas encore écrit) est ignoré.
 */
export function extractLinks(blocks: readonly DocBlock[]): { links: ExtractedLink[]; notLinks: NotLink[] } {
  const links: ExtractedLink[] = []
  const notLinks: NotLink[] = []
  for (const block of blocks) {
    if (block.id === null) continue
    const blockId = block.id
    const seen = new Set<string>()
    const add = (path: string, key: string | null) => {
      const unique = targetKey({ path, key })
      if (seen.has(unique)) return
      seen.add(unique)
      links.push({ blockId, path, key })
    }
    for (const { raw, link } of humanTexts(block).flatMap((text) => linksIn(text))) {
      if (link) add(link.path, link.key)
      else notLinks.push({ text: raw, blockId })
    }
    if (block.type === "reference" && typeof block.data.path === "string") add(block.data.path, null)
  }
  return { links, notLinks }
}

/** Les cibles distinctes d'une suite de liens, dans l'ordre de leur première citation. */
function distinctTargets(links: readonly LinkTarget[]): LinkTarget[] {
  const seen = new Map<string, LinkTarget>()
  for (const { path, key } of links) if (!seen.has(targetKey({ path, key }))) seen.set(targetKey({ path, key }), { path, key })
  return [...seen.values()]
}

/**
 * Les avertissements des liens écrits (AC2, AC5) : d'abord les cibles absentes ou invisibles du
 * publieur, puis les clés sans bloc, puis ce qui a la forme d'un lien sans chemin ; chaque cible et
 * chaque texte une fois, dans l'ordre du document.
 */
function linkWarnings(resolved: readonly TargetResolution[], notLinks: readonly NotLink[]): string[] {
  const shown = (target: LinkTarget) => `[[${target.path}${target.key === null ? "" : `#${target.key}`}]]`
  return [
    ...resolved.filter((target) => target.status === "missing").map((target) => `link ${shown(target)}: no page at this path yet`),
    ...resolved.flatMap((target) => (target.keyFound === false && target.node ? [`link ${shown(target)}: ${target.node.path} has no block « ${target.key} »`] : [])),
    ...[...new Set(notLinks.map((notLink) => notLink.text))].map((text) => `${text} is not a link: links use paths, e.g. [[conseil/grille_tarifaire]]`),
  ]
}

/**
 * Les liens d'une page, d'une procédure ou d'un Contexte pour `publish_node` (`p_links`, N23) et ce que
 * la publication signale (AC2, AC3, AC5, AC12) : au-delà de 1 000 liens distincts, refus avant toute
 * lecture et sans publier ; sinon chaque cible est relue sous les droits du publieur (`resolveTargets`,
 * une requête par étape pour les liens et les blocs `reference` ensemble). Un bloc `reference` n'a que
 * son avertissement propre (AC12).
 */
export async function prepareLinks(db: PlatformDb, identity: Identity, node: { path: string }, blocks: readonly DocBlock[]): Promise<{ pLinks: Json; warnings: string[] }> {
  const { links, notLinks } = extractLinks(blocks)
  if (links.length > LINKS_MAX) {
    throw new PlatformError(
      "too_large",
      `${node.path} holds ${formatCount(links.length)} links; a page holds at most ${formatCount(LINKS_MAX)}: split it into several pages. The draft is kept; nothing was published.`,
    )
  }
  const references = extractReferences(blocks)
  const fromReferences = new Set(blocks.flatMap((block) => (block.type === "reference" && block.id !== null ? [block.id] : [])))
  const written = distinctTargets(links.filter((link) => !fromReferences.has(link.blockId)))
  const cited = distinctTargets(references.map((reference) => ({ path: reference.path, key: null })))
  const resolved = await resolveTargets(db, identity, distinctTargets([...written, ...cited]))
  const byTarget = new Map(resolved.map((target) => [targetKey(target), target]))
  const warnings = [
    ...linkWarnings(written.flatMap((target) => byTarget.get(targetKey(target)) ?? []), notLinks),
    ...referenceWarnings(resolvedReferences(references, byTarget, identity.org.prefix)),
  ]
  const pLinks = links.map((link) => ({ block_id: link.blockId, path: link.path, ...(link.key === null ? {} : { key: link.key }) }))
  return { pLinks, warnings }
}
