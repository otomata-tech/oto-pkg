// Le document d'un nœud en mémoire (E03-S03) : blocs dans l'ordre, tailles rendues, références servies
// et positions. Fonctions pures, sans base. Le rendu et les sections viennent de M05
// (`schemas/blocks-render.ts`), jamais réécrits ici (N43) ; ce module n'y ajoute que ce qui est propre
// à `read` et `write`. Sans lui, pas d'adressage par référence ni de bornes par section.
import { blockInputSchema, blockRef, renderBlock, splitSections, type BlockSection } from "../../schemas"
import { chars } from "../../schemas/blocks"
import { POSITION_EPSILON, POSITION_STEP } from "./limits"

/**
 * Un bloc de document (E01-S06 § 2) tel que `nodes/` le manipule : `id` nul pour un bloc pas encore
 * écrit, `position` nulle pour un bloc à placer (neuf ou déplacé).
 */
export type DocBlock = {
  id: string | null
  type: string
  text: string | null
  data: Record<string, unknown>
  key: string | null
  position: number | null
  revision: number
  provenance: Record<string, unknown>
}

/** Le rendu de `read` et de `write` : le titre du nœud prend `#`, un titre de niveau 1 `##` (N7). */
export const HEADING_BASE = 2

/** « 25,412 » : un nombre servi au modèle s'écrit en anglais, séparateur de milliers « , ». */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US")
}

/**
 * Caractères d'un texte comme la base les compte (`char_length`) : une paire de substitution vaut un.
 * C'est `chars` de `schemas/blocks.ts` (E01-S06), sous le nom que lisent les modules de `nodes/`.
 */
export const charCount = chars

// Un bloc n'est jamais modifié en place (les opérations en fabriquent un autre) : son rendu se garde.
const markdownOf = new WeakMap<DocBlock, string>()

/** Le markdown d'un bloc (M05, `headingBase` 2), sans ligne de référence ; vide pour un bloc jamais rendu. */
export function blockMarkdown(block: DocBlock): string {
  let markdown = markdownOf.get(block)
  if (markdown === undefined) {
    markdown = renderBlock(block, { headingBase: HEADING_BASE })
    markdownOf.set(block, markdown)
  }
  return markdown
}

/** Taille rendue d'une suite de blocs : leur markdown, une ligne vide entre deux blocs rendus. */
export function blocksSize(blocks: readonly DocBlock[]): number {
  let size = 0
  let rendered = 0
  for (const block of blocks) {
    const markdown = blockMarkdown(block)
    if (markdown === "") continue
    size += charCount(markdown)
    rendered++
  }
  return rendered > 1 ? size + 2 * (rendered - 1) : size
}

/**
 * La taille de chaque section de `splitSections` (M05), début de page compris : son markdown rendu,
 * de sa ligne de titre à son dernier bloc, sans lignes de référence (plan, bornes, réponses).
 */
export function sectionSizes(blocks: readonly DocBlock[], sections: BlockSection<DocBlock>[] = splitSections(blocks)): number[] {
  return sections.map((section) => blocksSize(section.blocks))
}

/** Niveau (1 à 5, E10-S04) d'un titre que le schéma partagé accepte ; `null` pour tout autre bloc. */
export function headingLevel(block: DocBlock): 1 | 2 | 3 | 4 | 5 | null {
  if (block.type !== "heading") return null
  const valid = blockInputSchema.safeParse(block)
  return valid.success && valid.data.type === "heading" ? valid.data.data.level : null
}

/** Les 8 premiers caractères de l'id, sans tiret (`blockRef` d'E01-S06). */
function shortRef(id: string): string {
  return blockRef({ id, key: null })
}

/**
 * Références servies (E01-S06 § 3, N13) : la clé d'un bloc ; sinon les 8 premiers caractères de son
 * id ; sinon, quand ces 8 caractères sont aussi la clé ou le début de l'id d'un autre bloc de la suite,
 * son id complet. Un bloc sans id ni clé (pas encore écrit) n'en a pas.
 */
export function displayRefs(blocks: readonly DocBlock[]): Map<DocBlock, string> {
  const keys = new Set(blocks.flatMap((block) => (block.key ? [block.key] : [])))
  const prefixes = new Map<string, number>()
  for (const block of blocks) {
    if (block.id) prefixes.set(shortRef(block.id), (prefixes.get(shortRef(block.id)) ?? 0) + 1)
  }
  const refs = new Map<DocBlock, string>()
  for (const block of blocks) {
    if (block.key) refs.set(block, block.key)
    else if (block.id) {
      const short = shortRef(block.id)
      refs.set(block, keys.has(short) || (prefixes.get(short) ?? 0) > 1 ? block.id : short)
    }
  }
  return refs
}

