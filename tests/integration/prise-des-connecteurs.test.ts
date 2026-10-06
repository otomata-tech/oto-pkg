// @vitest-environment node
// Prise des connecteurs sur une vraie base (story prise-des-connecteurs) : comptes réels, secret posé par qui gère le
// compte, refus d'un compte simulé sur un connecteur réel, puis, migration appliquée, la table des connecteurs, le
// chiffré lu par `platform.account_secret` et le secret remis à la seule fonction appelée, jamais servi ailleurs
// (NFR-ADMIN-01). Portable : organisation O de `createSqlFixtures`, chaque personne sous sa session (`fx.as`), la
// connexion d'administration pour poser et relire. `fetch` simulé : aucun réseau, un jeton tiré à l'exécution. Ce qui
// se refuse avant la base (mode d'un compte, client HTTP, coffre) est dans `tests/unit/`.
import { randomBytes } from "crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { runCall, type CallInput } from "../../packages/plateforme/server/calls"
import { createAccount, listOrgAccounts, setAccountSecret } from "../../packages/plateforme/server/connectors/accounts"
import { loadActiveConnectors } from "../../packages/plateforme/server/connectors/activations"
import type { Fetch } from "../../packages/plateforme/server/connectors/http"
import { decryptSecret } from "../../packages/plateforme/server/connectors/vault"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import { PlatformError } from "../../packages/plateforme/server/errors"
import { resolveIdentity, type Identity } from "../../packages/plateforme/server/identity"
import { loggedText } from "../helpers/logs"
import { connectDeps } from "../helpers/mcp"
import { pendingMigrations, pendingReason } from "../helpers/pending-migrations"
import { hex, REFERENCE_PEOPLE, type ReferencePerson } from "../helpers/plateforme"
import { createSqlFixtures, spyDb, SQL_SKIP_REASON, sqlConfigured, type SqlFixtures, type SqlReferenceOrg } from "../helpers/sql"

const VERSION = "20261006090000"
const pending = (await pendingMigrations()).includes(VERSION)

const NETWORK_TIMEOUT = 120_000
const SETUP_TIMEOUT = 180_000
const ORIGIN = "https://acme.test"

type Session = { db: PlatformDb; identity: Identity }

async function refusal(run: Promise<unknown>): Promise<PlatformError> {
  const error = await run.then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof PlatformError)) throw new Error(`expected a PlatformError, got ${String(error)}`)
  return error
}

/** Le code SQL d'une requête refusée par la base, `null` si elle passe. */
const codeOf = (run: Promise<unknown>) =>
  run.then(
    () => null,
    (error: { code?: string }) => error.code ?? "?",
  )

const newSecret = () => `ntn_${randomBytes(16).toString("hex")}`

/** Notion simulé : la recherche rend une page ; chaque requête est gardée pour relire son en-tête d'authentification. */
function stubNotion() {
  const page = { object: "page", id: "1f2e3d4c-5b6a-7988-1f2e-3d4c5b6a7988", url: null, properties: { Name: { type: "title", title: [{ plain_text: "Roadmap" }] } } }
  const send = vi.fn<Fetch>(async () => new Response(JSON.stringify({ object: "list", results: [page], next_cursor: null, has_more: false })))
  vi.stubGlobal("fetch", send)
  return { send, authorizations: () => send.mock.calls.map(([, init]) => new Headers(init.headers).get("authorization")) }
}

const suite = sqlConfigured ? "connector intake on a real database" : `connector intake on a real database (${SQL_SKIP_REASON})`

