// @vitest-environment node
// Services du MCP admin sur la face SQL (E01-S10, lot d2 ; E08-S02 AC10, AC14, AC17), portables : la base des
// tests admin (`seedAdminFixture`) et le client de la face SQL sous l'appelant (`asCaller`), sur le projet
// comme sur un Postgres nu (job `bare-postgres`). Trois contrôles du service que la RLS masquait sur la
// vraie base (lot t1-d2a, « Limite nommée ») y ont leur preuve : les filtres `user_id` et `revoked_at` des
// accès que lit `listOrgs`, par des lignes que la RLS rend à l'équipe plateforme ; la conversion
// `not_member` → organisation inconnue de `resolveAdminOrg`, par une révocation jouée entre ses deux lectures
// (`before` de l'espion). Et la transaction de `updateOrg` (AC-x4) : la marque en échec n'en laisse aucune
// écriture.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveAdminOrg, type StaffCaller } from "../../packages/plateforme/server/admin/context"
import { listOrgs, updateOrg } from "../../packages/plateforme/server/admin/orgs"
import { adminTables, ORGS, PERSONS, type AdminPerson } from "../helpers/mcp-admin"
import { seedAdminFixture, type AdminFixtureSql } from "../helpers/mcp-admin-sql"
import { asCaller, isoInstants, seedWithAdmin, spyDb, SQL_SKIP_REASON, sqlConfigured, type SeededData, type SentQuery } from "../helpers/sql"
import { undoAll } from "../helpers/spy-t1-d2a"

const SETUP_TIMEOUT = 180_000
const NETWORK_TIMEOUT = 60_000

const UNKNOWN = (slug: string) =>
  `Unknown organisation ${slug}, or you have no platform access to it. List yours with admin_context {"op": "orgs"}; a colleague who has access can grant you one with admin_org {"op": "grant_access"}.`

const SUITE = "admin services on the SQL face (E01-S10, lot d2)"

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.skipIf(!sqlConfigured)(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let admin: AdminFixtureSql
  /** Ce que le test en cours a changé dans la graine, défait après lui, même en échec. */
  const undo: (() => Promise<unknown>)[] = []

  beforeAll(async () => {
    seed = seedWithAdmin()
    admin = await seedAdminFixture(seed)
  }, SETUP_TIMEOUT)

  afterEach(() => undoAll(undo), SETUP_TIMEOUT)

  afterAll(async () => {
    try {
      await admin?.forgetJournal()
    } finally {
      await seed?.cleanup()
    }
  }, SETUP_TIMEOUT)

  const as = (person: AdminPerson): StaffCaller => ({ userId: admin.persons[person].id, email: admin.persons[person].email })
  const dbOf = (person: AdminPerson) => asCaller(admin.persons[person].id, admin.persons[person].email)

  /** Les accès semés par le test sur acme, retirés après lui. */
  function forgetGrantsOnAcme(...ids: string[]): void {
    undo.push(() => seed.admin`delete from platform.platform_grants where id in ${seed.admin(ids.map((id) => admin.id(id)))}`)
  }

  it("should list an organisation by the caller's own current access only, whatever other accesses the platform team reads (AC14, N9)", async () => {
    // L'équipe plateforme lit tous les accès d'acme (`platform_grants_select_staff_admin`), et la RLS d'`orgs` lui
    // rend acme par l'accès en cours de Sam : un accès en cours de Théo et un accès révoqué de Sam, plus récents,
    // n'y sont écartés que par le service.
    const acme = { org_id: ORGS.acme.id, reason: null }
    forgetGrantsOnAcme("theo-open", "sam-revoked")
    await admin.write({
      platform_grants: [
        { id: "theo-open", ...acme, user_id: PERSONS.theo.id, granted_by: PERSONS.ada.id, granted_at: "2026-09-26T08:00:00.000Z", revoked_at: null, revoked_by: null },
        {
          id: "sam-revoked",
          ...acme,
          user_id: PERSONS.sam.id,
          granted_by: PERSONS.ada.id,
          granted_at: "2026-09-25T08:00:00.000Z",
          revoked_at: "2026-09-26T09:00:00.000Z",
          revoked_by: PERSONS.ada.id,
        },
      ],
    })
    const seeded = adminTables().platform_grants.find((row) => row.org_id === ORGS.acme.id && row.user_id === PERSONS.sam.id)

    const listed = await listOrgs(dbOf("sam"), as("sam"))

    const entry = admin.readable(isoInstants(listed.find((org) => org.id === admin.orgs.acme.id)))
    expect(entry).toMatchObject({ access: "platform_access", role: null, since: seeded?.granted_at, grantedBy: seeded?.granted_by })
  })

  it("should refuse as an unknown organisation an access revoked between the organisation read and the identity (AC10, N9)", async () => {
    // Théo, de l'équipe plateforme, sans appartenance à acme : un accès en cours, révoqué juste avant que
    // l'identité lise ses lignes. La RLS lui rend encore la ligne d'acme, lue d'abord.
    forgetGrantsOnAcme("theo-raced")
    await admin.write({
      platform_grants: [
        { id: "theo-raced", org_id: ORGS.acme.id, user_id: PERSONS.theo.id, granted_by: PERSONS.sam.id, granted_at: "2026-09-26T08:00:00.000Z", revoked_at: null, revoked_by: null, reason: null },
      ],
    })
    let revoked = false
    const revoke = async (query: SentQuery) => {
      if (revoked || query.target !== "members") return
      revoked = true
      await seed.admin`update platform.platform_grants set revoked_at = now(), revoked_by = ${admin.persons.sam.id} where id = ${admin.id("theo-raced")}`
    }
    const { db, sent } = spyDb(dbOf("theo"), { before: revoke })
    const acme = admin.orgs.acme.slug

    await expect(resolveAdminOrg(db, as("theo"), acme)).rejects.toMatchObject({ code: "not_found", message: UNKNOWN(acme) })
    // La ligne d'acme a été lue avant la révocation : c'est la conversion du refus d'`identityInOrg` qui répond.
    expect(revoked).toBe(true)
    expect(sent[0]).toMatchObject({ op: "select", target: "orgs" })
  })

  it("should leave no write of an organisation update when its brand write fails (AC17, AC-x4)", async () => {
    const seededAcme = adminTables().orgs.filter((row) => row.id === ORGS.acme.id)
    undo.push(() => admin.write({ orgs: seededAcme }))
    const read = async () => [
      ...(await seed.admin<{ name: string; settings: unknown; brand: unknown }[]>`select name, settings, brand from platform.orgs where id = ${admin.orgs.acme.id}`),
    ]
    const [before] = await read()
    // La base ne répond pas à l'écriture de la marque, la seconde de l'opération (`57014`).
    const brandFails = (query: SentQuery) => (query.op === "update" && query.target === "orgs" && /\bbrand\b/.test(String(query.detail)) ? { code: "57014" } : null)
    const { db, sent } = spyDb(dbOf("sam"), { fail: brandFails })
    const identity = await resolveAdminOrg(db, as("sam"), admin.orgs.acme.slug)

    await expect(updateOrg(db, identity, { name: "Acme Partielle", domains: "ventes", theme: "foret" })).rejects.toMatchObject({
      code: "internal",
      message: "The brand could not be saved.",
    })
    // Les deux écritures sont parties, la première dans la même transaction que la seconde : rien n'en reste.
    expect(sent.filter((query) => query.op === "update").map((query) => query.target)).toEqual(["orgs", "orgs"])
    expect(await read()).toEqual([before])
  })
})
