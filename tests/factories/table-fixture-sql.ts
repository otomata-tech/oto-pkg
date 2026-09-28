// La fixture des tableaux (`table-fixture.ts`) sur une vraie base (E01-S10, lot t1-0) : les tables de
// `fixtureTables(rules, rows)` (O et P, leur contenu, les tableaux publiés, leurs en-têtes et leurs
// lignes, provenances et baux compris), écrites par `seedReferenceTables` (`tests/helpers/reference-org-sql.ts`)
// sur la connexion d'administration, jetables et portables. Ce que rend la fonction : le même
// `ReferenceOrgSql` que `seedReferenceOrg` ; un tableau se joint par `ref.nodeId(PROSPECTS.path)`, celui
// de P par `ref.id(FOREIGN_TABLE.id)`, une ligne de plus par `ref.write({ blocks: rowBlocks(…) })`.
//
// Deux écarts, imposés par le schéma : le tableau de P, `achats/fournisseurs`, que la base simulée pose
// sous la racine, a son dossier `achats` (`nodes_guard` : un chemin est celui de son parent) ; le membre
// parti des provenances (`user-former`, non exporté de `table-fixture.ts`) reçoit un identifiant tiré au
// hasard, qui n'est celui d'aucune personne semée.
import { randomUUID } from "crypto"
import type { RowBlock } from "../../packages/plateforme/server/tables/meta"
import { OTHER_ORG, type RuleSpec } from "../helpers/reference-org"
import { seedReferenceTables, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Row } from "../helpers/simulated-db"
import type { SeededData } from "../helpers/sql"
import { fixtureTables } from "./table-fixture"

/** Le dossier de P sous lequel le schéma range `achats/fournisseurs` ; complété comme un nœud de `contentTables`. */
export const FOREIGN_FOLDER: Row = { id: "other:node:achats", org_id: OTHER_ORG.id, path: "achats" }

/** Le membre parti des provenances de `PROSPECT_ROWS` (`FORMER_USER` de `table-fixture.ts`). */
const FORMER_USER = "user-former"

/** Les tableaux de la fixture sur la base réelle : `fixtureTables(rules, rows)`, plus `FOREIGN_FOLDER`. */
export function seedTableFixture(seed: SeededData, options: { rules?: RuleSpec[]; rows?: readonly RowBlock[] } = {}): Promise<ReferenceOrgSql> {
  const tables = fixtureTables(options.rules, options.rows)
  tables.nodes.push({ ...FOREIGN_FOLDER })
  return seedReferenceTables(seed, tables, { [FORMER_USER]: randomUUID() })
}
