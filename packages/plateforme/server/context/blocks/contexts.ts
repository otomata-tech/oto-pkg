// Blocs « Contexte » de `context` (E03-S08, AC1, AC9, AC12, AC13 ; P39, ADR-011 § 1, § 5, § 6) : les
// nœuds `context` de Tout le monde, de Perso, puis des équipes par nom (E05-S13), chacun
// servi par ses blocs publiés — le rendu de `read` (`renderBlocks` de M05), un niveau de titre plus
// bas, un bloc `reference` par sa ligne résolue (E03-S07) —, puis ses sous-pages et tableaux, puis ses
// pages liées, en lignes d'index, jamais leur corps. Le service filtre (H123) : Contextes et enfants
// par leurs niveaux calculés en un lot, cibles des liens par `resolveTargets` ; une lecture par étape
// pour tous les Contextes, jamais une par Contexte. Sans lui, le contenu de l'organisation, de Perso et
// des équipes n'est plus servi (le guide ne l'est plus, P39).
//
// Repris d'oto-frontend (`src/components/contexte/contenus-lies.tsx` l. 17-56) : ce qui est rangé dans
// la page d'abord, puis ce qu'elle cite ailleurs, et « cité n'est pas injecté » (une ligne : chemin,
// titre, résumé). Retiré : l'écran, le mode d'injection par contenu (les sous-pages aussi en lignes).
//
// E05-S12 (D109, D110 b) : une partie par Contexte attendu, toujours servie — son en-tête, sa ligne de faits
// (organisation, personne, équipe) et les connecteurs, puis le corps du Contexte quand il y en a un ;
// procédures comprises dans ses enfants listés. Repris de la maquette (l. 108-135) : les faits des blocs
// personne, organisation et équipe ; retirés : leurs en-têtes et la phrase « sans équipe ».
import { CONTEXT_INDEX, NODE_PATH_PATTERN, orderBlocks, renderBlocks } from "../../../schemas"
import { ACCESS_LEVELS, nodeLevels, type AccessLevel } from "../../access"
import type { PlatformDb } from "../../db"
import { inTransaction } from "../../errors"
import type { Identity } from "../../identity"
import type { DocBlock } from "../../nodes/document"
import { resolveTargets, targetKey, type TargetNode, type TargetResolution } from "../../nodes/link-resolution"
import { contextReference, extractReferences, referenceLines, resolvedReferences, type ReferenceBlock } from "../../nodes/references"
import { BLOCK_SQL_COLUMNS, docBlock } from "../../nodes/store"
import { linesThatFit, type ContextBlock } from "../engine"

/** Tailles nominales de H30 (N6), listes comprises, du corps seul : la tête d'une partie n'y compte pas (E05-S12, AC-5). */
export const CONTEXT_SIZES = { all: 2400, private: 1200, team: 1200 } as const

/** Lignes des deux listes d'un Contexte, enfants d'abord (AC12). */
const CONTEXT_LIST_MAX = 20

/**
 * Les lignes de faits des parties (E05-S12, AC-1, AC-2) : celle de l'organisation, celle de la personne, une
 * par équipe dans l'ordre d'`identity.teams`, et les lignes des connecteurs (en-tête compris, vide sans
 * connecteur actif) : celles de chaque équipe qui a un compte (`teamConnectors`, dans l'ordre des équipes)
 * et celles de Tout le monde (`connectors`, E05-S13, fiche D128).
 */
export type PartFacts = {
  everyone: string
  private: string
  teams: readonly string[]
  teamConnectors: readonly (readonly string[])[]
  connectors: readonly string[]
}

/**
 * Une partie attendue pour la personne : son nom au rapport, le chemin de son Contexte (`null` : jamais
 * cherché, un Privé sans `handle`), son en-tête, sa taille nominale et ses lignes de faits.
 */
type ContextPath = { name: string; path: string | null; header: string; size: number; facts: (facts: PartFacts) => readonly string[] }

/** Le corps rendu d'un Contexte servi : ses blocs, puis ses listes ; `listsCut` : listes arrêtées à 20 lignes. */
export type ContextBody = { text: string; listsCut: boolean }

/** Une ligne d'index d'un Contexte : sous-page, tableau, procédure ou page liée (« cité n'est pas injecté »). */
type IndexNode = { path: string; title: string; summary: string }

