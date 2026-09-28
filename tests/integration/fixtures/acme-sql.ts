// Acme sur O (`acmeTables`, `acme.ts`) sur une vraie base (E01-S10, lot t1-0) : les tables de O et P de
// `referenceTables(rules)`, plus les nœuds d'Acme hors Perso, publiés en révision 1, leurs blocs et les
// lignes du tableau, écrits par `seedReferenceTables` (`tests/helpers/reference-org-sql.ts`) sur la
// connexion d'administration, jetables et portables. Ce que rend la fonction : le même `ReferenceOrgSql`
// que `seedReferenceOrg` ; un nœud d'Acme se joint par `ref.nodeId(path)`, un bloc par
// `ref.id(simulatedBlockId(n))`, et Ada, administratrice de O, lit toutes les procédures.
//
// Un écart, imposé par le schéma : `conseil/contexte` n'est pas semé. O n'a pas d'équipe Conseil, et un
// Contexte n'existe qu'au chemin `contexte`, `<équipe>/contexte` ou `private/<handle>/contexte`
// (`is_context_path`, `nodes_guard` : 23514) ; un test qui le lit crée d'abord l'équipe Conseil.
import { nodeId, type RuleSpec } from "../../helpers/reference-org"
import { seedReferenceTables, type ReferenceOrgSql } from "../../helpers/reference-org-sql"
import type { SeededData } from "../../helpers/sql"
import { acmeTables } from "./acme"

/** Les nœuds d'`acmeTables` que le schéma refuse sur O, et que la fixture ne sème donc pas. */
export const ACME_UNSEEDED: readonly string[] = ["conseil/contexte"]

/** Acme sur la base réelle : `acmeTables(rules)`, sans `ACME_UNSEEDED`. */
export function seedAcme(seed: SeededData, options: { rules?: RuleSpec[] } = {}): Promise<ReferenceOrgSql> {
  const tables = acmeTables(options.rules)
  const unseeded = new Set(ACME_UNSEEDED.map(nodeId))
  tables.nodes = tables.nodes.filter((row) => !unseeded.has(String(row.id)))
  tables.blocks = tables.blocks.filter((row) => !unseeded.has(String(row.node_id)))
  return seedReferenceTables(seed, tables)
}
