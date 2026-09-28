// @vitest-environment node
// Lectures OAuth du schéma `auth` (E01-S06 : AC34, AC35 ; fiche D10, option A) sur le projet
// Supabase d'oto-platform : la ressource de la demande en attente de l'appelant, et l'activité des
// clients OAuth pour le ménage d'outillage. Les clients OAuth sont jetables et supprimés en
// `afterAll`, même en échec ; les cas qui en demandent un sont sautés si le serveur OAuth du projet
// les refuse. Supabase seulement : le serveur OAuth et le schéma `auth` sont ceux de Supabase Auth.
// Depuis E01-S10 f2, les fonctions de `platform` s'appellent par la face SQL (`asCaller`,
// `withAnonSession`, la connexion d'administration), plus par PostgREST.
import { createHash, randomBytes } from "crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import { withAnonSession, type Tx } from "../../packages/plateforme/server/sql"
import { createFixtures, hex, SKIP_REASON, supabaseConfigured, type Fixtures, type SessionAuth } from "../helpers/plateforme"
import { asCaller, SQL_SKIP_REASON, sqlConfigured, testAdminSql, type TestSql } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000
const OAUTH_SKIP = "OAuth server disabled on this project (E02-S02, JB action)"
const REDIRECT = "http://127.0.0.1:9/callback"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

const configured = supabaseConfigured && sqlConfigured
const SUITE = "OAuth reads of the auth schema"

describe.skipIf(!configured)(configured ? SUITE : `${SUITE} (${supabaseConfigured ? SQL_SKIP_REASON : SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let fx: Fixtures
  let admin: TestSql
  /** Les méthodes OAuth du serveur d'auth sous la session Supabase Auth de Léa ; jamais `platform`. */
  let leaAuth: SessionAuth
  let lea: PlatformDb
  let marc: PlatformDb
  const clientIds: string[] = []

  /** Un client OAuth public jetable (`token_endpoint_auth_method: none`), ou null si le serveur le refuse. */
  async function createOAuthClient(): Promise<string | null> {
    const { data, error } = await fx.auth.auth.admin.oauth.createClient({
      client_name: `test-${hex(4)}`,
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
    })
    if (error || !data) return null
    clientIds.push(data.client_id)
    return data.client_id
  }

  /** Une demande d'autorisation (PKCE S256, `resource` jetable) ; son `authorization_id` lu dans `Location`. */
  async function openAuthorization(clientId: string): Promise<{ id: string | null; resource: string }> {
    const verifier = randomBytes(32).toString("base64url")
    const resource = `https://t${hex(4)}.example.invalid/api/mcp`
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state: hex(8),
      scope: "openid",
      resource,
    })
    const response = await fetch(`${url}/auth/v1/oauth/authorize?${params}`, { redirect: "manual", headers: { apikey: anonKey } })
    const location = response.headers.get("location")
    return { id: location ? new URL(location, url).searchParams.get("authorization_id") : null, resource }
  }

  const readPending = (sql: Tx, id: string) =>
    sql<{ resource: string | null }[]>`select platform.oauth_pending_resource(${id}) as resource`.then(([row]) => row.resource)
  const pendingResource = (db: PlatformDb, id: string) => db.tx((sql) => readPending(sql, id))

  // Deux personnes suffisent : les deux fonctions ne lisent que l'appelant, aucune organisation (M11).
  beforeAll(async () => {
    fx = createFixtures()
    admin = testAdminSql()
    const leaUser = await fx.createUser({ fullName: "Léa Roux" })
    const marcUser = await fx.createUser({ fullName: "Marc Petit" })
    leaAuth = (await fx.sessionFor(leaUser)).auth
    lea = asCaller(leaUser.id, leaUser.email)
    marc = asCaller(marcUser.id, marcUser.email)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    try {
      for (const id of clientIds) await fx.auth.auth.admin.oauth.deleteClient(id)
    } finally {
      try {
        await fx?.cleanup()
      } finally {
        await admin?.end({ timeout: 5 })
      }
    }
  }, SETUP_TIMEOUT)

  describe("oauth_pending_resource (AC34)", () => {
    it("should give Léa the resource of her pending request, and nobody else", async (ctx) => {
      const clientId = await createOAuthClient()
      if (!clientId) return ctx.skip(OAUTH_SKIP)
      const { id, resource } = await openAuthorization(clientId)
      if (!id) return ctx.skip(OAUTH_SKIP)
      const details = await leaAuth.oauth.getAuthorizationDetails(id)
      expect(details.error).toBeNull()
      expect(await pendingResource(lea, id)).toBe(resource)
      expect(await pendingResource(marc, id)).toBeNull()
    })

    it("should give null once Léa has denied the request", async (ctx) => {
      const clientId = await createOAuthClient()
      if (!clientId) return ctx.skip(OAUTH_SKIP)
      const { id } = await openAuthorization(clientId)
      if (!id) return ctx.skip(OAUTH_SKIP)
      await leaAuth.oauth.getAuthorizationDetails(id)
      const denied = await leaAuth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
      expect(denied.error).toBeNull()
      expect(await pendingResource(lea, id)).toBeNull()
    })

    it("should give null for an unknown request, and refuse anon (42501)", async () => {
      expect(await pendingResource(lea, `unknown-${hex(8)}`)).toBeNull()
      await expect(withAnonSession((sql) => readPending(sql, `unknown-${hex(8)}`))).rejects.toMatchObject({ code: "42501" })
    })
  })

  describe("oauth_clients_activity (AC35)", () => {
    // `sessions` est un `bigint`, que le pilote rend en texte ; PostgREST le rendait en nombre.
    const activityOf = (clientId: string) => admin`
      select client_id, client_name, client_type, registration_type, created_at, sessions::int as sessions, last_activity
      from platform.oauth_clients_activity() where client_id = ${clientId}`

    it("should list a public client without session, then forget it once deleted", async (ctx) => {
      const clientId = await createOAuthClient()
      if (!clientId) return ctx.skip(OAUTH_SKIP)
      const rows = await activityOf(clientId)
      expect(rows).toEqual([
        {
          client_id: clientId,
          client_name: expect.stringMatching(/^test-/),
          client_type: "public",
          registration_type: expect.any(String),
          created_at: expect.any(Date),
          sessions: 0,
          last_activity: null,
        },
      ])
      expect((await fx.auth.auth.admin.oauth.deleteClient(clientId)).error).toBeNull()
      expect(await activityOf(clientId)).toEqual([])
    })

    it("should refuse anon and a signed-in person (42501)", async () => {
      const activity = (sql: Tx) => sql`select * from platform.oauth_clients_activity()`
      await expect(withAnonSession(activity)).rejects.toMatchObject({ code: "42501" })
      await expect(lea.tx(activity)).rejects.toMatchObject({ code: "42501" })
    })
  })
})
