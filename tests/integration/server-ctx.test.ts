// @vitest-environment node
// Code `ctx` (E03-S01, AC10 à AC12, H27 ; E03-S08 AC2) sur une vraie base, en suite portable (E01-S10,
// partie e1a : `server/ctx.ts` passe au SQL ; AC-x3, fiche D76 A) : l'émission à la version des règles,
// un seul nouvel essai sur un code déjà pris ; la garde qui refuse un code inconnu, d'une autre personne,
// d'une autre organisation ou d'autres règles ; la borne des nouveautés, dernier code de la personne dans
// l'organisation, et le rejet d'une lecture en panne (suite de HN-E01S10-t1c2-4). O et P de
// `seedReferenceOrg` ; sous la seule isolation, Léa lit les codes de ses collègues et ceux de P, dont elle
// est membre : le service les écarte lui-même. Les cas sans base sont dans `tests/unit/server-ctx.test.ts`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { CTX_PATTERN } from "../../packages/plateforme/schemas"
import { CTX_ALPHABET, issueCtx, lastCtxAt, missingCtxMessage, newCtxCode, requireCtx, staleCtxMessage } from "../../packages/plateforme/server/ctx"
import { PlatformError } from "../../packages/plateforme/server/errors"
import { ORG, OTHER_ORG, PEOPLE, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { asCaller, seedWithAdmin, spyDb, SQL_SKIP_REASON, sqlConfigured, type SeededData } from "../helpers/sql"

const SETUP_TIMEOUT = 180_000
const SUITE = "ctx codes on a real database"

// Les caractères que tire `newCtxCode`, un par appel de `randomInt` : un cas les impose pour rejouer une
// collision sur la base ; sinon, le vrai tirage.
const drawn = vi.hoisted(() => ({ queue: [] as number[] }))
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>()
  return { ...actual, randomInt: (max: number) => drawn.queue.shift() ?? actual.randomInt(max) }
})

/** Les tirages qui donnent `code` à `newCtxCode`. */
const drawsOf = (code: string) => [...code.replace("-", "")].map((char) => CTX_ALPHABET.indexOf(char))