type ContextNode = { id: string; path: string }
type ChildRow = IndexNode & { id: string; parent_id: string | null }
type LinkRow = { source_node_id: string; target_path: string }
/** Un bloc publié d'un Contexte : les colonnes de `docBlock`, plus le nœud (les blocs de tous les Contextes se lisent ensemble). */
type ContextBlockRow = Parameters<typeof docBlock>[0] & { node_id: string }

/** Ce qui est lu pour tous les Contextes à la fois, puis rendu Contexte par Contexte. */
type ContextReads = {
  documents: Map<string, DocBlock[]>
  references: Map<string, ReferenceBlock[]>
  children: ChildRow[]
  links: LinkRow[]
  byTarget: Map<string, TargetResolution>
  published: Set<string>
  prefix: string
}

/** Un chemin hors du format H51 n'est jamais cherché. */
function searchable(path: string): string | null {
  return NODE_PATH_PATTERN.test(path) ? path : null
}

/**
 * Les parties de la personne, dans l'ordre de P39 (N10, HN-E05S12-2) : Tout le monde, Privé, puis chaque
 * équipe de l'identité, par nom (E05-S13, fiche D128) ; les chemins mêmes que reconnaît
 * `platform.is_context_path` (E01-S04). Les connecteurs d'une équipe qui a un compte suivent ses faits ; ceux
 * dont aucune équipe de la personne n'a de compte suivent les faits de l'organisation (D128). Un Privé sans
 * `handle` est servi sans chemin (AC-3).
 */
function contextPaths(identity: Identity): ContextPath[] {
  const handle = identity.member.profile.handle
  const personal = handle ? `private/${handle}/contexte` : null
  return [
    { name: "contexte", path: "contexte", header: "everyone", size: CONTEXT_SIZES.all, facts: (facts) => [facts.everyone, ...facts.connectors] },
    { name: personal ?? "private", path: personal && searchable(personal), header: "you only", size: CONTEXT_SIZES.private, facts: (facts) => [facts.private] },
    ...identity.teams.map((team, index): ContextPath => ({
      name: `${team.slug}/contexte`,
      path: searchable(`${team.slug}/contexte`),
      header: `team ${team.name}`,
      size: CONTEXT_SIZES.team,
      facts: (facts) => [facts.teams[index], ...(facts.teamConnectors[index] ?? [])],
    })),
  ]
}

function headerOf(entry: ContextPath): string {
  return `## Context: ${entry.header}${entry.path ? ` (${entry.path})` : ""}`
}

/** L'ordre des chemins des lignes d'index ; aussi des procédures utiles et des documents récents à égalité. */
export function byPath(a: { path: string }, b: { path: string }): number {
  if (a.path === b.path) return 0
  return a.path < b.path ? -1 : 1
}

