// @vitest-environment node
// La face SQL de l'espion des requêtes (`dbSpy` de `tests/helpers/spy-t1-c1a.ts` ; E01-S10, lot t1-c1a), qu'aucun
// module de `server/` n'emprunte avant la conversion de sa partie : sans ce test, un défaut de cette face
// rendrait vides, donc vraies, les preuves « aucune lecture de `blocks` » et « aucune écriture » des tests
// réécrits sur base réelle (AC-x3), au lieu de les faire échouer. La face PostgREST est exercée par les
// assertions positives de ces tests (comptage d'AC16, insertion d'AC1, mises à jour d'AC12 des tableaux).
// Portable : `asCaller` seul, aucune donnée semée (AC-a7).
import { randomUUID } from "crypto"
import { describe, expect, it } from "vitest"
import { dbSpy, isWrite, type SpiedCall } from "../helpers/spy-t1-c1a"
import { asCaller, SQL_SKIP_REASON, sqlConfigured } from "../helpers/sql"

/** Une transaction de trois instructions sur la base partagée : quelques centaines de millisecondes au calme. */
const NETWORK_TIMEOUT = 60_000

describe.skipIf(!sqlConfigured)(sqlConfigured ? "dbSpy on the SQL face, portable" : `dbSpy on the SQL face, portable (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  it("should note each statement once as it is sent, with its tables, verb and bound values, and raise the failure of its hook instead of sending it", async () => {
    const id = randomUUID()
    const order: string[] = []
    const spy = dbSpy((call) => {
      order.push(`before ${call.op}`)
      return isWrite(call) ? { code: "57014" } : null
    })
    const seen = await spy.wrap(asCaller(randomUUID())).tx(async (sql) => {
      // Un fragment, jamais déclenché seul : il ne part pas, et rien ne le note.
      const where = sql`where id = ${id}`
      const [row] = await sql<{ n: number }[]>`select count(${sql("id")})::int as n from platform.orgs ${where}`
      order.push("sent")
      // Envoyée, l'instruction échouerait sur `1 / 0` (22012), et toute la transaction avec elle : la suivante ne passerait pas.
      const refused: unknown = await sql`update platform.orgs set name = ${"renamed"} where id = ${id} and 1 / 0 = 1`.catch((error: unknown) => error)
      const [alive] = await sql<{ ok: number }[]>`select 1 as ok`.execute()
      return { n: row.n, refused, ok: alive.ok }
    })
    expect(seen).toMatchObject({ n: 0, refused: { code: "57014" }, ok: 1 })
    expect(order).toEqual(["before select", "sent", "before update", "before select"])
    const expected: SpiedCall[] = [
      { face: "sql", tables: ["orgs"], op: "select", values: [id], count: true, text: 'select count("id")::int as n from platform.orgs where id = ?' },
      { face: "sql", tables: ["orgs"], op: "update", values: ["renamed", id], count: false, text: "update platform.orgs set name = ? where id = ? and 1 / 0 = 1" },
      { face: "sql", tables: [], op: "select", values: [], count: false, text: "select 1 as ok" },
    ]
    expect(spy.calls).toEqual(expected)
  })
})
