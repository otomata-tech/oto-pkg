// Rendu des blocs (tâche M05 ; ADR-011 § 5) : ordre, markdown, sections et emplacement d'un bloc
// `call`, en fonctions pures, sans base ni import de server/, pour que `read` et `write` (E03-S03),
// `context` (E03-S02, E03-S08), le contrôle des procédures (E03-S06), les références (E03-S07) et les
// écrans (ui/) partagent un seul rendu. Sans ce module, chacun réécrirait le sien, et un texte servi
// par `context` ou vérifié à la publication différerait de celui que `read` sert et que `write` relit.
//
// Règles : « Contrat pour les autres stories » d'E01-S06, § 3 (ordre, section, emplacement d'un
// `call`, rendu) ; tableau « Formes canoniques » d'E03-S03, qui fait foi pour le rendu et dont
// `parseMarkdown` (E03-S03) est l'inverse ; règle 7 d'E03-S06 (format de l'emplacement). Un bloc que
// `blockInputSchema` refuse (forme que la base admet par ses chemins JSON `lax`, E01-S06 N44, ou type
// et forme écrits par une version plus récente, M67) n'est ni titre de section, ni liste qui numérote
// une étape ; il est rendu à sa place par une ligne de commentaire (`isUnknownBlock`, M67, D122), jamais
// effacé : un hôte resté en 1.0 le perdrait en silence, et un `write` par section le réécrirait sans lui.
//
// Repris de la maquette (`mcp-test/src/proto/services/sections.ts`, `sameTitle`) : titres comparés
// sans casse, sans accent et sans espace de bord. Retiré : les sections `{title, body}` en markdown
// (→ plages de blocs).
import { blockInputSchema, type BlockInput } from "./blocks"

/**
 * Forme minimale d'un bloc : celle de `BlockInput` (E01-S06), d'une ligne de `blocks`, ou d'un bloc
 * de brouillon calculé avant son écriture, qui n'a encore ni `id` ni `position`.
 */
export type BlockLike = {
  type: string
  text?: string | null
  data?: unknown
  key?: string | null
  id?: string | null
  position?: number | null
}

export type RenderOptions<B extends BlockLike = BlockLike> = {
  /** Nombre de `#` d'un titre de niveau 1 (défaut 2 : le titre du nœud prend `#`) ; `context` passe 3. */
  headingBase?: number
  /** Rendu d'un bloc `reference` à la place de sa clôture relisible (E03-S07 : ligne résolue). */
  reference?: (block: B) => string
  /** Référence affichée d'un bloc (E03-S03, `displayRefs`) : une chaîne donne la ligne `<!-- ref: … -->` avant lui. */
  refs?: (block: B) => string | null
}

/** Une section : son titre (`null` pour le début de page) et ses blocs, titre en tête, sous-sections comprises. */
export type BlockSection<B extends BlockLike = BlockLike> = { heading: B | null; blocks: B[] }

/** Emplacement d'un bloc `call` : titre le plus proche avant lui, rang parmi les `call` qui le suivent, étape. */
export type CallLocation = { section: string | null; rank: number; step: number | null }

const DEFAULT_HEADING_BASE = 2

/** Le bloc tel que le schéma partagé l'accepte (E01-S06 N44), ou `null`. */
function validated(block: BlockLike): BlockInput | null {
  const parsed = blockInputSchema.safeParse(block)
  return parsed.success ? parsed.data : null
}

/**
 * Un bloc que cette version ne sait pas lire (M67, D122) : type ou forme que le schéma partagé refuse.
 * `read` le sert par une ligne de commentaire ; `write` refuse de le perdre (`server/nodes/section-ops.ts`,
 * `block-ops.ts`).
 */
export function isUnknownBlock(block: BlockLike): boolean {
  return validated(block) === null
}

// ------------------------------------------------------------------------------------------ Ordre

/** Valeur de tri d'une position ou d'un `id` : absente (nulle, `NaN`) après toutes les autres. */
function sortKey<T extends number | string>(value: T | null | undefined): T | null {
  if (value === null || value === undefined) return null
  return typeof value === "number" && Number.isNaN(value) ? null : value
}

/** Comparaison croissante, valeurs absentes en dernier, comme `order by … nulls last` de Postgres. */
function compareNullsLast<T extends number | string>(a: T | null, b: T | null): number {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  if (a < b) return -1
  return a > b ? 1 : 0
}

/**
 * Les blocs d'un document dans leur ordre de lecture, par (`position`, `id`) (E01-S06 § 3, l'ordre de
 * la lecture en base) : un bloc sans position vient après les blocs placés ; à position égale, un bloc
 * sans `id` vient après les autres ; à égalité complète, l'ordre reçu est gardé. Rend un nouveau tableau.
 */
