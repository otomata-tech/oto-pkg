// @vitest-environment node
// Émetteur configurable (E01-S11, partie a1-core : AC-a1, AC-a2, AC-a3, AC-a6, AC-a11), sans réseau :
// l'émetteur de test sert découverte, clés et `userinfo` en mémoire (`tests/helpers/oidc-issuer.ts`),
// posé à la place du `fetch` global ; la configuration passe par l'environnement, comme chez un hôte.
import { randomBytes } from "crypto"
import { generateKeyPair } from "jose"
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest"
import { makeVerifyToken } from "../../packages/plateforme/mcp/auth"
import { loggedText } from "../helpers/logs"
import { testIssuer, type TestIssuer } from "../helpers/oidc-issuer"

const REQUEST = new Request("https://acme.example.test/api/mcp", { method: "POST" })
const AUDIENCE = "https://acme.example.test/api/mcp"
const SUBJECT = "abc123"

/**
 * Le mode OIDC d'un hôte : cet émetteur, cette audience, et son `fetch` à la place du réseau. La
 * console est tenue : un jeton sans email fait appeler `userinfo`, que cet émetteur refuse (401).
 */
function hostOn(issuer: TestIssuer): MockInstance<typeof console.error> {
  vi.stubEnv("PLATFORM_OIDC_ISSUER", issuer.issuer)
  vi.stubEnv("PLATFORM_OIDC_AUDIENCE", AUDIENCE)
  vi.stubGlobal("fetch", issuer.fetch)
  return vi.spyOn(console, "error").mockImplementation(() => {})
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("issuer by default: Supabase Auth (AC-a1)", () => {
  it("should verify with the project issuer and its keys, without checking aud, when PLATFORM_OIDC_ISSUER is absent", async () => {
    const project = `https://project-${randomBytes(4).toString("hex")}.example.test`
    const supabase = await testIssuer({ issuer: `${project}/auth/v1`, alg: "RS256", discovery: "none", jwksPath: "/.well-known/jwks.json" })
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `${project}/`)
    vi.stubEnv("PLATFORM_OIDC_ISSUER", "")
    vi.stubGlobal("fetch", supabase.fetch)
    const bearer = await supabase.sign({ sub: SUBJECT, email: "claire@example.test" }, { audience: "authenticated-elsewhere" })

    const info = await makeVerifyToken()(REQUEST, bearer)

    expect(info?.extra).toEqual({ sub: SUBJECT, email: "claire@example.test", iss: `${project}/auth/v1`, issuer_kind: "supabase" })
    expect(supabase.requests).toEqual([`${project}/auth/v1/.well-known/jwks.json`])
  })
})

describe("OIDC issuer: keys by discovery (AC-a2)", () => {
  it.each(["openid", "oauth"] as const)("should accept a token signed by the key at jwks_uri of the %s discovery, keys kept", async (form) => {
    const issuer = await testIssuer({ discovery: form })
    hostOn(issuer)
    const verify = makeVerifyToken()

    const first = await verify(REQUEST, await issuer.sign({ sub: SUBJECT, email: "x@example.test", email_verified: true }, { audience: AUDIENCE }))
    const second = await verify(REQUEST, await issuer.sign({ sub: SUBJECT }, { audience: [AUDIENCE, "other"] }))

    expect(first?.extra).toEqual({ sub: SUBJECT, email: "x@example.test", iss: issuer.issuer, issuer_kind: "oidc" })
    expect(second?.extra?.sub).toBe(SUBJECT)
    // La découverte et les clés, une fois : la seconde vérification ne relit rien.
    expect(issuer.requests.filter((url) => url.endsWith("/jwks"))).toHaveLength(1)
    expect(issuer.requests.filter((url) => url.includes("/.well-known/"))).toHaveLength(form === "openid" ? 1 : 2)
  })

  it("should refuse a token whose iss differs by one character, or signed by another key", async () => {
    const issuer = await testIssuer()
    hostOn(issuer)
    const other = await generateKeyPair("ES384")

    const verify = makeVerifyToken()
    expect(await verify(REQUEST, await issuer.sign({ sub: SUBJECT }, { audience: AUDIENCE, issuer: `${issuer.issuer}/` }))).toBeUndefined()
    expect(await verify(REQUEST, await issuer.sign({ sub: SUBJECT }, { audience: AUDIENCE, key: other.privateKey }))).toBeUndefined()
    expect(await verify(REQUEST, await issuer.sign({ sub: SUBJECT }, { audience: AUDIENCE }))).toBeDefined()
  })
})

