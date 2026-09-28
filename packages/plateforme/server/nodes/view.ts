// Ce qu'on sait d'un nœud autour de ses blocs (E03-S03, AC4, AC5, AC35) : son propriétaire effectif et
// qui le décrit, son parent et ses enfants visibles, les noms des membres. Partagé par `read`, `write`
// et `loadNode` (écran) ; chaque liste est filtrée par le service avant d'être servie (H123). Sans lui,
// `read.ts` et `write.ts` liraient chacun le propriétaire et les enfants.
import type { NodeKind, NodeView } from "../../schemas"
import { ACCESS_LEVELS, describeOwner, nodeLevels, nodeOwner, type Owner } from "../access"
import type { PlatformDb } from "../db"
import { inTransaction } from "../errors"
import { leadNames, memberDirectory, teamsWithLeads } from "../directory"
import type { Identity } from "../identity"
import { CHILDREN_SHOWN } from "./limits"
import { type NodeRow } from "./lookup"

/** Le propriétaire effectif d'un nœud (H52), lu par `node_owner` (`access.ts`) ; `null` s'il est introuvable. */
export async function ownerOf(db: PlatformDb, nodeId: string): Promise<Owner | null> {
  const owner = await nodeOwner(db, nodeId)
  return owner ? { kind: owner.kind, teamId: owner.teamId, userId: owner.userId } : null
}

/** L'équipe du journal (H07) : celle qui possède le nœud, sinon aucune. */
export function teamOf(owner: Owner | null): string | null {
  return owner?.kind === "team" ? owner.teamId : null
}

/** Les noms des membres de l'organisation, par personne (`memberDirectory`, `directory.ts`). */
export async function memberNames(db: PlatformDb, orgId: string): Promise<Map<string, string>> {
  return new Map((await memberDirectory(db, orgId)).map((member) => [member.userId, member.name]))
}

/**
 * La ligne `owner:` de `read` (AC4) et, quand `withPublisher`, à qui demander de publier (la partie
 * « à qui » d'`access.ts`, H68) : « organisation Acme Test », « team Ventes (lead: Claire Morel) »,
 * « you (personal) », « Claire Morel (personal) ».
 */
export async function ownerTexts(
  db: PlatformDb,
  identity: Identity,
  owner: Owner | null,
  withPublisher: boolean,
): Promise<{ line: string; publisher: string | null }> {
  if (!owner) return { line: "unknown", publisher: null }
  const publisher = withPublisher || owner.kind === "team" ? await describeOwner(db, identity, owner) : null
  if (owner.kind === "team") return { line: publisher ?? "", publisher }
  if (owner.kind === "org") return { line: `organisation ${identity.org.name}`, publisher }
  if (owner.userId === identity.user.id) return { line: "you (personal)", publisher }
  const name = (await memberNames(db, identity.org.id)).get(owner.userId ?? "") ?? "its owner"
  return { line: `${name} (personal)`, publisher }
}

/** Le propriétaire d'un nœud tel que l'écran le lit (AC35) : noms en champs. */
export async function ownerView(db: PlatformDb, identity: Identity, owner: Owner | null, names: Map<string, string>): Promise<NodeView["owner"]> {
  if (!owner || owner.kind === "org") return { kind: "org" }
  if (owner.kind === "user") return { kind: "user", userName: names.get(owner.userId ?? ""), you: owner.userId === identity.user.id }
  // Une équipe propriétaire porte son id (`nodes_owner_check`) : sans lui, rien à lire (jamais un id vide, `22P02`).
  const teamId = owner.teamId
  if (!teamId) return { kind: "team" }
  const [data] = await inTransaction(db, "nodes: owner team", (sql) => teamsWithLeads(sql, identity.org.id, teamId))
  const leadName = leadNames(data?.leads ?? [], (userId) => names.get(userId)).join(", ")
  return { kind: "team", teamName: data?.name, leadName: leadName || undefined }
}

