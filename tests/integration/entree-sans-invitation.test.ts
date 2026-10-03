// @vitest-environment node
// L'entrée sans invitation (`open_entry`) sur une vraie base : le réglage, écrit par un administrateur avec au moins
// un domaine ; une personne admise qui devient membre à son premier appel, sans équipe ; chaque garde de `join_org`
// (réglage, email, domaine, exclusion, accès plateforme, plafond de membres) ; le retrait qui exclut, l'invitation
// acceptée qui lève l'exclusion. Portable : organisation O et personnes de `createLocalFixtures` ; les plafonds de
// l'hôte par `registerOrgLimits`.
import { randomUUID } from "crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createPlatformDb, readOpenEntry, registerOrgLimits, removeMember, resolveIdentity, setOpenEntry, type PlatformDb } from "@otomata_tech/oto_platform/server"
import { pendingMigrations, pendingReason } from "../helpers/pending-migrations"
import { hex } from "../helpers/plateforme"
import { createLocalFixtures, type LocalFixtures } from "../helpers/session-locale"
import { SQL_SKIP_REASON, sqlConfigured, type SqlReferenceOrg, type SqlUser } from "../helpers/sql"

const VERSION = "20261003090000"
const pending = (await pendingMigrations()).includes(VERSION)

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000
// Un domaine jetable par passage : deux passages sur la même base ne se voient pas.
const DOMAIN = `entree-${hex(4)}.example.invalid`

async function refusal(run: Promise<unknown>): Promise<{ code?: string; message?: string; details?: Record<string, unknown> } | null> {
  return run.then(
    () => null,
    (error: { code?: string; message?: string; details?: Record<string, unknown> }) => ({ code: error.code, message: error.message, details: error.details }),
  )
}

const suite = sqlConfigured ? "entry without invitation (open_entry)" : `entry without invitation (open_entry) (${SQL_SKIP_REASON})`