/** Résultat d'une résolution : le bloc, ou pourquoi il n'y en a pas un seul. */
export type RefResolution<B extends Pick<DocBlock, "id" | "key">> = { block: B } | { unknown: true } | { matches: number }

/**
 * Le bloc que désigne une référence (N13) : la clé exacte d'abord, puis le début d'un id (tirets
 * ignorés), de 8 caractères au moins, qui désigne un seul bloc. Ne lit que l'id et la clé : la cible
 * d'un lien `[[chemin#clé]]` n'en charge pas plus (E03-S07).
 */
export function resolveBlockRef<B extends Pick<DocBlock, "id" | "key">>(blocks: readonly B[], ref: string): RefResolution<B> {
  const wanted = ref.trim()
  const byKey = blocks.find((block) => block.key === wanted)
  if (byKey) return { block: byKey }
  const hex = wanted.toLowerCase().replace(/-/g, "")
  if (hex.length < 8 || !/^[0-9a-f]+$/.test(hex)) return { unknown: true }
  const found = blocks.filter((block) => block.id?.toLowerCase().replace(/-/g, "").startsWith(hex))
  if (found.length === 1) return { block: found[0] }
  return found.length === 0 ? { unknown: true } : { matches: found.length }
}

/**
 * Position d'insertion entre deux positions (E01-S06 N7) : le milieu ; en tête, la suivante − 1 024 ;
 * en fin, la précédente + 1 024 ; 1 024 dans un document vide. `null` quand l'écart tombe sous 1e-6 :
 * le brouillon doit être renuméroté.
 */
export function positionBetween(before: number | null, after: number | null): number | null {
  if (before === null) return after === null ? POSITION_STEP : after - POSITION_STEP
  if (after === null) return before + POSITION_STEP
  const middle = (before + after) / 2
  return middle - before < POSITION_EPSILON || after - middle < POSITION_EPSILON ? null : middle
}

/**
 * Les indices d'une plus longue sous-suite strictement croissante de `values` : règle déterministe,
 * partagée par le placement (`placeBlocks`) et l'écart entre révisions (`diffBlocks`, AC11).
 */
export function longestIncreasing(values: readonly number[]): Set<number> {
  const tails: number[] = []
  const previous: number[] = values.map(() => -1)
  values.forEach((value, index) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (values[tails[middle]] < value) low = middle + 1
      else high = middle
    }
    if (low > 0) previous[index] = tails[low - 1]
    tails[low] = index
  })
  const kept = new Set<number>()
  for (let index = tails.at(-1) ?? -1; index !== -1; index = previous[index]) kept.add(index)
  return kept
}

/** Positions de `count` blocs entre deux positions gardées (`null` : bord du document). */
function spread(before: number | null, after: number | null, count: number): number[] {
  return Array.from({ length: count }, (_, rank) => {
    if (before === null && after === null) return POSITION_STEP * (rank + 1)
    if (before === null) return (after ?? 0) - POSITION_STEP * (count - rank)
    if (after === null) return before + POSITION_STEP * (rank + 1)
    return before + ((after - before) * (rank + 1)) / (count + 1)
  })
}

/**
 * Positions du brouillon après les opérations (E01-S06 N7, E03-S03 point 4) : les blocs gardés dont
 * l'ordre relatif ne change pas (plus longue suite croissante de leurs positions) gardent la leur ;
 * les autres (neufs, déplacés) prennent le milieu de leurs voisins gardés, ou 1 024 de plus ou de moins
 * aux bords ; 1 024 × rang pour un document neuf ; sous un écart de 1e-6, tout est renuméroté. Rend
 * de nouveaux blocs, dans le même ordre, les champs non listés gardés.
 */
export function placeBlocks<B extends DocBlock>(blocks: readonly B[]): B[] {
  const placed = blocks.flatMap((block, index) => (block.position === null ? [] : [index]))
  const kept = new Set([...longestIncreasing(placed.map((index) => blocks[index].position ?? 0))].map((rank) => placed[rank]))
  let positions: (number | null)[] = blocks.map((block, index) => (kept.has(index) ? block.position : null))
  for (let start = 0; start < positions.length; start++) {
    if (positions[start] !== null) continue
    let end = start
    while (end < positions.length && positions[end] === null) end++
    const filled = spread(start > 0 ? positions[start - 1] : null, end < positions.length ? positions[end] : null, end - start)
    positions.splice(start, end - start, ...filled)
    start = end - 1
  }
  const tooClose = positions.some((position, index) => index > 0 && (position ?? 0) - (positions[index - 1] ?? 0) < POSITION_EPSILON)
  if (tooClose) positions = blocks.map((_, index) => POSITION_STEP * (index + 1))
  return blocks.map((block, index) => (positions[index] === block.position ? block : { ...block, position: positions[index] }))
}
