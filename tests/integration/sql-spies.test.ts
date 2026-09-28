// @vitest-environment node
// La face SQL des deux espions de `tests/helpers/sql.ts`, `spyDb` (lot t1-e1) et `recordDb` (lot e1b1), que
// des tests de service croient sur parole : sans ce test, un espion qui noterait deux fois une instruction
// (postgres.js la relit par le `catch` qu'il pose dans une transaction), ou jamais une instruction lancée par
// `execute()`, rendrait vides, donc vraies, les preuves « aucune écriture » (AC-x3), ou jouerait deux fois une
// course (`testing-strategy.md § Anti-patterns`, « Aide de test qui observe ou simule la base » ; M32). Chaque
// espion est exercé par `then` (un `await`) et par `execute()`. Portable : `asCaller` seul, aucune donnée semée.
import { randomUUID } from "crypto"
import { describe, expect, it } from "vitest"
import { asCaller, opOf, portable, recordDb, spyDb, sqlConfigured } from "../helpers/sql"

/** Deux transactions de quelques instructions sur la base partagée : quelques centaines de millisecondes au calme. */
const NETWORK_TIMEOUT = 60_000

describe.skipIf(!sqlConfigured)(portable("spyDb and recordDb on the SQL face"), { timeout: NETWORK_TIMEOUT }, () => {
  it("spyDb should see each statement once as it is sent, by then and by execute, and raise the failure of fail instead of sending it", async () => {
    const id = randomUUID()
    const order: string[] = []
    const { db, sent } = spyDb(asCaller(randomUUID()), {
      before: (query) => {
        order.push(`before ${query.op} ${query.target}`)
      },
      fail: (query) => (query.op === "update" ? { code: "57014" } : null),
    })
    const seen = await db.tx(async (sql) => {
      // Un fragment, jamais déclenché seul : il ne part pas, et rien ne le voit.
      const where = sql`where id = ${id}`
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from platform.orgs ${where}`
      order.push("sent")
      // Envoyée, l'instruction échouerait sur `1 / 0` (22012), et toute la transaction avec elle : la suivante ne passerait pas.
      const refused: unknown = await sql`update platform.orgs set name = ${"renamed"} where id = ${id} and 1 / 0 = 1`.catch((error: unknown) => error)
      const [alive] = await sql<{ ok: number }[]>`select 1 as ok`.execute()
      return { n: row.n, refused, ok: alive.ok }
    })
    expect(seen).toMatchObject({ n: 0, refused: { code: "57014" }, ok: 1 })
    expect(order).toEqual(["before select orgs", "sent", "before update orgs", "before select null"])
    expect(sent.map((query) => [query.op, query.target])).toEqual([
      ["select", "orgs"],
      ["update", "orgs"],
      ["select", null],
    ])
  })

  it("recordDb should record each statement, by then and by execute, then the end of its transaction and whether it wrote", async () => {
    const recorded = recordDb(asCaller(randomUUID()))
    await recorded.db.tx(async (sql) => {
      await sql`select 1 as one`
      await sql`select 2 as two`.execute()
    })
    // `txid_current()` attribue un identifiant à la transaction : ce que Postgres fait à sa première écriture.
    await recorded.db.tx(async (sql) => {
      await sql`select pg_catalog.txid_current() as xid`.execute()
    })
    expect(recorded.requests.map(opOf)).toEqual(["select", "select", "commit", "select", "commit"])
    expect(recorded.writes()).toEqual([{ kind: "transaction", wrote: true }])
  })

  it("recordDb should record the statements of a tx that resumes an open transaction, and only the end of the outer one", async () => {
    const recorded = recordDb(asCaller(randomUUID()))
    await recorded.db.tx(async (sql) => {
      await sql`select 1 as outer_one`
      // Un service appelé par un autre : son `tx` reprend la transaction ouverte (`server/sql.ts`).
      await recorded.db.tx((inner) => inner`select pg_catalog.txid_current() as xid`.execute())
      await sql`select 2 as outer_two`
    })
    expect(recorded.requests.map(opOf)).toEqual(["select", "select", "select", "commit"])
    expect(recorded.writes()).toEqual([{ kind: "transaction", wrote: true }])
  })
})
