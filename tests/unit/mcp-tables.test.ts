// @vitest-environment node
// Les six fonctions `table.*` par `<p>_call` (E07-S02, AC28, AC30 ; H84, N20) : `InMemoryTransport`
// (`connectDeps`), sur la fixture d'E07-S01 semée sur une vraie base (E01-S10, lot t1-c1b :
// `seedTableFixture`, une graine pour le fichier ; suite portable), garde `ctx`
// comprise (un code semé par personne). Journal : la fonction en cible, l'équipe propriétaire du tableau,
// aucun compte. Un tableau atteint par un ancien chemin (alias d'E03-S07) : la ligne « moved to »,
// `moved_from`, et l'équipe propriétaire du tableau déplacé au journal, là où `call` ne trouve pas
// l'ancien chemin. La parité des canaux, le schéma strict et les suites sont les règles d'E03-S01 et
// d'E03-S04, prouvées par leurs tests.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { describeFunction } from "../../packages/plateforme/server/catalog/registry"
import type { Identity } from "../../packages/plateforme/server/identity"
import { tableClaim } from "../../packages/plateforme/server/tables/claim"
import { tableRelease } from "../../packages/plateforme/server/tables/release"
import { tableWrite } from "../../packages/plateforme/server/tables/write"
import { connectDeps } from "../helpers/mcp"
import { nodeId, ORG, PEOPLE, TEAMS, teamOf } from "../helpers/reference-org"
import type { ReferenceOrgSql } from "../helpers/reference-org-sql"
import { seedWithAdmin, type SeededData, sqlConfigured, portable } from "../helpers/sql"
import { fixtureTables, PROSPECT_ROWS, PROSPECTS, rowBlocks } from "../factories/table-fixture"
import { seedTableFixture } from "../factories/table-fixture-sql"
import { acmeIdentity } from "../factories/table-publish-sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

/** Le code `ctx` semé pour chaque personne qui appelle : la base le tient pour unique, un par personne. */
const CTX = { lea: "ABCD-1234", claire: "ABCD-5678" } as const

