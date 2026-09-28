// @vitest-environment node
// Résultats et journal des cinq outils d'E08-S06 (AC21, AC22), par InMemoryTransport sur une vraie base
// (E01-S10, lot t1-d2b) : une ligne `admin_journal` par opération, avec son organisation et sa cible,
// aucune dans `journal` ; le même texte dans les deux canaux, les données en champs ; une page qui tient
// sous le plafond de 45 000 caractères et dont la suite reprend après le dernier élément servi. La base
// des tests admin, avec l'arbre d'acme, `mail` actif, un compte, une conversation et un ticket
// (`seedAdminFixture`), est semée une fois pour le fichier par la connexion d'administration ; codes de
// session, slug, préfixe et emails y sont jetables, et les textes attendus les portent.
// En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import * as z from "zod/v4"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_RESULT_CHARS } from "../../packages/plateforme/mcp/result"
import { connectAdminMcp, ORGS, PERSONS, TEAMS } from "../helpers/mcp-admin"
import { seedAdminFixture, type AdminFixtureSql } from "../helpers/mcp-admin-sql"
import type { Row, Tables } from "../helpers/simulated-db"
import { seedWithAdmin, sqlConfigured, type SeededData, portable } from "../helpers/sql"

const HOUR_AGO = new Date(Date.now() - 3_600_000).toISOString()
const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

/** Le rang que portent les arguments des appels servis, lu par un schéma plutôt qu'affirmé. */
const rankedCalls = z.array(z.object({ args: z.object({ rank: z.number() }) }))

/** `mail` actif, « Mail Ventes », une conversation d'un appel et un ticket d'acme ; l'outil appelé porte le préfixe, jetable, d'acme. */
function tables(prefix: string): Tables {
  const owner = { owner_kind: "team", owner_team_id: TEAMS.ventes.id, owner_user_id: null }
  return {
    connector_activations: [{ org_id: ORGS.acme.id, connector: "mail", state: "active", activated_by: PERSONS.ada.id, updated_at: HOUR_AGO }],
    accounts: [{ id: "c2000000-0000-4000-8000-000000000001", org_id: ORGS.acme.id, connector: "mail", label: "Mail Ventes", mode: "simule", status: "active", ...owner }],
    journal: [
      { id: 1, org_id: ORGS.acme.id, ts: HOUR_AGO, user_id: PERSONS.claire.id, team_id: null, ctx: "AAAA-0001", tool: `${prefix}_read`, target: "ventes", is_error: false, error: null, host: null, user_agent: null, account_id: null, duration_ms: 5, args: {} },
    ],
    feedback: [
      { id: 1, org_id: ORGS.acme.id, number: 12, created_at: HOUR_AGO, user_id: PERSONS.claire.id, ctx: null, type: "gap", target: null, text: "Missing.", state: "open", resolution: null, handled_by: null, handled_at: null },
    ],
  }
}

