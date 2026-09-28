// @vitest-environment node
// Services d'organisation du MCP admin (E08-S02 : AC10, AC14 à AC19, AC21, AC24 ;
// `security-patterns.md § Droits dans le service`) sur une vraie base (E01-S10, lot t1-d2a) : la base des
// tests admin (`seedAdminFixture`), semée une fois pour le fichier, le client de chaque personne (mode de
// transition, lot t1-0b) et l'espion des requêtes des deux faces (`recordRequests`, AC-x3). La RLS n'isole
// que les organisations, et l'équipe plateforme y lit tous les accès plateforme : ce que le service ne
// filtre pas lui-même revient ; chaque service refuse avant d'écrire. Ce qu'un test change dans la graine,
// il le défait après lui, même en échec (`undo`) : chacun passe seul. Slugs, adresses et emails sont
// jetables : les lignes se comparent par `readable`, les textes portent les valeurs réelles. En
// suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  addHost,
  createOrg,
  describeTeamDeletion,
  getOrg,
  grantAccess,
  listOrgOverviews,
  removeHost,
  resolveAdminOrg,
  revokeAccess,
  updateOrg,
  type StaffCaller,
} from "@otomata_tech/oto_platform/server"
import { adminTables, ORGS, PERSONS, type AdminPerson } from "../helpers/mcp-admin"
import { seedAdminFixture, type AdminFixtureSql } from "../helpers/mcp-admin-sql"
import { isoInstants, sqlConfigured, seedWithAdmin, type SeededData, portable } from "../helpers/sql"
import { createdOrgs, recordRequests, requestedWrites, undoAll } from "../helpers/spy-t1-d2a"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

/** Les tables que lit la résolution d'une identité (`resolveAdminOrg`, puis `identityInOrg`). */
const IDENTITY_TABLES: ReadonlySet<string> = new Set(["orgs", "members", "teams", "team_members", "platform_staff", "platform_grants"])

const UNKNOWN = (slug: string) =>
  `Unknown organisation ${slug}, or you have no platform access to it. List yours with admin_context {"op": "orgs"}; a colleague who has access can grant you one with admin_org {"op": "grant_access"}.`
const STAFF_ADMIN = (op: string, slug: string) =>
  `op ${op} of admin_org is reserved to platform team members who administer ${slug}. A colleague who does can grant you a platform access with admin_org {"op": "grant_access"}.`

/** Un accès de Théo à acme, accordé par Sam le 2026-09-01, révoqué par Ada à `revokedAt`. */
function revokedTheo(id: string, revokedAt: string) {
  const granted = { org_id: ORGS.acme.id, user_id: PERSONS.theo.id, granted_by: PERSONS.sam.id, granted_at: "2026-09-01T08:00:00.000Z" }
  return { id, ...granted, revoked_at: revokedAt, revoked_by: PERSONS.ada.id, reason: null }
}

