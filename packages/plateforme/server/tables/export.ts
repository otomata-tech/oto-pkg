// `GET /api/platform/tables/export?path=` (E10-S01, AC-b6) : le `.csv` d'un tableau, pour « Télécharger en
// .csv » du rail. La lecture est décidée par `loadTable` avant toute requête sur les lignes ; les lignes sont lues
// par pages dans l'ordre de la clé, 5 000 au plus (`FILTERED_ROWS_MAX`, HN-E10S01-7), puis écrites par `toCsv`
// (`schemas/csv.ts`) dans la langue de l'organisation, formules neutralisées. Sans lui, un tableau ne sort de la
// plateforme que page par page, par `table.rows`. Un export n'est pas journalisé, comme toute lecture (HN-E10S01-18).
//
// Repris d'Oto (`oto_mcp/api/datastore_export.py` l. 1-30, 58, 77-132) : colonnes dans l'ordre du schéma, lecture
// par lots, tableau introuvable refusé avant d'écrire la réponse. Retiré : le flux Starlette et
// `run_in_threadpool` (la face API rend du JSON), les colonnes découvertes hors du schéma, le plafond de 200 000
// lignes (5 000 ici).
import { toCsv } from "../../schemas"
import { FILTERED_ROWS_MAX } from "../../schemas/tables"
import type { PlatformDb } from "../db"
import { PlatformError } from "../errors"
import type { Identity } from "../identity"
import { organisationLanguage } from "../language"
import { formatCount } from "../nodes/document"
import { exportPath, type ExportedFile } from "../nodes/export"
import { lastSegment } from "../nodes/segments"
import { loadTable, rowCells } from "./meta"
import { loadRows } from "./rows"

/**
 * Le `.csv` d'un tableau (AC-b6) : illisible, `not_found` ; un autre genre, `invalid_arguments` ; plus de 5 000
 * lignes, `too_large`. BOM, en-tête des noms de colonnes, séparateur et décimale de la langue de l'organisation.
 */
export async function exportTable(db: PlatformDb, identity: Identity, query: unknown): Promise<ExportedFile> {
  const table = await loadTable({ db, identity }, exportPath(query))
  const rows = await loadRows(db, table.node.id, FILTERED_ROWS_MAX)
  const path = table.node.path
  if (rows.length > FILTERED_ROWS_MAX) {
    throw new PlatformError("too_large", `${path} has more than ${formatCount(FILTERED_ROWS_MAX)} rows: an export holds ${formatCount(FILTERED_ROWS_MAX)} at most in this version.`)
  }
  const content = toCsv(table.header.columns, rows.map((row) => rowCells(row, table.header)), organisationLanguage(identity.org))
  return { filename: `${lastSegment(path)}.csv`, content }
}
