// « Dupliquer » (E05-S10, AC-b10 ; HN-E05S10e-6) : un nœud et son sous-arbre copiés sous le même parent,
// juste après l'original, sous « <titre> (copie) » et un chemin neuf tiré de ce titre ; blocs publiés et
// lignes d'un tableau compris ; ni règle d'accès ni propriétaire explicite (la copie hérite de son
// parent) ; les descendants que la personne ne lit pas restent (et ce qui est sous eux). Décidé par le
// service seul (ADR-012 § 3) : lire le nœud et chaque descendant copié, écrire sous son parent ; puis
// `duplicate_subtree`, une transaction, qui ne calcule aucun niveau et borne sous le verrou de l'arbre
// l'organisation et la forme de la copie (HN-E05S10e-18). Sans lui, un contenu ne se copie pas.
import { nodePathBodySchema } from "../../schemas"
import { ACCESS_LEVELS, describeOwner, nodeLevel, nodeLevels, reservedTo } from "../access"
import type { PlatformDb } from "../db"
import { inTransaction, invalidInput, PlatformError } from "../errors"
import type { Identity } from "../identity"
import type { Mutation } from "../members"
import { findNode, notAvailable, parentPath, ROOT_PATH, unknownNode, type NodeRow } from "./lookup"
import { structureOf } from "./move"
import { positionAfter } from "./order"
import { freePath, lastSegment, titleSegment } from "./segments"
import { ownerOf, teamOf } from "./view"

const TITLE_MAX = 200
const COPY_SUFFIX = " (copie)"

/** « Tarifs (copie) », coupé pour tenir en 200 caractères. */
export function copyTitle(title: string): string {
  return `${title.slice(0, TITLE_MAX - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`
}

/** Ce que l'arbre garde en place ne se duplique pas : la racine, `private`, un espace personnel, un Contexte, le dossier d'une équipe. */
async function refuseStructure(db: PlatformDb, identity: Identity, node: NodeRow): Promise<void> {
  const structure = await structureOf(db, identity, node)
  if (!structure) return
  const what: Record<typeof structure.kind, string> = {
    root: "the root of the tree",
    private: "the folder of the personal spaces",
    space: "a personal space",
    context: "a Contexte",
    team: "the folder of a team",
  }
  throw new PlatformError("invalid_arguments", `${node.path} cannot be duplicated: it is ${what[structure.kind]}. Duplicate the pages inside it instead.`)
}

/**
 * Les descendants vivants du nœud que la personne lit, chacun sous un parent copié (le nœud ou un
 * descendant gardé), dans l'ordre des chemins (un parent avant ses enfants).
 */
async function copiedDescendants(db: PlatformDb, identity: Identity, node: NodeRow): Promise<string[]> {
  const rows = await inTransaction(db, "duplicate: descendants", (sql) => sql<{ id: string; parent_id: string; path: string }[]>`
    select id, parent_id, path from platform.nodes
     where org_id = ${identity.org.id} and deleted_at is null and starts_with(path, ${`${node.path}/`})`)
  const levels = await nodeLevels(db, identity, rows.map((row) => row.id))
  const kept = new Set([node.id])
  for (const row of [...rows].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (kept.has(row.parent_id) && (levels.get(row.id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read) kept.add(row.id)
  }
  kept.delete(node.id)
  return [...kept]
}

/**
 * Duplique un nœud et son sous-arbre (AC-b10) : le nœud lu par `findNode` (lecture) ; ce que l'arbre garde
 * en place refusé ; l'écriture exigée sous son parent ; puis, dans une transaction, sa position juste après
 * l'original et `duplicate_subtree`. Rend le chemin de la copie et le nombre de nœuds copiés.
 */
export async function duplicateNode(db: PlatformDb, identity: Identity, input: unknown): Promise<Mutation<{ path: string; from: string; count: number }>> {
  const parsed = nodePathBodySchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const found = await findNode(db, identity, parsed.data.path)
  if (!found) throw unknownNode(parsed.data.path, identity.org.prefix)
  const { node } = found
  await refuseStructure(db, identity, node)
  const parentId = node.parent_id
  const parentAt = parentPath(node.path) ?? ROOT_PATH
  if (!parentId) throw new PlatformError("invalid_arguments", `${node.path} cannot be duplicated: it is the root of the tree.`)
  if ((await nodeLevel(db, identity, parentId)) < ACCESS_LEVELS.write) {
    const owner = await ownerOf(db, parentId)
    throw new PlatformError("forbidden", reservedTo("write", `under ${parentAt}`, owner ? await describeOwner(db, identity, owner) : "its managers"))
  }
  const descendants = await copiedDescendants(db, identity, node)
  const title = copyTitle(node.title)
  const path = await freePath(db, identity, { parent: parentAt, segment: titleSegment(title) })
  const copies = await inTransaction(db, "duplicate: copy", async (sql) => {
    const position = await positionAfter(sql, identity.org.id, { parentId, afterId: node.id, movingId: null })
    return sql<{ copy_path: string }[]>`
      select copy_path from platform.duplicate_subtree(p_source => ${node.id}, p_nodes => ${descendants}::uuid[],
                                                       p_segment => ${lastSegment(path)}, p_title => ${title}, p_position => ${position})`
  }).catch((error: unknown) => {
    // Le chemin pris entre la lecture et la copie (la fonction revérifie sous le verrou de l'arbre).
    throw error instanceof PlatformError && error.code === "conflict" ? notAvailable(path) : error
  })
  // La copie hérite du propriétaire de son parent : l'équipe du journal est la sienne.
  return { data: { path, from: node.path, count: copies.length }, target: path, teamId: teamOf(await ownerOf(db, parentId)) }
}
