// @vitest-environment node
// Les services d'E05-S03 (membres, équipes, règles, annuaire) sur une vraie base (E01-S07c : AC22, AC27 ;
// E01-S10, lot t1-e1 ; `security-patterns.md § Droits dans le service`) : sous la seule isolation
// (E01-S08), la base rend à chaque personne de O toutes les lignes de O, et à Léa celles de P, dont elle
// est membre ; chaque droit se décide dans le service, avant sa requête, et une liste ne sert que ce que
// l'appelant lit. Une écriture qui ne rend aucune ligne après la décision est un conflit, jamais un refus
// (HN-E01S07-6) : la connexion d'administration change sa cible juste avant qu'elle parte. O et P viennent
// de `seedReferenceOrg`, une graine pour le fichier ; `spyDb` voit chaque requête d'un service.
// En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { randomUUID } from "crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  describeTeamDeletion,
  listMembers,
  listNodeRules,
  listPlatformAccess,
  listRuledNodes,
  listTeams,
  removeMember,
  removeRule,
  removeTeamMember,
  revokePlatformAccess,
  setNodeRule,
  updateMember,
  updateTeam,
  type Identity,
  type PlatformDb,
} from "@otomata_tech/oto_platform/server"
import { memberDirectory } from "../../packages/plateforme/server/directory"
import { ORG, OTHER_ORG, PEOPLE, TEAMS, type Person, type RuleSpec } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { recordDb, seedWithAdmin, spyDb, sqlConfigured, writesOf, type SeededData, type SentQuery, type TestSql, portable } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

const SUITE = "services of E05-S03 on a real database"

