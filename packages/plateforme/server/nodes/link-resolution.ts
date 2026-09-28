// Résolution des cibles des liens `[[…]]` et des blocs `reference` (E03-S07, H57, H68, H123 ; N2,
// N11) : pour chaque `{ path, key }`, le nœud de l'organisation à ce chemin, sinon celui dont c'est un
// ancien chemin (alias), puis le bloc publié que vise la clé. Une requête par étape pour toutes les
// cibles, jamais une par lien (`database-patterns.md § N+1 Queries`) ; le niveau de tous les nœuds
// trouvés est calculé en un lot (`nodeLevels`) : un nœud de niveau 0 vaut absent (H68), même quand la
// base le rend. Sans lui, `read` ne relirait pas un lien pour son lecteur, ni la publication ne dirait
// quels liens n'ont pas de cible. Fichier à part de `links.ts` pour la borne de 300 lignes.
//
// Repris d'Oto (`oto_mcp/db/backlinks.py` l. 1-30) : un lien sans cible reste un lien, dit comme tel.
// Retiré : la résolution par titre, la portée par projet, l'ambiguïté entre titres (un chemin est unique).
import { NODE_PATH_PATTERN } from "../../schemas"
import { ACCESS_LEVELS, nodeLevels } from "../access"
import type { PlatformDb } from "../db"
import { inTransaction } from "../errors"
import type { Identity } from "../identity"
import type { Tx } from "../sql"
import { resolveBlockRef, type DocBlock } from "./document"

/** Une cible : le chemin écrit et la clé d'un bloc (`[[chemin#clé]]`), nulle sans `#`. */
export type LinkTarget = { path: string; key: string | null }

/** Ce qu'on sert d'une cible : son chemin courant, son titre, son résumé et son genre. */
export type TargetNode = { id: string; path: string; title: string; summary: string; kind: string }

/**
 * Une cible relue pour l'appelant : `ok` (le nœud est à ce chemin), `moved` (c'est un ancien chemin du
 * nœud, `movedFrom`), `missing` (ni l'un ni l'autre, ou invisible) ; `keyFound` pour une clé, cherchée
 * dans les blocs publiés du nœud comme une référence courte (`resolveBlockRef`, N2).
 */
export type TargetResolution = LinkTarget & {
  status: "ok" | "moved" | "missing"
  node?: TargetNode
  movedFrom?: string
  keyFound?: boolean
}

/** Clé d'une cible dans une carte : le chemin, puis la clé. */
export function targetKey(target: LinkTarget): string {
  return `${target.path}#${target.key ?? ""}`
}

type Alias = { old_path: string; node_id: string }

/** Les alias de l'organisation aux chemins donnés : l'ancien chemin et le nœud qui l'a quitté ; aucune lecture sans chemin. */
async function aliasesAt(sql: Tx, orgId: string, paths: readonly string[]): Promise<Alias[]> {
  if (paths.length === 0) return []
  return sql<Alias[]>`select old_path, node_id from platform.node_aliases where org_id = ${orgId} and old_path = any(${paths})`
}

/** Les nœuds de l'organisation aux chemins donnés ; aucune lecture sans chemin. */
async function nodesByPath(sql: Tx, orgId: string, paths: readonly string[]): Promise<TargetNode[]> {
  if (paths.length === 0) return []
  return sql<TargetNode[]>`select id, path, title, summary, kind from platform.nodes where org_id = ${orgId} and path = any(${paths})`
}

/** Les nœuds de l'organisation aux identifiants donnés ; aucune lecture sans identifiant. */
async function nodesById(sql: Tx, orgId: string, ids: readonly string[]): Promise<TargetNode[]> {
  if (ids.length === 0) return []
  return sql<TargetNode[]>`select id, path, title, summary, kind from platform.nodes where org_id = ${orgId} and id = any(${ids})`
}

/**
 * Les blocs publiés des nœuds donnés, réduits à ce qu'une référence courte lit (id, clé), par nœud :
 * lignes de tableau comprises (`[[ventes/suivi_prospects#P-001]]`). Lus après la décision : ces nœuds
 * sont visibles de l'appelant. Aucune lecture sans nœud.
 */
