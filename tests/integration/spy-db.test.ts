// @vitest-environment node
// L'espion des requêtes des tests réécrits sur base réelle (E01-S10, lot t1-c1b : `spyDb` de
// `tests/helpers/spy-tables.ts`) sur la face SQL, qu'aucun test de service n'exerce avant la conversion
// de sa partie : chaque requête vue une fois, dans l'ordre où elle part, l'écriture concurrente jouée juste
// avant elle, la panne demandée rendue à sa place sans que la requête parte. Sans ce test, un défaut
// de cette face fausserait les preuves d'AC-x3 (refus sans requête, courses) au lieu de les faire
// échouer. La face PostgREST est exercée par les tests du lot t1-c1b. Portable : `asCaller` et la
// connexion d'administration (AC-a7).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { spyDb, type DbCall } from "../helpers/spy-tables"
import { asCaller, seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, type SeededData, type SeededOrg, type SeededPerson } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000

describe.skipIf(!sqlConfigured)(sqlConfigured ? "spyDb on the SQL face, portable" : `spyDb on the SQL face, portable (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let org: SeededOrg
  let person: SeededPerson

  beforeAll(async () => {
    seed = seedWithAdmin()
    org = await seed.createOrg()
    person = seed.person()
    await seed.addMember(org.id, person, "admin")
  }, NETWORK_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, NETWORK_TIMEOUT)

  it("should see each query of a transaction once, play the concurrent write before it, and fail it on demand without sending it", async () => {
    const order: string[] = []
    const meanwhile = async (call: DbCall) => {
      order.push(`meanwhile ${call.kind === "table" ? `${call.table} ${call.op}` : call.name}`)
    }
    const fail = (call: DbCall) => (call.kind === "table" && call.op === "update" ? { code: "57014" } : null)
    const { db, calls } = spyDb(asCaller(person.id, person.email), { meanwhile, fail })

    const members = await db.tx(async (sql) => {
      const [row] = await sql<{ count: number }[]>`select count(*)::int as count from platform.members where org_id = ${org.id}`
      order.push("sent")
      return row.count
    })
    await db.tx((sql) => sql`select platform.org_by_host(${org.host})`)
    const refused = await db.tx((sql) => sql`update platform.orgs set name = ${"renamed"} where id = ${org.id}`).then(
      () => null,
      (error: unknown) => error,
    )

    expect([members, refused]).toMatchObject([1, { code: "57014" }])
    expect(calls).toEqual([
      { kind: "table", table: "members", op: "select", count: true, values: [org.id] },
      { kind: "rpc", name: "org_by_host", values: [org.host] },
      { kind: "table", table: "orgs", op: "update", values: ["renamed", org.id] },
    ])
    expect(order).toEqual(["meanwhile members select", "sent", "meanwhile org_by_host", "meanwhile orgs update"])
    const [kept] = await seed.admin<{ name: string }[]>`select name from platform.orgs where id = ${org.id}`
    expect(kept.name).toBe(org.name)
  })
})
