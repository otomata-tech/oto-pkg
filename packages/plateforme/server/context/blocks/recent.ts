// Bloc « Recent content » de `context` (E03-S08, AC5, AC6 ; H36, N4 ; « Recent documents » jusqu'à E05-S12,
// AC-20 : renommé seulement) : les pages et tableaux que la
// personne a lus ou écrits sur 90 jours — lectures et écritures au journal, blocs qu'elle a écrits
// (brouillon d'une page, ligne d'un tableau), nœuds qu'elle a publiés —, datés de leur source la plus
// récente, 20 au plus (sans taille, E11-S03) ; ni procédure, ni Contexte, ni la racine, ni nœud
// qu'elle ne lit pas. Sans lui, la personne ne retrouve pas ce sur quoi elle travaillait.
//
// Repris de la maquette (`mcp-test/src/proto/services/context.ts` l. 205-208, 227-230) : forme des
// lignes, exclusions (procédures, racine), 20 au plus. Retiré : les documents de toute l'organisation
// (→ ceux de la personne, H36), la lecture par clé de service.
import { NODE_PATH_PATTERN, SERVED_RECENT } from "../../../schemas"
import { ACCESS_LEVELS, nodeLevels } from "../../access"
import type { PlatformDb } from "../../db"
import { inTransaction } from "../../errors"
import type { Identity } from "../../identity"
import { ROOT_PATH } from "../../nodes/lookup"
import { day } from "../../nodes/read-format"
import { daysAgo, type ContextBlock } from "../engine"
import { byPath } from "./contexts"

/** Documents listés au plus (H36). */
const RECENT_MAX = 20

const RECENT_DAYS = 90

/** Lignes de journal et blocs lus au plus par source, les plus récents. */
const SOURCE_ROWS = 200

/** Genres servis ici : procédures et Contextes ont leurs blocs (N4). */
const DOCUMENT_KINDS = ["page", "table"]

type DocumentNode = { id: string; path: string; kind: string; title: string }

/** Les sources de la personne, datées comme la base les rend, et les nœuds que visent son journal et ses blocs. */
type PersonalReads = {
  journal: { target: string | null; ts: Date }[]
  blocks: { node_id: string; updated_at: Date }[]
  nodes: (DocumentNode & { updated_at: Date })[]
  atPath: DocumentNode[]
  atId: DocumentNode[]
}

/**
 * Les trois sources de la personne sur 90 jours, lues en parallèle et chacune filtrée dans la requête
 * par l'organisation et la personne (N4, H123) : ses lectures et écritures au journal, sans erreur,
 * dont la cible est un chemin ; les blocs qu'elle a écrits ; les pages et tableaux publiés qu'elle a
 * mis à jour en dernier (`updated_by` : un dossier posé par déclencheur à sa création n'est pas publié).
 * Puis, dans la même transaction, les nœuds des chemins du journal et des blocs écrits (deux lectures
 * en parallèle, aucune pour une liste vide).
 */
async function personalReads(db: PlatformDb, identity: Identity): Promise<PersonalReads> {
  const org = identity.org.id
  const me = identity.user.id
  const since = daysAgo(RECENT_DAYS)
  const tools = [`${identity.org.prefix}_read`, `${identity.org.prefix}_write`]
  return inTransaction(db, "context: recent content", async (sql) => {
    const [journal, blocks, nodes] = await Promise.all([
      sql<PersonalReads["journal"]>`
        select target, ts from platform.journal
         where org_id = ${org} and user_id = ${me} and tool = any(${tools}) and is_error = false
           and target is not null and ts >= ${since}
         order by ts desc
         limit ${SOURCE_ROWS}`,
      sql<PersonalReads["blocks"]>`
        select node_id, updated_at from platform.blocks
         where org_id = ${org} and updated_by = ${me} and updated_at >= ${since}
         order by updated_at desc
         limit ${SOURCE_ROWS}`,
      sql<PersonalReads["nodes"]>`
        select id, path, kind, title, updated_at from platform.nodes
         where org_id = ${org} and updated_by = ${me} and kind = any(${DOCUMENT_KINDS}) and status = 'published'
           and updated_at >= ${since}
         order by updated_at desc
         limit ${RECENT_MAX}`,
    ])
    const paths = [...new Set(journal.flatMap((line) => (line.target && NODE_PATH_PATTERN.test(line.target) ? [line.target] : [])))]
    const ids = [...new Set(blocks.map((row) => row.node_id))]
    const [atPath, atId] = await Promise.all([
      paths.length > 0 ? sql<DocumentNode[]>`select id, path, kind, title from platform.nodes where org_id = ${org} and path = any(${paths})` : [],
      ids.length > 0 ? sql<DocumentNode[]>`select id, path, kind, title from platform.nodes where org_id = ${org} and id = any(${ids})` : [],
    ])
    return { journal, blocks, nodes, atPath, atId }
  })
}

