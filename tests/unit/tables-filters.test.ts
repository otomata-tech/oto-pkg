// @vitest-environment node
// Filtres d'un tableau (E07-S01, AC8 ; H95, N3, N4) : une seule grammaire, validée contre l'en-tête,
// évaluée sur les cellules des douze prospects de la fixture, sans base ; `q` (AC10) passe par
// `table.rows` (`tables-rows.test.ts`). Les refus sont servis au modèle : textes comparés mot pour mot
// (H04). Incidents d'Oto repris : `in: []` qui rendait tout le tableau (#353), `True` pour `true` qui
// rendait 0 ligne.
import { describe, expect, it } from "vitest"
import type { TableHeader } from "../../packages/plateforme/schemas"
import { tableFilterSchema } from "../../packages/plateforme/schemas/tables"
import { matchesRow, parseFilter } from "../../packages/plateforme/server/tables/filters"
import { parseTableHeader } from "../../packages/plateforme/server/tables/header"
import { rowCells } from "../../packages/plateforme/server/tables/meta"
import { PROSPECT_ROWS, PROSPECTS_HEADER } from "../factories/table-fixture"

function referenceHeader(): TableHeader {
  const parsed = parseTableHeader(PROSPECTS_HEADER)
  if (!("header" in parsed)) throw new Error(parsed.problems.join(" "))
  return parsed.header
}

const HEADER = referenceHeader()
const ENTRIES = PROSPECT_ROWS.map((block) => ({ key: block.key, cells: rowCells(block, HEADER) }))

/** Les clés des prospects que garde un filtre valide, dans l'ordre de la fixture. */
function kept(filter: unknown): string[] {
  const parsed = parseFilter(filter, HEADER)
  if ("problems" in parsed) throw new Error(parsed.problems.join(" "))
  return ENTRIES.filter((entry) => matchesRow(entry.cells, parsed.clauses)).map((entry) => entry.key)
}

function problems(filter: unknown): string[] {
  const parsed = parseFilter(filter, HEADER)
  return "problems" in parsed ? parsed.problems : []
}

const COLUMNS = "entreprise, contact, email, ville, montant_estime, dernier_contact, relance_le, actif, notes, statut"

