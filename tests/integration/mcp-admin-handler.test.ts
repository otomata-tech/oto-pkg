// @vitest-environment node
// Porte HTTP du MCP admin (E08-S02, AC1 à AC3, sécurité ; AC22 pour la ligne `initialize`) : la vraie
// chaîne mcp-handler (`withMcpAuth`), une JWKS locale, et, à la place du client au jeton de l'appelant, le
// client de la face SQL sous l'appelant que la porte tire du jeton (`asCaller`). Les autres jetons invalides
// sont ceux du vérificateur d'E03-S01, déjà testé.
// E01-S10, lot d2 : `requireStaff` et le journal admin passent au SQL (`db.tx`), que la base simulée ne sert
// pas. Les cas qui lisent la base tournent sur la base des tests admin (`seedAdminFixture`), portables : sur
// le projet comme sur un Postgres nu (job `bare-postgres`) ; ceux qui ne la lisent pas tournent partout.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { handleAdminMcp } from "../../packages/plateforme/mcp/admin/handler"
import { makeVerifyToken } from "../../packages/plateforme/mcp/auth"
import type { OrgCreationHook } from "../../packages/plateforme/server/admin/org-creation"
import { createPlatformDb } from "../../packages/plateforme/server/db"
import { DELETE, GET } from "../../src/app/api/mcp-admin/route"
import { PERSONS, type AdminPerson } from "../helpers/mcp-admin"
import { seedAdminFixture, type AdminFixtureSql } from "../helpers/mcp-admin-sql"
import type { Row } from "../helpers/simulated-db"
import { asCaller, seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, type SeededData } from "../helpers/sql"

vi.mock("../../packages/plateforme/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../packages/plateforme/server/db")>()),
  createPlatformDb: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const SETUP_TIMEOUT = 180_000
const NETWORK_TIMEOUT = 60_000

const ISSUER = "https://project.example.test/auth/v1"
const PROTOCOL = "2025-06-18"
const MESSAGES: Record<string, unknown> = {
  initialize: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "claude-ai", version: "0.1.0" } } },
  "tools/list": { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  "tools/call": { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "admin_context", arguments: {} } },
}

let signingKey: CryptoKey
let otherKey: CryptoKey
let jwks: JWTVerifyGetKey

beforeAll(async () => {
  const signing = await generateKeyPair("ES256")
  signingKey = signing.privateKey
  otherKey = (await generateKeyPair("ES256")).privateKey
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(signing.publicKey)), kid: "k1", alg: "ES256", use: "sig" }] })
})

const now = () => Math.floor(Date.now() / 1000)

/** Un jeton de `person` (par défaut Sam de la base simulée : les cas sans base ne le lisent pas). */
function token(key = signingKey, person: { id: string; email: string } = PERSONS.sam) {
  return new SignJWT({ email: person.email })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer(ISSUER)
    .setSubject(person.id)
    .setIssuedAt(now() - 60)
    .setExpirationTime(now() + 3600)
    .sign(key)
}

function post({ bearer, forwarded = true, body = MESSAGES.initialize, userAgent }: { bearer?: string; forwarded?: boolean; body?: unknown; userAgent?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL })
  if (userAgent) headers.set("user-agent", userAgent)
  if (forwarded) {
    headers.set("x-forwarded-host", "admin.example.test")
    headers.set("x-forwarded-proto", "https")
  }
  if (bearer) headers.set("authorization", `Bearer ${bearer}`)
  return new Request("http://localhost:3000/api/mcp-admin", { method: "POST", headers, body: JSON.stringify(body) })
}

/**
 * La porte, le client de chaque requête étant celui de la face SQL sous l'appelant qu'elle passe (le `sub`
 * et l'email du jeton vérifié) ; `tasks` : le journal différé.
 */
async function call(request: Request, orgCreation?: OrgCreationHook) {
  vi.mocked(createPlatformDb).mockImplementation(({ caller }) => {
    if (!caller) throw new Error("the admin door passed no verified caller")
    // Un appelant émis par Supabase (E01-S11 a1-wire) a pour sujet l'identifiant interne.
    return asCaller("userId" in caller ? caller.userId : caller.subject, caller.email ?? undefined)
  })
  const tasks: (() => Promise<void>)[] = []
  const response = await handleAdminMcp(request, { verifyToken: makeVerifyToken({ jwks, issuer: ISSUER }), defer: (task) => tasks.push(task), orgCreation })
  // Le corps lu en entier : les outils ont fini d'écrire avant la fin du flux.
  const text = await response.text()
  return { response, text, tasks }
}

const WWW_AUTHENTICATE = (origin: string) =>
  `Bearer error="invalid_token", error_description="No authorization provided", resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp-admin"`

describe("POST /api/mcp-admin without a valid token (AC1)", () => {
  it.each([
    ["no Authorization header", true, "https://admin.example.test", async () => undefined],
    ["a token signed by another key", true, "https://admin.example.test", () => token(otherKey)],
    ["no Authorization header, without x-forwarded-host", false, "http://localhost:3000", async () => undefined],
  ])("should answer 401 pointing to the admin resource metadata for %s, and serve nothing", async (_case, forwarded, origin, make) => {
    const { response, tasks } = await call(post({ bearer: await make(), forwarded }))
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(WWW_AUTHENTICATE(origin))
    expect(tasks).toEqual([])
    expect(createPlatformDb).not.toHaveBeenCalled()
  })
})

const SUITE = "admin door on a real database (AC2, AC5, AC22, E09-S02)"

