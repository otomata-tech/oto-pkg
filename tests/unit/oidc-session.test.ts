// @vitest-environment node
// Session OIDC de l'hôte (E01-S11 partie b) : le cookie chiffré qui garde les jetons (AC-b2), son
// découpage quand les jetons dépassent un cookie, et la configuration, nommée sans sa valeur. Sans
// réseau : l'émetteur de test sert découverte, autorisation et jeton en mémoire
// (`tests/helpers/oidc-issuer.ts`), posé à la place du `fetch` global par l'hôte de test
// (`tests/helpers/oidc-host.ts`). Le parcours complet, routes et middleware compris, est dans
// `tests/integration/oidc-flow.test.ts`.
import type { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { currentOidcSession, oidcCallback, oidcLogin } from "@/lib/plateforme/oidc-session"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { oidcMode } from "../../packages/plateforme/server/issuer"
import { loggedText } from "../helpers/logs"
import { absorb, CLIENT_SECRET, EMAIL, NAME, oidcHost, ORIGIN, PERSON, request, SESSION_COOKIE, type Jar } from "../helpers/oidc-host"
import type { TestIssuer, TestPerson } from "../helpers/oidc-issuer"

/** Les cookies de `jar`, tels que les lisent le middleware, les écrans et la route de l'API. */
function reader(jar: Jar) {
  return request("/", jar).cookies
}

/** Une connexion chez l'émetteur, jusqu'au retour : la réponse du rappel et les cookies qu'elle laisse. */
async function signIn(issuer: TestIssuer, person: TestPerson, jar: Jar = new Map()): Promise<{ jar: Jar; callback: NextResponse }> {
  const login = await oidcLogin(ORIGIN, "/")
  absorb(jar, login)
  const back = issuer.authorize(login.headers.get("location") ?? "", person)
  const callback = await oidcCallback(request(back, jar), ORIGIN, async () => {})
  return { jar: absorb(jar, callback), callback }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the encrypted session cookie (AC-b2)", () => {
  it("should keep the session in httpOnly, secure, sameSite=lax cookies that only its secret opens, unaltered", async () => {
    const issuer = await oidcHost()

    const { jar, callback } = await signIn(issuer, PERSON)

    const cookie = callback.cookies.get(`${SESSION_COOKIE}.0`)
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" })
    const session = await currentOidcSession(reader(jar))
    expect(session).toMatchObject({ subject: PERSON.sub, email: EMAIL, name: NAME })
    // Chiffré : ni les jetons ni l'email ne se lisent dans le cookie (noms comparés, jamais les valeurs).
    const sealed = [...jar].filter(([name]) => name.startsWith(SESSION_COOKIE)).map(([, value]) => value).join("")
    const visible = { accessToken: session?.accessToken, refreshToken: session?.refreshToken, idToken: session?.idToken, email: EMAIL }
    expect(Object.entries(visible).filter(([, value]) => !value || sealed.includes(value)).map(([name]) => name)).toEqual([])
    // Un caractère changé, ou une autre clé : aucune session.
    const value = jar.get(`${SESSION_COOKIE}.0`) ?? ""
    const altered = new Map(jar).set(`${SESSION_COOKIE}.0`, `${value.slice(0, 40)}${value[40] === "A" ? "B" : "A"}${value.slice(41)}`)
    expect(await currentOidcSession(reader(altered))).toBeNull()
    vi.stubEnv("PLATFORM_SESSION_SECRET", randomBytes(32).toString("base64"))
    expect(await currentOidcSession(reader(jar))).toBeNull()
  })

  // Les jetons de Keycloak dépassent chacun 1 Ko : trois ne tiennent pas dans un cookie de 4 096 octets.
  it("should split a session larger than one cookie, read it back whole, and drop the pieces of a larger one", async () => {
    const issuer = await oidcHost()
    // Un nom de 1 000 caractères, dans le jeton d'accès, l'`id_token` et la session : trois morceaux.
    const long = { ...PERSON, claims: { ...PERSON.claims, name: "N".repeat(1_000) } }

    const first = await signIn(issuer, long)
    const pieces = [...first.jar.keys()].filter((name) => name.startsWith(SESSION_COOKIE))
    const after = await signIn(issuer, PERSON, new Map(first.jar))
    const left = [...after.jar.keys()].filter((name) => name.startsWith(SESSION_COOKIE))

    expect(pieces.length).toBeGreaterThan(1)
    expect((await currentOidcSession(reader(first.jar)))?.name).toBe("N".repeat(1_000))
    // Un morceau de la session précédente, resté, se lirait à la suite de la nouvelle et la rendrait illisible.
    expect(left.length).toBeLessThan(pieces.length)
    expect((await currentOidcSession(reader(after.jar)))?.name).toBe(NAME)
  })
})

describe("the configuration of the host (E01-S11 b)", () => {
  it.each([
    { variable: "PLATFORM_OIDC_CLIENT_SECRET", value: "" },
    { variable: "PLATFORM_SESSION_SECRET", value: randomBytes(8).toString("hex") },
  ])("should refuse to sign in without a usable $variable, naming it and never its value", async ({ variable, value }) => {
    await oidcHost()
    vi.stubEnv(variable, value)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await oidcLogin(ORIGIN, "/")

    expect(response.status).toBe(500)
    expect(response.headers.get("location")).toBeNull()
    const logged = loggedText(log)
    expect(logged).toContain(variable)
    expect(Object.entries({ value, CLIENT_SECRET }).filter(([, secret]) => secret && logged.includes(secret)).map(([name]) => name)).toEqual([])
  })
})

describe("the OIDC mode of the host and of the package (M42)", () => {
  // `oidcEnabled` (l'hôte) et `oidcMode` (le paquet) lisent la même variable : l'un en OIDC, l'autre sur
  // Supabase Auth, l'hôte ouvrirait une session que le paquet ne vérifierait pas.
  it.each([
    { issuer: "https://issuer.example.test/oidc", oidc: true },
    { issuer: "", oidc: false },
    { issuer: undefined, oidc: false },
  ])("should say the same mode on both sides when PLATFORM_OIDC_ISSUER is $issuer", ({ issuer, oidc }) => {
    vi.stubEnv("PLATFORM_OIDC_ISSUER", issuer)
    expect({ host: oidcEnabled(), package: oidcMode() }).toEqual({ host: oidc, package: oidc })
  })
})