async function publishedRefs(db: PlatformDb, identity: Identity, nodeIds: readonly string[]): Promise<Map<string, Pick<DocBlock, "id" | "key">[]>> {
  const byNode = new Map<string, Pick<DocBlock, "id" | "key">[]>()
  if (nodeIds.length === 0) return byNode
  const rows = await inTransaction(db, "links: target blocks", (sql) => sql<{ id: string; key: string | null; node_id: string }[]>`
    select id, key, node_id from platform.blocks where org_id = ${identity.org.id} and state = 'published' and node_id = any(${nodeIds})`)
  for (const { id, key, node_id } of rows) byNode.set(node_id, [...(byNode.get(node_id) ?? []), { id, key }])
  return byNode
}

/**
 * Chaque chemin et le nœud visible qu'il désigne : le nœud qui l'occupe, sinon celui dont c'est un ancien
 * chemin. Nœuds par chemin, alias des chemins restants et leurs nœuds : une lecture par étape, dans une
 * transaction ; les niveaux ensuite, hors d'elle.
 */
async function placesOf(db: PlatformDb, identity: Identity, paths: readonly string[]): Promise<Map<string, { node: TargetNode; movedFrom?: string }>> {
  const org = identity.org.id
  const { byPath, aliases, moved } = await inTransaction(db, "links: targets", async (sql) => {
    const found = new Map((await nodesByPath(sql, org, paths)).map((node) => [node.path, node]))
    // Un chemin occupé, même par un nœud invisible, n'est l'ancien chemin d'aucun autre (M02).
    const old = await aliasesAt(sql, org, paths.filter((path) => !found.has(path)))
    const targets = await nodesById(sql, org, [...new Set(old.map((alias) => alias.node_id))])
    return { byPath: found, aliases: old, moved: new Map(targets.map((node) => [node.id, node])) }
  })
  // Un filtre de liste compare `nodeLevels` à 1 seulement (`security-patterns.md § Droits dans le service`).
  const levels = await nodeLevels(db, identity, [...byPath.values(), ...moved.values()].map((node) => node.id))
  const visible = (node: TargetNode) => (levels.get(node.id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read
  const places = new Map<string, { node: TargetNode; movedFrom?: string }>()
  for (const [path, node] of byPath) if (visible(node)) places.set(path, { node })
  for (const alias of aliases) {
    const node = moved.get(alias.node_id)
    if (node && visible(node)) places.set(alias.old_path, { node, movedFrom: alias.old_path })
  }
  return places
}

/**
 * Chaque cible relue pour l'appelant, dans l'ordre reçu (N2, N11) : nœuds par chemin, puis alias des
 * chemins restants et leurs nœuds, niveaux de tous les nœuds trouvés en un lot, puis blocs publiés des
 * nœuds dont une clé est demandée ; une requête par étape, jamais une par cible. Une cible invisible
 * (niveau 0) est `missing`, comme une cible absente (H68), et un chemin hors du format H51 aussi, sans
 * aller dans un filtre (`security-patterns.md § SQL Injection Prevention`).
 */
export async function resolveTargets(db: PlatformDb, identity: Identity, targets: readonly LinkTarget[]): Promise<TargetResolution[]> {
  if (targets.length === 0) return []
  const paths = [...new Set(targets.map((target) => target.path))].filter((path) => NODE_PATH_PATTERN.test(path))
  const places = await placesOf(db, identity, paths)
  const keyed = targets.flatMap((target) => {
    const id = target.key === null ? undefined : places.get(target.path)?.node.id
    return id === undefined ? [] : [id]
  })
  const blocks = await publishedRefs(db, identity, [...new Set(keyed)])
  return targets.map((target) => {
    const place = places.get(target.path)
    if (!place) return { ...target, status: "missing" }
    const keyFound = target.key === null ? undefined : "block" in resolveBlockRef(blocks.get(place.node.id) ?? [], target.key)
    return {
      ...target,
      status: place.movedFrom === undefined ? "ok" : "moved",
      node: place.node,
      ...(place.movedFrom === undefined ? {} : { movedFrom: place.movedFrom }),
      ...(keyFound === undefined ? {} : { keyFound }),
    }
  })
}
