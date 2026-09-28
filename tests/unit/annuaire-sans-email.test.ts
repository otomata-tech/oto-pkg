// @vitest-environment node
// Tâche M20 (suite d'E01-S09) : une ligne `members` ou `platform_staff` écrite sans email (par le
// Data API, sous un jeton) laisse l'email et le nom nuls, et `member_directory` comme
// `staff_directory` les rendent nuls. Les lectures qui les supposaient présents levaient une
// `TypeError`, un 500 : le tri de `memberDirectory`, la recherche par email de `findMember`, de
// `findStaff` et d'`admin_team remove_member`. Chacune lit ici un email nul comme absent, et le texte
// d'`admin_team list` le dit.
// E01-S10, lot e1a : `memberDirectory` et `identityInOrg` passent au SQL (`db.tx`), que la base simulée
// ne sert pas. `memberDirectory` et `findMember` se lisent sur une vraie base, en suite portable
// (`asCaller`, lignes semées par la connexion d'administration) ; `admin_team` sur la base des tests admin
// (`seedAdminFixture`), en suite portable aussi ;
// `findStaff` (`staff_directory`) aussi en suite portable depuis le lot d2.
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { findMember, findStaff } from "../../packages/plateforme/server/admin/context"
import { memberDirectory } from "../../packages/plateforme/server/directory"
import type { Identity } from "../../packages/plateforme/server/identity"
import { connectAdminMcp, TEAMS } from "../helpers/mcp-admin"
import { seedAdminFixture, type AdminFixtureSql } from "../helpers/mcp-admin-sql"
import {
  asCaller,
  seedWithAdmin,
  SQL_SKIP_REASON,
  sqlConfigured,
  type SeededData,
  type SeededOrg,
  type SeededPerson,
  portable,
} from "../helpers/sql"

const SETUP_TIMEOUT = 180_000
const NETWORK_TIMEOUT = 60_000

/** L'identité d'un membre administrateur de l'organisation semée : `findMember` n'en lit que l'organisation. */
function identityIn(org: SeededOrg, person: SeededPerson): Identity {
  return {
    org: { id: org.id, slug: org.slug, name: org.name, prefix: org.prefix, brand: {}, domains: null },
    user: { id: person.id, email: person.email, name: "Caller" },
    member: { role: "admin", profile: {} },
    teams: [],
    isStaff: false,
    viaGrant: false,
    hasOpenGrant: false,
  }
}

const DIRECTORY = "member directory without email on a real database (M20)"

describe.skipIf(!sqlConfigured)(sqlConfigured ? DIRECTORY : `${DIRECTORY} (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData

  beforeAll(() => {
    seed = seedWithAdmin()
  })

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  /** Une organisation jetable et ses membres, écrits tels quels (email et nom nuls compris) par la connexion d'administration. */
  async function orgWith(members: { email: string | null; name: string | null }[]): Promise<{ org: SeededOrg; ids: string[] }> {
    const org = await seed.createOrg()
    const ids: string[] = []
    for (const member of members) {
      const id = seed.person().id
      ids.push(id)
      await seed.admin`insert into platform.members (org_id, user_id, role, email, name) values (${org.id}, ${id}, 'member', ${member.email}, ${member.name})`
    }
    return { org, ids }
  }

  it("should name a member without name nor email user <id>, keep the absent email null, and sort without throwing", async () => {
    const nadia = `test-nadia-${randomUUID().slice(0, 8)}@example.invalid`
    const claire = `test-claire-${randomUUID().slice(0, 8)}@example.invalid`
    const { org, ids } = await orgWith([
      { email: nadia, name: "Nadia" },
      { email: null, name: "Nadia" },
      { email: null, name: null },
      { email: null, name: null },
      { email: claire, name: "Claire" },
    ])
    // Les deux personnes sans nom ni email se trient par leur libellé `user <id>`, tiré au hasard.
    const unnamed = [ids[2], ids[3]].sort((a, b) => `user ${a}`.localeCompare(`user ${b}`, "fr"))

    const people = await memberDirectory(asCaller(ids[4], claire), org.id)

    expect(people.map(({ userId, name, email }) => ({ userId, name, email }))).toEqual([
      { userId: ids[4], name: "Claire", email: claire },
      { userId: ids[1], name: "Nadia", email: null },
      { userId: ids[0], name: "Nadia", email: nadia },
      ...unnamed.map((id) => ({ userId: id, name: `user ${id}`, email: null })),
    ])
  })

  it("should find a member by email past a member without email, and never match the one without", async () => {
    // Aline, sans email, passe avant Claire dans l'annuaire trié : la recherche la lit d'abord.
    const claire = `test-claire-${randomUUID().slice(0, 8)}@example.invalid`
    const { org, ids } = await orgWith([
      { email: null, name: "Aline" },
      { email: claire, name: "Claire Morel" },
    ])
    const db = asCaller(ids[1], claire)
    const identity = identityIn(org, { id: ids[1], email: claire })

    await expect(findMember(db, identity, claire.toUpperCase())).resolves.toMatchObject({ userId: ids[1], name: "Claire Morel" })
    await expect(findMember(db, identity, "nobody@example.invalid")).rejects.toMatchObject({
      code: "not_found",
      message: `No member of ${org.slug} has the email nobody@example.invalid. Invite them first from the web app (Équipes).`,
    })
  })
})

// E01-S10, lot d2 : `staffDirectory` passe au SQL ; le cas se lit sur une vraie base, en suite portable.
const STAFF = "findStaff past a person without email on a real database (M20)"

describe.skipIf(!sqlConfigured)(sqlConfigured ? STAFF : `${STAFF} (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData

  beforeAll(() => {
    seed = seedWithAdmin()
  })

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  it("should find a platform team member by email past one without email, and never match the one without", async () => {
    // Des personnes sans compte dans l'équipe plateforme : une organisation marquée d'abord, dont elles ont
    // l'accès, pour que `pnpm test:cleanup` les date si le passage s'interrompt (`testing-strategy.md § Anti-patterns`).
    const org = await seed.createOrg()
    const caller = seed.person()
    const theo = `test-theo-${randomUUID().slice(0, 8)}@example.invalid`
    const staff = [
      { id: caller.id, email: caller.email, name: "Caller" },
      { id: seed.person().id, email: null, name: null },
      { id: seed.person().id, email: theo, name: "Théo Staff" },
    ]
    for (const person of staff) {
      await seed.admin`insert into platform.platform_staff (user_id, email, name) values (${person.id}, ${person.email}, ${person.name})`
      await seed.admin`insert into platform.platform_grants (org_id, user_id, granted_by) values (${org.id}, ${person.id}, ${person.id})`
    }
    const db = asCaller(caller.id, caller.email)

    await expect(findStaff(db, theo.replace("theo", "Theo"))).resolves.toMatchObject({ userId: staff[2].id, name: "Théo Staff" })
    await expect(findStaff(db, "nobody@oto.test")).rejects.toMatchObject({
      code: "not_found",
      message: "No member of the platform team has the email nobody@oto.test.",
    })
  })
})