describe.skipIf(!sqlConfigured)(suite, { timeout: NETWORK_TIMEOUT }, () => {
  let fx: SqlFixtures
  let o: SqlReferenceOrg
  const sessions = new Map<ReferencePerson, Session>()
  const savedKey = process.env.PLATFORM_VAULT_KEY

  function as(who: ReferencePerson): Session {
    const found = sessions.get(who)
    if (!found) throw new Error(`${who} has no session`)
    return found
  }

  const call = (who: ReferencePerson, input: CallInput) => {
    const { db, identity } = as(who)
    return runCall({ db, identity, ctxCode: null, origin: ORIGIN, activeConnectors: () => loadActiveConnectors(db, o.org.id) }, input)
  }

  /** Un compte de l'organisation, au libellé propre au cas : chaque appel le nomme (`account`), sans ambiguïté. */
  async function orgAccount(mode: "reel" | "simule"): Promise<{ id: string; label: string }> {
    const label = `Notion ${mode} ${hex(3)}`
    return { id: await fx.createAccount(o.org.id, { connector: "notion", ownerKind: "org", label, mode }), label }
  }

  const ciphertextOf = async (id: string) =>
    (await fx.admin<{ secret_ciphertext: string | null }[]>`select secret_ciphertext from platform.accounts where id = ${id}`)[0]?.secret_ciphertext ?? null

  beforeAll(async () => {
    process.env.PLATFORM_VAULT_KEY = randomBytes(32).toString("base64")
    fx = createSqlFixtures()
    o = await fx.buildReferenceOrg()
    await fx.addActivation(o.org.id, "notion")
    for (const person of REFERENCE_PEOPLE) {
      const user = o.people[person]
      const db = fx.as(user)
      sessions.set(person, { db, identity: await resolveIdentity(db, o.host, { userId: user.id, email: user.email }) })
    }
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    if (savedKey === undefined) delete process.env.PLATFORM_VAULT_KEY
    else process.env.PLATFORM_VAULT_KEY = savedKey
    await fx?.cleanup()
  }, SETUP_TIMEOUT)

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe("live accounts and their secret (AC8, AC13)", () => {
    it("should let an administrator create a live notion account, then set its secret, never given back (AC8, AC13)", async () => {
      const ada = as("ada")
      const label = `Notion Live ${hex(3)}`
      const created = await createAccount(ada.db, ada.identity, { connector: "notion", owner_kind: "org", label, mode: "reel" })
      expect(created).toMatchObject({ label, connector: "notion", mode: "reel" })
      const secret = newSecret()
      const set = await setAccountSecret(ada.db, ada.identity, { account_id: created.id, secret })
      expect(set).toEqual(created)
      const ciphertext = await ciphertextOf(created.id)
      expect(ciphertext).not.toBeNull()
      expect(JSON.stringify(set)).not.toContain(secret)
      expect(ciphertext).not.toContain(secret)
      expect(decryptSecret(created.id, ciphertext ?? "")).toBe(secret)
    })

    it("should refuse the secret to whoever does not manage the account, and to a simulated account, writing nothing (AC8)", async () => {
      const live = await orgAccount("reel")
      const marc = as("marc")
      const forbidden = await refusal(setAccountSecret(marc.db, marc.identity, { account_id: live.id, secret: newSecret() }))
      expect({ code: forbidden.code, message: forbidden.message }).toEqual({
        code: "forbidden",
        message: `Setting the secret of « ${live.label} » is reserved to those who manage it: the administrators of Acme Test (Ada Martin).`,
      })
      const simulated = await fx.createAccount(o.org.id, { connector: "mail", ownerKind: "org", label: `Mail ${hex(3)}` })
      const ada = as("ada")
      expect((await refusal(setAccountSecret(ada.db, ada.identity, { account_id: simulated, secret: newSecret() }))).code).toBe("invalid_arguments")
      expect([await ciphertextOf(live.id), await ciphertextOf(simulated)]).toEqual([null, null])
    })

    it("should answer conflict, logged, when the account goes away between its read and the write of its secret (AC8)", async () => {
      const live = await orgAccount("reel")
      const ada = as("ada")
      const errors = vi.spyOn(console, "error").mockImplementation(() => {})
      const raced = spyDb(ada.db, { before: (query) => (query.op === "update" ? fx.admin`delete from platform.accounts where id = ${live.id}` : undefined) })
      const error = await refusal(setAccountSecret(raced.db, ada.identity, { account_id: live.id, secret: newSecret() }))
      expect({ code: error.code, message: error.message }).toEqual({ code: "conflict", message: `Account « ${live.label} » changed meanwhile. Reload it and retry.` })
      expect(loggedText(errors)).toContain(`[platform] setAccountSecret: no row written for account ${live.id}`)
    })

    it("should refuse a simulated account of a live connector before the function (AC13)", async () => {
      const simulated = await orgAccount("simule")
      const { send } = stubNotion()
      const error = await refusal(call("ada", { function: "notion.search_workspace", arguments: { query: "x" }, account: simulated.label }))
      expect({ code: error.code, message: error.message }).toEqual({
        code: "not_enabled",
        message: `Account « ${simulated.label} » is simulated, but notion is a live connector: it runs on live accounts only. Ask the administrators of Acme Test (Ada Martin) to connect a live account.`,
      })
      expect(send).not.toHaveBeenCalled()
    })

    it("should keep secret_ciphertext out of reach of a member's select (AC10)", async () => {
      const live = await orgAccount("reel")
      const ada = as("ada")
      expect(await codeOf(ada.db.tx((sql) => sql`select secret_ciphertext from platform.accounts where id = ${live.id}`))).toBe("42501")
    })
  })

  describe.skipIf(pending)(pending ? `with the migration (${pendingReason([VERSION])})` : "with the migration", () => {
    it("should refuse an account, an activation or a draft of a connector the table does not know (AC3)", async () => {
      const unknown = `c_${hex(3)}`
      const account = await fx.createAccount(o.org.id, { connector: "mail", ownerKind: "org", label: `Mail FK ${hex(3)}` })
      expect([
        await codeOf(fx.admin`insert into platform.accounts (org_id, connector, owner_kind, label, mode) values (${o.org.id}, ${unknown}, 'org', ${`X ${hex(3)}`}, 'reel')`),
        await codeOf(fx.addActivation(o.org.id, unknown)),
        await codeOf(fx.admin`
          insert into platform.sim_outbox (org_id, account_id, connector, function, payload, created_by)
          values (${o.org.id}, ${account}, ${unknown}, 'x.y', ${fx.admin.json({})}, ${o.people.ada.id})`),
      ]).toEqual(["23503", "23503", "23503"])
    })

    it("should let any session read the connectors, and none write them (AC5)", async () => {
      const lea = as("lea")
      const names = await lea.db.tx((sql) => sql<{ name: string }[]>`select name from platform.connectors where name in ('mail', 'notion') order by name`)
      expect(names.map((row) => row.name)).toEqual(["mail", "notion"])
      expect(await codeOf(lea.db.tx((sql) => sql`insert into platform.connectors (name) values (${`c_${hex(3)}`})`))).toBe("42501")
    })

    it("should give the ciphertext to a member of the account's organisation only (AC10)", async () => {
      const live = await orgAccount("reel")
      const ada = as("ada")
      await setAccountSecret(ada.db, ada.identity, { account_id: live.id, secret: newSecret() })
      const other = await fx.createOrg()
      const stranger = await fx.createUser()
      await fx.addMember(other.id, stranger.id, { role: "admin" })
      const read = (db: PlatformDb) => db.tx((sql) => sql<{ secret: string | null }[]>`select platform.account_secret(${live.id}) as secret`)
      expect((await read(as("lea").db))[0].secret).toBe(await ciphertextOf(live.id))
      expect((await read(fx.as(stranger)))[0].secret).toBeNull()
    })

    it("should hand the decrypted secret to the function of a live account, and to it only (AC11)", async () => {
      const ada = as("ada")
      const live = await orgAccount("reel")
      const secret = newSecret()
      await setAccountSecret(ada.db, ada.identity, { account_id: live.id, secret })
      const notion = stubNotion()
      const output = await call("lea", { function: "notion.search_workspace", arguments: { query: "roadmap" }, account: live.label })
      expect(notion.authorizations()).toEqual([`Bearer ${secret}`])
      expect(output.text).toBe(`1 result shared with the integration:\n- page « Roadmap » · id 1f2e3d4c-5b6a-7988-1f2e-3d4c5b6a7988\nNo team · account « ${live.label} » (live).`)
    })

    it("should refuse a live account without secret before the function (AC12)", async () => {
      const bare = await orgAccount("reel")
      const notion = stubNotion()
      const error = await refusal(call("lea", { function: "notion.search_workspace", arguments: {}, account: bare.label }))
      expect({ code: error.code, message: error.message }).toEqual({
        code: "not_enabled",
        message: `Account « ${bare.label} » has no secret yet. Ask the administrators of Acme Test (Ada Martin) to set it.`,
      })
      expect(notion.send).not.toHaveBeenCalled()
    })

    it("should serve neither the secret nor its ciphertext in the accounts, context, the call and its journal line, read or the logs (AC15)", async () => {
      const ada = as("ada")
      const live = await orgAccount("reel")
      const secret = newSecret()
      await setAccountSecret(ada.db, ada.identity, { account_id: live.id, secret })
      const ciphertext = (await ciphertextOf(live.id)) ?? ""
      stubNotion()
      const errors = vi.spyOn(console, "error")
      const journal: Parameters<typeof connectDeps>[0]["journal"] = []
      const gate = await connectDeps({
        db: ada.db,
        org: ada.identity.org,
        caller: { kind: "member", identity: ada.identity },
        userAgent: "vitest",
        journal,
        activeConnectors: () => loadActiveConnectors(ada.db, o.org.id),
        origin: ORIGIN,
      })
      const opened = await gate.openContext()
      const called = await gate.call("call", { ctx: opened.code, function: "notion.search_workspace", arguments: { query: "roadmap" }, account: live.label })
      expect(called.isError).toBe(false)
      const contract = await gate.call("read", { ctx: opened.code, path: "notion.search_workspace" })
      const served = [
        JSON.stringify(await listOrgAccounts(ada.db, ada.identity)),
        JSON.stringify(opened.result),
        JSON.stringify(called.result),
        JSON.stringify(contract.result),
        JSON.stringify(journal),
        loggedText(errors),
      ].join("\n")
      expect([served.includes(secret), served.includes(ciphertext), served.includes("secret_ciphertext")]).toEqual([false, false, false])
    })
  })
})
