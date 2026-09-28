// Liens sortants et entrants de l'en-tête de `read` (E03-S07, AC4, AC5, AC10 ; H57, N10, N11), lus dans
// `links` sans parcourir le contenu : sortants relus pour le lecteur (`resolveTargets` : chemin, alias,
// bloc visé ; une cible invisible est « sans cible ») ; entrants = les liens dont la cible est le nœud,
// ou nulle mais écrite vers son chemin ou l'un de ses anciens chemins, dont la source est lisible du
// lecteur (niveau ≥ 1 calculé en un lot, avant la borne de 20, HN-E01S07-8) : sous la RLS d'isolation
// d'E01-S08, `links` rend toutes les lignes de l'organisation, et le service filtre (H123). Sans lui,
// l'en-tête ne dirait ni ce que la page cite ni qui la cite. Fichier à part de `links.ts` (borne de 300 lignes).
//
// Repris de la maquette (`mcp-test/src/proto/services/read.ts` l. 38-44) : l'en-tête en lignes courtes
// `clé: valeur`. Retiré : l'équipe portée par une colonne du nœud (→ propriétaire hérité, H52).
import { NODE_PATH_PATTERN } from "../../schemas"
import { ACCESS_LEVELS, nodeLevels } from "../access"
import type { PlatformDb } from "../db"
import { inTransaction } from "../errors"
import type { Identity } from "../identity"
import type { Tx } from "../sql"
import { formatCount } from "./document"
import { LINKS_SHOWN } from "./limits"
import { resolveTargets, targetKey, type LinkTarget, type TargetResolution } from "./link-resolution"

/** Un lien sortant tel que `read` le sert en champs (`links_out`, AC4). */
export type LinkView = {
  path: string
  key?: string
  title?: string
  status: "ok" | "missing" | "moved"
  moved_to?: string
  key_found?: boolean
}

/** Une source d'un lien entrant (`links_in`) : son chemin et son titre. */
type IncomingView = { path: string; title: string }

type Side<T> = { links: T[]; total: number }

function compareTargets(a: LinkTarget, b: LinkTarget): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1
  if (a.key === b.key) return 0
  if (a.key === null || b.key === null) return a.key === null ? -1 : 1
  return a.key < b.key ? -1 : 1
}

function linkView(target: TargetResolution): LinkView {
  return {
    path: target.path,
    ...(target.key === null ? {} : { key: target.key }),
    ...(target.node ? { title: target.node.title } : {}),
    status: target.status,
    ...(target.status === "moved" && target.node ? { moved_to: target.node.path } : {}),
    ...(target.keyFound === undefined ? {} : { key_found: target.keyFound }),
  }
}

/**
 * Les liens sortants d'un nœud (AC4, AC5, AC10) : ses lignes `links`, filtrées par l'organisation dans
 * la requête ; un même chemin et une même clé cités par deux blocs comptent une fois ; triés par chemin
 * puis clé ; les 20 premiers relus pour le lecteur, le total compté.
 */
async function outgoingLinks(db: PlatformDb, identity: Identity, node: { id: string }): Promise<{ resolved: TargetResolution[]; total: number }> {
  const rows = await inTransaction(db, "links: outgoing", (sql) => sql<{ target_path: string; target_key: string | null }[]>`
    select target_path, target_key from platform.links where org_id = ${identity.org.id} and source_node_id = ${node.id}`)
  const targetsOf = rows.map((row): LinkTarget => ({ path: row.target_path, key: row.target_key }))
  const targets = [...new Map(targetsOf.map((target) => [targetKey(target), target])).values()].sort(compareTargets)
  return { resolved: await resolveTargets(db, identity, targets.slice(0, LINKS_SHOWN)), total: targets.length }
}

/** Les anciens chemins d'un nœud (`node_aliases`) dans l'organisation. */
async function oldPathsOf(sql: Tx, orgId: string, nodeId: string): Promise<string[]> {
  const rows = await sql<{ old_path: string }[]>`select old_path from platform.node_aliases where org_id = ${orgId} and node_id = ${nodeId}`
  return rows.map((row) => row.old_path)
}

type Source = { source_node_id: string }

/**
 * Les sources des liens d'un nœud en attente de cible, écrits vers l'un des chemins donnés (validés par
 * leur format avant le filtre) ; aucune lecture sans chemin.
 */
async function pendingAt(sql: Tx, orgId: string, paths: readonly string[]): Promise<Source[]> {
  const valid = paths.filter((path) => NODE_PATH_PATTERN.test(path))
  if (valid.length === 0) return []
  return sql<Source[]>`select source_node_id from platform.links where org_id = ${orgId} and target_node_id is null and target_path = any(${valid})`
}