export function orderBlocks<B extends BlockLike>(blocks: readonly B[]): B[] {
  return [...blocks].sort(
    (a, b) =>
      compareNullsLast(sortKey(a.position), sortKey(b.position)) || compareNullsLast(sortKey(a.id), sortKey(b.id)),
  )
}

// ---------------------------------------------------------------------------------------- Rendu

/** Clôture d'accents graves plus longue que toute suite d'accents graves du texte, trois au moins. */
function fenceFor(text: string): string {
  let longest = 0
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return "`".repeat(Math.max(3, longest + 1))
}

function fenced(info: string, content: string, fence = "```"): string {
  return `${fence}${info}\n${content}\n${fence}`
}

/** Un élément de liste : sa marque, puis ses lignes suivantes indentées de deux espaces. */
function listItem(marker: string, text: string): string {
  const [first, ...rest] = text.split("\n")
  return [`${marker} ${first}`, ...rest.map((line) => (line === "" ? line : `  ${line}`))].join("\n")
}

/**
 * Le corps d'un bloc selon les formes canoniques d'E03-S03 ; un bloc refusé, la ligne de M67 (une ligne
 * de commentaire, que `parseMarkdown` ignore) ; `null` : jamais rendu (ligne de tableau).
 */
function renderBody<B extends BlockLike>(block: B, options: RenderOptions<B>): string | null {
  if (block.type === "row") return null
  const valid = validated(block)
  if (valid === null) return `<!-- block ${block.type} not shown: this platform version does not know it -->`
  switch (valid.type) {
    case "heading":
      return `${"#".repeat((options.headingBase ?? DEFAULT_HEADING_BASE) + valid.data.level - 1)} ${valid.text}`
    case "paragraph":
      return valid.text
    case "list": {
      const { items, ordered, start = 1 } = valid.data
      return items.map((item, index) => listItem(ordered === true ? `${start + index}.` : "-", item)).join("\n")
    }
    case "checklist":
      return valid.data.items.map((item) => listItem(item.checked ? "- [x]" : "- [ ]", item.text)).join("\n")
    case "code":
      return fenced(valid.data?.language ?? "", valid.text, fenceFor(valid.text))
    case "call":
      return fenced("call", `${valid.data.function} ${JSON.stringify(valid.data.args)}`)
    case "mermaid":
      return fenced("mermaid", valid.text, fenceFor(valid.text))
    case "image": {
      const caption = valid.text === null || valid.text === undefined ? "" : ` "${valid.text}"`
      return `![${valid.data.alt ?? ""}](${valid.data.src}${caption})`
    }
    case "callout": {
      const tone = valid.data?.tone ? [`> [!${valid.data.tone.toUpperCase()}]`] : []
      return [...tone, ...valid.text.split("\n").map((line) => `> ${line}`)].join("\n")
    }
    case "reference": {
      if (options.reference) return options.reference(block)
      const { path, view } = valid.data
      return fenced("reference", view === undefined ? path : `${path} ${JSON.stringify(view)}`)
    }
    case "row":
      return null
  }
}

/**
 * Le markdown d'un bloc, précédé d'une ligne `<!-- ref: … -->` quand `refs` rend une chaîne. Une ligne
 * de tableau n'est jamais rendue : chaîne vide, sans ligne de référence. Un bloc que le schéma partagé
 * refuse rend `<!-- block <type> not shown: this platform version does not know it -->` (M67). Sans
 * l'option `reference`, un bloc `reference` rend sa clôture relisible.
 */
export function renderBlock<B extends BlockLike>(block: B, options: RenderOptions<B> = {}): string {
  const body = renderBody(block, options)
  if (body === null) return ""
  const ref = options.refs?.(block)
  const lines = typeof ref === "string" ? [`<!-- ref: ${ref} -->`] : []
  if (body !== "") lines.push(body)
  return lines.join("\n")
}

/** Les blocs dans l'ordre reçu (voir `orderBlocks`), une ligne vide entre deux blocs rendus. */
export function renderBlocks<B extends BlockLike>(blocks: readonly B[], options: RenderOptions<B> = {}): string {
  return blocks
    .map((block) => renderBlock(block, options))
    .filter((markdown) => markdown !== "")
    .join("\n\n")
}

// ------------------------------------------------------------------------------------- Sections

/** Titre comparable (H54) : sans accent, sans casse, sans espace de bord ; « Étapes » = « etapes ». */
export function normalizeTitle(title: string): string {
  return title.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase()
}

/** Niveau et texte d'un titre que le schéma partagé accepte ; `null` pour tout autre bloc. */
function headingOf(block: BlockLike): { level: 1 | 2 | 3; text: string } | null {
  if (block.type !== "heading") return null
  const valid = validated(block)
  return valid?.type === "heading" ? { level: valid.data.level, text: valid.text } : null
}