describe("filters (AC8)", () => {
  it("should keep the rows that match every clause, text without case or accent, other types exactly", () => {
    const valbrune = ["Atelier 2", "Boulangerie Fournier", "École de Valbrune"]
    expect(kept({ ville: "Valbrune" })).toEqual(valbrune)
    expect(kept({ ville: "VALBRUNE" })).toEqual(valbrune)
    expect(kept({ ville: { eq: " valbrune " } })).toEqual(valbrune)
    expect(kept({ ville: { contains: "BREMON" } })).toEqual(["Atelier 10", "Garage des Tilleuls"])
    expect(kept({ statut: { in: ["Qualifié", "ECARTE"] } })).toEqual(["Garage des Tilleuls", "Mairie de Coudray"])
    // Un montant rangé en texte (« 12000 ») n'est pas un nombre : aucune comparaison ne le garde.
    expect(kept({ montant_estime: { gte: 10000, lt: 100000 } })).toEqual(["Camping Les Pins", "Clinique des Saules", "École de Valbrune", "Garage des Tilleuls", "Pharmacie du Port", "Scierie Vallon"])
    expect(kept({ dernier_contact: { lt: "2026-03-01" } })).toEqual(["École de Valbrune", "Ferme du Coudray"])
    // 10:00 à Paris (+02:00) est 08:00 UTC : l'instant compte, pas l'ordre des caractères.
    expect(kept({ relance_le: { lte: "2026-09-30T08:00:00Z" } })).toEqual(["Clinique des Saules", "École de Valbrune"])
    expect(kept({ actif: false })).toEqual(["Clinique des Saules", "Garage des Tilleuls", "Mairie de Coudray"])
    expect(kept({ email: { empty: true } })).toEqual(["Boulangerie Fournier", "Brasserie de la Lise", "Ferme du Coudray", "Mairie de Coudray", "Scierie Vallon"])
    expect(kept({ ville: { not_empty: true }, statut: { ne: "à traiter" } })).toEqual(["Atelier 10", "Clinique des Saules", "École de Valbrune", "Garage des Tilleuls", "Mairie de Coudray", "Scierie Vallon"])
    expect(kept({ ville: "Valbrune", montant_estime: { gt: 5000 } })).toEqual(["Boulangerie Fournier", "École de Valbrune"])
  })

  it("should refuse, each problem named, what the grammar or the column type does not take", () => {
    const tooMany = {
      montant_estime: { eq: 1, ne: 1, in: [1], gt: 1, gte: 1, lt: 1, lte: 1, empty: true, not_empty: true },
      dernier_contact: { eq: "2026-01-01", ne: "2026-01-01", in: ["2026-01-01"], gt: "2026-01-01", gte: "2026-01-01", lt: "2026-01-01", lte: "2026-01-01", empty: true, not_empty: true },
      relance_le: { eq: "2026-01-01T00:00:00Z", ne: "2026-01-01T00:00:00Z", in: ["2026-01-01T00:00:00Z"], gt: "2026-01-01T00:00:00Z", gte: "2026-01-01T00:00:00Z", lt: "2026-01-01T00:00:00Z", lte: "2026-01-01T00:00:00Z", empty: true, not_empty: true },
      ville: { eq: "a", ne: "b", contains: "c", in: ["d"] },
    }
    const cases: [unknown, string][] = [
      [{ ville: { in: [] } }, "in needs at least one value (an empty list would match nothing): ville."],
      [{ email: null }, 'null is refused in filters: use {"email": {"empty": true}} for a cell without value.'],
      [{ email: { eq: null } }, 'null is refused in filters: use {"email": {"empty": true}} for a cell without value.'],
      [{ couleur: "bleu" }, `Unknown column(s): couleur. Columns: ${COLUMNS}.`],
      [{ montant_estime: { between: [1, 2] } }, "Unknown operator between on montant_estime. Operators: eq, ne, contains, in, gt, gte, lt, lte, empty, not_empty."],
      [{ montant_estime: "12000" }, 'montant_estime is a number column: expected a number, e.g. 12000 (not "12000").'],
      [{ actif: "true" }, 'actif is a bool column: expected true or false (not "true").'],
      [{ ville: { gt: "A" } }, "gt applies to number, date and datetime columns; ville is text."],
      [{ email: { empty: false } }, 'empty takes true: {"email": {"empty": true}}.'],
      [tooMany, "Too many filter clauses (31): 30 at most."],
      [{ ville: { in: Array.from({ length: 101 }, (_, index) => `v${index}`) } }, "in takes 100 values at most (101 given): ville."],
    ]
    for (const [filter, problem] of cases) expect(problems(filter), problem).toContain(problem)
    // Un refus bâti sur des noms reçus en cite 20 au plus, puis leur nombre (mcp-patterns.md § 4).
    const names = Array.from({ length: 25 }, (_, index) => `c${index}`)
    const twenty = `${names.slice(0, 20).join(", ")}, … and 5 more`
    expect(problems(Object.fromEntries(names.map((name) => [name, 1])))).toEqual([`Unknown column(s): ${twenty}. Columns: ${COLUMNS}.`])
    // Le schéma des arguments dit les mêmes refus que le service, avant lui (arguments de `call`).
    const issue = (filter: unknown) => tableFilterSchema.safeParse(filter).error?.issues[0]?.message
    expect([
      issue({ email: null }),
      issue({ montant_estime: { between: [1, 2] } }),
      issue({ montant_estime: Object.fromEntries(names.map((name) => [name, 1])) }),
      issue({ ville: { in: Array.from({ length: 101 }, (_, index) => `v${index}`) } }),
    ]).toEqual([
      'null is refused in filters: use {"email": {"empty": true}} for a cell without value.',
      "Unknown operator between on montant_estime. Operators: eq, ne, contains, in, gt, gte, lt, lte, empty, not_empty.",
      `Unknown operators ${twenty} on montant_estime. Operators: eq, ne, contains, in, gt, gte, lt, lte, empty, not_empty.`,
      "in takes 100 values at most (101 given): ville.",
    ])
  })
})
