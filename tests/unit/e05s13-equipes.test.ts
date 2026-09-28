// @vitest-environment node
// E05-S13, lot M (fiche D128, point 13) : plusieurs responsables par équipe, dans ce que lisent les assistants
// (AC-23 : « Lead: A, B. », « (lead) », à qui demander) et dans la console d'administration (AC-25 :
// `admin_team add_lead`, `remove_lead`, `list`, `set_lead` qui garde son sens). Sur une vraie base portable.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { describeOwner } from "../../packages/plateforme/server/access"
import { personFacts } from "../../packages/plateforme/server/context/blocks/person"
import { teamFacts } from "../../packages/plateforme/server/context/blocks/team"
import { connectAdminMcp } from "../helpers/mcp-admin"
import { seedAdminFixture, type AdminFixtureSql } from "../helpers/mcp-admin-sql"
import { ORG, TEAMS } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Row } from "../helpers/simulated-db"
import { portable, seedWithAdmin, sqlConfigured, type SeededData } from "../helpers/sql"

const SETUP_TIMEOUT = 180_000
const TEAM_HEADER =
  "Connectors (this team runs a call when the procedure or the call names it, or when it is your only team with an account; if several are, ask the user which one):"
const ORG_HEADER = "Connectors (when no team of yours runs the call):"

describe.skipIf(!sqlConfigured)(portable("several leads in what assistants read (AC-23)"), { timeout: 60_000 }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
    // Léa, membre de Ventes que mène Claire, en devient responsable aussi.
    await seed.admin`update platform.team_members set role = 'lead' where team_id = ${ref.id(TEAMS.ventes.id)} and user_id = ${ref.people.lea.id}`
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  it("should name every lead of a team in its line, by name, and none for a team without lead", async () => {
    const lea = ref.identityOf("lea", { teams: [ref.teamOf("ventes", "lea"), ref.teamOf("support", "lea")] })
    expect((await teamFacts(await ref.db("lea"), lea)).teams).toEqual(["Team Ventes. Lead: Claire Morel, Léa Roux.", "Team Support. Lead: Paul Girard."])
    const support = ref.id(TEAMS.support.id)
    // Ada, nommée après Paul, passe avant lui : l'ordre des noms, pas celui des lignes.
    await seed.admin`insert into platform.team_members (team_id, user_id, role) values (${support}, ${ref.people.ada.id}, 'lead')`
    try {
      expect((await teamFacts(await ref.db("lea"), lea)).teams[1]).toBe("Team Support. Lead: Ada Martin, Paul Girard.")
      await seed.admin`update platform.team_members set role = 'member' where team_id = ${support}`
      expect((await teamFacts(await ref.db("lea"), lea)).teams[1]).toBe("Team Support.")
    } finally {
      await seed.admin`delete from platform.team_members where team_id = ${support} and user_id = ${ref.people.ada.id}`
      await seed.admin`update platform.team_members set role = 'lead' where team_id = ${support} and user_id = ${ref.people.paul.id}`
    }
  })

  // Fiche D128 (point 14) : plus d'équipe par défaut ; les lignes d'un connecteur vont dans la partie de chaque
  // équipe de la personne qui en a un compte, sinon après les faits de l'organisation.
  it("should put the connector lines in the part of each team with an account, else in the organisation's", async () => {
    const account = (id: string, label: string, team: string | null): Row => ({
      id, org_id: ORG.id, label, connector: "mail", mode: "simule", status: "active", owner_user_id: null,
      ...(team ? { owner_kind: "team", owner_team_id: team } : { owner_kind: "org", owner_team_id: null }),
    })
    const claire = ref.identityOf("claire", { teams: [ref.teamOf("support", "claire"), ref.teamOf("ventes", "claire")] })
    const given = async (accounts: Row[]) => {
      await seed.admin`delete from platform.connector_activations where org_id = ${ref.org.id}`
      await seed.admin`delete from platform.accounts where org_id = ${ref.org.id}`
      await ref.write({ accounts, connector_activations: [{ org_id: ORG.id, connector: "mail", state: "active" }] })
      return teamFacts(await ref.db("claire"), claire)
    }

    const withTeamAccount = await given([account("account:mail-ventes", "Mail Ventes", TEAMS.ventes.id), account("account:mail-acme", "Mail Acme", null)])
    expect([withTeamAccount.teamConnectors, withTeamAccount.connectors]).toEqual([
      [[], [TEAM_HEADER, "mail: team Ventes (write), account « Mail Ventes » (simulated)"]],
      [],
    ])
    const orgOnly = await given([account("account:mail-acme", "Mail Acme", null)])
    // Un membre lit le compte de l'organisation sans l'écrire (niveau d'un membre).
    expect([orgOnly.teamConnectors, orgOnly.connectors]).toEqual([
      [[], []],
      [ORG_HEADER, "mail: no account you can use: calls will be refused until you are given write access; you can only read « Mail Acme »."],
    ])
  })

  it("should keep « (lead) » in the person's facts, and name every lead to ask", async () => {
    const lea = ref.identityOf("lea", { teams: [{ ...ref.teamOf("ventes", "lea"), role: "lead" }] })
    expect(personFacts(lea)).toContain("Teams: Ventes (lead).")
    const owner = { kind: "team" as const, teamId: ref.id(TEAMS.ventes.id), userId: null }
    expect(await describeOwner(await ref.db("lea"), lea, owner)).toBe("team Ventes (leads: Claire Morel, Léa Roux)")
  })
})