/** Fin (exclue) de la section ouverte par le titre d'indice `start` : le prochain titre de niveau ≤. */
function sectionEnd(levels: readonly (number | null)[], start: number): number {
  const level = levels[start] ?? 0
  let end = start + 1
  while (end < levels.length) {
    const next = levels[end]
    if (next !== null && next <= level) break
    end++
  }
  return end
}

/**
 * Les sections des blocs reçus, dans l'ordre (ADR-011 § 5, E01-S06 § 3) : d'abord le début de page
 * (`heading: null`, les blocs avant le premier titre, vide quand la page commence par un titre), puis
 * une section par titre : le titre et les blocs qui le suivent jusqu'au prochain titre de niveau
 * inférieur ou égal, sous-sections comprises (une sous-section figure aussi à son propre rang).
 */
export function splitSections<B extends BlockLike>(blocks: readonly B[]): BlockSection<B>[] {
  const levels = blocks.map((block) => headingOf(block)?.level ?? null)
  const first = levels.findIndex((level) => level !== null)
  const start = first === -1 ? blocks.length : first
  const sections: BlockSection<B>[] = [{ heading: null, blocks: blocks.slice(0, start) }]
  for (let index = start; index < blocks.length; index++) {
    if (levels[index] !== null) sections.push({ heading: blocks[index], blocks: blocks.slice(index, sectionEnd(levels, index)) })
  }
  return sections
}

/** Toutes les sections dont le titre correspond à `title` (`normalizeTitle`), homonymes compris, dans l'ordre. */
export function findSections<B extends BlockLike>(blocks: readonly B[], title: string): BlockSection<B>[] {
  const wanted = normalizeTitle(title)
  return splitSections(blocks).filter(
    (section) => section.heading !== null && normalizeTitle(section.heading.text ?? "") === wanted,
  )
}

function indexOfBlock(blocks: readonly BlockLike[], blockId: string): number {
  const index = blocks.findIndex((block) => block.id === blockId)
  if (index === -1) throw new Error(`Block ${blockId} is not among the blocks given.`)
  return index
}

/** Le titre le plus proche à l'indice `index` ou avant, avec son indice ; `null` au début de page. */
function nearestHeading(blocks: readonly BlockLike[], index: number): { index: number; text: string } | null {
  for (let at = index; at >= 0; at--) {
    const heading = headingOf(blocks[at])
    if (heading) return { index: at, text: heading.text }
  }
  return null
}

/**
 * Le texte du titre de la section d'un bloc de tout type : le titre le plus proche avant lui, quel
 * que soit son niveau (un titre est dans sa propre section) ; `null` avant le premier titre. Les
 * blocs sont dans l'ordre du document ; un `blockId` absent de la liste est une erreur d'appel.
 */
export function sectionOfBlock(blocks: readonly BlockLike[], blockId: string): string | null {
  return nearestHeading(blocks, indexOfBlock(blocks, blockId))?.text ?? null
}

/** Étape d'un `call` : le dernier numéro de la liste numérotée qui le précède hors `call`, sinon `null`. */
function stepBefore(blocks: readonly BlockLike[], index: number): number | null {
  let before = index - 1
  while (before >= 0 && blocks[before].type === "call") before--
  const list = before >= 0 ? validated(blocks[before]) : null
  if (list?.type !== "list" || list.data.ordered !== true) return null
  return (list.data.start ?? 1) + list.data.items.length - 1
}

/**
 * Emplacement d'un bloc `call` (E01-S06 § 3 ; E03-S06, règle 7) : la section est le texte du titre le
 * plus proche avant lui (`null` : aucun) ; le rang, sa place parmi les blocs `call` qui suivent ce
 * titre, à partir de 1 ; l'étape, quand le bloc précédent qui n'est pas un `call` est une liste
 * numérotée, `(start ?? 1) + items.length − 1`. Réservé aux blocs `call` : un autre bloc, ou un
 * `blockId` absent de la liste, est une erreur d'appel.
 */
export function callLocation(blocks: readonly BlockLike[], blockId: string): CallLocation {
  const index = indexOfBlock(blocks, blockId)
  if (blocks[index].type !== "call") throw new Error(`Block ${blockId} is a ${blocks[index].type} block, not a call block.`)
  const heading = nearestHeading(blocks, index - 1)
  const calls = blocks.slice(heading === null ? 0 : heading.index + 1, index).filter((block) => block.type === "call")
  return { section: heading?.text ?? null, rank: calls.length + 1, step: stepBefore(blocks, index) }
}

/** « section « Étapes », call block 2 (step 3) » ; avant tout titre, « before the first heading, call block 1 ». */
export function formatCallLocation(location: CallLocation): string {
  const where = location.section === null ? "before the first heading" : `section « ${location.section} »`
  const step = location.step === null ? "" : ` (step ${location.step})`
  return `${where}, call block ${location.rank}${step}`
}
