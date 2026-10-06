// @vitest-environment node
// Client HTTP des connecteurs (story prise-des-connecteurs, AC16) : `fetch` simulé, aucun réseau. Le jeton est
// tiré à l'exécution ; chaque refus et chaque log se relisent pour prouver qu'il n'y passe jamais.
import { randomBytes } from "crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { requestJson, type ConnectorApi, type Fetch } from "../../packages/plateforme/server/connectors/http"
import { PlatformError } from "../../packages/plateforme/server/errors"
import { loggedText } from "../helpers/logs"

const API: ConnectorApi = {
  label: "Tiers",
  baseUrl: "https://api.example.test/v1",
  timeoutMs: 5_000,
  headers: { "Tiers-Version": "2025-09-03" },
  errors: [
    { status: 400, code: "invalid_arguments", message: "Tiers rejected the request." },
    { status: 401, code: "upstream_error", message: "Tiers rejected the token." },
    { status: 429, code: "rate_limited", message: "Tiers rate exceeded: retry later." },
    { status: [500, 503], code: "upstream_error", message: "Tiers is unavailable: retry later." },
  ],
}

const token = () => `tok_${randomBytes(12).toString("hex")}`
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

async function refusal(run: Promise<unknown>): Promise<PlatformError> {
  const error = await run.then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof PlatformError)) throw new Error(`expected a PlatformError, got ${String(error)}`)
  return error
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("requestJson", () => {
  it("should send the bearer token, the constant headers, a JSON body without undefined keys and a deadline", async () => {
    const secret = token()
    const send = vi.fn<Fetch>(async () => json({ ok: true }))
    const answer = await requestJson(API, secret, { method: "POST", path: "/search", body: { query: "x", filter: undefined } }, send)
    expect(answer).toEqual({ ok: true })
    const [url, init] = send.mock.calls[0]
    expect(url).toBe("https://api.example.test/v1/search")
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${secret}`)
    expect(new Headers(init.headers).get("tiers-version")).toBe("2025-09-03")
    expect(new Headers(init.headers).get("content-type")).toBe("application/json")
    expect(init.body).toBe(JSON.stringify({ query: "x" }))
    expect(init.redirect).toBe("error")
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    [400, "invalid_arguments", "Tiers rejected the request."],
    [401, "upstream_error", "Tiers rejected the token."],
    [429, "rate_limited", "Tiers rate exceeded: retry later."],
    [503, "upstream_error", "Tiers is unavailable: retry later."],
    [418, "upstream_error", "Tiers answered with an unexpected status (418). Retry later."],
  ])("should translate status %i through the connector's table, without the token anywhere", async (status, code, message) => {
    const secret = token()
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = await refusal(requestJson(API, secret, { method: "GET", path: "/x" }, async () => json({ message: `echo ${secret}` }, status)))
    expect({ code: error.code, message: error.message }).toEqual({ code, message })
    expect(`${error.message} ${JSON.stringify(error.details ?? {})} ${String(error.cause ?? "")}`).not.toContain(secret)
    expect(loggedText(errors)).not.toContain(secret)
  })

  it("should turn a deadline or a network failure into upstream_error, carrying neither the request nor the token", async () => {
    const secret = token()
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const timeout = Object.assign(new Error(`aborted Bearer ${secret}`), { name: "TimeoutError" })
    const late = await refusal(requestJson(API, secret, { method: "GET", path: "/x" }, async () => Promise.reject(timeout)))
    expect({ code: late.code, message: late.message }).toEqual({ code: "upstream_error", message: "Tiers did not answer within 5 s. Retry later." })
    const down = await refusal(requestJson(API, secret, { method: "GET", path: "/x" }, async () => Promise.reject(new TypeError(`fetch failed ${secret}`))))
    expect({ code: down.code, message: down.message }).toEqual({ code: "upstream_error", message: "Tiers could not be reached. Retry later." })
    for (const error of [late, down]) expect(error.cause).toBeUndefined()
    expect(loggedText(errors)).not.toContain(secret)
  })

  it("should refuse an answer that is not JSON as upstream_error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const unreadable = await refusal(requestJson(API, token(), { method: "GET", path: "/x" }, async () => new Response("<html>", { status: 200 })))
    expect(unreadable.code).toBe("upstream_error")
  })

  it("should fail as internal, sending nothing, without the secret of a live account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const send = vi.fn<Fetch>(async () => json({}))
    expect((await refusal(requestJson(API, undefined, { method: "GET", path: "/x" }, send))).code).toBe("internal")
    expect(send).not.toHaveBeenCalled()
  })
})