describe.skipIf(!sqlConfigured)(portable("admin_team with a member without email (M20)"), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  /** Une base des tests admin par cas : chacun change l'équipe Support d'acme. */
  const fixtures: AdminFixtureSql[] = []

  beforeAll(async () => {
    seed = seedWithAdmin()
    fixtures.push(await seedAdminFixture(seed), await seedAdminFixture(seed))
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    try {
      for (const fixture of fixtures) await fixture.forgetJournal()
    } finally {
      await seed?.cleanup()
    }
  }, SETUP_TIMEOUT)

  /**
   * Une personne sans email (nom `name`) entre dans acme et dans l'équipe Support, comme membre ou comme
   * responsable ; puis Sam appelle `admin_team` sur acme.
   */
  async function adminTeam(fixture: AdminFixtureSql, role: "member" | "lead", name: string | null, args: Record<string, unknown>) {
    const acme = fixture.orgs.acme
    const support = fixture.id(TEAMS.support.id)
    const person = seed.person().id
    await seed.admin`insert into platform.members (org_id, user_id, role, email, name) values (${acme.id}, ${person}, 'member', null, ${name})`
    await seed.admin`insert into platform.team_members (team_id, user_id, role) values (${support}, ${person}, 'member')`
    // Le responsable se lit sur `teams.lead_user_id` (P17) ; `teams_lead_sync` en dérive le rôle.
    if (role === "lead") await seed.admin`update platform.teams set lead_user_id = ${person} where id = ${support}`
    const session = await connectAdminMcp(await fixture.deps("sam"))
    const { code } = await session.openAdmin()
    const result = await session.call("admin_team", { ctx: code, org: acme.slug, ...args })
    return { ...result, person }
  }

  it("should remove a member from a team where a member without email is listed first", async () => {
    const [fixture] = fixtures
    // Aline, sans email, passe avant Marc Petit dans l'annuaire trié : la recherche par email la lit d'abord.
    const removed = await adminTeam(fixture, "member", "Aline", { op: "remove_member", team: "support", email: fixture.persons.marc.email })

    expect(removed).toMatchObject({ isError: false, text: "Marc Petit removed from team Support (1 member; lead: none)." })
  })

  it("should say that the lead of a team has no email", async () => {
    // Ni nom ni email : l'annuaire la nomme `user <id>` (la base simulée des tests admin, « ? »).
    const { text, person } = await adminTeam(fixtures[1], "lead", null, { op: "list" })

    expect(text.split("\n")).toContain(`- support · Support · lead user ${person} (no email) · 2 members`)
  })
})