export type ChildRow = { id: string; path: string; title: string; summary: string; kind: NodeKind; status: "draft" | "published" }

type ChildRead = Omit<ChildRow, "kind" | "status"> & { kind: string; status: string; position: number | null }

/**
 * L'ordre des chemins des enfants et de l'arbre (AC5, AC36) : par unités de code, en mémoire, après
 * la lecture ; il ne dépend pas de la collation de la base de l'hôte.
 */
export function comparePaths(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

/**
 * L'ordre des frères (E05-S10, AC-b9) : par `position`, les nœuds sans position ensuite, puis par
 * chemin. Sans position posée, l'ordre des chemins d'avant la story (HN-E05S10e-1).
 */
export function compareSiblings(a: { path: string; position: number | null }, b: { path: string; position: number | null }): number {
  if (a.position !== b.position) {
    if (a.position === null) return 1
    if (b.position === null) return -1
    return a.position - b.position
  }
  return comparePaths(a, b)
}

/** Le parent et les enfants visibles d'un nœud (`familyOf`). */
export type Family = { parent: { path: string; title: string } | null; children: ChildRow[]; total: number }

/**
 * Le parent d'un nœud s'il est visible (niveau ≥ 1 ; `null` pour la racine ou un parent invisible, H68) et
 * ses enfants visibles (AC5, N5), dans l'ordre des frères (`compareSiblings`, E05-S10 : par position, puis par
 * chemin) : parent et enfants lus en une lecture (la face SQL n'a pas la coupe de `max_rows`, N48), niveaux en
 * un lot, dans une transaction (E05-S10, partie c : deux lectures et deux lots de niveaux de moins) ; niveau ≥ 1
 * gardé (un enfant à la corbeille vaut 0) ; la borne de 50 s'applique après ce filtre (HN-E01S07-8) ; `total`
 * compte les enfants visibles.
 */
export async function familyOf(db: PlatformDb, identity: Identity, node: NodeRow): Promise<Family> {
  // Lus par id, comme les pages de PostgREST l'étaient : un ordre sans rapport avec le chemin, que seul le tri
  // en mémoire range. Sans `order by`, la base rend souvent l'ordre d'écriture, qui peut être celui des
  // chemins : le test d'AC5 (E03-S03) ne prouvait plus ce tri (HN-E01S10-b1-7).
  const { rows, levels } = await inTransaction(db, "nodes: family", async (sql) => {
    const read = await sql<(ChildRead & { is_parent: boolean })[]>`
      select id, path, title, summary, kind, status, position, id = ${node.parent_id} is true as is_parent from platform.nodes
       where org_id = ${identity.org.id} and (parent_id = ${node.id} or id = ${node.parent_id}) order by id`
    // Un filtre de liste compare `nodeLevels` à 1 seulement (`security-patterns.md § Droits dans le service`).
    return { rows: read, levels: await nodeLevels(db, identity, read.map((row) => row.id)) }
  })
  const readable = rows.filter((row) => (levels.get(row.id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read)
  const parent = readable.find((row) => row.is_parent)
  const visible = readable.filter((row) => !row.is_parent).sort(compareSiblings)
  const children = visible.slice(0, CHILDREN_SHOWN).map((row) => ({ id: row.id, path: row.path, title: row.title, summary: row.summary, kind: kindOf(row.kind), status: statusOf(row.status) }))
  return { parent: parent ? { path: parent.path, title: parent.title } : null, children, total: visible.length }
}

/** Le genre d'un nœud (colonne texte sous contrainte `check`, ADR-011 § 1). */
export function kindOf(value: string): NodeKind {
  return value === "procedure" || value === "context" || value === "table" ? value : "page"
}

/** Le statut d'un nœud (colonne texte sous contrainte `check`). */
export function statusOf(value: string): "draft" | "published" {
  return value === "published" ? "published" : "draft"
}