/**
 * Les documents récents de la personne, les plus récents d'abord, 20 au plus (AC5) : ses sources et les
 * nœuds qu'elles visent (`personalReads`), puis leurs niveaux en un lot, après la transaction ; gardés :
 * niveau ≥ 1, page ou tableau, hors racine ; date = la plus récente de leurs sources.
 */
async function recentDocuments(db: PlatformDb, identity: Identity): Promise<(DocumentNode & { at: string })[]> {
  const found = await personalReads(db, identity)
  const nodes = new Map<string, DocumentNode>([...found.atPath, ...found.atId, ...found.nodes].map(({ id, path, kind, title }) => [id, { id, path, kind, title }]))
  // La date d'une source (ISO, à la milliseconde comme `Date.parse` la compare), la plus récente par nœud.
  const latest = new Map<string, string>()
  const touch = (id: string | undefined, date: Date) => {
    const at = date.toISOString()
    const previous = id === undefined ? undefined : latest.get(id)
    if (id !== undefined && (previous === undefined || Date.parse(at) > Date.parse(previous))) latest.set(id, at)
  }
  const idOfPath = new Map(found.atPath.map((node) => [node.path, node.id]))
  for (const line of found.journal) if (line.target) touch(idOfPath.get(line.target), line.ts)
  for (const row of found.blocks) touch(row.node_id, row.updated_at)
  for (const node of found.nodes) touch(node.id, node.updated_at)
  const levels = await nodeLevels(db, identity, [...latest.keys()])
  // Un filtre de liste compare `nodeLevels` à 1 seulement (`security-patterns.md § Droits dans le service`).
  const kept = [...latest.entries()].flatMap(([id, at]) => {
    const node = nodes.get(id)
    const readable = (levels.get(id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read
    return node && readable && DOCUMENT_KINDS.includes(node.kind) && node.path !== ROOT_PATH ? [{ ...node, at }] : []
  })
  return kept.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || byPath(a, b)).slice(0, RECENT_MAX)
}

/**
 * Le texte du bloc (AC5, AC6 ; E05-S12, AC-20) : « ## Recent content » et une ligne par document, servi entier
 * (E11-S03, AC-b1) ; `null` sans document. Formats de `SERVED_RECENT`, que l'écran relit (E05-S13, AC-16) ; exporté pour son test
 * de parité, sans base.
 */
export function recentText(documents: readonly (Pick<DocumentNode, "path" | "kind" | "title"> & { at: string })[]): ContextBlock | null {
  if (documents.length === 0) return null
  const { title, item, kindStart, dateStart, dateEnd } = SERVED_RECENT
  const lines = documents.map((document) => `${item}${document.path}${kindStart}${document.kind}${dateStart}${day(document.at)}${dateEnd}${document.title}`)
  return { name: "recent content", text: [title, ...lines].join("\n") }
}

/** Le bloc : les documents récents de la personne (`recentDocuments`), rendus par `recentText`. */
export async function recentBlock(db: PlatformDb, identity: Identity): Promise<ContextBlock | null> {
  return recentText(await recentDocuments(db, identity))
}
