// @vitest-environment node
// L'espion des requêtes du lot t1-d2a (`recordRequests`, `tests/helpers/spy-t1-d2a.ts` ; E01-S10),
// sur la face SQL, en suite portable (`sqlConfigured` : le projet, ou le Postgres nu du job
// `bare-postgres`). Aucun module de `server/` n'y passe encore : sans ce test, un espion qui noterait
// deux fois une instruction d'une transaction (postgres.js la relit par `catch`) ou jamais passerait
// toute la suite, et rendrait faux, à la conversion, les refus « sans requête » d'AC-x3 et les courses
// que pose `before`. La face PostgREST se prouve par les tests des services qui l'emploient.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { asCaller, seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, type SeededData, type SeededOrg, type SeededPerson } from "../helpers/sql"
import { recordRequests, requestedWrites } from "../helpers/spy-t1-d2a"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

describe.skipIf(!sqlConfigured)(
  sqlConfigured ? "the request spy of the t1 lots (E01-S10, AC-x3)" : `the request spy of the t1 lots (E01-S10, AC-x3) (${SQL_SKIP_REASON})`,
  { timeout: NETWORK_TIMEOUT },
  () => {
    let seed: SeededData
    let org: SeededOrg
    let member: SeededPerson

    beforeAll(async () => {
      seed = seedWithAdmin()
      org = await seed.createOrg()
      member = seed.person()
      await seed.addMember(org.id, member, "admin")
    }, SETUP_TIMEOUT)

    afterAll(async () => {
      await seed?.cleanup()
    }, SETUP_TIMEOUT)

    it("should note each statement of a transaction once, with its objects, values and write, run its hook once, and never a fragment", async () => {
      let hooks = 0
      const spy = recordRequests(asCaller(member.id, member.email), { before: () => void hooks++ })
      await spy.db.tx(async (sql) => {
        await sql`select id from platform.orgs where id = ${org.id}`
        await sql`update platform.orgs set name = name where id = ${org.id} and ${sql`true`}`
      })
      expect(spy.requests.map(({ objects, write, values }) => ({ objects, write, values: values.length }))).toEqual([
        { objects: ["orgs"], write: false, values: 1 },
        { objects: ["orgs"], write: true, values: 2 },
      ])
      expect(spy.requests[1].text).toMatch(/where id = \? and \?$/)
      expect(hooks).toBe(2)
      expect(requestedWrites(spy.requests).map((request) => request.objects)).toEqual([["orgs"]])
    })
  },
)