describe.skipIf(!sqlConfigured)(portable("admin results on a real database"), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let admin: AdminFixtureSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    admin = await seedAdminFixture(seed, { tree: true })
    await admin.write(tables(admin.orgs.acme.prefix))
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    try {
      await admin?.forgetJournal()
    } finally {
      await seed?.cleanup()
    }
  }, SETUP_TIMEOUT)

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** La session admin de Sam, ouverte ; `call` lui passe son code. */
  async function session() {
    const mcp = await connectAdminMcp(await admin.deps("sam"))
    const { code } = await mcp.openAdmin()
    const call = (tool: string, args: Record<string, unknown>) => mcp.call(tool, { ctx: code, ...args })
    return { mcp, call }
  }

  describe("separate admin journal (AC21)", () => {
    it("should write one admin_journal line per operation, with its organisation and target, and none in journal", async () => {
      const [{ mark }] = await seed.admin<{ mark: number }[]>`select coalesce(max(id), 0)::int as mark from platform.admin_journal`
      const acmeId = admin.orgs.acme.id
      try {
        const { mcp, call } = await session()
        const acme = admin.orgs.acme.slug
        const conversation = admin.id("AAAA-0001")
        await call("admin_node", { op: "rules", org: acme, path: "ventes" })
        await call("admin_connector", { op: "activate", org: acme, connector: "mail" })
        await call("admin_connector", { op: "account_rules", org: acme, account: "Mail Ventes" })
        await call("admin_journal", { op: "conversation", org: acme, code: conversation })
        await call("admin_feedback", { op: "set_state", org: acme, ticket: "FB-0012", state: "resolved" })
        await call("admin_cell", { op: "version" })
        await mcp.flush()
        const sam = admin.persons.sam.id
        const lines = await seed.admin<Row[]>`
          select tool, op, org_id, target, is_error from platform.admin_journal
           where user_id = ${sam} and id > ${mark} and tool is distinct from 'admin_context' order by id`
        expect(admin.readable([...lines]).map((line) => [line.tool, line.op, line.org_id, line.target, line.is_error])).toEqual([
          ["admin_node", "rules", ORGS.acme.id, "ventes", false],
          ["admin_connector", "activate", ORGS.acme.id, "mail", false],
          ["admin_connector", "account_rules", ORGS.acme.id, "account:Mail Ventes", false],
          ["admin_journal", "conversation", ORGS.acme.id, `conversation:${conversation}`, false],
          ["admin_feedback", "set_state", ORGS.acme.id, "FB-0012", false],
          ["admin_cell", "version", null, "cell", false],
        ])
        // Une écriture de `journal` porterait l'appelant (`journal_insert_own`) : aucune ligne n'est à Sam.
        const [{ count }] = await seed.admin<{ count: number }[]>`select count(*)::int as count from platform.journal where user_id = ${sam}`
        expect(count).toBe(0)
      } finally {
        // FB-0012 rendu à l'état de la graine (ouvert, sans décision) : la graine du fichier sert aux autres tests.
        await seed.admin`
          update platform.feedback set state = 'open', resolution = null, handled_by = null, handled_at = null where org_id = ${acmeId} and number = 12`
      }
    })
  })

  describe("results (AC22)", () => {
    it("should serve the same text in both channels, with the data in fields", async () => {
      const { call } = await session()
      const acme = admin.orgs.acme.slug
      const served = [
        [await call("admin_node", { op: "rules", org: acme, path: "ventes" }), "rules"],
        [await call("admin_connector", { op: "catalogue", org: acme }), "connectors"],
        [await call("admin_connector", { op: "accounts", org: acme }), "accounts"],
        [await call("admin_journal", { op: "conversations", org: acme }), "conversations"],
        [await call("admin_journal", { op: "conversation", org: acme, code: admin.id("AAAA-0001") }), "calls"],
        [await call("admin_journal", { op: "admin_log" }), "rows"],
        [await call("admin_feedback", { op: "list", org: acme }), "tickets"],
        [await call("admin_cell", { op: "migrations" }), "cell"],
      ] as const
      for (const [result, field] of served) {
        expect(result.isError, field).toBe(false)
        expect(result.structured?.text, field).toBe(result.text)
        expect(result.structured, field).toHaveProperty(field)
      }
    })

    it("should keep a long conversation under 45,000 characters and continue it right after the last call served", async () => {
      // 200 appels aux arguments longs : ils ne tiennent pas en une page ; retirés après le test.
      const calls: Row[] = Array.from({ length: 200 }, (_, index) => ({
        id: 100 + index,
        org_id: ORGS.acme.id,
        ts: HOUR_AGO,
        user_id: PERSONS.claire.id,
        team_id: null,
        ctx: "FFFF-0006",
        tool: `${admin.orgs.acme.prefix}_read`,
        target: "ventes",
        is_error: false,
        error: null,
        host: null,
        user_agent: null,
        account_id: null,
        duration_ms: 5,
        args: { rank: index, note: "x".repeat(280) },
      }))
      // Une seule écriture : la base tire les identifiants dans l'ordre des lignes, celui des rangs.
      await admin.write({ journal: calls })
      try {
        const { call } = await session()
        const acme = admin.orgs.acme.slug
        const code = admin.id("FFFF-0006")
        const first = await call("admin_journal", { op: "conversation", org: acme, code })
        expect(JSON.stringify(first.result.structuredContent).length).toBeLessThanOrEqual(MAX_RESULT_CHARS)
        expect(first.structured?.truncated).toBeUndefined()
        const shown = rankedCalls.parse(first.structured?.calls).map((entry) => entry.args.rank)
        expect(shown.length).toBeLessThan(200)
        expect(shown).toEqual(Array.from({ length: shown.length }, (_, index) => index))
        expect(first.text.split("\n").at(-1)).toBe(`next_cursor: ${String(first.structured?.next_cursor)}`)
        const second = await call("admin_journal", { op: "conversation", org: acme, code, cursor: first.structured?.next_cursor })
        expect(rankedCalls.parse(second.structured?.calls)[0].args.rank).toBe(shown.length)
      } finally {
        await seed.admin`delete from platform.journal where ctx = ${admin.id("FFFF-0006")}`
      }
    })
  })
})