describe.skipIf(!sqlConfigured)(portable("admin_team with several leads (AC-25)"), { timeout: 60_000 }, () => {
  let seed: SeededData
  let fixture: AdminFixtureSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    fixture = await seedAdminFixture(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    try {
      await fixture?.forgetJournal()
    } finally {
      await seed?.cleanup()
    }
  }, SETUP_TIMEOUT)

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should add and remove leads one by one, list them all, and keep set_lead to a single lead", async () => {
    const session = await connectAdminMcp(await fixture.deps("sam"))
    const { code } = await session.openAdmin()
    const { acme } = fixture.orgs
    const { claire, marc } = fixture.persons
    const team = (args: Record<string, unknown>) => session.call("admin_team", { ctx: code, org: acme.slug, ...args })
    const leads = async (slug: string) => {
      const rows = await seed.admin<{ user_id: string }[]>`
        select tm.user_id from platform.team_members tm join platform.teams t on t.id = tm.team_id
         where t.org_id = ${acme.id} and t.slug = ${slug} and tm.role = 'lead'`
      return rows.map((row) => row.user_id).sort()
    }

    // Marc, de Support, devient responsable de Ventes, où il entre ; Claire le reste.
    expect((await team({ op: "add_lead", team: "ventes", email: marc.email })).text).toBe(
      `Marc Petit ${marc.email} now leads team Ventes (leads: Claire Morel, Marc Petit).`,
    )
    expect(await leads("ventes")).toEqual([claire.id, marc.id].sort())
    expect((await team({ op: "add_lead", team: "ventes", email: marc.email })).text).toBe(`${marc.email} already leads team Ventes; nothing changed.`)
    expect((await team({ op: "list" })).text.split("\n")[2]).toBe(`- ventes · Ventes · leads Claire Morel ${claire.email}, Marc Petit ${marc.email} · 2 members`)

    // Claire quitte les responsables et reste membre ; Marc le reste.
    expect((await team({ op: "remove_lead", team: "ventes", email: claire.email })).text).toBe(
      "Claire Morel no longer leads team Ventes and stays a member (lead: Marc Petit).",
    )
    expect((await team({ op: "remove_lead", team: "ventes", email: claire.email })).text).toBe("Claire Morel does not lead team Ventes; nothing changed.")
    expect((await team({ op: "remove_lead", team: "conseil", email: claire.email })).text).toBe(`${claire.email} is not a member of team Conseil.`)

    // set_lead garde son sens : un seul responsable, l'autre redevenu membre.
    await team({ op: "add_lead", team: "ventes", email: claire.email })
    expect((await team({ op: "set_lead", team: "ventes", email: claire.email })).text).toBe(`Claire Morel ${claire.email} now leads team Ventes.`)
    expect(await leads("ventes")).toEqual([claire.id])
  })
})