/**
 * Les sources des liens entrants d'un nœud (AC4, AC5, AC10) : liens dont la cible est le nœud, ou nulle
 * et écrite vers son chemin ou l'un de ses anciens chemins, lus dans une transaction ; une ligne par
 * source, gardée si le lecteur la lit (niveau ≥ 1 en un lot, hors de la transaction), avant la borne de
 * 20 ; triées par chemin. Les liens vers le chemin courant se lisent en même temps que les anciens
 * chemins ; ceux vers les anciens chemins ensuite, pour un nœud déplacé seulement : une lecture en série
 * de moins pour les autres (N24).
 */
async function incomingLinks(db: PlatformDb, identity: Identity, node: { id: string; path: string }): Promise<Side<IncomingView>> {
  const org = identity.org.id
  const sources = await inTransaction(db, "links: incoming", async (sql) => {
    const [resolved, pendingHere, oldPaths] = await Promise.all([
      sql<Source[]>`select source_node_id from platform.links where org_id = ${org} and target_node_id = ${node.id}`,
      pendingAt(sql, org, [node.path]),
      oldPathsOf(sql, org, node.id),
    ])
    const pendingBefore = await pendingAt(sql, org, oldPaths)
    return [...new Set([...resolved, ...pendingHere, ...pendingBefore].map((row) => row.source_node_id))]
  })
  // Un filtre de liste compare `nodeLevels` à 1 seulement (`security-patterns.md § Droits dans le service`).
  const levels = await nodeLevels(db, identity, sources)
  const readable = sources.filter((id) => (levels.get(id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read)
  const nodes =
    readable.length === 0
      ? []
      : await inTransaction(db, "links: sources", (sql) => sql<{ id: string; path: string; title: string }[]>`
          select id, path, title from platform.nodes where org_id = ${org} and id = any(${readable})`)
  const sorted = nodes.map(({ path, title }) => ({ path, title })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { links: sorted.slice(0, LINKS_SHOWN), total: sorted.length }
}

/** « ventes/b#zzz — B (no block « zzz ») », « ventes/a/x → ventes/b/x (moved) », « ventes/grille (no target) ». */
function outgoingLabel(link: LinkView): string {
  const name = link.key === undefined ? link.path : `${link.path}#${link.key}`
  if (link.status === "missing") return `${name} (no target)`
  const noBlock = link.key_found === false ? `no block « ${link.key} »` : null
  if (link.status === "moved") return `${name} → ${link.moved_to} (${noBlock ? `moved, ${noBlock}` : "moved"})`
  return `${name} — ${link.title}${noBlock ? ` (${noBlock})` : ""}`
}

function sideLine<T>(label: string, side: Side<T>, format: (link: T) => string): string {
  if (side.total === 0) return `${label}: none`
  const more = side.total - side.links.length
  const entries = [...side.links.map(format), ...(more > 0 ? [`… and ${formatCount(more)} more`] : [])]
  return `${label} (${formatCount(side.total)}): ${entries.join(" · ")}`
}

/** Les deux lignes de l'en-tête, après les enfants (AC4) : `links in`, puis `links out`. */
function renderLinkLines(outgoing: Side<LinkView>, incoming: Side<IncomingView>): string[] {
  return [sideLine("links in", incoming, (link) => `${link.path} — ${link.title}`), sideLine("links out", outgoing, outgoingLabel)]
}

/**
 * Lignes et champs des liens d'un nœud pour `read` (AC4) : `links_out`, `links_in` et leurs totaux ;
 * `targets`, les cibles sortantes relues pour le lecteur, que les blocs `reference` du même `read`
 * reprennent sans les relire (N24).
 */
export async function linkHeader(
  db: PlatformDb,
  identity: Identity,
  node: { id: string; path: string },
): Promise<{ lines: string[]; data: Record<string, unknown>; targets: TargetResolution[] }> {
  // Les deux sens et leurs niveaux dans une transaction (E05-S10, partie c) : chacune coûte quatre allers-retours.
  const [outgoing, incoming] = await inTransaction(db, "links: header", () => Promise.all([outgoingLinks(db, identity, node), incomingLinks(db, identity, node)]))
  const out: Side<LinkView> = { links: outgoing.resolved.map(linkView), total: outgoing.total }
  return {
    lines: renderLinkLines(out, incoming),
    data: { links_out: out.links, links_in: incoming.links, links_out_total: out.total, links_in_total: incoming.total },
    targets: outgoing.resolved,
  }
}
