// L'adresse qui suit le titre (E05-S10, AC-b12 ; HN-E05S10e-5) : quand un titre changé est publié (par
// l'écran, par `write` d'un assistant ou par `admin_node publish` : `publishNode`), le chemin du nœud
// devient celui du titre (`Tarifs 2026` → `ventes/tarifs_2026`, le premier libre), et celui de son
// sous-arbre avec lui. C'est un déplacement sous le même parent, par `moveNode` (E03-S07), à l'action
// `rename` : le niveau écriture, que la publication exige déjà (E11-S02, HN-E11S02-18), et l'écriture sur
// le parent ; même mise à jour gardée, et la base inscrit
// chaque ancien chemin dans `node_aliases` : un lien, un assistant ou un marque-page qui le citent arrivent
// toujours. Ce que l'arbre garde en place (racine, espaces, Contexte, dossier d'équipe) garde son chemin.
// Sans lui, un nœud créé depuis le rail resterait à `sans_titre` (HN-E05S10b-3).
import { inTransaction, isPlatformError } from "../errors"
import type { PlatformDb } from "../db"
import type { Identity } from "../identity"
import { parentPath, ROOT_PATH, type NodeRow } from "./lookup"
import { moveNode, structureOf } from "./move"
import { freePath, titleSegment } from "./segments"

/** La ligne d'un résultat qui dit la nouvelle adresse (`write`, `admin_node publish`). */
export function renamedLine(renamed: { from: string; to: string }): string {
  return `Renamed: now at ${renamed.to}; the old path ${renamed.from} still leads here.`
}

/**
 * Après une publication (AC-b12) : le titre publié, relu ; s'il n'est plus celui d'avant (`node`, lu
 * avant la publication), le nœud va au chemin de ce titre. `null` quand le titre n'a pas changé, que le
 * chemin le suit déjà, que le nœud reste en place par construction, ou que le déplacement est refusé :
 * la publication a eu lieu, un refus ici (course, droit retiré entre-temps) part au log et le nœud garde
 * son chemin.
 */
export async function followTitle(db: PlatformDb, identity: Identity, node: NodeRow): Promise<{ from: string; to: string } | null> {
  const [current] = await inTransaction(db, "nodes: published title", (sql) => sql<{ title: string }[]>`
    select title from platform.nodes where org_id = ${identity.org.id} and id = ${node.id}`)
  if (!current || current.title === node.title) return null
  if (await structureOf(db, identity, node)) return null
  const parent = parentPath(node.path) ?? ROOT_PATH
  try {
    // Le premier chemin libre du titre, le nœud et ses anciens chemins comptés libres : quand le chemin
    // suit déjà le titre (`tarifs`, ou `tarifs_2` quand `tarifs` est pris), c'est le sien, et rien ne bouge.
    const to = await freePath(db, identity, { parent, segment: titleSegment(current.title), nodeId: node.id })
    if (to === node.path) return null
    // D125 : si `to` a été pris entre-temps, `moveNode` prend lui-même le chemin libre suivant ; le chemin rendu
    // est celui qu'il a pris (revue de M68).
    const moved = await moveNode(db, identity, { path: node.path, new_path: to }, "rename")
    return { from: node.path, to: moved.target }
  } catch (error) {
    if (!isPlatformError(error)) throw error
    console.error("[platform] followTitle: path kept", node.id, error.code)
    return null
  }
}
