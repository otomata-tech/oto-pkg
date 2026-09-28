// @vitest-environment node
// La face SQL de l'espion `watchDb` (`tests/helpers/spy-t1-e2b2.ts`, E01-S10 lot t1-e2b2) : un module de service qui
// passe au SQL (parties b à e2) garde ses preuves par elle, refus sans requête (`touches`, `isWrite`,
// `callsFunction`), panne posée (`fail`), ordre de lecture (`reverse`), fonction servie par le test (`rpc`,
// lot e2b). Aucune n'est vue par un test tant
// qu'aucun module traversé n'est converti : sans ce cas de fumée, une preuve y deviendrait vide sans bruit.
// Portable : `asCaller` et la connexion d'administration, sur le projet comme dans le job `bare-postgres`.
// Il garde l'erreur du cycle 1 du lot : dans une transaction, une lecture mise à rebours revenait à
// l'endroit (`begin` guette chaque requête par `catch`, qui passe par son `then`).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { callsFunction, isWrite, touches, watchDb } from "../helpers/spy-t1-e2b2"
import { asCaller, seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, type SeededData, type SeededOrg, type SeededPerson } from "../helpers/sql"

const SETUP_TIMEOUT = 60_000

describe.skipIf(!sqlConfigured)(sqlConfigured ? "watchDb, SQL face" : `watchDb, SQL face (${SQL_SKIP_REASON})`, { timeout: SETUP_TIMEOUT }, () => {
  let seed: SeededData
  let org: SeededOrg
  let reader: SeededPerson

  beforeAll(async () => {
    seed = seedWithAdmin()
    org = await seed.createOrg()
    reader = seed.person()
    await seed.addMember(org.id, reader, "admin")
    for (let index = 0; index < 3; index++) await seed.addMember(org.id, seed.person())
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  it("should give the targeted query its rows in reverse, once, in a transaction, and leave a fragment, values() and other queries working", async () => {
    const ordered = await seed.admin<{ email: string }[]>`select email from platform.members where org_id = ${org.id} order by email`
    const reversed = ordered.map((row) => row.email).reverse()
    const { db, calls } = watchDb(asCaller(reader.id, reader.email), { reverse: (call) => touches(call, "members") })

    const rows = await db.tx((sql) => sql<{ email: string }[]>`select email from platform.members where org_id = ${org.id} order by email`)
    const withFragment = await db.tx((sql) => sql<{ email: string }[]>`select email from platform.members ${sql`where org_id = ${org.id}`} order by email`)
    const values = await db.tx((sql) => sql`select email from platform.members where org_id = ${org.id} order by email`.values())
    const other = await db.tx((sql) => sql<{ n: number }[]>`select generate_series(1, 3) as n`)

    expect([rows.map((row) => row.email), withFragment.map((row) => row.email), values.map(([email]) => email)]).toEqual([reversed, reversed, reversed])
    expect(rows.count).toBe(4)
    expect(other.map((row) => row.n)).toEqual([1, 2, 3])
    expect(calls.filter((call) => touches(call, "members"))).toHaveLength(3)
  })

  it("should see a read and a write of platform, and refuse the write with the code asked without sending it", async () => {
    // Une écriture que la base accepte de l'administratrice (`orgs_update_admin` : `settings`), refusée sous un
    // code que la base ne rendrait pas ici : partie, elle se lirait dans la ligne.
    const { db, calls } = watchDb(asCaller(reader.id, reader.email), { fail: (call) => (isWrite(call) ? { code: "57014" } : null) })

    const read = await db.tx((sql) => sql`select name from platform.members where org_id in (select platform.member_orgs()) and user_id = ${reader.id}`)
    const write = await db.tx((sql) => sql`update platform.orgs set settings = ${sql.json({ spy: true })} where id = ${org.id}`).then(
      () => null,
      (error: unknown) => error,
    )

    expect(read).toHaveLength(1)
    expect(write).toMatchObject({ code: "57014" })
    expect(calls.map((call) => [touches(call, "members"), touches(call, "orgs"), isWrite(call), callsFunction(call, "member_orgs")])).toEqual([
      [true, false, false, true],
      [false, true, true, false],
    ])
    const [row] = await seed.admin<{ settings: Record<string, unknown> }[]>`select settings from platform.orgs where id = ${org.id}`
    expect(row.settings).not.toHaveProperty("spy")
  })

  // Lot e2b : `find` et `routing` appellent `search_content` et `route_candidates` par la face SQL ; leurs tests
  // en font rendre les lignes par l'espion (HN-E01S10-t1e2b2-1).
  it("should serve a function asked by the test, recorded with its named arguments, fragments unfolded, without sending the query", async () => {
    const served: Record<string, unknown>[] = []
    const { db, calls } = watchDb(asCaller(reader.id, reader.email), {
      rpc: {
        absent_function: (args) => {
          served.push(args)
          return [{ n: 1 }, { n: 2 }]
        },
      },
    })

    // Une fonction que la base n'a pas : partie, la requête échouerait (`42883`).
    const rows = await db.tx((sql) => {
      const kinds = sql`p_kinds => ${["page", "context"]}, `
      return sql<{ n: number }[]>`select f.n from platform.absent_function(p_org => ${org.id}, ${kinds}p_limit => ${50}) f`
    })
    const failed = await watchDb(asCaller(reader.id, reader.email), { rpc: { absent_function: () => [] }, fail: (call) => (callsFunction(call, "absent_function") ? { code: "57014" } : null) })
      .db.tx((sql) => sql`select * from platform.absent_function(p_org => ${org.id})`)
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(rows).toEqual([{ n: 1 }, { n: 2 }])
    expect(served).toEqual([{ p_org: org.id, p_kinds: ["page", "context"], p_limit: 50 }])
    expect(calls.filter((call) => call.kind === "rpc")).toEqual([{ kind: "rpc", name: "absent_function", args: { p_org: org.id, p_kinds: ["page", "context"], p_limit: 50 } }])
    expect(failed).toMatchObject({ code: "57014" })
  })
})
