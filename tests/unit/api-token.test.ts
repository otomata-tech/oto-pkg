// @vitest-environment node
// Vérification du jeton à la porte de l'API (M10, ADR-012 § 5 b) : le vérificateur injecté, du type
// de celui du MCP ; sans lui, `makeVerifyToken()` du projet Supabase ; un jeton que la base refuse
// après la porte rend 401 `unauthorized`, jamais `internal`. Jetons ES256 signés à l'exécution
// (aucun jeton écrit en littéral, `testing-strategy.md § Anti-patterns`). Le défaut sur la JWKS réelle
// du projet : `tests/integration/api-invitations.test.ts` (vraies sessions, aucun vérificateur passé).
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import type { Identity } from "@otomata_tech/oto_platform/server"
import { makeVerifyToken, type VerifyToken } from "../../packages/plateforme/mcp/auth"
import { createPlatformDb } from "../../packages/plateforme/server/db"
import { resolveIdentity } from "../../packages/plateforme/server/identity"
import { listInvitations } from "../../packages/plateforme/server/invitations"

const db = vi.hoisted(() => ({ tx: vi.fn() }))

vi.mock("../../packages/plateforme/server/db", () => ({ createPlatformDb: vi.fn(() => ({ tx: db.tx })) }))

// Les vrais `makeVerifyToken` et `resolveIdentity`, espionnés : le défaut que prend la porte, et
// l'appelant qu'elle tire du jeton.
vi.mock("../../packages/plateforme/mcp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../packages/plateforme/mcp/auth")>()
  return { ...actual, makeVerifyToken: vi.fn(actual.makeVerifyToken) }
})

vi.mock("../../packages/plateforme/server/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../packages/plateforme/server/identity")>()
  return { ...actual, resolveIdentity: vi.fn(actual.resolveIdentity) }
})

vi.mock("../../packages/plateforme/server/invitations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../packages/plateforme/server/invitations")>()),
  listInvitations: vi.fn(),
}))

const HOST = "acme.test"
const ISSUER = "https://project.example.test/auth/v1"
const USER_ID = "5f0c1d7e-0000-4000-8000-000000000001"
const EMAIL = "claire@acme.test"
const IDENTITY: Identity = {
  org: { id: "org-1", slug: "acme", name: "Acme", prefix: "acme", brand: {}, domains: null },
  user: { id: USER_ID, email: EMAIL, name: "claire" },
  member: { role: "admin", profile: {} },
  teams: [],
  isStaff: false,
  viaGrant: false,
  hasOpenGrant: false,
}

/** Un vérificateur qui accepte tout jeton comme celui de Claire. */
const accept: VerifyToken = async (_request, bearer) => ({ token: bearer ?? "", clientId: "", scopes: [], extra: { sub: USER_ID, email: EMAIL } })

let signingKey: CryptoKey
let otherKey: CryptoKey
let jwks: JWTVerifyGetKey

beforeAll(async () => {
  const signing = await generateKeyPair("ES256")
  signingKey = signing.privateKey
  otherKey = (await generateKeyPair("ES256")).privateKey
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(signing.publicKey)), kid: "k1", alg: "ES256", use: "sig" }] })
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listInvitations).mockResolvedValue([])
})

/** Jeton au format Supabase, signé à l'exécution par la clé donnée. */
function token(key: CryptoKey) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email: EMAIL, role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" })
    .setIssuer(ISSUER)
    .setSubject(USER_ID)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 3600)
    .sign(key)
}

async function call(accessToken: string, verifyToken?: VerifyToken) {
  const req = new Request(`https://${HOST}/api/plateforme/invitations`, { headers: { "x-forwarded-proto": "https" } })
  const response = await handlePlateforme(req, { accessToken, host: HOST, defer: () => {}, verifyToken })
  return { req, response, body: await response.json() }
}

describe("handlePlateforme token verification (M10)", () => {
  it("should identify the caller by the verifier it receives, of the MCP type, and refuse before any database client", async () => {
    const verifyToken = makeVerifyToken({ jwks, issuer: ISSUER })

    const refused = await call(await token(otherKey), verifyToken)
    expect([refused.response.status, refused.body]).toEqual([401, { error: { code: "forbidden", message: "Authentication required." } }])
    expect(createPlatformDb).not.toHaveBeenCalled()

    vi.mocked(resolveIdentity).mockResolvedValueOnce(IDENTITY)
    const accepted = await call(await token(signingKey), verifyToken)
    expect([accepted.response.status, accepted.body]).toEqual([200, { data: { invitations: [] } }])
    expect(resolveIdentity).toHaveBeenCalledOnce()
    // L'identifiant interne se lit dans la session, que la base traduit (E01-S11) : la porte ne passe que l'email.
    expect(resolveIdentity).toHaveBeenCalledWith(expect.anything(), HOST, { email: EMAIL })
    // Le vérificateur de l'hôte seul : la porte n'a pas construit son défaut.
    expect(makeVerifyToken).toHaveBeenCalledOnce()
  })

  it("should verify with makeVerifyToken() of the Supabase project when the host passes no verifier", async () => {
    const projectDefault = vi.fn(accept)
    vi.mocked(makeVerifyToken).mockReturnValueOnce(projectDefault)
    vi.mocked(resolveIdentity).mockResolvedValueOnce(IDENTITY)

    const { req, response } = await call("session-token")

    expect(makeVerifyToken).toHaveBeenCalledWith()
    expect(projectDefault).toHaveBeenCalledWith(req, "session-token")
    expect(response.status).toBe(200)
  })

  it("should answer 401 unauthorized, never internal, when the database refuses the token after the gate", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    // À la première requête de la vraie `resolveIdentity`, que sa face SQL rejette avec le code du refus
    // (E01-S10, partie e1a) : ce que rejette `db.tx` est traduit par son code (HN-E01S10-15), une panne
    // que la base ne produit pas à la demande, injectée (HN-E01S10-t1e1-3).
    db.tx.mockRejectedValueOnce(Object.assign(new Error("JWT expired"), { code: "PGRST301" }))

    const { response, body } = await call("session-token", accept)

    expect([response.status, body.error.code]).toEqual([401, "unauthorized"])
    log.mockRestore()
  })
})