describe("OIDC issuer: audience (AC-a3)", () => {
  it("should refuse a token without PLATFORM_OIDC_AUDIENCE in aud, and every token when the audience is not configured", async () => {
    const issuer = await testIssuer()
    const log = hostOn(issuer)
    const bearer = await issuer.sign({ sub: SUBJECT }, { audience: AUDIENCE })

    expect(await makeVerifyToken()(REQUEST, await issuer.sign({ sub: SUBJECT }, { audience: "https://other.example.test/api/mcp" }))).toBeUndefined()
    expect(await makeVerifyToken()(REQUEST, await issuer.sign({ sub: SUBJECT }))).toBeUndefined()
    expect(log).not.toHaveBeenCalled()

    vi.stubEnv("PLATFORM_OIDC_AUDIENCE", "")
    expect(await makeVerifyToken()(REQUEST, bearer)).toBeUndefined()
    expect(loggedText(log)).toContain("PLATFORM_OIDC_AUDIENCE")
  })
})

describe("OIDC issuer: verified email only (AC-a6)", () => {
  it.each([
    { source: "the token, verified", claims: { email: "x@example.test", email_verified: true }, answer: null, email: "x@example.test", userinfoCalls: 0 },
    {
      source: "userinfo, the token not verified",
      claims: { email: "unverified@example.test", email_verified: false },
      answer: { email: "x@example.test", email_verified: true },
      email: "x@example.test",
      userinfoCalls: 1,
    },
    { source: "neither: userinfo not verified", claims: {}, answer: { email: "x@example.test", email_verified: false }, email: undefined, userinfoCalls: 1 },
    {
      source: "neither: userinfo answers for another subject",
      claims: {},
      answer: { sub: "someone-else", email: "x@example.test", email_verified: true },
      email: undefined,
      userinfoCalls: 1,
    },
    { source: "neither: userinfo refuses the token", claims: {}, answer: null, email: undefined, userinfoCalls: 1 },
  ])("should take the email from $source", async ({ claims, answer, email, userinfoCalls }) => {
    const issuer = await testIssuer()
    hostOn(issuer)
    if (answer) issuer.userinfo.set(SUBJECT, { sub: SUBJECT, ...answer })
    const verify = makeVerifyToken()
    const bearer = await issuer.sign({ sub: SUBJECT, ...claims }, { audience: AUDIENCE })

    const extra = { sub: SUBJECT, email, iss: issuer.issuer, issuer_kind: "oidc" }
    expect((await verify(REQUEST, bearer))?.extra).toEqual(extra)
    // Gardée jusqu'à l'expiration du jeton : le second appel ne relit pas `userinfo`.
    expect((await verify(REQUEST, bearer))?.extra).toEqual(extra)
    expect(issuer.requests.filter((url) => url.endsWith("/me"))).toHaveLength(userinfoCalls)
  })
})

describe("OIDC issuer: invalid configuration (AC-a11)", () => {
  it.each([
    { state: "is unreachable", options: {}, unreachable: true },
    { state: "has no jwks_uri", options: { jwksPath: null }, unreachable: false },
    // L'émetteur annoncé par la découverte doit égaler la variable (RFC 8414 § 3.3, HN-E01S11a1c-4).
    { state: "announces another issuer in its discovery", options: { announcedIssuer: "https://other-issuer.example.test/oidc" }, unreachable: false },
  ])("should refuse every token when the issuer $state, naming PLATFORM_OIDC_ISSUER in the server log", async ({ options, unreachable }) => {
    const issuer = await testIssuer(options)
    const log = hostOn(issuer)
    if (unreachable) vi.stubGlobal("fetch", async () => Promise.reject(new TypeError("fetch failed")))
    const bearer = await issuer.sign({ sub: SUBJECT, email: "x@example.test", email_verified: true }, { audience: AUDIENCE })

    expect(await makeVerifyToken()(REQUEST, bearer)).toBeUndefined()
    const logged = loggedText(log)
    expect(logged).toContain("PLATFORM_OIDC_ISSUER")
    expect(Object.entries({ bearer, email: "x@example.test" }).filter(([, value]) => logged.includes(value)).map(([name]) => name)).toEqual([])
  })

  it("should keep a failed discovery ten seconds, one read and one log line for a burst of tokens, then read again", async () => {
    const issuer = await testIssuer()
    const log = hostOn(issuer)
    const unreachable = vi.fn(async () => Promise.reject(new TypeError("fetch failed")))
    vi.stubGlobal("fetch", unreachable)
    const bearer = await issuer.sign({ sub: SUBJECT }, { audience: AUDIENCE })
    const verify = makeVerifyToken()

    const burst = await Promise.all([verify(REQUEST, bearer), verify(REQUEST, bearer), verify(REQUEST, bearer)])
    const during = await verify(REQUEST, bearer)
    const counts = { reads: unreachable.mock.calls.length, logs: log.mock.calls.length }
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 11_000 })
    const after = await verify(REQUEST, bearer)

    expect([...burst, during, after]).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(counts).toEqual({ reads: 1, logs: 1 })
    expect({ reads: unreachable.mock.calls.length, logs: log.mock.calls.length }).toEqual({ reads: 2, logs: 2 })
  })
})
