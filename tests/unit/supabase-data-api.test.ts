// @vitest-environment node
import { randomBytes } from "crypto"
import { describe, expect, it } from "vitest"
import { runCli } from "../../scripts/supabase-data-api.mjs"

// E01-S10 f2 (fiche D80, AC-f1) : `platform` retiré des schémas du Data API par l'API de gestion, sans
// réseau (`fetch` simulé, projet en mémoire). Le script sur notre projet, le pilote le lance juste après
// la poussée de f2.

const REF = "targettargettargetaa"
const hex = () => randomBytes(16).toString("hex")
// Construits à l'exécution : un jeton ou une clé écrits en littéral seraient de faux secrets dans le dépôt.
const token = ["sbp", hex()].join("_")
const anonKey = ["sb_publishable", hex()].join("_")

type Call = { method: string; url: string; body?: unknown; headers: Headers }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/**
 * L'API de gestion et le Data API du projet, simulés : `postgrest` rend et fusionne `db_schema` ;
 * `/rest/v1/nodes` sous `Accept-Profile: platform` rend des lignes tant que `platform` est exposé (ou
 * toujours, `stuck`), `PGRST106` sinon.
 */
function project(dbSchema: string, options: { stuck?: boolean } = {}) {
  const config: Record<string, unknown> = { db_schema: dbSchema, max_rows: 1000, db_extra_search_path: "public, extensions" }
  const calls: Call[] = []
  const fetch = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body, headers: new Headers(init?.headers) })
    if (url === `https://api.supabase.com/v1/projects/${REF}/postgrest`) {
      if (method === "PATCH") Object.assign(config, body)
      return json(config)
    }
    if (url.startsWith(`https://api.supabase.com/v1/projects/${REF}/api-keys`)) return json([{ name: "anon", api_key: anonKey }])
    if (url.startsWith(`https://${REF}.supabase.co/rest/v1/nodes`)) {
      const exposed = options.stuck || String(config.db_schema).includes("platform")
      return exposed ? json([]) : json({ code: "PGRST106", message: "The schema must be one of the following: public, graphql_public" }, 406)
    }
    return json({ message: "Not found" }, 404)
  }
  return { fetch, calls, config }
}

async function run(args: string[], api: ReturnType<typeof project>) {
  const lines: string[] = []
  const out = { log: (line: string) => lines.push(line), error: (line: string) => lines.push(line) }
  const code = await runCli(args, { env: { SUPABASE_ACCESS_TOKEN: token }, fileTexts: [], fetch: api.fetch, wait: async () => {}, out })
  return { code, text: lines.join("\n") }
}

describe("pnpm data-api:close (E01-S10 f2, fiche D80)", () => {
  it("should show the exposed schemas and the wanted ones without writing anything, without --apply", async () => {
    const api = project("public, graphql_public, platform")
    const { code, text } = await run(["--to", REF], api)
    expect(code).toBe(0)
    expect(text).toContain("public, graphql_public, platform → public, graphql_public")
    expect(api.calls.map((call) => call.method)).toEqual(["GET"])
  })

  it("should write db_schema without platform, read it back, then see PostgREST refuse platform (AC-f1), never printing the token or the key", async () => {
    const api = project("public, graphql_public, platform")
    const { code, text } = await run(["--to", REF, "--apply"], api)
    expect(code).toBe(0)
    expect(api.calls.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([{ db_schema: "public, graphql_public" }])
    expect(api.config).toMatchObject({ max_rows: 1000, db_extra_search_path: "public, extensions" })
    const probe = api.calls.find((call) => call.url.includes("/rest/v1/nodes"))
    expect(probe?.headers.get("Accept-Profile")).toBe("platform")
    expect(text).toContain("est refusé (PGRST106")
    expect(Object.entries({ token, anonKey }).filter(([, value]) => text.includes(value)).map(([name]) => name)).toEqual([])
  })

  it("should fail when PostgREST still serves platform after the change", async () => {
    const api = project("public, graphql_public, platform", { stuck: true })
    const { code, text } = await run(["--to", REF, "--apply"], api)
    expect(code).toBe(1)
    expect(text).toContain("PostgREST sert encore le schéma")
  })
})
