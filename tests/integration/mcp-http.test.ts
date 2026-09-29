// @vitest-environment node
// La porte HTTP du MCP sur une vraie base (E03-S01 : AC2, AC9, AC18, AC19) : jetons signés localement
// pour des personnes jetables sans compte, vérifiés par `verifyToken` (`tests/helpers/session-locale.ts`),
// vraie chaîne mcp-handler ; `defer` collecte les tâches, lancées une fois la réponse lue en entier.
// L'adresse sans organisation (AC4) et la personne qui n'est pas membre (AC5) sont prouvées sans base
// (`tests/unit/mcp-handler.test.ts`, `tests/unit/mcp-server.test.ts`) : leurs cas sont retirés (M11b).
// Ce fichier reste à fusionner dans `mcp-core.test.ts`, que modifie une story en cours. Suite portable
// (E11-S14), relectures par la connexion d'administration ; seul le dernier `describe`, un vrai jeton de
// Supabase Auth vérifié par la JWKS du projet (`makeVerifyToken()` sans argument), garde le projet.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFixtures, hex, type Fixtures, type TestOrg } from "../helpers/plateforme"
import { createLocalFixtures, type LocalFixtures } from "../helpers/session-locale"
import { onProject, portable, projectConfigured, sqlConfigured, testAdminSql, type TestSql } from "../helpers/sql"
import pkg from "../../packages/plateforme/package.json"
import { makeVerifyToken } from "../../packages/plateforme/mcp/auth"
import { handleMcpPost } from "../../packages/plateforme/mcp/handler"

const NETWORK_TIMEOUT = 60_000
const PROTOCOL = "2025-06-18"

type Task = () => Promise<void>
type RpcMessage = {
  result?: { tools?: { name: string }[]; content?: { type: string; text: string }[]; [field: string]: unknown }
  error?: { code: number; message: string }
}

const initialize = (clientInfo?: { name: string; version: string }) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: PROTOCOL, capabilities: {}, ...(clientInfo ? { clientInfo } : {}) },
})

const SUITE = "MCP HTTP door on a real database"