function readable(levels: ReadonlyMap<string, AccessLevel>, id: string): boolean {
  // Un filtre de liste compare `nodeLevels` à 1 seulement (`security-patterns.md § Droits dans le service`).
  return (levels.get(id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read
}

/** Le texte sans un bloc clôturé resté ouvert à sa fin : la coupe recule avant son ouverture (AC1). */
function beforeOpenFence(text: string): string {
  let open: { fence: string; at: number } | null = null
  let at = 0
  for (const line of text.split("\n")) {
    const run = /^`{3,}/.exec(line)?.[0]
    if (open === null && run !== undefined) open = { fence: run, at }
    else if (open !== null && line.trimEnd() === open.fence) open = null
    at += line.length + 1
  }
  return open === null ? text : text.slice(0, open.at)
}

/**
 * Le corps d'un Contexte (AC1, AC12) : son rendu, puis, après une ligne vide, ses sous-pages, tableaux et
 * procédures (« Pages, tables and procedures here: », D110 b) et ses pages liées (« Linked pages: »), 20
 * lignes au plus pour les deux, enfants d'abord, une liste vide sans titre.
 */
function contextBody(input: { markdown: string; children: readonly IndexNode[]; linked: readonly IndexNode[] }): ContextBody {
  const { item, separator } = CONTEXT_INDEX
  const line = (node: IndexNode) => `${item}${node.path}${separator}${node.title}${separator}${node.summary}`
  const children = input.children.slice(0, CONTEXT_LIST_MAX)
  const linked = input.linked.slice(0, CONTEXT_LIST_MAX - children.length)
  const lists = [
    ...(children.length > 0 ? [CONTEXT_INDEX.children, ...children.map(line)] : []),
    ...(linked.length > 0 ? [CONTEXT_INDEX.linked, ...linked.map(line)] : []),
  ].join("\n")
  return {
    text: [input.markdown, lists].filter((part) => part !== "").join("\n\n"),
    listsCut: children.length + linked.length < input.children.length + input.linked.length,
  }
}

/**
 * La partie d'un Contexte (E05-S12, AC-1 à AC-5) : sa tête — en-tête, ligne de faits, connecteurs —, jamais
 * coupée par la taille nominale, puis le corps de son Contexte (`body`), ou la ligne qui dit qu'il n'a pas
 * été lu (`notLoaded`), ou rien (absent, jamais publié, illisible, vide). Le corps seul est borné à la taille
 * nominale (H30) : coupé à la dernière ligne qui tient, jamais dans un bloc clôturé ; coupé, ou ses listes
 * arrêtées à 20 lignes (N20), il finit par le pointeur vers `read` et la partie compte `cut`. `path` au
 * rapport seulement quand le corps est servi (AC-4).
 */
function partBlock(entry: ContextPath, facts: PartFacts, prefix: string, content: { body?: ContextBody; notLoaded?: boolean }): ContextBlock {
  const head = [headerOf(entry), ...entry.facts(facts)].join("\n")
  const part = { name: entry.name, head: head.length }
  const { body } = content
  if (content.notLoaded && entry.path) return { ...part, text: `${head}\n${CONTEXT_INDEX.notLoaded}${prefix}_read {"path": "${entry.path}"}.` }
  if (!body || body.text === "" || !entry.path) return { ...part, text: head }
  if (!body.listsCut && body.text.length <= entry.size) return { ...part, text: `${head}\n${body.text}`, path: entry.path }
  const pointer = `${CONTEXT_INDEX.rest} ${prefix}_read {"path": "${entry.path}"}.`
  const kept = beforeOpenFence(linesThatFit(body.text, entry.size - pointer.length - 1)).trimEnd()
  return { ...part, text: [head, ...(kept ? [kept] : []), pointer].join("\n"), path: entry.path, cut: true }
}

/**
 * Les parties de la personne (E05-S12, AC-1 à AC-4), dans l'ordre de `contextPaths`, chacune servie même
 * quand son Contexte manque : `bodies` = les corps lus par `contextBodies`, par chemin ; `null` quand leur
 * lecture a échoué (AC13) : chaque Contexte cherché dit alors de le lire par `read`.
 */
export function contextParts(identity: Identity, facts: PartFacts, bodies: ReadonlyMap<string, ContextBody> | null): ContextBlock[] {
  return contextPaths(identity).map((entry) =>
    partBlock(entry, facts, identity.org.prefix, bodies === null ? { notLoaded: true } : { body: entry.path ? bodies.get(entry.path) : undefined }),
  )
}

/**
 * Les nœuds Contexte attendus, de genre `context` et publiés (révision ≥ 1 : le brouillon d'un Contexte
 * n'est jamais servi), que la personne lit : niveaux calculés en un lot, après la transaction, niveau 0
 * retiré (H123).
 */
async function readableContexts(db: PlatformDb, identity: Identity, expected: readonly string[]): Promise<ContextNode[]> {
  const nodes = await inTransaction(
    db,
    "context: contexts",
    (sql) => sql<ContextNode[]>`
      select id, path from platform.nodes
       where org_id = ${identity.org.id} and kind = 'context' and status = 'published' and revision >= 1
         and path = any(${expected})`,
  )
  const levels = await nodeLevels(db, identity, nodes.map((node) => node.id))
  return nodes.filter((node) => readable(levels, node.id))
}

/**
 * Ce que portent les Contextes lisibles, en une transaction, une lecture pour tous : leurs blocs publiés,
 * leurs enfants publiés (pages, tableaux et procédures, D110 b) et leurs liens sortants.
 */
async function contextRows(db: PlatformDb, identity: Identity, ids: readonly string[]): Promise<[ContextBlockRow[], ChildRow[], LinkRow[]]> {
  const org = identity.org.id
  return inTransaction(db, "context: context blocks, children and links", (sql) =>
    Promise.all([
      sql<ContextBlockRow[]>`
        select node_id, ${sql(BLOCK_SQL_COLUMNS)} from platform.blocks
         where org_id = ${org} and state = 'published' and node_id = any(${ids})`,
      sql<ChildRow[]>`
        select id, parent_id, path, title, summary from platform.nodes
         where org_id = ${org} and status = 'published' and kind in ('page', 'table', 'procedure') and parent_id = any(${ids})`,
      sql<LinkRow[]>`
        select source_node_id, target_path from platform.links
         where org_id = ${org} and source_node_id = any(${ids})`,
    ]),
  )
}

/** Les enfants des Contextes que la personne lit (second lot de niveaux, avant la borne de 20). */
async function readableChildren(db: PlatformDb, identity: Identity, rows: readonly ChildRow[]): Promise<ChildRow[]> {
  const levels = await nodeLevels(db, identity, rows.map((row) => row.id))
  return rows.filter((row) => readable(levels, row.id))
}

/**
 * Les cibles des liens et des blocs `reference`, relues pour la personne en un appel à `resolveTargets`
 * (E03-S07 : le nœud au chemin, sinon celui dont c'est un ancien chemin ; niveau 0 = sans cible), et
 * celles des nœuds trouvés qui sont publiés (N9), en une lecture, aucune sans nœud trouvé.
 */
async function resolvedTargets(db: PlatformDb, identity: Identity, paths: readonly string[]): Promise<Pick<ContextReads, "byTarget" | "published">> {
  const resolved = await resolveTargets(db, identity, [...new Set(paths)].map((path) => ({ path, key: null })))
  const found = [...new Set(resolved.flatMap((target) => (target.node ? [target.node.id] : [])))]
  const published =
    found.length === 0
      ? []
      : await inTransaction(
          db,
          "context: linked pages",
          (sql) => sql<{ id: string }[]>`
            select id from platform.nodes where org_id = ${identity.org.id} and status = 'published' and id = any(${found})`,
        )
  return { byTarget: new Map(resolved.map((target) => [targetKey(target), target])), published: new Set(published.map((row) => row.id)) }
}

/** Les pages liées d'un Contexte : cibles trouvées et publiées, ni lui-même ni un de ses enfants, une fois chacune, par chemin. */
function linkedPages(node: ContextNode, childIds: ReadonlySet<string>, reads: ContextReads): TargetNode[] {
  const linked = new Map<string, TargetNode>()
  for (const link of reads.links.filter((row) => row.source_node_id === node.id)) {
    const target = reads.byTarget.get(targetKey({ path: link.target_path, key: null }))?.node
    if (target && reads.published.has(target.id) && target.id !== node.id && !childIds.has(target.id)) linked.set(target.id, target)
  }
  return [...linked.values()].sort(byPath)
}

function renderContextNode(node: ContextNode, reads: ContextReads): ContextBody {
  const lines = referenceLines(resolvedReferences(reads.references.get(node.id) ?? [], reads.byTarget, reads.prefix))
  const markdown = renderBlocks(reads.documents.get(node.id) ?? [], { headingBase: 3, reference: contextReference(lines) })
  const children = reads.children.filter((child) => child.parent_id === node.id).sort(byPath)
  const linked = linkedPages(node, new Set(children.map((child) => child.id)), reads)
  return contextBody({ markdown, children, linked })
}

/**
 * Les corps des Contextes de la personne (AC1, AC12), par chemin : les nœuds et leurs niveaux, puis en une
 * transaction leurs blocs publiés, leurs enfants et leurs liens sortants, puis les niveaux des enfants, puis
 * les cibles des liens et des blocs `reference` ; une lecture par étape pour tous les Contextes. Un Contexte
 * absent, jamais publié ou illisible n'a pas de corps. Une panne lève : `contextParts` reçoit alors `null`
 * (AC13).
 */
export async function contextBodies(db: PlatformDb, identity: Identity): Promise<Map<string, ContextBody>> {
  const expected = contextPaths(identity).flatMap((entry) => (entry.path ? [entry.path] : []))
  const nodes = await readableContexts(db, identity, expected)
  if (nodes.length === 0) return new Map()
  const ids = nodes.map((node) => node.id)
  const [blockRows, childRows, links] = await contextRows(db, identity, ids)
  const children = await readableChildren(db, identity, childRows)
  const documents = new Map(ids.map((id) => [id, orderBlocks(blockRows.filter((row) => row.node_id === id).map(docBlock))]))
  const references = new Map(ids.map((id) => [id, extractReferences(documents.get(id) ?? [])]))
  const cited = [...references.values()].flat().map((reference) => reference.path)
  const targets = await resolvedTargets(db, identity, [...links.map((link) => link.target_path), ...cited])
  const reads: ContextReads = { documents, references, children, links, ...targets, prefix: identity.org.prefix }
  return new Map(nodes.map((node) => [node.path, renderContextNode(node, reads)]))
}
