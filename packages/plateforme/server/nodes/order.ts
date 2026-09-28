// L'ordre des frères (E05-S10, AC-b9) : un nœud se range entre deux frères, pour tout le monde, par sa
// `position` (double, comme celle d'un bloc : `positionBetween`, E01-S06 N7). Un parent dont les enfants
// n'ont pas encore de position (tout l'arbre d'avant la story, HN-E05S10e-1) les reçoit d'abord dans
// l'ordre servi (par chemin), puis le nœud s'insère ; un écart devenu trop petit renumérote de même.
// Ranger n'est pas modifier : la base garde `updated_at` quand seule `position` change (déclencheur
// `set_updated_at_position`, HN-E05S10e-1).
// Décidé par le service : la gestion du nœud, comme « Déplacer » (`requireNodeLevel`, action `move`) ;
// le frère visé doit être visible et du même parent. Sans lui, le rail ne range que par chemin.
import { placeNodeSchema } from "../../schemas"
import { ACCESS_LEVELS, requireNodeLevel } from "../access"
import type { PlatformDb } from "../db"
import { changedMeanwhile, inTransaction, invalidInput, PlatformError } from "../errors"
import type { Identity } from "../identity"
import type { Mutation } from "../members"
import type { Tx } from "../sql"
import { positionBetween } from "./document"
import { POSITION_STEP } from "./limits"
import { findNode, unknownNode } from "./lookup"
import { compareSiblings, ownerOf, teamOf } from "./view"

type Sibling = { id: string; path: string; position: number | null }

/** Les frères vivants sous `parentId`, dans leur ordre (`compareSiblings`) ; une lecture dans la transaction. */
async function siblingsOf(sql: Tx, orgId: string, parentId: string): Promise<Sibling[]> {
  const rows = await sql<Sibling[]>`
    select id, path, position from platform.nodes where org_id = ${orgId} and parent_id = ${parentId} and deleted_at is null`
  return [...rows].sort(compareSiblings)
}

/** Les frères renumérotés dans leur ordre, `POSITION_STEP` × rang, en une écriture ; rend la liste à jour. */
async function renumber(sql: Tx, orgId: string, siblings: readonly Sibling[]): Promise<Sibling[]> {
  const numbered = siblings.map((sibling, index) => ({ ...sibling, position: POSITION_STEP * (index + 1) }))
  if (numbered.length === 0) return numbered
  await sql`
    update platform.nodes as n set position = u.position
      from (select unnest(${numbered.map((sibling) => sibling.id)}::uuid[]) as id,
                   unnest(${numbered.map((sibling) => sibling.position)}::float8[]) as position) u
     where n.org_id = ${orgId} and n.id = u.id`
  return numbered
}

/**
 * La position d'un nœud juste après le frère `afterId` (en tête avec `null`), parmi les frères de
 * `parentId` hors de `movingId` (le nœud qu'on range, ou aucun pour un nœud neuf) ; les frères reçoivent
 * d'abord une position s'il en manque une, ou si l'écart est trop petit. Dans la transaction de l'appelant.
 */
export async function positionAfter(
  sql: Tx,
  orgId: string,
  place: { parentId: string; afterId: string | null; movingId: string | null },
): Promise<number> {
  const read = (await siblingsOf(sql, orgId, place.parentId)).filter((sibling) => sibling.id !== place.movingId)
  const siblings = read.some((sibling) => sibling.position === null) ? await renumber(sql, orgId, read) : read
  const at = place.afterId === null ? -1 : siblings.findIndex((sibling) => sibling.id === place.afterId)
  if (place.afterId !== null && at === -1) throw new PlatformError("invalid_arguments", "The sibling to place it after is not under the same parent.")
  const between = (list: readonly Sibling[]) => positionBetween(list[at]?.position ?? null, list[at + 1]?.position ?? null)
  const position = between(siblings)
  if (position !== null) return position
  const spaced = await renumber(sql, orgId, siblings)
  return between(spaced) ?? POSITION_STEP * (at + 1.5)
}

/**
 * Range un nœud juste après son frère `after`, en tête avec `null` (AC-b9) : `input` validé par
 * `placeNodeSchema` ; le nœud et le frère lus par `findNode` (inconnus ou invisibles : `not_found`) ; la
 * gestion du nœud exigée avant toute écriture ; le frère doit être du même parent. Une écriture de la
 * position du nœud, gardée par son parent : un nœud déplacé entre-temps rend `conflict`.
 */
export async function placeNode(db: PlatformDb, identity: Identity, input: unknown): Promise<Mutation<{ path: string; after: string | null }>> {
  const parsed = placeNodeSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const { path, after } = parsed.data
  const found = await findNode(db, identity, path)
  if (!found) throw unknownNode(path, identity.org.prefix)
  const { node } = found
  if (node.parent_id === null) throw new PlatformError("invalid_arguments", `${node.path} is the root of the tree: it has no siblings.`)
  if (found.level < ACCESS_LEVELS.manage) await requireNodeLevel(db, identity, { id: node.id, path: node.path }, "move")
  const sibling = after === null ? null : await findNode(db, identity, after)
  if (after !== null && !sibling) throw unknownNode(after, identity.org.prefix)
  if (sibling && (sibling.node.id === node.id || sibling.node.parent_id !== node.parent_id)) {
    throw new PlatformError("invalid_arguments", `${sibling.node.path} is not a sibling of ${node.path}: move ${node.path} under the same parent first.`)
  }
  const parentId = node.parent_id
  await inTransaction(db, "nodes: position", async (sql) => {
    const position = await positionAfter(sql, identity.org.id, { parentId, afterId: sibling?.node.id ?? null, movingId: node.id })
    const written = await sql`
      update platform.nodes set position = ${position}
       where org_id = ${identity.org.id} and id = ${node.id} and parent_id = ${parentId} and deleted_at is null
      returning id`
    if (written.length === 0) throw changedMeanwhile("placeNode", node.id, `${node.path} moved meanwhile: reload the tree and try again.`)
  })
  return { data: { path: node.path, after: sibling?.node.path ?? null }, target: node.path, teamId: teamOf(await ownerOf(db, node.id)) }
}
