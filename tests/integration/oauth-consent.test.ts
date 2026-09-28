// @vitest-environment node
// Consentement sur le serveur OAuth réel du projet Supabase d'oto-platform (E02-S02, AC22) : une
// demande ouverte par PKCE S256 avec `resource` et `offline_access` par un client public jetable (garde
// contre supabase/auth#2820 : 400 sur ces trois points), lue comme une personne connectée, puis
// refusée ou autorisée par `consentRequest` et `consentDecision` ; ce que rendent une demande tranchée
// dans un autre onglet et un client déjà consenti (AC11, AC17, HN-E02S02-20). Organisation et personne
// jetables (`t<hex>`, `test-<hex>@example.invalid`, H120) ; clients OAuth supprimés en `afterAll`, même
// en échec. Sauté, avec sa raison, quand le serveur OAuth du projet n'est pas activé (action JB).
// Supabase seulement : le serveur OAuth est celui de Supabase Auth, sous la session de la personne ;
// depuis E01-S10 f2, les lectures de `platform` du service passent par la face SQL sous le même appelant
// (`asCaller`), plus par PostgREST.
import { createHash, randomBytes } from "crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { consentDecision, consentRequest } from "../../packages/plateforme/server/oauth"
import { createFixtures, hex, SKIP_REASON, supabaseConfigured, type Fixtures, type SessionAuth, type TestOrg } from "../helpers/plateforme"
import { asCaller, SQL_SKIP_REASON, sqlConfigured } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000
const OAUTH_SKIP = "OAuth server disabled on this project: no authorization_endpoint announced (E02-S02, JB action 1)"
const REDIRECT = "http://127.0.0.1:9/callback"

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

const configured = supabaseConfigured && sqlConfigured
const SUITE = "consent on the real OAuth server"

