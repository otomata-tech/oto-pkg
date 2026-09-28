// Les blocs `reference` rendus en place à l'écran (E07-S03, AC15, AC16 ; H56, P18, HN-E07S03-5,
// HN-E07S03-11) : les 10 premiers blocs `reference` du nœud affiché, désignés par leur `id`. Les
// chemins cités sont relus pour l'appelant par `resolveTargets` (E03-S07 : alias suivis, niveaux en un
// lot par `nodeLevels`, niveau 0 = absent, H68) ; puis les en-têtes des tableaux cités, en une lecture,
// et les lignes de chaque vue par `selectRows` (filtre, tri et colonnes de `table.rows`, E07-S01) :
// aucune ligne d'un tableau absent ou invisible n'est lue. Fichier à part de `references.ts`, dont les
// formes de `read` et de `context` n'ont pas à lire de lignes. Sans lui, l'écran ne rendrait qu'un
// lien pour chaque référence (`ReferenceEnLien`, E05-S02).
import {
  SCREEN_REFERENCES_MAX,
  TABLE_VIEW_ROWS_MAX,
  tableViewSchema,
  type NodeKind,
  type ScreenReference,
  type ScreenReferenceProblem,
  type TableHeader,
  type TableSort,
} from "../../schemas"
import type { PlatformDb } from "../db"
import { inTransaction, isPlatformError } from "../errors"
import type { Identity } from "../identity"
import { unknownColumns } from "../tables/filters"
import { publishedHeader } from "../tables/meta"
import { selectRows } from "../tables/screen"
import type { DocBlock } from "./document"
import { resolveTargets, type TargetNode } from "./link-resolution"
import { NODE_SQL_COLUMNS, type NodeRow } from "./lookup"
import { extractReferences, type ReferenceBlock } from "./references"

/** Une vue contrôlée, prête à lire ses lignes : son tableau, son en-tête publié et ses réglages. */
type ViewRequest = { node: TargetNode; header: TableHeader; filter?: unknown; sort?: TableSort; columns: string[] | null; limit: number }

function problem(reference: ReferenceBlock, error: "not_found" | "invalid_arguments", reason: ScreenReferenceProblem, detail?: string): ScreenReference {
  return { kind: reference.view === null ? "card" : "view", path: reference.path, error, reason, ...(detail === undefined ? {} : { detail }) }
}

/**
 * Les en-têtes publiés des tableaux cités, lus en une fois après la décision des niveaux (aucune lecture
 * sans tableau) ; `null` : jamais publié.
 */
async function headersOf(db: PlatformDb, identity: Identity, nodeIds: readonly string[]): Promise<Map<string, TableHeader | null>> {
  if (nodeIds.length === 0) return new Map()
  const rows = await inTransaction(db, "references: table headers", (sql) => sql<{ node: NodeRow }[]>`
    select to_json(n) as node from (select ${sql(NODE_SQL_COLUMNS)} from platform.nodes where org_id = ${identity.org.id} and id = any(${nodeIds})) n`)
  return new Map(
    rows.map(({ node }) => {
      const published = publishedHeader(node)
      return [node.id, "header" in published ? published.header : null]
    }),
  )
}

/** La vue d'un bloc contrôlée contre sa forme (H56), puis contre l'en-tête du tableau (AC15) ; ou la raison de la refuser. */
function checkedView(reference: ReferenceBlock, node: TargetNode, header: TableHeader | null | undefined): ViewRequest | ScreenReference {
  if (node.kind !== "table") return problem(reference, "invalid_arguments", "not_a_table", node.path)
  const shape = tableViewSchema.safeParse(reference.view)
  if (!shape.success) {
    const [issue] = shape.error.issues
    if (issue.code === "unrecognized_keys") return problem(reference, "invalid_arguments", "unknown_key", issue.keys.join(", "))
    const at = String(issue.path[0] ?? "")
    if (at === "limit") return problem(reference, "invalid_arguments", "limit")
    if (at === "columns") return problem(reference, "invalid_arguments", "unknown_column")
    return problem(reference, "invalid_arguments", at === "sort" ? "sort" : "filter")
  }
  if (!header) return problem(reference, "invalid_arguments", "unpublished")
  const { filter, sort, columns, limit } = shape.data
  const unknown = unknownColumns(header, [...Object.keys(filter ?? {}), ...(sort ? [sort.column] : []), ...(columns ?? [])])
  if (unknown.length > 0) return problem(reference, "invalid_arguments", "unknown_column", unknown.join(", "))
  return { node, header, filter, sort, columns: columns ?? null, limit: limit ?? TABLE_VIEW_ROWS_MAX }
}

