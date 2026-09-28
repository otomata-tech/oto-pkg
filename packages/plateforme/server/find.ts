// `find` (ADR-011 § 4, H44) : la longue traîne, au-delà de ce que `context` reconnaît. Nœuds et contenu
// par `search_content` (E01-S06, classement de M06) : titre, puis résumé, puis blocs publiés, lignes de
// tableau comprises. Le service ne garde que les nœuds que la personne lit (`nodeLevels`, H123, N22),
// les regroupe en trois nœuds au plus avec leurs emplacements, puis cherche les fonctions actives du
// catalogue, un nom exact en tête. Sans ce module, `find` répond « Not available yet ».
//
// Repris de la maquette (`mcp-test/src/proto/services/find.ts` l. 10-66) : textes des fonctions, nom
// exact en tête, fonctions sans `type`, « No match » en résultat. Retiré : `rankCandidates` pour les
// nœuds (→ `search_content`), « its "Étapes" section », la ligne « The best match is weak » (N14).
// Repris d'Oto (`oto_mcp/search.py` l. 63-65 et 223-235) : un extrait sur une ligne, une liste coupée
// qui le dit (N15, N16). Retiré : fusion de sources, sémantique, `limit` en argument, projets.
import { blockRef } from "../schemas"
import { ACCESS_LEVELS, nodeLevels } from "./access"
import type { CatalogFunction } from "./catalog/define"
import { findFunction, isActive, looksLikeFunction, searchFunctions } from "./catalog/registry"
import type { PlatformDb } from "./db"
import { inTransaction } from "./errors"
import type { Identity } from "./identity"
import { clip, MAX_TARGET_CHARS } from "./journal"
import { formatScore, roundScore } from "./routing"
import type { ToolOutput } from "./tool-output"

/** Nœuds et fonctions servis au plus : la description figée de `find` le promet (N13). */
const FIND_LIMIT = 3
/** `p_limit` de `search_content`, sa borne : les emplacements des trois premiers nœuds y sont presque toujours. */
const SEARCH_ROWS = 50
/** Un rang de `search_content` est dans [0, 3] (titre, résumé, bloc) ; le score d'un nœud, dans [0, 1]. */
const RANK_SPAN = 3

export type FindType = "procedure" | "page" | "table" | "function"

/** Genres cherchés par `type` ; un Contexte se cherche comme une page (N12). */
const KINDS: Record<Exclude<FindType, "function">, string[]> = {
  procedure: ["procedure"],
  page: ["page", "context"],
  table: ["table"],
}

/** Une ligne de `search_content` (E01-S06, « Contrat » § 4) ; colonnes de bloc nulles pour un titre ou un résumé. */
type SearchRow = {
  node_id: string
  path: string
  title: string
  summary: string
  kind: string
  match: string
  block_id: string | null
  block_type: string | null
  block_key: string | null
  column_name: string | null
  snippet: string | null
  rank: number
}

/** Où la requête a été trouvée dans un nœud (AC16) ; `block` est la référence courte du bloc. */
type Place = { match: string; block: string | null; block_type: string | null; column: string | null; snippet: string }

type NodeMatch = { path: string; kind: string; title: string; summary: string; score: number; places: Place[] }

type FunctionMatch = { fn: CatalogFunction; score: number }

/** Un extrait sur une ligne : blancs et sauts de ligne réduits à une espace (N16). */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** Un emplacement ; `block`, `block_type` et `column` sont nuls hors d'un bloc (AC16). */
function placeOf(row: SearchRow): Place {
  const snippet = oneLine(row.snippet ?? "")
  if (row.match !== "block" || row.block_id === null) return { match: row.match, block: null, block_type: null, column: null, snippet }
  const block = blockRef({ id: row.block_id, key: row.block_key })
  return { match: row.match, block, block_type: row.block_type, column: row.column_name, snippet }
}

/**
 * Les lignes regroupées par nœud (N11) : trois nœuds au plus, dans l'ordre de leur première ligne,
 * chacun avec ses emplacements dans l'ordre des lignes et son score (meilleur rang / 3, N13), et le
 * nombre des autres nœuds vus. Sur les lignes que le filtre de niveau a gardées (HN-E01S07-8).
 */
function groupMatches(rows: readonly SearchRow[]): { nodes: NodeMatch[]; moreNodes: number } {
  const byNode = new Map<string, NodeMatch>()
  for (const row of rows) {
    const found = byNode.get(row.node_id)
    const node = found ?? { path: row.path, kind: row.kind, title: row.title, summary: row.summary, score: 0, places: [] }
    node.score = Math.max(node.score, Math.min(1, row.rank / RANK_SPAN))
    node.places.push(placeOf(row))
    if (!found) byNode.set(row.node_id, node)
  }
  const nodes = [...byNode.values()]
  return { nodes: nodes.slice(0, FIND_LIMIT), moreNodes: Math.max(0, nodes.length - FIND_LIMIT) }
}

/** Première phrase d'une description : jusqu'au premier point suivi d'une espace ou de la fin, point final redit. */
function firstSentence(description: string): string {
  const end = description.search(/\.(?:\s|$)/)
  return `${(end === -1 ? description : description.slice(0, end)).trim()}.`
}

function functionLines(functions: readonly FunctionMatch[], prefix: string): string[] {
  return [
    ...functions.map(
      ({ fn, score }, index) => `${index + 1}. ${fn.name} (${fn.class}, score ${formatScore(score)}): ${firstSentence(fn.description)}`,
    ),
    `Read a contract with ${prefix}_read {"path": "<function>"}, then run it with ${prefix}_call.`,
  ]
}