describe.skipIf(!configured)(
  configured ? SUITE : `${SUITE} (${supabaseConfigured ? SQL_SKIP_REASON : SKIP_REASON})`,
  { timeout: NETWORK_TIMEOUT },
  () => {
    let fx: Fixtures
    let oauthEnabled = false
    let acme: TestOrg & { host: string }
    let delta: TestOrg & { host: string }
    let person: { id: string; email: string; auth: SessionAuth; accessToken: string }
    const clientIds: string[] = []

    /** Un client OAuth public jetable (`token_endpoint_auth_method: none`), un par test. */
    async function createOAuthClient(): Promise<string> {
      const { data, error } = await fx.auth.auth.admin.oauth.createClient({
        client_name: `test-${hex(4)}`,
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
      })
      if (error || !data) throw new Error(`oauth createClient failed: ${error?.message}`)
      clientIds.push(data.client_id)
      return data.client_id
    }

    /**
     * Ouvre une demande comme un host (PKCE S256, `resource`, `offline_access`), par un client neuf ou
     * par `clientId` ; rend son `authorization_id`.
     */
    async function openRequest(resource: string, clientId?: string): Promise<string> {
      const client = clientId ?? (await createOAuthClient())
      const verifier = randomBytes(32).toString("base64url")
      const params = new URLSearchParams({
        response_type: "code",
        client_id: client,
        redirect_uri: REDIRECT,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        state: hex(8),
        scope: "openid email offline_access",
        resource,
      })
      const response = await fetch(`${url}/auth/v1/oauth/authorize?${params}`, { redirect: "manual", headers: { apikey: anonKey } })
      const location = response.headers.get("location")
      const id = location ? new URL(location, url).searchParams.get("authorization_id") : null
      if (!id) throw new Error(`authorize answered ${response.status} without authorization_id`)
      return id
    }

    const deps = () => ({ auth: person.auth, db: asCaller(person.id, person.email) })

    function decision(authorizationId: string, choix: "approve" | "deny"): FormData {
      const data = new FormData()
      data.set("authorization_id", authorizationId)
      data.set("decision", choix)
      return data
    }

    beforeAll(async () => {
      fx = createFixtures()
      const discovery = await fetch(`${url}/auth/v1/.well-known/oauth-authorization-server`, { headers: { apikey: anonKey } })
      const document: { authorization_endpoint?: string } | null = discovery.ok ? await discovery.json() : null
      oauthEnabled = Boolean(document?.authorization_endpoint)
      if (!oauthEnabled) return

      const acmeHost = `t${hex(4)}.example.invalid`
      const deltaHost = `t${hex(4)}.example.invalid`
      acme = { ...(await fx.createOrg({ name: "Acme Test", hosts: [acmeHost] })), host: acmeHost }
      delta = { ...(await fx.createOrg({ name: "Delta Test", hosts: [deltaHost] })), host: deltaHost }
      const user = await fx.createUser()
      await fx.addMember(acme.id, user.id)
      // Session par un lien généré à la clé secrète : les connexions par mot de passe ont leur quota par IP.
      person = { id: user.id, email: user.email, ...(await fx.sessionFor(user)) }
    }, SETUP_TIMEOUT)

    afterAll(async () => {
      try {
        for (const id of clientIds) await fx.auth.auth.admin.oauth.deleteClient(id)
      } finally {
        await fx?.cleanup()
      }
    }, SETUP_TIMEOUT)

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("should read the request, name the organisation of the resource, and deny with access_denied", async (ctx) => {
      if (!oauthEnabled) return ctx.skip(OAUTH_SKIP)
      const id = await openRequest(`https://${acme.host}/api/mcp`)

      const lecture = await consentRequest(deps(), id)

      expect(lecture.kind).toBe("ask")
      if (lecture.kind !== "ask") return
      expect(lecture.demande.organisation).toMatchObject({ etat: "connue", nom: "Acme Test", membre: true })
      expect(lecture.demande.compte).toBe(person.email)
      expect(lecture.demande.adresseDeRetour).toBe(REDIRECT)
      expect(lecture.demande.client.nom).toMatch(/^test-/)
      expect(lecture.demande.acces.map((acces) => acces.scope)).toEqual(["openid", "email", "offline_access"])

      const refus = await consentDecision(deps(), decision(id, "deny"))
      expect(refus.kind).toBe("redirect")
      if (refus.kind !== "redirect") return
      expect(refus.url.startsWith(REDIRECT)).toBe(true)
      expect(new URL(refus.url).searchParams.get("error")).toBe("access_denied")
    })

    it("should approve a request and give a return address with a code", async (ctx) => {
      if (!oauthEnabled) return ctx.skip(OAUTH_SKIP)
      const id = await openRequest(`https://${acme.host}/api/mcp`)
      expect((await consentRequest(deps(), id)).kind).toBe("ask")

      const accord = await consentDecision(deps(), decision(id, "approve"))

      expect(accord.kind).toBe("redirect")
      if (accord.kind !== "redirect") return
      expect(accord.url.startsWith(REDIRECT)).toBe(true)
      expect(new URL(accord.url).searchParams.get("code")).toBeTruthy()
    })

    it("should say the person is not a member of the organisation of the resource (AC13)", async (ctx) => {
      if (!oauthEnabled) return ctx.skip(OAUTH_SKIP)
      const id = await openRequest(`https://${delta.host}/api/mcp`)

      const lecture = await consentRequest(deps(), id)

      expect(lecture.kind === "ask" && lecture.demande.organisation).toMatchObject({ etat: "connue", nom: "Delta Test", membre: false })
    })

    it("should name the host of a resource without organisation (AC14)", async (ctx) => {
      if (!oauthEnabled) return ctx.skip(OAUTH_SKIP)
      const host = `t${hex(4)}.example.invalid`
      const id = await openRequest(`https://${host}/api/mcp`)

      const lecture = await consentRequest(deps(), id)

      expect(lecture.kind === "ask" && lecture.demande.organisation).toEqual({ etat: "inconnue", hote: host })
    })

    // AC17 et HN-E02S02-20 : ce que rend le serveur réel quand la même demande est ouverte dans deux onglets.
    it("should ask to retry a decision on a request another tab decided, which then reads as unreadable (AC17)", async (ctx) => {
      if (!oauthEnabled) return ctx.skip(OAUTH_SKIP)
      const log = vi.spyOn(console, "error").mockImplementation(() => {})
      const id = await openRequest(`https://${acme.host}/api/mcp`)
      expect((await consentRequest(deps(), id)).kind).toBe("ask")
      expect((await consentDecision(deps(), decision(id, "approve"))).kind).toBe("redirect")

      const refus = await consentDecision(deps(), decision(id, "deny"))

      expect(refus).toEqual({ kind: "retry", authorizationId: id, erreur: "decision" })
      expect(await consentRequest(deps(), id)).toEqual({ kind: "expired" })
      expect(log).toHaveBeenCalled()
    })

    it("should keep a shown request pending once the same client got consent on another one, and deny it (HN-E02S02-20)", async (ctx) => {
      if (!oauthEnabled) return ctx.skip(OAUTH_SKIP)
      const resource = `https://${acme.host}/api/mcp`
      const clientId = await createOAuthClient()
      const montree = await openRequest(resource, clientId)
      expect((await consentRequest(deps(), montree)).kind).toBe("ask")
      const autre = await openRequest(resource, clientId)
      expect((await consentRequest(deps(), autre)).kind).toBe("ask")
      expect((await consentDecision(deps(), decision(autre, "approve"))).kind).toBe("redirect")

      expect((await consentRequest(deps(), montree)).kind).toBe("ask")
      const refus = await consentDecision(deps(), decision(montree, "deny"))

      expect(refus.kind === "redirect" && new URL(refus.url).searchParams.get("error")).toBe("access_denied")
    })

    it("should send a new request of a client already consented straight back with a code (AC11)", async (ctx) => {
      if (!oauthEnabled) return ctx.skip(OAUTH_SKIP)
      const resource = `https://${acme.host}/api/mcp`
      const clientId = await createOAuthClient()
      const premiere = await openRequest(resource, clientId)
      expect((await consentRequest(deps(), premiere)).kind).toBe("ask")
      expect((await consentDecision(deps(), decision(premiere, "approve"))).kind).toBe("redirect")

      const lecture = await consentRequest(deps(), await openRequest(resource, clientId))

      expect(lecture.kind).toBe("redirect")
      if (lecture.kind !== "redirect") return
      expect(lecture.url.startsWith(REDIRECT)).toBe(true)
      expect(new URL(lecture.url).searchParams.get("code")).toBeTruthy()
    })
  },
)