describe.skipIf(!sqlConfigured)(
  portable(SUITE),
  { timeout: NETWORK_TIMEOUT },
  () => {
    let fx: LocalFixtures
    let admin: TestSql
    let org: TestOrg
    let host: string
    let member: { id: string; token: string }

    beforeAll(async () => {
      fx = createLocalFixtures()
      admin = testAdminSql()
      host = `t${hex(4)}.example.invalid`
      org = await fx.createOrg({ hosts: [host] })
      const person = await fx.createUser()
      await fx.addMember(org.id, person.id)
      member = { id: person.id, token: (await fx.sessionFor(person)).accessToken }
    }, 120_000)

    afterAll(async () => {
      try {
        await fx?.cleanup()
      } finally {
        await admin?.end({ timeout: 5 })
      }
    }, NETWORK_TIMEOUT)

    type PostOptions = { token: string; userAgent: string; to?: string; accept?: string }

    /** `POST /api/mcp` sur l'adresse de l'organisation ; rend le premier message et les tâches. */
    async function post(body: unknown, { token, userAgent, to = host, accept = "application/json, text/event-stream" }: PostOptions) {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept,
          authorization: `Bearer ${token}`,
          "user-agent": userAgent,
          "x-forwarded-host": to,
          "x-forwarded-proto": "https",
          "mcp-protocol-version": PROTOCOL,
        },
        body: JSON.stringify(body),
      })
      const tasks: Task[] = []
      const response = await handleMcpPost(request, { verifyToken: fx.verifyToken, defer: (task) => tasks.push(task) })
      // Le corps lu en entier : les outils ont fini d'écrire leurs lignes avant la fin du flux.
      const text = await response.text()
      const data = text.split("\n").find((line) => line.startsWith("data: "))
      const message: RpcMessage | null = text ? JSON.parse(data ? data.slice("data: ".length) : text) : null
      return { response, message, tasks }
    }

    const journal = (userAgent: string) =>
      admin`select method, tool, ctx, host, user_agent, is_error from platform.journal where org_id = ${org.id} and user_agent = ${userAgent} order by id`

    it("should initialize with the server identity and journal the client signature after the response (AC9, AC18)", async () => {
      const userAgent = `http-init-${hex(4)}`
      const { response, message, tasks } = await post(initialize({ name: "claude-ai", version: "0.1.0" }), { token: member.token, userAgent })
      expect(response.status).toBe(200)
      expect(message?.result).toMatchObject({
        serverInfo: { name: "oto-platform", title: org.name, version: pkg.version },
        capabilities: { tools: {}, prompts: {} },
        instructions: expect.stringContaining(`${org.prefix}_context first`),
      })
      expect(await journal(userAgent)).toEqual([])

      for (const task of tasks) await task()
      expect(await journal(userAgent)).toEqual([
        { method: "initialize", tool: null, ctx: null, host: "claude-ai@0.1.0", user_agent: userAgent, is_error: false },
      ])
    })

    it("should write no initialize line for a response of 400 or more (AC18)", async () => {
      const userAgent = `http-refused-${hex(4)}`
      const { response, tasks } = await post(initialize({ name: "claude-ai", version: "0.1.0" }), {
        token: member.token,
        userAgent,
        accept: "application/json",
      })
      expect(response.status).toBe(406)
      for (const task of tasks) await task()
      expect(await journal(userAgent)).toEqual([])
    })

    it("should list the six tools and sign the ctx with the initialize of the same user agent (AC19)", async () => {
      const userAgent = `http-sig-${hex(4)}`
      const init = await post(initialize({ name: "claude-ai", version: "0.1.0" }), { token: member.token, userAgent })
      for (const task of init.tasks) await task()

      const listed = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { token: member.token, userAgent })
      const tools = listed.message?.result?.tools ?? []
      expect(tools.map((tool) => tool.name)).toEqual(
        ["context", "find", "read", "call", "write", "feedback"].map((key) => `${org.prefix}_${key}`),
      )

      const called = await post(
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: `${org.prefix}_context`, arguments: { phrase: "bonjour" } } },
        { token: member.token, userAgent },
      )
      const content = called.message?.result?.content ?? []
      const code = /^ctx: (\S+)/.exec(content[0]?.text ?? "")?.[1]
      expect(code).toBeTruthy()
      for (const task of [...listed.tasks, ...called.tasks]) await task()

      expect(await admin`select host, user_agent from platform.ctx where code = ${code ?? ""}`).toEqual([{ host: "claude-ai@0.1.0", user_agent: userAgent }])
      expect(await journal(userAgent)).toEqual([
        expect.objectContaining({ method: "initialize", host: "claude-ai@0.1.0" }),
        expect.objectContaining({ method: "tools/list" }),
        expect.objectContaining({ method: "tools/call", tool: `${org.prefix}_context`, ctx: code, host: "claude-ai@0.1.0" }),
      ])
    })

    it("should refuse a forged token with 401 (AC2)", async () => {
      const { response } = await post(initialize({ name: "claude-ai", version: "0.1.0" }), { token: `${member.token}x`, userAgent: "http-forged" })
      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toContain(`resource_metadata="https://${host}/.well-known/oauth-protected-resource/api/mcp"`)
    })
  },
)

// La vérification d'un vrai jeton de Supabase Auth par la JWKS du projet (HN-E11S14-4) : le vérificateur de
// la configuration de l'hôte, `makeVerifyToken()` sans argument. Le reste de la porte est prouvé ci-dessus.
describe.skipIf(!projectConfigured)(onProject("MCP HTTP door under a Supabase Auth session"), { timeout: NETWORK_TIMEOUT }, () => {
  let fx: Fixtures
  let host: string
  let token: string

  beforeAll(async () => {
    fx = createFixtures()
    host = `t${hex(4)}.example.invalid`
    const org = await fx.createOrg({ hosts: [host] })
    const person = await fx.createUser()
    await fx.addMember(org.id, person.id)
    token = (await fx.sessionFor(person)).accessToken
  }, 120_000)

  afterAll(async () => {
    await fx?.cleanup()
  }, NETWORK_TIMEOUT)

  it("should initialize with 200 under a token verified by the JWKS of the project (AC2)", async () => {
    const request = new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "x-forwarded-host": host,
        "x-forwarded-proto": "https",
        "mcp-protocol-version": PROTOCOL,
      },
      body: JSON.stringify(initialize({ name: "claude-ai", version: "0.1.0" })),
    })
    // Le journal de cet appel n'est pas le sujet : prouvé ci-dessus.
    const response = await handleMcpPost(request, { verifyToken: makeVerifyToken(), defer: () => {} })
    expect(response.status).toBe(200)
  })
})