/** Les valeurs dans l'ordre du slug de leur organisation, celui de `listOrgs` : les slugs jetables sont tirés au hasard. */
function bySlug<T>(entries: [string, T][]): T[] {
  return [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
}

/** Un texte tel quel dans une expression régulière. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.skipIf(!sqlConfigured)(portable("organisation services of the admin MCP (E08-S02)"), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let admin: AdminFixtureSql
  let orgs: ReturnType<typeof createdOrgs>
  /** Ce que le test en cours a changé dans la graine, défait après lui dans l'ordre inverse, même en échec. */
  const undo: (() => Promise<unknown>)[] = []

  beforeAll(async () => {
    seed = seedWithAdmin()
    orgs = createdOrgs(seed)
    admin = await seedAdminFixture(seed)
  }, SETUP_TIMEOUT)

  afterEach(() => undoAll(undo), SETUP_TIMEOUT)

  afterAll(async () => {
    try {
      await orgs?.cleanup()
      await admin?.forgetJournal()
    } finally {
      await seed?.cleanup()
    }
  }, SETUP_TIMEOUT)

  const as = (person: AdminPerson): StaffCaller => ({ userId: admin.persons[person].id, email: admin.persons[person].email })
  const dbOf = async (person: AdminPerson) => (await admin.deps(person)).db

  /** Théo n'a aucun accès à acme dans la graine : ceux que le test lui donne partent après lui. */
  function forgetTheoOnAcme(): void {
    undo.push(() => seed.admin`delete from platform.platform_grants where org_id = ${admin.orgs.acme.id} and user_id = ${admin.persons.theo.id}`)
  }

  /** Théo, de l'équipe plateforme, simple membre d'acme le temps du test. */
  async function theoMemberOfAcme(): Promise<void> {
    undo.push(() => seed.admin`delete from platform.members where org_id = ${admin.orgs.acme.id} and user_id = ${admin.persons.theo.id}`)
    await admin.write({ members: [{ org_id: ORGS.acme.id, user_id: PERSONS.theo.id, role: "member", profile: {} }] })
  }

  /** Les adresses d'une organisation, dans la base. */
  async function hostsOf(orgId: string): Promise<string[]> {
    const rows = await seed.admin<{ host: string }[]>`select host from platform.org_domains where org_id = ${orgId} order by host`
    return rows.map((row) => row.host)
  }

  describe("organisations the caller acts on (AC10, AC14, N9)", () => {
    it("should list only the organisations of the caller's memberships and current accesses, with their details", async () => {
      // Un accès révoqué de Théo à acme : le détail ne compte que les accès en cours.
      forgetTheoOnAcme()
      await admin.write({ platform_grants: [revokedTheo("revoked-theo", "2026-09-02T08:00:00.000Z")] })
      const { acme, demo } = admin.orgs
      const { orgs: listed, overviews } = await listOrgOverviews(await dbOf("sam"), as("sam"), 200)
      // `delta` : l'accès révoqué de Sam ; `other` : l'accès de Théo, que l'équipe plateforme lit aussi. La RLS
      // cache ces deux organisations (ligne embarquée nulle) et la ligne d'Otto, membre d'`other`.
      expect(listed.map((org) => [org.slug, org.access, org.role])).toEqual(
        bySlug([
          [acme.slug, [acme.slug, "platform_access", null]],
          [demo.slug, [demo.slug, "member", "admin"]],
        ]),
      )
      expect([...overviews.keys()]).toEqual(
        bySlug([
          [acme.slug, acme.id],
          [demo.slug, demo.id],
        ]),
      )
      expect(admin.readable(isoInstants(overviews.get(acme.id)))).toEqual({
        hosts: ["acme.test"],
        members: 3,
        teams: 3,
        accesses: [{ userId: PERSONS.sam.id, grantedAt: "2026-09-20T08:00:00.000Z" }],
      })
    })

    it("should refuse an organisation without membership nor current access as an unknown one, before any other request", async () => {
      const spy = recordRequests(await dbOf("sam"))
      const other = admin.orgs.other.slug
      await expect(resolveAdminOrg(spy.db, as("sam"), other)).rejects.toMatchObject({ code: "not_found", message: UNKNOWN(other) })
      await expect(resolveAdminOrg(spy.db, as("sam"), "nope")).rejects.toMatchObject({ code: "not_found", message: UNKNOWN("nope") })
      // La RLS cache la ligne d'`other` : rien n'est lu hors de la résolution de l'identité.
      const read = spy.requests.flatMap((request) => request.objects)
      expect(read).toContain("orgs")
      expect(read.filter((object) => !IDENTITY_TABLES.has(object))).toEqual([])
    })

    it("should read the sheet of an organisation: addresses, brand, routing defaults, administrators, contact, accesses", async () => {
      forgetTheoOnAcme()
      await admin.write({ platform_grants: Array.from({ length: 6 }, (_, index) => revokedTheo(`revoked-${index}`, `2026-09-0${index + 2}T08:00:00.000Z`)) })
      const { acme } = admin.orgs
      const db = await dbOf("sam")
      const sheet = admin.readable(isoInstants(await getOrg(db, await resolveAdminOrg(db, as("sam"), acme.slug))))
      expect(sheet).toMatchObject({
        slug: acme.slug,
        prefix: acme.prefix,
        hosts: ["acme.test"],
        domains: null,
        brand: { theme: "manuscrit", logo_url: null, display_name: null },
        routing: { threshold: 0.65, gap: 0.1 },
        flags: {},
        rulesVersion: 1,
        administrators: [{ name: "Ada Martin", email: "ada.martin@acme.test" }],
        contact: { name: "Ada Martin", email: "ada.martin@acme.test" },
      })
      expect(sheet.accesses.map((access) => [access.email, access.revokedAt])).toEqual([
        ["sam.staff@oto.test", null],
        ...[7, 6, 5, 4, 3].map((day) => ["theo.staff@oto.test", `2026-09-0${day}T08:00:00.000Z`]),
      ])
    })
  })

  describe("create an organisation (AC15, AC16)", () => {
    /** Une organisation à créer : slug jetable, noté pour le ménage, qui sert aussi de préfixe (`pnpm test:cleanup`), et une adresse libre. */
    function draftOf(name: string) {
      const slug = orgs.slug()
      return { org: slug, name, prefix: slug, host: `${slug}.example.test` }
    }

    it("should write nothing before confirm, and refuse an address taken as soon as the first step", async () => {
      const spy = recordRequests(await dbOf("sam"))
      const draft = draftOf("Acme Deux")
      expect(await createOrg(spy.db, as("sam"), draft)).toEqual({ created: false, org: { slug: draft.org, name: "Acme Deux", prefix: draft.prefix, host: draft.host } })
      const taken = admin.orgs.acme.host
      await expect(createOrg(spy.db, as("sam"), { ...draft, host: taken })).rejects.toMatchObject({
        code: "conflict",
        message: `Address ${taken} already opens another organisation.`,
      })
      expect(requestedWrites(spy.requests)).toEqual([])
    })

    it("should refuse a caller outside the platform team before any other request", async () => {
      const spy = recordRequests(await dbOf("ada"))
      await expect(createOrg(spy.db, as("ada"), { ...draftOf("Acme Deux"), confirm: true })).rejects.toMatchObject({ code: "forbidden" })
      expect(spy.requests.map((request) => request.objects)).toEqual([["is_staff"]])
    })

    it("should create by create_org once confirmed, and name the address taken between the two steps", async () => {
      undo.push(() => orgs.cleanup())
      const spy = recordRequests(await dbOf("sam"))
      const draft = draftOf("Acme Deux")
      const created = await createOrg(spy.db, as("sam"), { ...draft, confirm: true })
      expect(spy.requests.at(-1)).toMatchObject({ objects: ["create_org"], values: ["Acme Deux", draft.org, draft.prefix, [draft.host]] })
      expect(created).toMatchObject({ created: true, org: { slug: draft.org } })
      const grants = await seed.admin`
        select g.user_id, g.granted_by, g.reason from platform.platform_grants g join platform.orgs o on o.id = g.org_id where o.slug = ${draft.org}`
      expect(admin.readable([...grants])).toEqual([{ user_id: PERSONS.sam.id, granted_by: PERSONS.sam.id, reason: "creation" }])

      const late = draftOf("Acme Trois")
      undo.push(() => seed.admin`delete from platform.org_domains where host = ${late.host}`)
      const raced = recordRequests(await dbOf("sam"), {
        // Prise entre les deux temps : l'adresse ouvre `other` juste avant `create_org`.
        before: async (request) => {
          if (request.objects.includes("create_org")) await seed.admin`insert into platform.org_domains (host, org_id) values (${late.host}, ${admin.orgs.other.id})`
        },
      })
      await expect(createOrg(raced.db, as("sam"), { ...late, confirm: true })).rejects.toMatchObject({
        code: "conflict",
        message: `Address ${late.host} already opens another organisation.`,
      })
    })
  })

  describe("update an organisation (AC17)", () => {
    it("should merge settings, remove domains with an empty string, and keep the stored brand fields not passed", async () => {
      // La ligne d'acme de la graine (nom, marque, réglages), remise après le test.
      const seeded = adminTables().orgs.filter((row) => row.id === ORGS.acme.id)
      undo.push(() => admin.write({ orgs: seeded }))
      await admin.write({ orgs: [{ id: ORGS.acme.id, settings: { demo: true, domains: "sales" }, brand: { theme: "cobalt", logo_url: "https://acme.test/logo.png" } }] })
      const db = await dbOf("sam")
      const identity = await resolveAdminOrg(db, as("sam"), admin.orgs.acme.slug)
      const { changes } = await updateOrg(db, identity, { name: "Acme Énergies", domains: "", routing_threshold: 0.7, theme: "foret" })
      expect(changes).toEqual([
        { field: "name", before: "Acme Test", after: "Acme Énergies" },
        { field: "domains", before: "sales", after: null },
        { field: "routing_threshold", before: 0.65, after: 0.7 },
        { field: "theme", before: "cobalt", after: "foret" },
      ])
      const [acme] = await seed.admin<{ name: string; brand: unknown; settings: unknown }[]>`
        select name, brand, settings from platform.orgs where id = ${admin.orgs.acme.id}`
      expect(acme).toMatchObject({ name: "Acme Énergies", brand: { theme: "foret", logo_url: "https://acme.test/logo.png", display_name: null } })
      // Tel que la base le garde (jsonb) : les domaines retirés, les autres clés gardées.
      expect(acme.settings).toEqual({ demo: true, routing: { threshold: 0.7 } })
    })

    // E05-S13 (AC-1) : l'écran « Organisation » n'envoie plus que le nom ; les domaines enregistrés restent.
    it("should keep the stored domains when only the name is sent", async () => {
      const seeded = adminTables().orgs.filter((row) => row.id === ORGS.acme.id)
      undo.push(() => admin.write({ orgs: seeded }))
      await admin.write({ orgs: [{ id: ORGS.acme.id, settings: { domains: "sales, support" } }] })
      const db = await dbOf("sam")
      const identity = await resolveAdminOrg(db, as("sam"), admin.orgs.acme.slug)
      const { changes } = await updateOrg(db, identity, { name: "Acme Énergies" })
      expect(changes).toEqual([{ field: "name", before: "Acme Test", after: "Acme Énergies" }])
      const [acme] = await seed.admin<{ settings: unknown }[]>`select settings from platform.orgs where id = ${admin.orgs.acme.id}`
      expect(acme.settings).toEqual({ domains: "sales, support" })
    })

    it("should refuse a caller who does not administer the organisation before any write, and a concurrent change as a conflict", async () => {
      const { acme } = admin.orgs
      const claireSpy = recordRequests(await dbOf("claire"))
      const claire = await resolveAdminOrg(claireSpy.db, as("claire"), acme.slug)
      await expect(updateOrg(claireSpy.db, claire, { name: "Acme" })).rejects.toMatchObject({
        code: "forbidden",
        message: `Changing the settings of ${acme.slug} is reserved to the administrators of Acme Test (Ada Martin). Ask them.`,
      })
      expect(requestedWrites(claireSpy.requests)).toEqual([])

      // Une autre écriture d'acme entre la lecture de `updateOrg` et la sienne : `updated_at` a changé.
      const raced = recordRequests(await dbOf("sam"), {
        before: async (request) => {
          if (request.write && request.objects.includes("orgs")) await seed.admin`update platform.orgs set updated_at = now() where id = ${acme.id}`
        },
      })
      const identity = await resolveAdminOrg(raced.db, as("sam"), acme.slug)
      await expect(updateOrg(raced.db, identity, { domains: "sales" })).rejects.toMatchObject({
        code: "conflict",
        message: `${acme.slug} changed meanwhile: read it again with admin_org {"op": "get"} and retry.`,
      })
      expect(console.error).toHaveBeenCalledWith("[platform] updateOrg: no row written", acme.id)
    })
  })

  describe("addresses of an organisation (AC18)", () => {
    it("should add a free address, refuse one already served, and remove one in two steps", async () => {
      const { acme, demo } = admin.orgs
      const added = `app.${acme.host}`
      // L'adresse que le test ajoute, puis retire lui-même : celle de la graine, que lisent les autres tests,
      // reste. Retirée après lui s'il échoue avant.
      undo.push(() => seed.admin`delete from platform.org_domains where host = ${added}`)
      const db = await dbOf("sam")
      const identity = await resolveAdminOrg(db, as("sam"), acme.slug)
      expect(await addHost(db, identity, { host: added.toUpperCase() })).toEqual({ host: added })
      await expect(addHost(db, identity, { host: demo.host })).rejects.toMatchObject({ message: `Address ${demo.host} already opens another organisation.` })
      await expect(addHost(db, identity, { host: acme.host })).rejects.toMatchObject({ message: `${acme.host} is already an address of ${acme.slug}.` })
      expect(await removeHost(db, identity, { host: added })).toEqual({ host: added, remaining: [acme.host], removed: false })
      expect(await hostsOf(acme.id)).toContain(added)
      expect(await removeHost(db, identity, { host: added, confirm: true })).toMatchObject({ removed: true })
      expect(await hostsOf(acme.id)).not.toContain(added)
      await expect(removeHost(db, identity, { host: demo.host })).rejects.toMatchObject({
        code: "not_found",
        message: `${demo.host} is not an address of ${acme.slug}. Its addresses: ${acme.host}.`,
      })
    })

    it("should refuse an administrator outside the platform team, and a platform team member who does not administer, before any write", async () => {
      await theoMemberOfAcme()
      const { acme } = admin.orgs
      for (const person of ["ada", "theo"] as const) {
        const spy = recordRequests(await dbOf(person))
        const identity = await resolveAdminOrg(spy.db, as(person), acme.slug)
        await expect(addHost(spy.db, identity, { host: "new.test" })).rejects.toMatchObject({ code: "forbidden", message: STAFF_ADMIN("add_host", acme.slug) })
        await expect(removeHost(spy.db, identity, { host: acme.host, confirm: true })).rejects.toMatchObject({ code: "forbidden" })
        await expect(grantAccess(spy.db, identity, { email: admin.persons.theo.email })).rejects.toMatchObject({
          code: "forbidden",
          message: STAFF_ADMIN("grant_access", acme.slug),
        })
        expect(requestedWrites(spy.requests), person).toEqual([])
      }
    })
  })

  describe("summary of a team deletion (AC21)", () => {
    it("should refuse a caller who does not administer the organisation before any read", async () => {
      // Théo, de l'équipe plateforme, simple membre d'acme sans accès en cours : il n'administre pas.
      await theoMemberOfAcme()
      const spy = recordRequests(await dbOf("theo"))
      const identity = await resolveAdminOrg(spy.db, as("theo"), admin.orgs.acme.slug)
      const resolved = spy.requests.length
      await expect(describeTeamDeletion(spy.db, identity, "support")).rejects.toMatchObject({
        code: "forbidden",
        message: "Only an administrator of Acme Test can delete a team.",
      })
      expect(spy.requests.slice(resolved)).toEqual([])
    })
  })

  describe("platform accesses (AC19, AC24)", () => {
    it("should grant a colleague a dated access, then refuse a second one and an email outside the platform team", async () => {
      forgetTheoOnAcme()
      const { acme } = admin.orgs
      const { theo, ada } = admin.persons
      const db = await dbOf("sam")
      const identity = await resolveAdminOrg(db, as("sam"), acme.slug)
      const granted = await grantAccess(db, identity, { email: theo.email.toUpperCase(), reason: "Pilot support" })
      expect(granted.email).toBe(theo.email)
      const grants = await seed.admin`select org_id, user_id, granted_by, reason from platform.platform_grants where org_id = ${acme.id} and user_id = ${theo.id}`
      expect(admin.readable([...grants])).toEqual([{ org_id: ORGS.acme.id, user_id: PERSONS.theo.id, granted_by: PERSONS.sam.id, reason: "Pilot support" }])
      await expect(grantAccess(db, identity, { email: theo.email })).rejects.toMatchObject({
        code: "conflict",
        message: expect.stringMatching(new RegExp(`^${literal(theo.email)} already has a platform access to ${literal(acme.slug)} \\(since \\d{4}-\\d{2}-\\d{2}\\)\\.$`)),
      })
      await expect(grantAccess(db, identity, { email: ada.email })).rejects.toMatchObject({
        code: "not_found",
        message: `No member of the platform team has the email ${ada.email}.`,
      })
    })

    it("should let a colleague act once granted, then refuse them once revoked, the access read again at each call", async () => {
      forgetTheoOnAcme()
      const { acme } = admin.orgs
      const { theo } = admin.persons
      const samDb = await dbOf("sam")
      const theoDb = await dbOf("theo")
      await expect(resolveAdminOrg(theoDb, as("theo"), acme.slug)).rejects.toMatchObject({ code: "not_found" })
      const sam = await resolveAdminOrg(samDb, as("sam"), acme.slug)
      await grantAccess(samDb, sam, { email: theo.email })
      expect((await resolveAdminOrg(theoDb, as("theo"), acme.slug)).hasOpenGrant).toBe(true)

      const summary = await revokeAccess(samDb, sam, { email: theo.email })
      expect(summary).toMatchObject({ email: theo.email, grantedBy: "Sam Staff", own: false, revoked: false })
      expect((await revokeAccess(samDb, sam, { email: theo.email, confirm: true })).revoked).toBe(true)
      await expect(resolveAdminOrg(theoDb, as("theo"), acme.slug)).rejects.toMatchObject({ code: "not_found" })
      await expect(revokeAccess(samDb, sam, { email: theo.email })).rejects.toMatchObject({
        code: "not_found",
        message: `${theo.email} has no platform access to ${acme.slug} in progress.`,
      })
      expect((await revokeAccess(samDb, sam, { email: admin.persons.sam.email })).own).toBe(true)
    })
  })
})
