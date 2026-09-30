// @vitest-environment node
// Code `ctx` (E03-S01, AC10 à AC12, H27 ; E03-S08 AC2) sur une vraie base, en suite portable (E01-S10,
// partie e1a : `server/ctx.ts` passe au SQL ; AC-x3, fiche D76 A) : l'émission à la version des règles,
// un seul nouvel essai sur un code déjà pris ; la garde qui refuse un code inconnu, d'une autre personne,
// d'une autre organisation ou d'autres règles ; la borne des nouveautés, dernier code de la personne dans
// l'organisation, et le rejet d'une lecture en panne (suite de HN-E01S10-t1c2-4). O et P de
// `seedReferenceOrg` ; sous la seule isolation, Léa lit les codes de ses collègues et ceux de P, dont elle
// est membre : le service les écarte lui-même. Les cas sans base sont dans `tests/unit/server-ctx.test.ts`.
import { randomUUID } from "node:crypto"
import type postgres from "postgres"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { CTX_PATTERN } from "../../packages/plateforme/schemas"
import { CTX_ALPHABET, issueCtx, lastCtxAt, missingCtxMessage, newCtxCode, requireCtx, staleCtxMessage } from "../../packages/plateforme/server/ctx"
import { PlatformError } from "../../packages/plateforme/server/errors"
import { connectDeps } from "../helpers/mcp"
import { ORG, OTHER_ORG, PEOPLE, TEAMS, type Person } from "../helpers/reference-org"
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
    // Le Privé de Léa et celui de Claire, publiés en révision 1 (E11-S03).
    ref = await seedReferenceOrg(seed, { nodes: [{ path: "private/lea/contexte" }, { path: "private/claire/contexte" }] })
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
    (await seed.admin`select code, org_id, user_id, rules_version, contexts, host, user_agent from platform.ctx where code = ${code}`)[0]

  /** Blocs d'un instantané de `node_versions`, tels que `publish_node` les écrit. */
  const snapshot = (text: string, extra: Record<string, postgres.JSONValue> = {}) => [
    { id: randomUUID(), type: "paragraph", position: 1, key: null, text, data: {}, provenance: {}, revision: 1, ...extra },
  ]
  /**
   * Une publication du Contexte à `path`, comme `publish_node` la laisse : un instantané à la révision suivante, la
   * révision du nœud avancée. Rend la révision publiée.
   */
  async function publishContext(path: string, blocks: postgres.JSONValue[]): Promise<number> {
    const [node] = await seed.admin<{ id: string; revision: number }[]>`select id, revision from platform.nodes where id = ${ref.nodeId(path)}`
    const revision = node.revision + 1
    await seed.admin`insert into platform.node_versions (node_id, revision, title, summary, kind, blocks)
                     values (${node.id}, ${revision}, ${"Contexte"}, ${"Le contexte."}, 'context', ${seed.admin.json(blocks)})`
    await seed.admin`update platform.nodes set revision = ${revision} where id = ${node.id}`
    return revision
  }
  /** Les révisions publiées des Contextes de O, lues comme `issueCtx` les lit. */
  const revisionOf = async (path: string) =>
    (await seed.admin<{ revision: number }[]>`select revision from platform.nodes where id = ${ref.nodeId(path)}`)[0].revision

  describe("issueCtx (AC10 ; E11-S03, AC-a1)", () => {
    it("should insert the code with the current rules version, the revision of each expected Contexte, the host and the user agent", async () => {
      await setRulesVersion(7)
      const code = await issueCtx(dbOf("lea"), ref.identityOf("lea"), { host: "claude-ai@0.1.0", userAgent: "ua" })
      expect(code).toMatch(CTX_PATTERN)
      // Léa : Tout le monde, son Privé et Ventes, publiés.
      expect(await ctxRow(code)).toEqual({
        code,
        org_id: ref.org.id,
        user_id: ref.people.lea.id,
        rules_version: 7,
        contexts: { contexte: await revisionOf("contexte"), "private/lea/contexte": await revisionOf("private/lea/contexte"), "ventes/contexte": await revisionOf("ventes/contexte") },
        host: "claude-ai@0.1.0",
        user_agent: "ua",
      })
      // Sans `handle`, aucun Privé gardé ; une équipe sans Contexte, à 0 ; le Contexte d'une équipe d'ailleurs (Support), jamais.
      const achats = { id: ref.id(TEAMS.ventes.id), slug: "achats", name: "Achats", role: "member" as const }
      const other = await issueCtx(dbOf("lea"), ref.identityOf("lea", { member: { role: "member", profile: {} }, teams: [achats] }), { host: null, userAgent: null })
      expect((await ctxRow(other)).contexts).toEqual({ contexte: await revisionOf("contexte"), "achats/contexte": 0 })
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

    // E11-S03 (AC-a5, HN-E11S03-4) : un code émis avant la 1.1.0 ne dit pas ce qu'il a servi ; `rules_version` n'est plus lu.
    it("should refuse a code without kept Contextes as stale, without paths, and ignore the rules version", async () => {
      await ref.write({ ctx: [{ code: "CCCC-0001", org_id: ORG.id, user_id: PEOPLE.lea.id, rules_version: 1, contexts: null }] })
      await expect(requireCtx(dbOf("lea"), ref.identityOf("lea"), ref.id("CCCC-0001"))).rejects.toMatchObject({
        code: "ctx_stale",
        message: `context has changed: call ${ref.org.prefix}_context again with the same request, then retry this call.`,
      })
      await ref.write({ ctx: [{ code: "CCCC-0002", org_id: ORG.id, user_id: PEOPLE.lea.id, rules_version: 1 }] })
      await setRulesVersion(9)
      await expect(requireCtx(dbOf("lea"), ref.identityOf("lea"), ref.id("CCCC-0002"))).resolves.toMatchObject({ code: ref.id("CCCC-0002") })
    })

    it("should accept the caller's code, trimmed and upper-cased, with the host it carries", async () => {
      await setRulesVersion(2)
      await ref.write({ ctx: [{ code: "DDDD-0001", org_id: ORG.id, user_id: PEOPLE.lea.id, rules_version: 2, host: "claude-ai@0.1.0" }] })
      const code = ref.id("DDDD-0001")
      await expect(requireCtx(dbOf("lea"), ref.identityOf("lea"), `  ${code.toLowerCase()} `)).resolves.toEqual({ code, host: "claude-ai@0.1.0" })
    })
  })

  // E11-S03, lot a (FB-0005) : le code périme par les Contextes qu'il a servis, et eux seuls.
  describe("requireCtx, the kept Contextes (E11-S03, AC-a2 to AC-a6)", () => {
    const stale = (paths: string[]) => ({ code: "ctx_stale", message: staleCtxMessage(ref.org.prefix, paths) })
    /** Un code de Léa (Ventes) émis maintenant : ce qu'il garde est ce que lit `issueCtx`. */
    const leaCode = () => issueCtx(dbOf("lea"), ref.identityOf("lea"), { host: null, userAgent: null })
    const guard = (code: string) => requireCtx(dbOf("lea"), ref.identityOf("lea"), code)

    it("should refuse a code once everyone's, her team's or her own Contexte is published with another content, naming it", async () => {
      for (const path of ["contexte", "ventes/contexte", "private/lea/contexte"]) {
        const code = await leaCode()
        await expect(guard(code), path).resolves.toMatchObject({ code })
        await publishContext(path, snapshot(`Nouveau ${path} ${randomUUID()}`))
        await expect(guard(code), path).rejects.toMatchObject(stale([path]))
      }
      // Deux changés : dans l'ordre des parties (Tout le monde, Privé, équipes).
      const code = await leaCode()
      await publishContext("ventes/contexte", snapshot(`Encore ${randomUUID()}`))
      await publishContext("contexte", snapshot(`Encore ${randomUUID()}`))
      await expect(guard(code)).rejects.toMatchObject(stale(["contexte", "ventes/contexte"]))
    })

    it("should keep a code valid when another person's Privé or another team's Contexte is published", async () => {
      const code = await leaCode()
      await publishContext("private/claire/contexte", snapshot(`Privé de Claire ${randomUUID()}`))
      await publishContext("support/contexte", snapshot(`Support ${randomUUID()}`))
      await expect(guard(code)).resolves.toMatchObject({ code })
    })

    it("should refuse a code when a Contexte kept at 0 is first published, or one kept is no longer published (AC-a3)", async () => {
      await ref.write({ ctx: [{ code: "FFFF-0001", org_id: ORG.id, user_id: PEOPLE.lea.id, contexts: { "private/lea/contexte": 0 } }] })
      await expect(guard(ref.id("FFFF-0001"))).rejects.toMatchObject(stale(["private/lea/contexte"]))
      const code = await leaCode()
      await seed.admin`update platform.nodes set status = 'draft' where id = ${ref.nodeId("private/lea/contexte")}`
      try {
        await expect(guard(code)).rejects.toMatchObject(stale(["private/lea/contexte"]))
      } finally {
        await seed.admin`update platform.nodes set status = 'published' where id = ${ref.nodeId("private/lea/contexte")}`
      }
    })

    it("should keep a code valid over an identical republication, ids, positions, block revisions and provenance aside (AC-a4, H28)", async () => {
      const text = `Tutoyer ${randomUUID()}`
      await publishContext("ventes/contexte", snapshot(text, { key: "ton" }))
      const code = await leaCode()
      await publishContext("ventes/contexte", snapshot(text, { key: "ton", position: 7, revision: 3, provenance: { by: "assistant" } }))
      await expect(guard(code)).resolves.toMatchObject({ code })
      // La clé seule change : le contenu servi a changé.
      await publishContext("ventes/contexte", snapshot(text, { key: "autre" }))
      await expect(guard(code)).rejects.toMatchObject(stale(["ventes/contexte"]))
    })

    it("should read the snapshots only for a key whose revision differs (AC-a8)", async () => {
      const blocks = snapshot(`Identique ${randomUUID()}`)
      await publishContext("contexte", blocks)
      const code = await leaCode()
      const spied = spyDb(dbOf("lea"))
      await requireCtx(spied.db, ref.identityOf("lea"), code)
      expect(spied.sent.map((query) => query.target)).toEqual(["ctx", "nodes"])
      await publishContext("contexte", blocks)
      const republished = spyDb(dbOf("lea"))
      await expect(requireCtx(republished.db, ref.identityOf("lea"), code)).resolves.toMatchObject({ code })
      expect(republished.sent.map((query) => query.target)).toEqual(["ctx", "nodes", "node_versions"])
    })

    it("should let feedback through with a known but stale code, never an unknown one (AC-a6)", async () => {
      const code = await leaCode()
      await publishContext("contexte", snapshot(`Pour feedback ${randomUUID()}`))
      await expect(guard(code)).rejects.toMatchObject({ code: "ctx_stale" })
      await expect(requireCtx(dbOf("lea"), ref.identityOf("lea"), code, { staleAllowed: true })).resolves.toEqual({ code, host: null })
      for (const unknown of ["ZZZZ-ZZZZ", await issueCtx(dbOf("claire"), ref.identityOf("claire"), { host: null, userAgent: null })]) {
        await expect(requireCtx(dbOf("lea"), ref.identityOf("lea"), unknown, { staleAllowed: true })).rejects.toMatchObject({ code: "ctx_missing" })
      }
    })
  })

  // E11-S03 par la porte MCP (InMemoryTransport) : le refus mot pour mot, `feedback` enregistré sur un code périmé.
  describe("the kept Contextes through MCP (E11-S03, AC-a2, AC-a5, AC-a6)", () => {
    async function session() {
      const lea = ref.identityOf("lea")
      return connectDeps({ db: await dbOf("lea"), org: lea.org, caller: { kind: "member", identity: lea }, userAgent: "vitest", journal: [], activeConnectors: () => Promise.resolve(new Set<string>()), origin: `https://${ref.org.host}` })
    }

    it("should refuse read once a served Contexte is published changed, record feedback on that code, and pass after another person's Privé is published", async () => {
      const mcp = await session()
      const { code } = await mcp.openContext("Relance les devis")
      await publishContext("ventes/contexte", snapshot(`Par MCP ${randomUUID()}`))
      const refused = await mcp.call("read", { ctx: code, path: "ventes/devis" })
      expect([refused.isError, refused.text]).toEqual([
        true,
        `context has changed (ventes/contexte): call ${ref.org.prefix}_context again with the same request, then retry this call.`,
      ])
      const feedback = await mcp.call("feedback", { ctx: code, type: "gap", text: "Le contexte a changé en cours de route." })
      expect(feedback.isError).toBe(false)
      expect(await seed.admin`select ctx from platform.feedback where org_id = ${ref.org.id} and ctx = ${code}`).toHaveLength(1)

      const fresh = await mcp.openContext("Relance les devis")
      await publishContext("private/claire/contexte", snapshot(`Privé de Claire ${randomUUID()}`))
      expect((await mcp.call("read", { ctx: fresh.code, path: "ventes/devis" })).isError).toBe(false)
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
