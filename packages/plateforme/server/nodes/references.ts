// Blocs `reference` (E03-S07, AC11, AC12 ; ADR-011 § 2, H56, N4) : une page citée, `{path}`, ou une
// vue d'un tableau, `{path, view}`, résolue pour l'appelant en une ligne (titre, résumé, chemin ; pour
// une vue, l'appel exact de `table.rows`) servie sous deux formes : dans `read`, en commentaire après
// la clôture ```reference``` relisible de M05 (`parseMarkdown` l'ignore, E03-S03) ; dans `context`,
// seule (E03-S08 la branche). `view` n'est lu que comme un objet : son schéma appartient à E07-S01,
// qui le valide à l'appel de `table.rows`. Sans lui, le modèle ne lirait que la clôture, sans titre,
// résumé ni appel exact. E07-S03 y ajoute `resolveReferencesForScreen`.
//
// Repris d'oto-frontend (`src/api/generated/schema.d.ts` l. 424-441, `EmbeddedContent`) : le contenu
// cité au milieu du texte, page ou tableau, à l'endroit où la phrase qui précède dit pourquoi. Retiré :
// `scope`, `volume` et le mode d'injection (« cité n'est pas injecté » : une ligne, jamais le corps).
import { blockInputSchema, renderBlock, sectionOfBlock, type BlockLike } from "../../schemas"
import type { PlatformDb } from "../db"
import type { Identity } from "../identity"
import type { DocBlock } from "./document"
import { resolveTargets, targetKey, type TargetResolution } from "./link-resolution"

/** Un bloc `reference` du document : son chemin, sa vue (objet, ou `null` pour une page) et sa section (M05). */
export type ReferenceBlock = { blockId: string; path: string; view: Record<string, unknown> | null; section: string | null }

export type ReferenceStatus = "ok" | "moved" | "missing" | "invalid"

/** Un bloc `reference` résolu : sa ligne, son état, et le titre et le chemin courant de sa cible trouvée. */
export type ResolvedReference = ReferenceBlock & {
  kind: "page" | "view"
  status: ReferenceStatus
  line: string
  title?: string
  movedTo?: string
}

/**
 * Les blocs `reference` d'un document, dans son ordre, tels que le schéma partagé les accepte (un bloc
 * refusé n'est pas rendu, M05 N2), chacun avec la section où il est (`sectionOfBlock`, M05, jamais
 * recalculée) ; un bloc sans id (pas encore écrit) est ignoré.
 */
export function extractReferences(blocks: readonly DocBlock[]): ReferenceBlock[] {
  return blocks.flatMap((block) => {
    if (block.type !== "reference" || block.id === null) return []
    const valid = blockInputSchema.safeParse(block)
    if (!valid.success || valid.data.type !== "reference") return []
    const { path, view } = valid.data.data
    return [{ blockId: block.id, path, view: view ?? null, section: sectionOfBlock(blocks, block.id) }]
  })
}