describe.skipIf(!sqlConfigured)(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  afterEach(() => {
    drawn.queue.length = 0
    vi.restoreAllMocks()
  })

  const dbOf = (person: Person) => asCaller(ref.people[person].id, ref.people[person].email)
  const setRulesVersion = (version: number) => seed.admin`update platform.orgs set rules_version = ${version} where id = ${ref.org.id}`
  const ctxRow = async (code: string) =>
    (await seed.admin`select code, org_id, user_id, rules_version, host, user_agent from platform.ctx where code = ${code}`)[0]

  describe("issueCtx (AC10)", () => {
    it("should insert the code with the current rules version, the host and the user agent", async () => {
      await setRulesVersion(7)
      const code = await issueCtx(dbOf("lea"), ref.identityOf("lea"), { host: "claude-ai@0.1.0", userAgent: "ua" })
      expect(code).toMatch(CTX_PATTERN)
      expect(await ctxRow(code)).toEqual({ code, org_id: ref.org.id, user_id: ref.people.lea.id, rules_version: 7, host: "claude-ai@0.1.0", user_agent: "ua" })
    })

    it("should draw again once on a code already taken, then give up with internal", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {})
      // Un code de Claire, tiré dans l'alphabet de Crockford (celui des codes de la fixture en déborde).
      const taken = newCtxCode()
      await seed.admin`insert into platform.ctx (code, org_id, user_id, rules_version) values (${taken}, ${ref.org.id}, ${ref.people.claire.id}, 1)`

      drawn.queue.push(...drawsOf(taken))
      const code = await issueCtx(dbOf("lea"), ref.identityOf("lea"), { host: null, userAgent: null })
      expect(code).toMatch(CTX_PATTERN)
      expect(code).not.toBe(taken)
      expect(await ctxRow(code)).toMatchObject({ user_id: ref.people.lea.id })
      expect(await ctxRow(taken)).toMatchObject({ user_id: ref.people.claire.id })

      drawn.queue.push(...drawsOf(taken), ...drawsOf(taken))
      const error = await issueCtx(dbOf("lea"), ref.identityOf("lea"), { host: null, userAgent: null }).catch((reason: unknown) => reason)
      expect(error).toBeInstanceOf(PlatformError)
      expect(error).toMatchObject({ code: "internal" })
      expect(log).toHaveBeenCalledWith("[platform] issueCtx: two ctx code collisions in a row")
    })
  })

  describe("requireCtx (AC11, AC12)", () => {
    it("should refuse an unknown code, another person's code and a code of another organisation", async () => {
      await setRulesVersion(2)
      await ref.write({
        ctx: [
          { code: "BBBB-0001", org_id: ORG.id, user_id: PEOPLE.claire.id, rules_version: 2 },
          { code: "BBBB-0002", org_id: OTHER_ORG.id, user_id: PEOPLE.lea.id, rules_version: 2 },
        ],
      })
      const lea = ref.identityOf("lea")
      for (const code of ["ZZZZ-ZZZZ", ref.id("BBBB-0001"), ref.id("BBBB-0002")]) {
        await expect(requireCtx(dbOf("lea"), lea, code), code).rejects.toMatchObject({ code: "ctx_missing", message: missingCtxMessage(ref.org.prefix) })
      }
    })

    it("should refuse a code issued under other rules as stale", async () => {
      await setRulesVersion(2)
      await ref.write({ ctx: [{ code: "CCCC-0001", org_id: ORG.id, user_id: PEOPLE.lea.id, rules_version: 1 }] })
      await expect(requireCtx(dbOf("lea"), ref.identityOf("lea"), ref.id("CCCC-0001"))).rejects.toMatchObject({
        code: "ctx_stale",
        message: staleCtxMessage(ref.org.prefix),
      })
    })

    it("should accept the caller's code, trimmed and upper-cased, with the host it carries", async () => {
      await setRulesVersion(2)
      await ref.write({ ctx: [{ code: "DDDD-0001", org_id: ORG.id, user_id: PEOPLE.lea.id, rules_version: 2, host: "claude-ai@0.1.0" }] })
      const code = ref.id("DDDD-0001")
      await expect(requireCtx(dbOf("lea"), ref.identityOf("lea"), `  ${code.toLowerCase()} `)).resolves.toEqual({ code, host: "claude-ai@0.1.0" })
    })
  })

  describe("lastCtxAt (E03-S08, AC2)", () => {
    it("should give the last code of the person in the organisation, as PostgREST wrote it, never a colleague's nor another organisation's", async () => {
      // Paul rejoint P : sous l'isolation, il y lit ses propres codes, que le service écarte à l'adresse de O.
      await ref.write({ members: [{ org_id: OTHER_ORG.id, user_id: PEOPLE.paul.id, role: "member" }] })
      await ref.write({
        ctx: [
          { code: "EEEE-0001", org_id: ORG.id, user_id: PEOPLE.paul.id, created_at: "2026-09-20T08:00:00.123Z" },
          { code: "EEEE-0002", org_id: ORG.id, user_id: PEOPLE.paul.id, created_at: "2026-09-21T08:00:00.654Z" },
          { code: "EEEE-0003", org_id: ORG.id, user_id: PEOPLE.claire.id, created_at: "2026-09-22T08:00:00.000Z" },
          { code: "EEEE-0004", org_id: OTHER_ORG.id, user_id: PEOPLE.paul.id, created_at: "2026-09-23T08:00:00.000Z" },
        ],
      })
      // Les microsecondes de la borne, qu'une date passée par postgres.js perdrait (`supabase-patterns.md
      // § Couplage à Supabase (ADR-012)`, `timestamptz`) : écrites en texte, converties dans la requête.
      await seed.admin`update platform.ctx set created_at = ${"2026-09-21T08:00:00.654321Z"}::text::timestamptz where code = ${ref.id("EEEE-0002")}`
      const [expected] = await seed.admin<{ at: string }[]>`select to_json(created_at) as at from platform.ctx where code = ${ref.id("EEEE-0002")}`

      expect(await lastCtxAt(dbOf("paul"), ref.identityOf("paul"))).toBe(expected.at)
      expect(expected.at).toMatch(/^2026-09-21T08:00:00\.654321\+00:00$/)
    })

    it("should give null to a person without a code", async () => {
      expect(await lastCtxAt(dbOf("marc"), ref.identityOf("marc"))).toBeNull()
    })

    it("should reject a failed read with the error of the base, never a missing bound", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const { db } = spyDb(dbOf("lea"), { fail: (query) => (query.target === "ctx" ? { code: "57014" } : null) })

      const error = await lastCtxAt(db, ref.identityOf("lea")).catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(PlatformError)
      expect(error).toMatchObject({ code: "internal" })
    })
  })
})
