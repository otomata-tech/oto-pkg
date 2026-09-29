// Le segment d'un chemin tiré d'un titre, et le premier chemin libre (E05-S10 : adresse qui suit le titre,
// AC-b12 ; copie d'un sous-arbre, AC-b10 ; restauration sous un ancêtre, AC-b11). Sans lui, chacun de ces
// gestes tirerait son segment et chercherait son chemin libre à sa façon.
import { slugOf } from "../../schemas/nodes"
import type { PlatformDb } from "../db"
import { inTransaction } from "../errors"
import type { Identity } from "../identity"
import { ROOT_PATH } from "./lookup"

/** Longueur d'un segment tiré d'un titre (HN-E05S10e-5). */
export const SEGMENT_MAX = 60

/** Le segment d'un titre sans lettre ni chiffre, comme la création depuis le rail (HN-E05S10b-3). */
export const UNTITLED_SEGMENT = "sans_titre"

// Le segment d'un texte vit dans `schemas/nodes.ts` depuis E10-S01, que l'écran lit aussi ; les services le lisent ici.
export { slugOf }

/** Le segment d'un titre (AC-b12) : `Tarifs 2026` → `tarifs_2026` ; `sans_titre` sans lettre ni chiffre. */
export function titleSegment(title: string): string {
  return slugOf(title, SEGMENT_MAX) || UNTITLED_SEGMENT
}

/** Le chemin d'un enfant : `ventes` + `x` → `ventes/x` ; sous la racine, le segment seul (H50). */
export function childPath(parent: string, segment: string): string {
  return parent === ROOT_PATH ? segment : `${parent}/${segment}`
}

/** Le dernier segment d'un chemin. */
export function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}

/** Le suffixe d'un chemin libre après son segment : `_2`, `_3`… (ni `_1`, ni zéro en tête). */
const SUFFIX_PATTERN = /^_[1-9][0-9]*$/

/**
 * Le premier chemin libre sous `parent` parmi `<segment>`, `<segment>_2`, `<segment>_3`…, sans borne (E01-S12
 * partie c : cinq « Sans titre » à la corbeille ne bloquent plus une création) : ni un autre nœud que
 * `nodeId` (corbeille comprise, visible ou non), ni l'ancien chemin d'un autre nœud que lui (le nœud garde
 * son chemin ou reprend un ancien, M02), en une lecture des chemins du parent qui commencent par le segment.
 */
export async function freePath(db: PlatformDb, identity: Identity, place: { parent: string; segment: string; nodeId?: string }): Promise<string> {
  const base = childPath(place.parent, place.segment)
  const org = identity.org.id
  const nodeId = place.nodeId ?? null
  // Les chemins frères qui commencent par `base`, sans descendant (aucun `/` après lui).
  const taken = await inTransaction(db, "nodes: free path", (sql) => sql<{ path: string }[]>`
    select path from platform.nodes
     where org_id = ${org} and starts_with(path, ${base}) and strpos(substr(path, ${base.length + 1}), '/') = 0
       and id is distinct from ${nodeId}::uuid
    union
    select old_path as path from platform.node_aliases
     where org_id = ${org} and starts_with(old_path, ${base}) and strpos(substr(old_path, ${base.length + 1}), '/') = 0
       and node_id is distinct from ${nodeId}::uuid`)
  const used = new Set(taken.map((row) => row.path).filter((path) => path === base || SUFFIX_PATTERN.test(path.slice(base.length))))
  if (!used.has(base)) return base
  // `used` est fini : le premier rang libre est au plus `used.size + 1`.
  let rank = 2
  while (used.has(`${base}_${rank}`)) rank++
  return `${base}_${rank}`
}