/** Un JSON sur une ligne, une espace après chaque `:` et chaque `,` : la forme des appels servis. */
function spacedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(spacedJson).join(", ")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${spacedJson(item)}`).join(", ")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/** « filter {"ville":"Valbrune"}, columns entreprise, contact, limit 10 » : ce que la vue porte, dans cet ordre. */
function viewDescription(view: Record<string, unknown>): string {
  const columns = view.columns
  const parts = [
    view.filter === undefined ? null : `filter ${JSON.stringify(view.filter)}`,
    view.sort === undefined ? null : `sort ${JSON.stringify(view.sort)}`,
    columns === undefined ? null : `columns ${Array.isArray(columns) && columns.every((column) => typeof column === "string") ? columns.join(", ") : JSON.stringify(columns)}`,
    view.limit === undefined ? null : `limit ${JSON.stringify(view.limit)}`,
  ]
  return parts.filter((part) => part !== null).join(", ")
}

/** L'appel exact de `table.rows` d'une vue : le chemin courant du tableau en `table`, puis les clés de la vue telles quelles. */
function rowsCall(prefix: string, table: string, view: Record<string, unknown>): string {
  const keys = Object.fromEntries(Object.entries(view).filter(([key]) => key !== "table"))
  return `${prefix}_call ${spacedJson({ function: "table.rows", arguments: { table, ...keys } })}`
}

/** La ligne et l'état d'un bloc d'après la résolution de son chemin (AC11). */
function resolvedOne(reference: ReferenceBlock, target: TargetResolution | undefined, prefix: string): ResolvedReference {
  const kind: ResolvedReference["kind"] = reference.view === null ? "page" : "view"
  const node = target?.node
  if (!target || !node) return { ...reference, kind, status: "missing", line: `→ ${kind}: ${reference.path} (not found)` }
  const moved = target.status === "moved"
  const status: ReferenceStatus = moved ? "moved" : "ok"
  const found = { ...reference, kind, title: node.title, ...(moved ? { movedTo: node.path } : {}) }
  const where = moved ? `${node.path}, moved from ${reference.path}` : node.path
  if (reference.view === null) return { ...found, status, line: `→ page: ${node.title} — ${node.summary} (${where})` }
  if (node.kind !== "table") return { ...found, status: "invalid", line: `→ view: invalid block (${node.path} is not a table)` }
  const description = viewDescription(reference.view)
  const head = `→ view of table ${node.title} (${where})${description === "" ? "" : `: ${description}`}`
  return { ...found, status, line: `${head}. Rows: ${rowsCall(prefix, node.path, reference.view)}` }
}

/** Les blocs `reference` résolus d'après les cibles déjà relues (`resolveTargets`), dans l'ordre du document. */
export function resolvedReferences(references: readonly ReferenceBlock[], targets: ReadonlyMap<string, TargetResolution>, prefix: string): ResolvedReference[] {
  return references.map((reference) => resolvedOne(reference, targets.get(targetKey({ path: reference.path, key: null })), prefix))
}

/**
 * Les blocs `reference` de `blocks` résolus pour l'appelant (AC11) : leurs chemins relus par
 * `resolveTargets` (alias compris, cible de niveau 0 introuvable), en une requête par étape. `known` :
 * des cibles déjà relues pour le même appelant (les liens sortants de l'en-tête de `read`), reprises
 * sans nouvelle lecture (N24) ; `[]` sans elles.
 */
export async function resolveReferences(
  db: PlatformDb,
  identity: Identity,
  blocks: readonly DocBlock[],
  known: readonly TargetResolution[],
): Promise<ResolvedReference[]> {
  const references = extractReferences(blocks)
  const targets = new Map(known.map((target) => [targetKey(target), target]))
  const paths = [...new Set(references.map((reference) => reference.path))].filter((path) => !targets.has(targetKey({ path, key: null })))
  for (const target of await resolveTargets(db, identity, paths.map((path) => ({ path, key: null })))) targets.set(targetKey(target), target)
  return resolvedReferences(references, targets, identity.org.prefix)
}

/** Les lignes par id de bloc, lues par les deux formes. */
export function referenceLines(resolved: readonly ResolvedReference[]): Map<string, string> {
  return new Map(resolved.map((reference) => [reference.blockId, reference.line]))
}

/**
 * Une ligne dans un commentaire d'une ligne que `parseMarkdown` ignore : ni saut de ligne, ni `-->`
 * qui le fermerait (un titre peut en porter ; `\u003e` est `>` en JSON, l'appel reste exact). Chaque
 * suite d'espaces qui porte un saut de ligne devient une espace, en temps linéaire : la ligne porte du
 * texte du client (titre, résumé, vue), que `\s*[\r\n]+\s*` relisait depuis chaque caractère d'une
 * suite d'espaces (`security-patterns.md § Validation des inputs`).
 */
function commented(line: string): string {
  const oneLine = line.replace(/\s+/g, (run) => (/[\r\n]/.test(run) ? " " : run))
  return `<!-- ${oneLine.replaceAll("-->", "--\\u003e")} -->`
}

/** Forme de `read` (option `reference` de `renderBlocks`) : la clôture relisible de M05, puis la ligne en commentaire. */
export function readReference(lines: ReadonlyMap<string, string>): (block: BlockLike) => string {
  return (block) => {
    const line = block.id ? lines.get(block.id) : undefined
    const fence = renderBlock(block)
    return line === undefined ? fence : `${fence}\n${commented(line)}`
  }
}

/** Forme de `context` (E03-S08) : la ligne seule, sans clôture ni commentaire ; la clôture par défaut sans ligne. */
export function contextReference(lines: ReadonlyMap<string, string>): (block: BlockLike) => string {
  return (block) => (block.id ? lines.get(block.id) : undefined) ?? renderBlock(block)
}

/**
 * Les avertissements de la publication (AC12), dans l'ordre du document : une cible absente ou
 * invisible, une vue qui ne vise pas un tableau ; la section vient de `sectionOfBlock` (M05). Un bloc
 * `reference` n'a que son avertissement propre, jamais celui d'un lien.
 */
export function referenceWarnings(resolved: readonly ResolvedReference[]): string[] {
  return resolved.flatMap((reference) => {
    const where = reference.section === null ? "before the first heading" : `in « ${reference.section} »`
    const label = `${reference.kind === "view" ? "view" : "reference"} block ${where}`
    if (reference.status === "missing") return [`${label}: ${reference.path} does not exist (yet)`]
    if (reference.status === "invalid") return [`${label}: ${reference.movedTo ?? reference.path} is not a table`]
    return []
  })
}
