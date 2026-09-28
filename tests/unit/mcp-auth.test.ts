// @vitest-environment node
// Vérification du jeton d'accès du MCP (E03-S01, AC2, H20) : JWKS locale, jetons ES256 signés à
// l'exécution (aucun jeton écrit en littéral, `testing-strategy.md § Anti-patterns`).
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { makeVerifyToken } from "../../packages/plateforme/mcp/auth"

const ISSUER = "https://project.example.test/auth/v1"
const USER_ID = "5f0c1d7e-0000-4000-8000-000000000001"
const REQUEST = new Request("https://acme.example.test/api/mcp", { method: "POST" })

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

type TokenOptions = { key?: CryptoKey; issuer?: string; exp?: number | null; nbf?: number; sub?: string | null; email?: string }

/** Jeton au format Supabase ; la clé, l'émetteur, les dates et le `sub` (null : absent) varient. */
function token({ key = signingKey, issuer = ISSUER, exp = now() + 3600, nbf, sub = USER_ID, email = "claire@example.test" }: TokenOptions = {}) {
  const jwt = new SignJWT({ email, role: "authenticated", client_id: "client-123", scope: "openid email" })
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setIssuedAt(now() - 60)
  if (exp !== null) jwt.setExpirationTime(exp)
  if (nbf !== undefined) jwt.setNotBefore(nbf)
  if (sub !== null) jwt.setSubject(sub)
  return jwt.sign(key)
}

describe("makeVerifyToken", () => {
  const verify = () => makeVerifyToken({ jwks, issuer: ISSUER })

  it("should accept a valid token and return its sub and email, without expiresAt", async () => {
    const bearer = await token()
    const info = await verify()(REQUEST, bearer)
    expect(info).toEqual({
      token: bearer,
      clientId: "client-123",
      scopes: ["openid", "email"],
      // L'émetteur qui a vérifié le jeton, pour la traduction du sujet (E01-S11 a1-wire).
      extra: { sub: USER_ID, email: "claire@example.test", iss: ISSUER, issuer_kind: "supabase" },
    })
    expect(info).not.toHaveProperty("expiresAt")
  })

  it("should accept a token expired within the 5 s clock tolerance", async () => {
    expect(await verify()(REQUEST, await token({ exp: now() - 2 }))).toBeDefined()
  })

  it.each([
    ["expired", () => token({ exp: now() - 60 })],
    ["signed by another key", () => token({ key: otherKey })],
    ["from another issuer", () => token({ issuer: "https://other.example.test/auth/v1" })],
    ["without sub", () => token({ sub: null })],
    ["without exp", () => token({ exp: null })],
    ["not valid before a future date", () => token({ nbf: now() + 600 })],
    ["unreadable", async () => "not-a-jwt"],
  ])("should refuse a token %s", async (_case, make) => {
    expect(await verify()(REQUEST, await make())).toBeUndefined()
  })

  it("should refuse a missing token", async () => {
    expect(await verify()(REQUEST, undefined)).toBeUndefined()
  })

  it("should import and build without any environment variable, and refuse every token then", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const auth = await import("../../packages/plateforme/mcp/auth")
    const verifyFromEnv = auth.makeVerifyToken()
    expect(await verifyFromEnv(REQUEST, await token())).toBeUndefined()
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
    vi.unstubAllEnvs()
  })
})