function blockLine(place: Place): string {
  return place.block_type === "row"
    ? `   - row ${place.block}: ${place.snippet}`
    : `   - block ${place.block} (${place.block_type}): ${place.snippet}`
}

/** Un nœud en une ligne, titre ou résumé remplacé par son extrait quand la requête y est, puis ses blocs. */
function nodeLines(node: NodeMatch, index: number): string[] {
  const title = node.places.find((place) => place.match === "title")?.snippet ?? oneLine(node.title)
  const summary = node.places.find((place) => place.match === "summary")?.snippet ?? oneLine(node.summary)
  const blocks = node.places.filter((place) => place.match === "block").map(blockLine)
  return [`${index + 1}. ${node.path} (${node.kind}, score ${formatScore(node.score)}): ${title}. ${summary}`, ...blocks]
}

/**
 * Le texte de `find` (AC10 à AC15) : l'en-tête, les nœuds, « More nodes match … » si d'autres nœuds ont
 * été vus, la consigne de lecture s'il y a un nœud, la borne des lignes si une ligne de tableau est
 * montrée, puis les fonctions ; « No match » quand rien n'est trouvé, un résultat et non une erreur (N6).
 */
function renderFind(result: {
  query: string
  type?: FindType
  nodes: readonly NodeMatch[]
  moreNodes: number
  functions: readonly FunctionMatch[]
  prefix: string
}): string {
  const { query, nodes, functions, prefix } = result
  if (result.type === "function") {
    if (functions.length === 0) return `No function matches « ${query} ». Ask the user what they want to do; do not guess.`
    return [`Top functions for « ${query} »:`, ...functionLines(functions, prefix)].join("\n")
  }
  if (nodes.length === 0 && functions.length === 0) {
    return `No match for « ${query} ». Ask the user to rephrase or to say what they are looking for; do not guess.`
  }
  const lines = [`Top matches for « ${query} »:`, ...nodes.flatMap(nodeLines)]
  if (result.moreNodes > 0) lines.push(`More nodes match (at least ${result.moreNodes}): add words or set type to narrow the search.`)
  if (nodes.length > 0) lines.push(`Read one with ${prefix}_read {"path": "<path>"}; a procedure's steps are in its sections.`)
  if (nodes.some((node) => node.places.some((place) => place.block_type === "row"))) {
    lines.push(`At most 3 rows per table are shown: for every matching row, run ${prefix}_call table.rows with a filter or q.`)
  }
  if (functions.length > 0) lines.push("Functions:", ...functionLines(functions, prefix))
  return lines.join("\n")
}

/** Fonctions actives par leurs mots, trois au plus, un nom exact toujours en tête avec le score 1 (H44). */
function matchFunctions(active: readonly CatalogFunction[], query: string): FunctionMatch[] {
  const exact = looksLikeFunction(query) ? findFunction(active, query) : null
  const found = searchFunctions(active, query, FIND_LIMIT).filter((result) => result.fn !== exact)
  return (exact ? [{ fn: exact, score: 1 }, ...found] : found).slice(0, FIND_LIMIT)
}

/**
 * Les lignes de `search_content` pour la requête, telle quelle, et le genre demandé (`p_kinds` omis :
 * tous), un appel sous la session de la personne, arguments nommés, dans l'ordre où la fonction les
 * rend (son `order by`) ; puis seulement celles des nœuds qu'elle lit, niveaux calculés en un lot, hors
 * de la transaction, avant tout regroupement (N22).
 */
async function readableRows(db: PlatformDb, identity: Identity, query: string, type: Exclude<FindType, "function"> | undefined) {
  const rows = await inTransaction(db, "find: search_content", (sql) => {
    const kinds = type === undefined ? sql`` : sql`p_kinds => ${KINDS[type]}, `
    return sql<SearchRow[]>`
      select s.node_id, s.path, s.title, s.summary, s.kind, s.match, s.block_id, s.block_type, s.block_key, s.column_name, s.snippet, s.rank
        from platform.search_content(p_org => ${identity.org.id}, p_query => ${query}, ${kinds}p_limit => ${SEARCH_ROWS}) s`
  })
  const levels = await nodeLevels(db, identity, [...new Set(rows.map((row) => row.node_id))])
  return rows.filter((row) => (levels.get(row.node_id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read)
}

/**
 * `find` : nœuds par `search_content` (aucun appel avec `type: "function"`), fonctions actives du
 * catalogue sans `type` ou avec `type: "function"` (jamais avec un genre de nœud). Données en champs
 * (AC16) ; la cible du journal est la requête.
 */
export async function find(
  db: PlatformDb,
  identity: Identity,
  input: { query: string; type?: FindType },
  catalog: { functions: readonly CatalogFunction[]; activeConnectors: ReadonlySet<string> },
): Promise<ToolOutput> {
  const { query, type } = input
  const prefix = identity.org.prefix
  const { nodes, moreNodes } = type === "function" ? { nodes: [], moreNodes: 0 } : groupMatches(await readableRows(db, identity, query, type))
  const active = catalog.functions.filter((fn) => isActive(fn, catalog.activeConnectors))
  const functions = type === undefined || type === "function" ? matchFunctions(active, query) : []
  return {
    text: renderFind({ query, type, nodes, moreNodes, functions, prefix }),
    data: {
      matches: nodes.map((node) => ({ ...node, score: roundScore(node.score) })),
      more_nodes: moreNodes,
      functions: functions.map(({ fn, score }) => ({ name: fn.name, class: fn.class, connector: fn.connector, score: roundScore(score) })),
    },
    nextActions: nodes.length + functions.length > 0 ? [`${prefix}_read`] : [],
    target: clip(query, MAX_TARGET_CHARS),
  }
}