describe.skipIf(!sqlConfigured)(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let admin: AdminFixtureSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    admin = await seedAdminFixture(seed)
  }, SETUP_TIMEOUT)

  // Chaque cas part d'un journal admin vide pour les personnes semées : ses lignes survivent à leur organisation.
  beforeEach(() => admin.forgetJournal(), SETUP_TIMEOUT)

  afterAll(async () => {
    try {
      await admin?.forgetJournal()
    } finally {
      await seed?.cleanup()
    }
  }, SETUP_TIMEOUT)

  const tokenOf = (person: AdminPerson) => token(signingKey, admin.persons[person])

  /** Les lignes du journal admin de `person`, dans la base, en identifiants simulés. */
  async function journalOf(person: AdminPerson): Promise<Row[]> {
    const rows = await seed.admin<Row[]>`select * from platform.admin_journal where user_id = ${admin.persons[person].id} order by id`
    return admin.readable([...rows])
  }

  describe("POST /api/mcp-admin by an account outside the platform team (AC2)", () => {
    // Ada administre acme sans être de l'équipe plateforme (`is_staff()` faux, la vraie fonction).
    it.each(Object.keys(MESSAGES))("should answer %s with 401 without resource metadata, announce nothing and write no line", async (method) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const { response, text, tasks } = await call(post({ bearer: await tokenOf("ada"), body: MESSAGES[method] }))
      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"')
      expect(JSON.parse(text)).toEqual({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null })
      expect(tasks).toEqual([])
      expect(await journalOf("ada")).toEqual([])
      expect(warn).toHaveBeenCalledWith("[platform] mcp-admin: caller outside the platform team refused")
    })
  })

  describe("POST /api/mcp-admin by a platform team member (AC5, AC22)", () => {
    it("should initialize the admin server and journal the client signature after the response", async () => {
      const { response, text, tasks } = await call(post({ bearer: await tokenOf("sam") }))
      expect(response.status).toBe(200)
      expect(text).toContain('"serverInfo":{"name":"oto-platform-admin","title":"Platform admin","version":"1.0.0"}')
      expect(await journalOf("sam")).toEqual([])
      for (const task of tasks) await task()
      expect(await journalOf("sam")).toEqual([
        expect.objectContaining({ method: "initialize", host: "claude-ai@0.1.0", user_id: PERSONS.sam.id, org_id: null, is_error: false }),
      ])
    })

    // claude.ai ouvre une conversation sans `initialize` : chaque appel reprend la signature de la connexion, comme `journal.host` (P6).
    it("should sign every call of an admin session with the client of its connection, refusals included (fiche D99, M54, P6)", async () => {
      const bearer = await tokenOf("sam")
      const send = async (body: unknown, userAgent = "Claude-User") => {
        const { text, tasks } = await call(post({ bearer, body, userAgent }))
        for (const task of tasks) await task()
        return text
      }
      await send(MESSAGES.initialize)
      const code = /ctx: ([0-9A-Z]{4}-[0-9A-Z]{4})/.exec(await send(MESSAGES["tools/call"]))?.[1]
      const toolCall = (id: number, name: string, args: Record<string, unknown>) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })
      await send(toolCall(4, "admin_cell", { op: "help", ctx: code }))
      await send(toolCall(5, "admin_cell", { op: "inconnue", ctx: code }))
      // Un autre client, sans `initialize` à lui : aucune signature ne se devine.
      await send(toolCall(6, "admin_context", {}), "autre-client")
      expect((await journalOf("sam")).map((row) => [row.method, row.tool, row.is_error, row.host])).toEqual([
        ["initialize", null, false, "claude-ai@0.1.0"],
        ["tools/call", "admin_context", false, "claude-ai@0.1.0"],
        ["tools/call", "admin_cell", false, "claude-ai@0.1.0"],
        ["tools/call", "admin_cell", true, "claude-ai@0.1.0"],
        ["tools/call", "admin_context", false, null],
      ])
    })
  })

  // E09-S02 (AC1, AC7) : le point de création de l'hôte, passé à la porte comme `verifyToken`.
  describe("POST /api/mcp-admin with or without the creation hook of the host (E09-S02, AC1, AC7)", () => {
    type ListedTool = { name: string; annotations: Record<string, unknown> }

    /** `tools/list` par la porte, avec le point de création passé ou non. */
    async function listed(orgCreation?: OrgCreationHook): Promise<ListedTool[]> {
      const { text } = await call(post({ bearer: await tokenOf("sam"), body: MESSAGES["tools/list"] }), orgCreation)
      const data = text.split("\n").find((line) => line.startsWith("data: "))
      return JSON.parse(data ? data.slice("data: ".length) : text).result.tools
    }

    it("should declare admin_org open-world only when the route passes a hook, its declaration otherwise unchanged", async () => {
      const without = await listed()
      const hooked = await listed({ addresses: () => [], created: async () => [] })
      expect(without.find((tool) => tool.name === "admin_org")?.annotations).toEqual({ readOnlyHint: false, openWorldHint: false })
      expect(hooked).toEqual(without.map((tool) => (tool.name === "admin_org" ? { ...tool, annotations: { ...tool.annotations, openWorldHint: true } } : tool)))
    })
  })
})

describe("GET and DELETE /api/mcp-admin (AC3)", () => {
  it("should answer 405 with Allow: POST", () => {
    for (const response of [GET(), DELETE()]) {
      expect(response.status).toBe(405)
      expect(response.headers.get("allow")).toBe("POST")
    }
  })
})