describe.skipIf(!sqlConfigured)(portable("the table functions through acme_call"), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedTableFixture(seed)
    await ref.write({ ctx: (["lea", "claire"] as const).map((person) => ({ code: CTX[person], user_id: PEOPLE[person].id, org_id: ORG.id, rules_version: 1, host: null })) })
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  /** Une session MCP de la personne sur la fixture, avec son code `ctx` semé. */
  async function session(person: keyof typeof CTX, overrides: Partial<Identity> = {}) {
    const identity = acmeIdentity(ref, person, overrides)
    const connected = await connectDeps({ db: await ref.db(person), org: identity.org, caller: { kind: "member", identity }, userAgent: "unit-test", journal: [], activeConnectors: () => Promise.resolve(new Set<string>()), origin: "https://acme.test" })
    return { ...connected, run: (fn: string, args: Record<string, unknown>) => connected.call("call", { ctx: ref.id(CTX[person]), function: fn, arguments: args }) }
  }

  it("should run the six functions, each journaled with the function as target, the team that owns the table and no account (AC28)", async () => {
    const lea = await session("lea")
    const table = PROSPECTS.path
    const calls: [string, Record<string, unknown>, string | RegExp][] = [
      ["table.schema", { table }, "Table ventes/suivi_prospects: Suivi des prospects. Les prospects de l'équipe Ventes et la file des fiches à qualifier."],
      ["table.rows", { table, limit: 2 }, "ventes/suivi_prospects: 12 row(s) match; rows 1-2."],
      ["table.aggregate", { table, group_by: "statut" }, "ventes/suivi_prospects: 12 row(s) match; 5 group(s) by statut."],
      ["table.write", { table, rows: [{ key: "Boulangerie du Pont", set: { ville: { value: "Valbrune", comment: "Site officiel" } } }] }, "ventes/suivi_prospects: 1 row(s) written (1 created, 0 updated), 0 unchanged, 0 refused."],
      ["table.claim", { table, worker: "claude-lea", limit: 1 }, /^Claimed 1 row\(s\) for claude-lea until \d{2}:\d{2} UTC:$/],
      ["table.release", { table, key: "Scierie Vallon", worker: "claude-lea", state: "à revoir" }, "Scierie Vallon released → « à revoir » (revision 7)."],
    ]
    for (const [fn, args, first] of calls) {
      const result = await lea.run(fn, args)
      expect(result.isError, `${fn}: ${result.text}`).toBe(false)
      if (typeof first === "string") expect(result.text.split("\n")[0], fn).toBe(first)
      else expect(result.text.split("\n")[0], fn).toMatch(first)
    }
    expect(ref.readable(lea.journal.map((line) => [line.tool, line.target, line.team_id, line.account_id, line.is_error ?? false]))).toEqual(
      calls.map(([fn]) => ["acme_call", fn, TEAMS.ventes.id, null, false]),
    )
    // Le lien de la file de revue d'AC17, composé sur l'origine de l'adresse appelée, de la porte jusqu'au refus.
    const decided = await lea.run("table.write", { table, rows: [{ key: "Atelier 2", set: { statut: "qualifié" } }] })
    expect(decided.text.split("\n")[1]).toBe(
      "Atelier 2: refused, nothing written: statut: « qualifié » and « écarté » are decided by a person in the review queue of this table (https://acme.test/n/ventes/suivi_prospects).",
    )
    // Le contrat des trois fonctions d'écriture servi par `read` : exemples acceptés par leur schéma strict, sous 45 000 caractères.
    for (const fn of [tableWrite, tableClaim, tableRelease]) {
      for (const example of fn.examples) expect(fn.schema.safeParse(example).success, `${fn.name} ${JSON.stringify(example)}`).toBe(true)
      const { text, data } = describeFunction(fn, "acme")
      expect(JSON.stringify({ ...data, text }).length, fn.name).toBeLessThan(45_000)
    }
  })

  it("should serve a table reached by its old path with the moved line and moved_from, and journal the team that owns the moved table (AC30)", async () => {
    const prospects = fixtureTables().nodes.find((node) => node.path === PROSPECTS.path)
    // `ventes/t` déplacé en `ventes/t2`, possédé par Support : l'équipe par défaut de Claire est Ventes.
    await ref.write({
      nodes: [{ ...structuredClone(prospects), id: nodeId("ventes/t2"), path: "ventes/t2", owner_kind: "team", owner_team_id: TEAMS.support.id, owner_user_id: null }],
      node_aliases: [{ org_id: ORG.id, old_path: "ventes/t", node_id: nodeId("ventes/t2"), created_by: null, created_at: "2026-09-24T08:00:00.000000+00:00" }],
      blocks: rowBlocks(nodeId("ventes/t2"), PROSPECT_ROWS.slice(0, 2)),
    })
    const claire = await session("claire", { teams: [teamOf("ventes", "claire"), teamOf("support", "claire")] })
    const moved = "ventes/t moved to ventes/t2 on 2026-09-24: use the new path."
    for (const [fn, args] of [
      ["table.schema", {}],
      ["table.rows", {}],
      ["table.write", { rows: [{ key: "Atelier 2", set: { notes: { value: "Relancer", comment: "Demande de Claire" } } }] }],
    ] as const) {
      const result = await claire.run(fn, { table: "ventes/t", ...args })
      expect([result.isError, result.text.split("\n")[0]], fn).toEqual([false, moved])
      expect(result.result.structuredContent, fn).toMatchObject({ result: { moved_from: "ventes/t" } })
    }
    expect(ref.readable(claire.journal.map((line) => [line.target, line.team_id]))).toEqual(["table.schema", "table.rows", "table.write"].map((fn) => [fn, TEAMS.support.id]))
  })
})
