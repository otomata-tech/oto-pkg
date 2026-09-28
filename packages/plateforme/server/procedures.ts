// Procédures pour l'écran d'E05-S04 (E03-S06 ; P24, H123) : le contrôle d'une procédure sans la publier,
// et la liste des procédures que la personne lit. Les droits se décident ici, par `access.ts`, avant
// toute lecture de brouillon ; le contrôle lui-même est `procedures-check.ts`. Sans lui, l'écran ne
// peut ni lister les procédures ni dire ce qui empêcherait d'en publier une.
import type { ProcedureRefusal, ProcedureSummary } from "../schemas"
import { ACCESS_LEVELS, nodeDecisions, unknownPath, type AccessLevel, type Owner } from "./access"
import type { PlatformDb } from "./db"
import { inTransaction, PlatformError } from "./errors"
import type { Identity } from "./identity"
import { findNode } from "./nodes/lookup"
import { loadBlocks, loadDraft } from "./nodes/store"
import { statusOf, teamOf } from "./nodes/view"
import { checkProcedureBlocks } from "./procedures-check"

/** Procédures listées au plus pour l'écran, borne appliquée après le filtre (HN-E01S07-8). */
const PROCEDURES_LISTED = 500

/**
 * Contrôle d'une procédure sans la publier, pour l'écran (AC10) : le nœud et son niveau par `findNode`
 * (`access.ts`), décidés avant toute lecture de blocs ; le brouillon ouvert à partir du niveau 2, sinon
 * les blocs publiés (P24, N8). Inconnu ou invisible : `not_found` ; pas une procédure (genre du
 * brouillon lisible, sinon du nœud) : `invalid_arguments`. N'écrit rien.
 */
export async function checkProcedure(db: PlatformDb, identity: Identity, request: { path: string }): Promise<ProcedureRefusal[]> {
  const found = await findNode(db, identity, request.path)
  if (!found) throw new PlatformError("not_found", unknownPath(request.path))
  const { node, level } = found
  const draft = level >= ACCESS_LEVELS.write ? await loadDraft(db, node.id) : null
  if ((draft?.kind ?? node.kind) !== "procedure") throw new PlatformError("invalid_arguments", `${request.path} is not a procedure.`)
  return checkProcedureBlocks(db, identity, await loadBlocks(db, node.id, draft ? "draft" : "published"))
}

type ProcedureRow = { id: string; path: string; title: string; summary: string; status: string; revision: number; updated_at: string }

/**
 * Les procédures de l'organisation de l'identité, toutes, en une lecture (la face SQL n'a pas la coupe de
 * `max_rows`) ; `listProcedures` les reclasse par chemin. Chaque ligne passe par `to_json` : `updated_at`
 * en texte ISO, comme PostgREST le rendait.
 */
async function procedureRows(db: PlatformDb, identity: Identity): Promise<ProcedureRow[]> {
  const rows = await inTransaction(db, "listProcedures: nodes", (sql) => sql<{ row: ProcedureRow }[]>`
    select (select to_json(r) from (select n.id, n.path, n.title, n.summary, n.status, n.revision, n.updated_at) r) as row
      from platform.nodes n
     where n.org_id = ${identity.org.id} and n.kind = 'procedure'`)
  return rows.map(({ row }) => row)
}

/** Les nœuds du lot qui ont un brouillon ouvert : une lecture, une ligne par nœud au plus ; aucune pour un lot vide. */
async function openDrafts(db: PlatformDb, nodeIds: readonly string[]): Promise<Set<string>> {
  if (nodeIds.length === 0) return new Set()
  const rows = await inTransaction(
    db,
    "listProcedures: node_drafts",
    (sql) => sql<{ node_id: string }[]>`select d.node_id from platform.node_drafts d where d.node_id = any(${nodeIds})`,
  )
  return new Set(rows.map((row) => row.node_id))
}

/** Les noms des équipes de l'organisation, par id ; aucune lecture pour une liste vide. */
async function teamNames(db: PlatformDb, identity: Identity, teamIds: readonly string[]): Promise<Map<string, string>> {
  if (teamIds.length === 0) return new Map()
  const rows = await inTransaction(db, "listProcedures: teams", (sql) => sql<{ id: string; name: string }[]>`
    select t.id, t.name from platform.teams t where t.org_id = ${identity.org.id} and t.id = any(${teamIds})`)
  return new Map(rows.map((row) => [row.id, row.name]))
}

/**
 * Les procédures que la personne lit (AC9, N8) : nœuds `kind = procedure` de son organisation, niveaux
 * et propriétaires décidés en un lot par `access.ts` (HN-E01S07-3), niveau 1 au moins, triés par
 * chemin, 500 au plus après le filtre ; brouillon demandé pour les seules procédures de niveau 2 au
 * moins (P24) ; équipe propriétaire effective (H52).
 */
export async function listProcedures(db: PlatformDb, identity: Identity): Promise<ProcedureSummary[]> {
  const rows = await procedureRows(db, identity)
  const decisions = await nodeDecisions(db, identity, rows.map((row) => row.id))
  const decided = (row: ProcedureRow): { level: AccessLevel; owner: Owner | null } => decisions.get(row.id) ?? { level: ACCESS_LEVELS.none, owner: null }
  const listed = rows
    .filter((row) => decided(row).level >= ACCESS_LEVELS.read)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, PROCEDURES_LISTED)
  const writable = listed.filter((row) => decided(row).level >= ACCESS_LEVELS.write).map((row) => row.id)
  const teamIds = [...new Set(listed.flatMap((row) => teamOf(decided(row).owner) ?? []))]
  const [drafts, teams] = await Promise.all([openDrafts(db, writable), teamNames(db, identity, teamIds)])
  return listed.map((row) => {
    const teamId = teamOf(decided(row).owner)
    const name = teamId === null ? undefined : teams.get(teamId)
    return {
      path: row.path,
      title: row.title,
      summary: row.summary,
      status: statusOf(row.status),
      revision: row.revision,
      updatedAt: row.updated_at,
      ownerTeam: teamId !== null && name !== undefined ? { id: teamId, name } : null,
      hasDraft: drafts.has(row.id),
    }
  })
}