describe.skipIf(!sqlConfigured || pending)(pending ? `${suite} (${pendingReason([VERSION])})` : suite, { timeout: NETWORK_TIMEOUT }, () => {
  let fx: LocalFixtures
  let o: SqlReferenceOrg
  const minted: string[] = []

  /** Une personne jetable du domaine admis (ou d'un autre), membre d'aucune organisation, et son client. */
  async function newcomer(domain = DOMAIN): Promise<{ user: SqlUser; db: PlatformDb }> {
    const user = await fx.createUser({ fullName: "Nora Petit", email: `nora-${hex(4)}@${domain}` })
    return { user, db: fx.as(user) }
  }

  const admin = async () => ({ db: fx.as(o.people.ada), identity: await resolveIdentity(fx.as(o.people.ada), o.host, { userId: o.people.ada.id, email: o.people.ada.email }) })
  const enter = ({ user, db }: { user: SqlUser; db: PlatformDb }) => resolveIdentity(db, o.host, { email: user.email })
  const memberRows = (userId: string) => fx.admin<{ role: string }[]>`select role from platform.members where org_id = ${o.org.id} and user_id = ${userId}`

  async function open(domains: string[] = [DOMAIN], enabled = true) {
    const { db, identity } = await admin()
    return setOpenEntry(db, identity, { enabled, email_domains: domains })
  }

  beforeAll(async () => {
    fx = createLocalFixtures()
    o = await fx.buildReferenceOrg()
  }, SETUP_TIMEOUT)

  afterEach(() => registerOrgLimits(null))

  afterAll(async () => {
    if (fx) {
      for (const id of minted) await fx.admin`select platform.forget_user(${id})`
      await fx.cleanup()
    }
  }, SETUP_TIMEOUT)

  it("should keep an organisation closed by default, and refuse to open it without a domain or by a simple member", async () => {
    const { db, identity } = await admin()
    expect(await readOpenEntry(db, identity)).toEqual({ enabled: false, email_domains: [] })
    expect(await refusal(enter(await newcomer()))).toMatchObject({ code: "not_member" })

    expect(await refusal(setOpenEntry(db, identity, { enabled: true, email_domains: [] }))).toMatchObject({ code: "invalid_arguments" })
    expect(await refusal(setOpenEntry(db, identity, { enabled: true, email_domains: ["@acme.fr"] }))).toMatchObject({ code: "invalid_arguments" })
    const lea = await resolveIdentity(fx.as(o.people.lea), o.host, { userId: o.people.lea.id, email: o.people.lea.email })
    expect(await refusal(setOpenEntry(fx.as(o.people.lea), lea, { enabled: true, email_domains: [DOMAIN] }))).toMatchObject({ code: "forbidden" })
    expect(await readOpenEntry(db, identity)).toEqual({ enabled: false, email_domains: [] })
  })

  it("should let an account of an admitted domain in as a plain member at its first call, with a journal line, and keep the others out", async () => {
    // Les autres réglages de l'organisation ne bougent pas ; un domaine répété ou en majuscules se range une fois.
    const [before] = await fx.admin<{ settings: Record<string, unknown> }[]>`select settings from platform.orgs where id = ${o.org.id}`
    expect((await open([DOMAIN.toUpperCase(), DOMAIN])).data).toEqual({ enabled: true, email_domains: [DOMAIN] })
    const [after] = await fx.admin<{ settings: Record<string, unknown> }[]>`select settings from platform.orgs where id = ${o.org.id}`
    expect(after.settings).toEqual({ ...before.settings, open_entry: { enabled: true, email_domains: [DOMAIN] } })

    const nora = await newcomer()
    const identity = await enter(nora)
    expect({ role: identity.member.role, teams: identity.teams, viaGrant: identity.viaGrant, org: identity.org.id }).toEqual({ role: "member", teams: [], viaGrant: false, org: o.org.id })
    expect(await memberRows(nora.user.id)).toEqual([{ role: "member" }])
    const journal = await fx.admin<{ tool: string; target: string; args: unknown }[]>`
      select tool, target, args from platform.journal where org_id = ${o.org.id} and user_id = ${nora.user.id}`
    expect(journal).toEqual([{ tool: "member joined", target: nora.user.email, args: { origin: "open_entry" } }])
    // Le deuxième appel la sert en membre, sans seconde entrée.
    expect((await enter(nora)).user.id).toBe(nora.user.id)
    expect(await fx.admin`select 1 from platform.journal where org_id = ${o.org.id} and user_id = ${nora.user.id}`).toHaveLength(1)

    const elsewhere = await newcomer("ailleurs.example.invalid")
    expect(await refusal(enter(elsewhere))).toMatchObject({ code: "not_member" })
    expect(await memberRows(elsewhere.user.id)).toEqual([])
    const noEmail = await fx.createUser()
    expect(await refusal(resolveIdentity(createPlatformDb({ caller: { userId: noEmail.id, email: null, name: null } }), o.host, { email: "" }))).toMatchObject({ code: "not_member" })

    // Fermé, les domaines gardés : plus personne n'entre.
    expect((await open([DOMAIN], false)).data).toEqual({ enabled: false, email_domains: [DOMAIN] })
    expect(await refusal(enter(await newcomer()))).toMatchObject({ code: "not_member" })
  })

  it("should keep a removed member out, until an accepted invitation lifts the exclusion; forgetting the person leaves no exclusion", async () => {
    await open()
    const nora = await newcomer()
    await enter(nora)
    const { db, identity } = await admin()
    await removeMember(db, identity, nora.user.id)
    expect(await fx.admin`select excluded_by from platform.member_exclusions where org_id = ${o.org.id} and user_id = ${nora.user.id}`).toEqual([{ excluded_by: o.people.ada.id }])
    expect(await refusal(enter(nora))).toMatchObject({ code: "not_member" })
    expect(await memberRows(nora.user.id)).toEqual([])

    await fx.admin`insert into platform.invitations (org_id, email, role, invited_by) values (${o.org.id}, ${nora.user.email}, 'member', ${o.people.ada.id})`
    await nora.db.tx((sql) => sql`select platform.accept_invitations()`)
    expect(await memberRows(nora.user.id)).toEqual([{ role: "member" }])
    expect(await fx.admin`select 1 from platform.member_exclusions where org_id = ${o.org.id} and user_id = ${nora.user.id}`).toEqual([])

    await removeMember(db, identity, nora.user.id)
    await fx.admin`select platform.forget_user(${nora.user.id})`
    expect(await fx.admin`select 1 from platform.member_exclusions where user_id = ${nora.user.id}`).toEqual([])
  })

  it("should say the member limit of the host, and write nothing", async () => {
    await open()
    const [{ taken }] = await fx.admin<{ taken: number }[]>`
      select (select count(*)::int from platform.members where org_id = ${o.org.id})
           + (select count(*)::int from platform.invitations where org_id = ${o.org.id} and accepted_at is null and declined_at is null and revoked_at is null and expires_at > now()) as taken`
    registerOrgLimits({ read: ({ id }) => (id === o.org.id ? { members_max: taken } : null) })
    const nora = await newcomer()
    expect(await refusal(enter(nora))).toEqual({
      code: "forbidden",
      message: `${o.org.name} is limited to ${taken} members, pending invitations included. Ask an administrator of ${o.org.name} about it.`,
      details: { reason: "limit", limit: "members_max", max: taken },
    })
    expect(await memberRows(nora.user.id)).toEqual([])

    registerOrgLimits({ read: () => ({ members_max: taken + 1 }) })
    expect((await enter(nora)).member.role).toBe("member")
  })

  it("should serve a platform team member through its access, without making it a member", async () => {
    await open()
    const staff = await newcomer()
    await fx.makeStaff(staff.user.id)
    await fx.grantPlatformAccess(o.org.id, staff.user.id, null)
    const identity = await enter(staff)
    expect({ viaGrant: identity.viaGrant, role: identity.member.role }).toEqual({ viaGrant: true, role: "admin" })
    expect(await memberRows(staff.user.id)).toEqual([])
  })

  it("should create the identity of an OIDC subject that nothing invited, and let it in", async () => {
    await open()
    const subject = `oidc-${randomUUID()}`
    const email = `iris-${hex(4)}@${DOMAIN}`
    const db = createPlatformDb({ caller: { issuer: "https://issuer.entree.test", issuerKind: "oidc", subject, email, name: "Iris Blanc" } })
    const identity = await resolveIdentity(db, o.host, { email })
    minted.push(identity.user.id)
    expect({ role: identity.member.role, name: identity.user.name }).toEqual({ role: "member", name: "Iris Blanc" })
    expect(await fx.admin`select user_id from platform.identities where subject = ${subject}`).toEqual([{ user_id: identity.user.id }])
  })
})
