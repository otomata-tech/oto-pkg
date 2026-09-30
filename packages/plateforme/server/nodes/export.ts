// `GET /api/platform/nodes/export?path=` (E10-S01, AC-a5) : le `.md` d'une page, d'une procédure ou d'un
// Contexte publiés, pour « Télécharger en .md » du rail. La lecture est exigée avant toute requête sur les blocs
// (`findNode`, niveau d'`access.ts`) ; le fichier est composé par `pageMarkdown` (`schemas/blocks-render.ts`, que
// l'écran lit aussi), sans références de blocs. Sans lui, une page ne sort de la plateforme que copiée à la main.
// Un export n'est pas journalisé, comme toute lecture (HN-E10S01-18, décision de JB du 2026-09-29).
import { nodeExportQuerySchema, pageMarkdown } from "../../schemas"
import type { PlatformDb } from "../db"
import { invalidInput, PlatformError } from "../errors"
import type { Identity } from "../identity"
import { findNode } from "./lookup"
import { lastSegment } from "./segments"
import { loadBlocks } from "./store"

/** Un fichier rendu à l'écran (AC-a5, AC-b6), qui en fait un téléchargement. */
export type ExportedFile = { filename: string; content: string }

/** Le chemin d'un export (`?path=`), validé par le schéma partagé avec `tables/export`. */
export function exportPath(query: unknown): string {
  const parsed = nodeExportQuerySchema.safeParse(query)
  if (!parsed.success) throw invalidInput(parsed.error)
  return parsed.data.path
}

/**
 * Le `.md` d'un nœud (AC-a5) : illisible ou inconnu, `not_found` ; un tableau, ou un nœud jamais publié,
 * `invalid_arguments` ; sinon `# <titre>`, une ligne vide et le rendu des blocs publiés.
 */
export async function exportNode(db: PlatformDb, identity: Identity, query: unknown): Promise<ExportedFile> {
  const path = exportPath(query)
  const found = await findNode(db, identity, path)
  if (!found) throw new PlatformError("not_found", `Unknown path ${path}.`)
  const { node } = found
  if (node.kind === "table") throw new PlatformError("invalid_arguments", `${node.path} is a table: use tables/export`)
  if (node.revision === 0) throw new PlatformError("invalid_arguments", `${node.path} has no published version`)
  const blocks = await loadBlocks(db, node.id, "published")
  return { filename: `${lastSegment(node.path)}.md`, content: pageMarkdown(node.title, blocks) }
}