describe.skipIf(!sqlConfigured)(portable(SUITE), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  beforeEach(() => {
    // `fromDatabaseError` et les conflits journalisent côté serveur.
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** L'identité que `resolveIdentity` rend à la personne dans O ; `overrides` la change (accès révoqué). */
  const who = (person: Person, overrides: Partial<Identity> = {}) => ref.identityOf(person, overrides)
  const marc = () => ref.people.marc.id
  const teamId = (key: keyof typeof TEAMS) => ref.id(TEAMS[key].id)

  /** Des lignes relues par la connexion d'administration : ce qu'un refus laisse identique (AC-x3). */
  const reread = async (rows: PromiseLike<readonly unknown[]>) => [...(await rows)]

  describe("administration of the organisation (AC22, HN-E05S03-40)", () => {
    /** Chaque opération d'administrateur, par l'action que nomme son refus (texte d'E05-S03). */
    const ADMINISTRATION: [string, (db: PlatformDb, identity: Identity) => Promise<unknown>][] = [
      ["change a member", (db, identity) => updateMember(db, identity, marc(), { role: "admin" })],
      ["remove a member", (db, identity) => removeMember(db, identity, marc())],
      ["create a team", (db, identity) => createTeam(db, identity, { name: "Conseil" })],
      ["change a team", (db, identity) => updateTeam(db, identity, teamId("ventes"), { name: "Ventes bis" })],
      ["delete a team", (db, identity) => deleteTeam(db, identity, teamId("ventes"))],
    ]

    it("should let a platform staff member with a current access administer as a plain member, and refuse her once revoked, or a member, before anything is read", async () => {
      expect((await updateMember(await ref.db("t"), who("t"), marc(), { role: "admin" })).data.role).toBe("admin")

      const refusals: [Person, Identity][] = [
        ["t", who("t", { hasOpenGrant: false })],
        ["lea", who("lea")],
      ]
      for (const [person, refused] of refusals) {
        for (const [action, run] of ADMINISTRATION) {
          const { db, sent } = spyDb(await ref.db(person))
          await expect(run(db, refused)).rejects.toMatchObject({
            code: "forbidden",
            message: `Only an administrator of Acme Test can ${action}.`,
          })
          expect(sent).toEqual([])
        }
      }
    })

    it("should let an administrator, or any platform staff member, see and revoke the platform accesses of the organisation of the address only, show the members added by the staff to an administrator only, and refuse a member before anything is read (fiche D2)", async () => {
      // Ada administre sans être du staff ; T révoqué est du staff sans accès en cours. La RLS ne cache
      // aucune organisation au staff : l'accès que P a ouvert à T, seul le filtre du service l'écarte.
      await ref.write({ platform_grants: [{ id: "grant:other:t", org_id: OTHER_ORG.id, user_id: PEOPLE.t.id, revoked_at: null }] })
      const theirs = ref.id("grant:other:t")
      const { db, sent } = spyDb(await ref.db("t"))
      const staff = who("t", { hasOpenGrant: false })
      const ours = [ref.id("grant:s"), ref.id("grant:t")].sort()

      const seenByStaff = await listPlatformAccess(db, staff)
      expect(seenByStaff.accesses.map((access) => access.id).sort()).toEqual(ours)
      // Les membres ajoutés par le staff se lisent dans `invitations`, que lit l'administrateur
      // (HN-E01S07-C2) : ni lus ni servis au reste de l'équipe plateforme.
      expect(seenByStaff.addedByStaff).toEqual([])
      expect(sent.filter((query) => query.target === "invitations")).toEqual([])
      const seenByAda = await listPlatformAccess(await ref.db("ada"), who("ada"))
      expect(seenByAda.accesses.map((access) => access.id).sort()).toEqual(ours)
      expect(seenByAda.addedByStaff.map((member) => member.name)).toEqual(["Théo Staff"])

      await expect(revokePlatformAccess(db, staff, theirs)).rejects.toMatchObject({
        code: "not_found",
        message: `No platform access ${theirs} to Acme Test.`,
      })
      expect(writesOf(sent)).toEqual([])
      expect(await reread(seed.admin`select revoked_at from platform.platform_grants where id = ${theirs}`)).toEqual([{ revoked_at: null }])
      // Un accès de O à ce cas, que la révocation consomme : ceux de la graine restent ouverts.
      await ref.write({ platform_grants: [{ id: "grant:revoked-by-staff", org_id: ORG.id, user_id: seed.person().id, revoked_at: null }] })
      const revocable = ref.id("grant:revoked-by-staff")
      expect((await revokePlatformAccess(db, staff, revocable)).data).toMatchObject({ id: revocable, alreadyRevoked: false })

      const { db: other, sent: refused } = spyDb(await ref.db("lea"))
      await expect(listPlatformAccess(other, who("lea"))).rejects.toMatchObject({
        code: "forbidden",
        message: "Only an administrator of Acme Test can see the platform accesses.",
      })
      await expect(revokePlatformAccess(other, who("lea"), ref.id("grant:s"))).rejects.toMatchObject({
        code: "forbidden",
        message: "Only an administrator of Acme Test can revoke a platform access.",
      })
      expect(refused).toEqual([])
    })
  })

  describe("teams and members of the organisation (AC22)", () => {
    /** Les appartenances aux équipes de O. */
    const memberships = () =>
      reread(seed.admin`select tm.team_id, tm.user_id, tm.role from platform.team_members tm
                        join platform.teams t on t.id = tm.team_id where t.org_id = ${ref.org.id} order by 1, 2`)

    it("should let the lead compose her team, and an administrator, platform staff with a current access included, any team, and refuse another lead before any write (H72)", async () => {
      expect((await addTeamMember(await ref.db("claire"), who("claire"), teamId("ventes"), { userId: marc() })).data.added).toBe(true)
      expect((await addTeamMember(await ref.db("t"), who("t"), teamId("support"), { userId: marc() })).data.added).toBe(true)

      const before = await memberships()
      const paul = spyDb(await ref.db("paul"))
      const t = spyDb(await ref.db("t"))
      await expect(addTeamMember(paul.db, who("paul"), teamId("ventes"), { userId: marc() })).rejects.toMatchObject({
        code: "forbidden",
        message: "Only the administrators of Acme Test and the leads of team Ventes change its members.",
      })
      await expect(removeTeamMember(t.db, who("t", { hasOpenGrant: false }), teamId("ventes"), ref.people.lea.id)).rejects.toMatchObject({
        code: "forbidden",
      })
      expect(writesOf([...paul.sent, ...t.sent])).toEqual([])
      expect(await memberships()).toEqual(before)
    })

    it("should serve the teams and the members of the organisation of the address only", async () => {
      // P a une équipe, dont Léa est responsable et membre. Son chemin n'est pas `ventes`, que la page
      // de P tient déjà (`teams_tree_sync` y fait naître le dossier de l'équipe).
      await ref.write({
        teams: [{ id: "other:team", org_id: OTHER_ORG.id, slug: "equipe_p", name: "Ventes P", lead_user_id: PEOPLE.lea.id }],
        team_members: [{ team_id: "other:team", user_id: PEOPLE.lea.id }],
      })
      const db = await ref.db("lea")
      const lea = who("lea")

      expect((await listTeams(db, lea)).map((team) => team.name)).toEqual(["Support", "Ventes"])
      const members = await listMembers(db, lea)
      expect(members.map((member) => member.name)).toEqual(["Ada Martin", "Claire Morel", "Léa Roux", "Marc Petit", "Paul Girard", "Théo Staff"])
      expect(ref.readable(members.find((member) => member.isSelf)?.teams)).toEqual([{ id: TEAMS.ventes.id, name: "Ventes", role: "member" }])
    })

    // Chaque opération tient en une transaction, annuaire compris (M32, HN-E01S10-e1b2-1) : l'annuaire la
    // reprend, aucune seconde n'attend la première. Opérations sans effet sur la graine (valeurs déjà là).
    const OPERATIONS: [string, (db: PlatformDb) => Promise<unknown>][] = [
      ["listTeams", (db) => listTeams(db, who("ada"))],
      ["listMembers", (db) => listMembers(db, who("ada"))],
      ["updateTeam", (db) => updateTeam(db, who("ada"), teamId("support"), { leadUserId: ref.people.paul.id })],
      ["addTeamMember", (db) => addTeamMember(db, who("ada"), teamId("ventes"), { userId: ref.people.lea.id })],
      ["removeTeamMember", (db) => removeTeamMember(db, who("ada"), teamId("support"), randomUUID())],
      ["updateMember", (db) => updateMember(db, who("ada"), ref.people.lea.id, { role: "member" })],
      ["listPlatformAccess", (db) => listPlatformAccess(db, who("ada"))],
      ["describeTeamDeletion", (db) => describeTeamDeletion(db, who("ada"), "support")],
    ]

    it.each(OPERATIONS)("%s should hold in one transaction, the directory read in it (M32)", async (_name, run) => {
      const { db, requests } = recordDb(await ref.db("ada"))
      await run(db)
      expect(requests.filter((request) => request.kind === "transaction")).toHaveLength(1)
      expect(requests.at(-1)?.kind).toBe("transaction")
    })
  })

  describe("rules of the nodes the caller reads (AC22)", () => {
    // Une règle dans un espace personnel, une sur un nœud de Ventes, une sur un nœud de Support.
    const RULES: RuleSpec[] = [
      { node: "private/claire/notes", user: "lea", level: "read" },
      { node: "ventes/devis/modele", user: "marc", level: "write" },
      { node: "support/faq", team: "ventes", level: "read" },
    ]

    beforeAll(async () => {
      await ref.addRules(RULES)
    }, SETUP_TIMEOUT)

    it("should list only the ruled nodes the caller reads, and answer the rules of another node as unknown (H68)", async () => {
      const paul = await ref.db("paul")

      expect((await listRuledNodes(paul, who("paul"))).map((node) => node.path)).toEqual(["support/faq"])
      expect((await listRuledNodes(await ref.db("lea"), who("lea"))).map((node) => [node.path, node.rulesCount])).toEqual([
        ["private/claire/notes", 1],
        ["support/faq", 1],
        ["ventes/devis/modele", 1],
      ])
      await expect(listNodeRules(paul, who("paul"), "ventes/devis/modele")).rejects.toMatchObject({
        code: "not_found",
        message: "Unknown path ventes/devis/modele.",
      })
    })

    it("should refuse sharing below the manage level, the manage level to a non-administrator, and a rule of an unread node as unknown, before any write (fiche D4)", async () => {
      const subject = { kind: "team" as const, id: teamId("support") }
      const rulesOfO = () => reread(seed.admin`select id, level from platform.access_rules where org_id = ${ref.org.id} order by id`)
      const before = await rulesOfO()
      const lea = spyDb(await ref.db("lea"))
      const claire = spyDb(await ref.db("claire"))
      const paul = spyDb(await ref.db("paul"))

      await expect(setNodeRule(lea.db, who("lea"), { path: "ventes/devis", subject, level: "read" })).rejects.toMatchObject({
        code: "forbidden",
        message: "Sharing ventes/devis is reserved to team Ventes (lead: Claire Morel). Ask them to share it.",
      })
      await expect(setNodeRule(claire.db, who("claire"), { path: "ventes/devis", subject, level: "manage" })).rejects.toMatchObject({
        code: "forbidden",
        message: "Only an administrator of Acme Test can grant the manage level.",
      })
      // Paul ne lit pas `ventes/devis/modele` : la règle posée dessus est introuvable, et son chemin tu.
      const hidden = ref.id("rule:node:ventes/devis/modele:marc")
      await expect(removeRule(paul.db, who("paul"), hidden)).rejects.toMatchObject({
        code: "not_found",
        message: `No rule ${hidden} on a node of Acme Test.`,
      })
      expect(writesOf([...lea.sent, ...claire.sent, ...paul.sent])).toEqual([])
      expect(await rulesOfO()).toEqual(before)

      // L'administrateur, staff avec un accès en cours compris, accorde la gestion (N6).
      expect((await setNodeRule(await ref.db("t"), who("t"), { path: "ventes/devis", subject, level: "manage" })).data.created).toBe(true)
    })
  })

  describe("a write that returns no row after the decision of the service (AC27, HN-E01S07-6)", () => {
    type Race = {
      service: string
      /** La cible du cas, posée par lui : chaque course consomme une ressource à elle. */
      prepare: () => Promise<string>
      run: (db: PlatformDb, target: string) => Promise<unknown>
      /** L'écriture que devance une autre transaction. */
      write: { table: string; op: SentQuery["op"] }
      /** Ce que l'autre transaction change juste avant elle, par la connexion d'administration. */
      meanwhile: (sql: TestSql, target: string) => PromiseLike<unknown>
    }

    /** Une personne de plus dans O, membre simple, sans espace personnel. */
    async function newMember(name: string): Promise<string> {
      const person = seed.person()
      await ref.write({ members: [{ org_id: ORG.id, user_id: person.id, role: "member", email: person.email, name }] })
      return person.id
    }

    /** Une équipe de plus dans O, sans nœud ni compte hors de son dossier et de son Contexte (`teams_tree_sync`). */
    async function newTeam(slug: string, name: string): Promise<string> {
      await ref.write({ teams: [{ id: `team-${slug}`, org_id: ORG.id, slug, name, lead_user_id: null }] })
      return ref.id(`team-${slug}`)
    }

    /** Une règle de plus dans O ; son identifiant réel. */
    async function newRule(rule: RuleSpec): Promise<string> {
      const [id] = await ref.addRules([rule])
      return id
    }

    const RACES: Race[] = [
      {
        service: "updateMember",
        prepare: () => newMember("Membre à changer"),
        run: (db, member) => updateMember(db, who("ada"), member, { role: "admin" }),
        write: { table: "members", op: "update" },
        meanwhile: (sql, member) => sql`delete from platform.members where org_id = ${ref.org.id} and user_id = ${member}`,
      },
      {
        service: "removeMember",
        prepare: () => newMember("Membre à retirer"),
        run: (db, member) => removeMember(db, who("ada"), member),
        write: { table: "members", op: "delete" },
        meanwhile: (sql, member) => sql`delete from platform.members where org_id = ${ref.org.id} and user_id = ${member}`,
      },
      {
        service: "revokePlatformAccess",
        prepare: async () => {
          await ref.write({ platform_grants: [{ id: "grant:race", org_id: ORG.id, user_id: seed.person().id, revoked_at: null }] })
          return ref.id("grant:race")
        },
        run: (db, grant) => revokePlatformAccess(db, who("ada"), grant),
        write: { table: "platform_grants", op: "update" },
        meanwhile: (sql, grant) => sql`update platform.platform_grants set revoked_at = now() where id = ${grant}`,
      },
      {
        // Ventes ne se supprime pas tant qu'elle possède des pages (clé différée de `nodes.owner_team_id`) :
        // l'équipe renommée est une équipe du cas.
        service: "updateTeam",
        prepare: () => newTeam("achats", "Achats"),
        run: (db, team) => updateTeam(db, who("ada"), team, { name: "Achats bis" }),
        write: { table: "teams", op: "update" },
        meanwhile: (sql, team) => sql`delete from platform.teams where id = ${team}`,
      },
      {
        service: "deleteTeam",
        prepare: () => newTeam("conseil", "Conseil"),
        run: (db, team) => deleteTeam(db, who("ada"), team),
        write: { table: "teams", op: "delete" },
        meanwhile: (sql, team) => sql`delete from platform.teams where id = ${team}`,
      },
      {
        service: "removeTeamMember",
        prepare: async () => {
          await ref.write({ team_members: [{ team_id: TEAMS.ventes.id, user_id: PEOPLE.paul.id }] })
          return ref.people.paul.id
        },
        run: (db, person) => removeTeamMember(db, who("ada"), teamId("ventes"), person),
        write: { table: "team_members", op: "delete" },
        meanwhile: (sql, person) => sql`delete from platform.team_members where team_id = ${teamId("ventes")} and user_id = ${person}`,
      },
      {
        service: "setNodeRule",
        prepare: () => newRule({ node: "ventes/tarifs", team: "support", level: "read" }),
        run: (db) => setNodeRule(db, who("ada"), { path: "ventes/tarifs", subject: { kind: "team", id: teamId("support") }, level: "write" }),
        write: { table: "access_rules", op: "update" },
        meanwhile: (sql, rule) => sql`delete from platform.access_rules where id = ${rule}`,
      },
      {
        service: "removeRule",
        prepare: () => newRule({ node: "support/faq", user: "marc", level: "read" }),
        run: (db, rule) => removeRule(db, who("ada"), rule),
        write: { table: "access_rules", op: "delete" },
        meanwhile: (sql, rule) => sql`delete from platform.access_rules where id = ${rule}`,
      },
    ]

    it.each(RACES)("$service should answer conflict with a server log, never a refusal nor not_found", async ({ service, prepare, run, write, meanwhile }) => {
      const target = await prepare()
      let raced = false
      const { db } = spyDb(await ref.db("ada"), {
        before: async (query) => {
          if (raced || query.target !== write.table || query.op !== write.op) return
          raced = true
          await meanwhile(seed.admin, target)
        },
      })

      await expect(run(db, target)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("changed meanwhile") })
      expect(console.error).toHaveBeenCalledWith(`[platform] ${service}: no row written`, expect.any(String))
    })
  })

  describe("memberDirectory (E01-S07c)", () => {
    it("should read every member beyond the rows PostgREST returns at once, page after page", async () => {
      // 1 005 membres de plus, sans nom ni email : sans pages, la lecture s'arrêtait à 1 000. Chacun a son handle : sans
      // lui, la base en tirerait un de l'email absent (`membre`, `membre_2`…), en temps quadratique (E11-S10, lot a).
      await ref.write({ members: Array.from({ length: 1005 }, (_, rang) => ({ org_id: ORG.id, user_id: randomUUID(), role: "member", profile: { handle: `page_${rang}` } })) })

      const people = await memberDirectory(await ref.db("ada"), ref.org.id)

      expect(people).toHaveLength(1005 + 6)
      expect(people.map((person) => person.name)).toContain("Théo Staff")
    })
  })
})