/** La vue rendue (AC15) : la colonne clé en tête quand `columns` ne la cite pas, jamais deux fois ; un filtre refusé dit sa raison. */
async function viewOf(db: PlatformDb, identity: Identity, reference: ReferenceBlock, view: ViewRequest): Promise<ScreenReference> {
  const { node, header } = view
  const table = { orgId: identity.org.id, nodeId: node.id, path: node.path, header }
  try {
    const { rows, total } = await selectRows(db, table, { filter: view.filter, sort: view.sort, limit: view.limit, columns: view.columns })
    const cited = view.columns ?? header.columns.map((column) => column.name)
    const names = cited.includes(header.key) ? cited : [header.key, ...cited]
    const columns = names.flatMap((name) => header.columns.filter((column) => column.name === name))
    return { kind: "view", path: node.path, title: node.title, key: header.key, columns, rows, total }
  } catch (error) {
    if (!isPlatformError(error) || (error.code !== "invalid_arguments" && error.code !== "too_large")) throw error
    return problem(reference, "invalid_arguments", error.code === "too_large" ? "too_large" : "filter")
  }
}

/** La carte d'un nœud cité sans vue (AC16) ; par un ancien chemin, celle du chemin courant. */
function cardOf(reference: ReferenceBlock, node: TargetNode): ScreenReference {
  // `kind` d'un nœud lu en base : l'un des genres de `nodes_kind_check` (E01-S06), ceux de `NodeKind`.
  const nodeKind = node.kind as NodeKind
  return { kind: "card", path: node.path, title: node.title, nodeKind, summary: node.summary, ...(node.path === reference.path ? {} : { movedFrom: reference.path }) }
}

/**
 * Les blocs `reference` de `blocks` rendus pour l'écran (AC15, AC16), par `id` de bloc : les
 * `maxBlocks` premiers dans l'ordre du document, rien au-delà. Sans `view`, la carte du nœud cité ;
 * avec, la vue d'un tableau ; un nœud absent ou de niveau 0 : `not_found` ; une vue illisible :
 * `invalid_arguments` et sa raison. Aucune lecture pour un nœud sans bloc `reference`.
 */
export async function resolveReferencesForScreen(
  db: PlatformDb,
  identity: Identity,
  blocks: readonly DocBlock[],
  options: { maxBlocks: number } = { maxBlocks: SCREEN_REFERENCES_MAX },
): Promise<Record<string, ScreenReference>> {
  const references = extractReferences(blocks).slice(0, options.maxBlocks)
  if (references.length === 0) return {}
  const paths = [...new Set(references.map((reference) => reference.path))]
  const resolutions = await resolveTargets(db, identity, paths.map((path) => ({ path, key: null })))
  const targets = new Map(resolutions.map((target) => [target.path, target.node]))
  const tableIds = references.flatMap((reference) => {
    const node = targets.get(reference.path)
    return reference.view !== null && node?.kind === "table" ? [node.id] : []
  })
  const headers = await headersOf(db, identity, [...new Set(tableIds)])
  const resolved = await Promise.all(
    references.map(async (reference): Promise<[string, ScreenReference]> => {
      const node = targets.get(reference.path)
      if (!node) return [reference.blockId, problem(reference, "not_found", "not_found")]
      if (reference.view === null) return [reference.blockId, cardOf(reference, node)]
      const view = checkedView(reference, node, headers.get(node.id))
      return [reference.blockId, "header" in view ? await viewOf(db, identity, reference, view) : view]
    }),
  )
  return Object.fromEntries(resolved)
}
