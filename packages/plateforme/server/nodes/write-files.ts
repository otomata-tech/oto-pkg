// Les fichiers qu'un bloc écrit cite (E10-S02, AC-d3 ; ADR-016 § 6) : un bloc `file` ou une image jointe (`file_id`)
// n'est écrit par `writeNode` (écran, `write`, dépôt par lien) que si son fichier est `ready` et joint au nœud écrit,
// relu en base avant l'écriture ; le nom, la taille et le type d'un bloc `file` viennent de la ligne `files`, jamais du
// client. Un fichier que le document citait déjà passe sans relecture : une copie de page encore `pending` ou un objet
// perdu (AC-e3, AC-b8) ne bloque pas l'écriture du reste de la page. Sans lui, un assistant citerait le fichier d'une
// autre page, qu'un lien public servirait alors avec elle (AC-e1). Fichier à part de `write.ts` (borne de 300 lignes).
import { renderBlock } from "../../schemas"
import type { PlatformDb } from "../db"
import { inTransaction, PlatformError } from "../errors"
import type { Identity } from "../identity"
import type { DocBlock } from "./document"

/** Ce qu'un bloc `file` reprend de sa ligne. */
type FileMeta = { name: string; size: number; mime: string }

/** Le fichier qu'un bloc cite : l'identifiant d'un bloc `file` ou d'une image jointe, sinon `null`. */
function citedFile(block: DocBlock): string | null {
  if (block.type !== "file" && block.type !== "image") return null
  return typeof block.data.file_id === "string" ? block.data.file_id : null
}

/** Le refus d'AC-d3, le même pour un fichier inconnu, `pending`, d'un autre nœud ou d'une autre organisation. */
function notAttached(fileId: string, path: string): PlatformError {
  return new PlatformError("invalid_arguments", `File ${fileId} is not attached to ${path}: upload it to this page first.`)
}

/**
 * Une création (AC-d3) : aucun fichier n'est encore joint au nœud qu'elle crée. Le premier bloc qui cite un fichier est
 * refusé avant l'insertion du nœud, sauf en mode tolérant, où `attachFiles` le garde en texte.
 */
export function refuseFilesOnCreate(blocks: readonly DocBlock[], options: { path: string; tolerant: boolean }): void {
  if (options.tolerant) return
  for (const block of blocks) {
    const fileId = citedFile(block)
    if (fileId) throw notAttached(fileId, options.path)
  }
}

/** Les lignes `ready` jointes au nœud parmi `ids`, sous l'isolation de l'organisation. */
async function attachedRows(db: PlatformDb, identity: Identity, nodeId: string, ids: readonly string[]): Promise<Map<string, FileMeta>> {
  if (ids.length === 0) return new Map()
  const rows = await inTransaction(db, "files: attached", (sql) => sql<({ id: string } & FileMeta)[]>`
    select id, name, size::int as size, mime from platform.files
     where org_id = ${identity.org.id} and node_id = ${nodeId} and status = 'ready' and id = any(${ids}::uuid[])`)
  return new Map(rows.map(({ id, ...meta }) => [id, meta]))
}

/** Les métadonnées des blocs `file` et la largeur des images jointes que le document citait avant l'écriture. */
function citedBefore(current: readonly DocBlock[]): { ids: Set<string>; meta: Map<string, FileMeta>; widths: Map<string, unknown> } {
  const ids = new Set<string>()
  const meta = new Map<string, FileMeta>()
  const widths = new Map<string, unknown>()
  for (const block of current) {
    const fileId = citedFile(block)
    if (!fileId) continue
    ids.add(fileId)
    const { name, size, mime, width } = block.data
    if (block.type === "file" && typeof name === "string" && typeof size === "number" && typeof mime === "string") meta.set(fileId, { name, size, mime })
    if (block.type === "image" && width !== undefined) widths.set(fileId, width)
  }
  return { ids, meta, widths }
}

/** Un bloc `file` aux métadonnées de sa ligne ; le même objet quand elles y sont déjà. */
function withMeta<B extends DocBlock>(block: B, meta: FileMeta): B {
  const { name, size, mime } = block.data
  return name === meta.name && size === meta.size && mime === meta.mime ? block : { ...block, data: { ...block.data, ...meta } }
}

/**
 * Les blocs d'une écriture contrôlés par leurs fichiers (AC-d3), avant tout envoi en base de ce qu'elle écrit : chaque
 * fichier que le document ne citait pas encore est relu (`ready`, joint à ce nœud) ; absent, refusé, ou en mode tolérant
 * (E10-S01, AC-a2) gardé en texte dans un bloc `code`, compté dans `keptAsText`. Un bloc `file` prend les métadonnées de
 * la ligne, ou celles du bloc que le document portait déjà ; une image jointe réécrite sans largeur garde la sienne
 * (le markdown ne la porte pas, AC-b3). `created` : un nœud neuf n'a aucun fichier, rien n'est relu.
 */
export async function attachFiles<B extends DocBlock, A extends { blocks: B[]; keptAsText?: number }>(
  db: PlatformDb,
  identity: Identity,
  request: { node: { id: string; path: string }; current: readonly DocBlock[]; created: boolean; tolerant: boolean },
  applied: A,
): Promise<A> {
  const { node } = request
  const before = citedBefore(request.current)
  const wanted = new Set<string>()
  for (const block of applied.blocks) {
    const fileId = citedFile(block)
    if (fileId && (!before.ids.has(fileId) || (block.type === "file" && !before.meta.has(fileId)))) wanted.add(fileId)
  }
  const rows = request.created ? new Map<string, FileMeta>() : await attachedRows(db, identity, node.id, [...wanted])
  let kept = 0
  const blocks = applied.blocks.map((block): B => {
    const fileId = citedFile(block)
    if (!fileId) return block
    const meta = rows.get(fileId) ?? before.meta.get(fileId)
    // Un bloc `file` sans ligne relue ni bloc `file` antérieur (le fichier n'était cité que par une image) n'aurait que le
    // nom, la taille et le type du client : refusé comme un fichier non joint.
    const known = block.type === "file" ? meta !== undefined : rows.has(fileId) || before.ids.has(fileId)
    if (!known) {
      if (!request.tolerant) throw notAttached(fileId, node.path)
      kept++
      return { ...block, type: "code", text: renderBlock(block), data: {} }
    }
    if (block.type === "file" && meta) return withMeta(block, meta)
    if (block.type === "image" && block.data.width === undefined && before.widths.has(fileId)) return { ...block, data: { ...block.data, width: before.widths.get(fileId) } }
    return block
  })
  return kept === 0 ? { ...applied, blocks } : { ...applied, blocks, keptAsText: (applied.keptAsText ?? 0) + kept }
}
