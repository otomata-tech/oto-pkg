// @vitest-environment node
// Une transaction par opération des tableaux (E01-S10, lot c1, AC-x4) : `table.write` et `table.claim`
// écrivaient chaque ligne par un appel PostgREST ; passés au SQL, les écritures d'un appel tiennent dans
// une seule transaction, et une panne de la base au milieu n'en laisse aucune. La seconde écriture de
// chaque appel échoue (`57014`, rendu par l'espion `dbSpy` à la place de la base : la requête ne part
// pas) ; la première, partie, est défaite, et les lignes relues par la connexion d'administration sont
// celles d'avant l'appel. Sur la fixture d'E07-S01 (`seedTableFixture`, une graine pour le fichier),
// lignes posées par `fixtureRows`. En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { CatalogFunction } from "../../packages/plateforme/server/catalog/define"
import type { Identity } from "../../packages/plateforme/server/identity"
import { tableClaim } from "../../packages/plateforme/server/tables/claim"
import { tableWrite } from "../../packages/plateforme/server/tables/write"
import type { ReferenceOrgSql } from "../helpers/reference-org-sql"
import { isWrite, type SpiedCall, type SpiedFailure } from "../helpers/spy-t1-c1a"
import { sqlConfigured, seedWithAdmin, type SeededData, portable } from "../helpers/sql"
import { PROSPECTS, runFunction } from "../factories/table-fixture"
import { seedTableFixture } from "../factories/table-fixture-sql"
import { CASE_TIMEOUT, clientOf, fixtureRows, SEED_TIMEOUT, type FixtureRows } from "../factories/table-rows-sql"

afterEach(() => {
  vi.restoreAllMocks()
})

/** Crochet de `dbSpy` : la `nth` écriture `op` de lignes (`blocks`) reçoit la panne `57014`, sans partir. */
function failingAt(op: "insert" | "update", nth: number): (call: SpiedCall) => SpiedFailure | null {
  let seen = 0
  return (call) => {
    if (call.op !== op || !call.tables.includes("blocks")) return null
    seen += 1
    return seen === nth ? { code: "57014" } : null
  }
}

describe.skipIf(!sqlConfigured)(portable("one transaction per table operation (AC-x4)"), { timeout: CASE_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql
  let fixture: FixtureRows

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedTableFixture(seed)
    fixture = fixtureRows(seed, ref)
  }, SEED_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SEED_TIMEOUT)

  /** Les lignes des prospects telles que la base les garde, rangées par clé (un tableau simple, sans les champs du résultat). */
  async function prospects() {
    return [
      ...(await seed.admin`
        select key, data, provenance, revision, claimed_by, claimed_by_user, lease_until, updated_at from platform.blocks
         where node_id = ${ref.nodeId(PROSPECTS.path)} and state = 'published' and type = 'row' order by key`),
    ]
  }

  /** L'appel de `fn` par `identity`, la panne jouée par `before` : son refus, les écritures parties, les lignes avant et après. */
  async function failedCall(fn: CatalogFunction, identity: Identity, args: Record<string, unknown>, before: (call: SpiedCall) => SpiedFailure | null) {
    const spy = await fixture.database(undefined, before)
    const rowsBefore = await prospects()
    const refused = await runFunction(fn, { db: await clientOf(ref, identity, spy), identity, ctx: "ABCD-1234", origin: "https://acme.test" }, { table: PROSPECTS.path, ...args }).then(
      () => null,
      (reason: unknown) => reason,
    )
    const writes = spy.calls.filter((call) => call.tables.includes("blocks") && isWrite(call)).map((call) => call.op)
    return { refused, writes, rowsBefore, rowsAfter: await prospects() }
  }

  it("should leave no row written by table.write when the base fails on a later row of the call", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const rows = [
      { key: "Atelier 2", set: { notes: { value: "Visite prévue", comment: "Agenda" } } },
      { key: "Nouveau Prospect", set: { contact: { value: "Hélène Dubois", comment: "Salon" } } },
    ]
    const { refused, writes, rowsBefore, rowsAfter } = await failedCall(tableWrite, ref.identityOf("lea"), { rows }, failingAt("insert", 1))
    expect(refused).toMatchObject({ code: "internal", message: "Internal error." })
    expect(logged).toHaveBeenCalledWith("[platform] tables: insert row", "57014")
    // La mise à jour d'« Atelier 2 » est partie avant la panne : la transaction l'a défaite.
    expect(writes).toEqual(["update", "insert"])
    expect(rowsAfter).toEqual(rowsBefore)
  })

  it("should leave no row claimed by table.claim when the base fails on a later claim of the call", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { refused, writes, rowsBefore, rowsAfter } = await failedCall(tableClaim, ref.identityOf("claire"), { worker: "claude-claire", limit: 2 }, failingAt("update", 2))
    expect(refused).toMatchObject({ code: "internal", message: "Internal error." })
    expect(logged).toHaveBeenCalledWith("[platform] tables: update row", "57014")
    // La première réservation est partie avant la panne : la transaction l'a défaite.
    expect(writes).toEqual(["update", "update"])
    expect(rowsAfter).toEqual(rowsBefore)
  })
})
