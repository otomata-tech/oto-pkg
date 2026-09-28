// L'hôte de référence en mode OIDC, tel que ses tests le posent (E01-S11 partie b) : ses variables sur un
// émetteur de test (`oidc-issuer.ts`) et son `fetch` à la place du réseau, la personne qui se connecte,
// et les cookies du navigateur d'une réponse à la requête suivante. `tests/unit/oidc-session.test.ts` et
// `tests/integration/oidc-flow.test.ts` les écrivaient chacun (revue 1 de la partie b).
import { NextRequest, type NextResponse } from "next/server"
import { randomBytes, randomUUID } from "crypto"
import { vi } from "vitest"
import { testIssuer, type TestIssuer, type TestIssuerOptions, type TestPerson } from "./oidc-issuer"

/** L'adresse de l'hôte : celle d'une organisation. */
export const ORIGIN = "https://acme.example.test"
/** La ressource d'API de l'hôte (`PLATFORM_OIDC_AUDIENCE`) : l'adresse de son MCP. */
export const AUDIENCE = `${ORIGIN}/api/mcp`
export const CLIENT_ID = "web-host"
// Secrets tirés à l'exécution, jamais écrits en littéral (`testing-strategy.md § Anti-patterns`).
export const CLIENT_SECRET = randomBytes(24).toString("hex")
const SESSION_SECRET = randomBytes(32).toString("base64")
/** Le préfixe des morceaux de la session : `${SESSION_COOKIE}.0`, `.1`… */
export const SESSION_COOKIE = "__Host-plateforme-session"

export const SUBJECT = randomUUID()
export const EMAIL = "claire@acme.example.test"
export const NAME = "Claire Morel"
/** La personne qui se connecte chez l'émetteur, son email vérifié. */
export const PERSON: TestPerson = { sub: SUBJECT, claims: { email: EMAIL, email_verified: true, name: NAME } }

/** Les cookies du navigateur : nom, valeur. */
export type Jar = Map<string, string>

/** Le mode OIDC d'un hôte, sur un émetteur de test : ses cinq variables, et son `fetch` à la place du réseau. */
export async function oidcHost(options: TestIssuerOptions = {}): Promise<TestIssuer> {
  const issuer = await testIssuer(options)
  issuer.clients.set(CLIENT_ID, CLIENT_SECRET)
  vi.stubEnv("PLATFORM_OIDC_ISSUER", issuer.issuer)
  vi.stubEnv("PLATFORM_OIDC_AUDIENCE", AUDIENCE)
  vi.stubEnv("PLATFORM_OIDC_CLIENT_ID", CLIENT_ID)
  vi.stubEnv("PLATFORM_OIDC_CLIENT_SECRET", CLIENT_SECRET)
  vi.stubEnv("PLATFORM_SESSION_SECRET", SESSION_SECRET)
  vi.stubGlobal("fetch", issuer.fetch)
  return issuer
}

/** Une requête du navigateur (`path` sous `ORIGIN`, ou une adresse entière), avec les cookies de `jar`. */
export function request(path: string, jar: Jar = new Map(), init: { method?: string; headers?: Record<string, string> } = {}): NextRequest {
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
  return new NextRequest(path.startsWith("http") ? path : `${ORIGIN}${path}`, { method: init.method, headers: { ...(cookie ? { cookie } : {}), ...init.headers } })
}

/** Les cookies du navigateur après `response` : posés, ou retirés (`Max-Age=0`). */
export function absorb(jar: Jar, response: NextResponse): Jar {
  for (const cookie of response.cookies.getAll()) {
    if (cookie.value && cookie.maxAge !== 0) jar.set(cookie.name, cookie.value)
    else jar.delete(cookie.name)
  }
  return jar
}
