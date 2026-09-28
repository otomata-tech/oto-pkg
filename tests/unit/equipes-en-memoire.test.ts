// @vitest-environment node
// Les services d'E05-S03 sur une vraie base (E01-S10, lot t1-e1), pour ce que l'organisation de référence
// ne porte pas et que chaque test pose lui-même : une équipe qui possède plus de 20 objets (AC14) ; un nom
// à initiale accentuée dans l'annuaire (AC4). Une écriture sans ligne après la décision du service
// (conflit, HN-E01S07-6) se prouve dans `tests/unit/equipes-droits.test.ts`. O vient de `seedReferenceOrg`.
// En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { deleteTeam, listMembers, PlatformError } from "@otomata_tech/oto_platform/server"
import { ORG, PEOPLE, TEAMS } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { seedWithAdmin, spyDb, sqlConfigured, writesOf, type SeededData, portable } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

const SUITE = "teams and members services on a real database, beyond the reference organisation"

async function refus(promesse: Promise<unknown>): Promise<PlatformError> {
  const erreur = await promesse.then(
    () => null,
    (raison: unknown) => raison,
  )
  if (!(erreur instanceof PlatformError)) throw new Error(`expected a PlatformError, got ${String(erreur)}`)
  return erreur
}

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
    // `fromDatabaseError` journalise le code technique côté serveur.
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("deleteTeam when the team owns more than 20 objects (AC14)", () => {
    it("should name 20 nodes and 20 accounts at most, with their totals, and delete nothing", async () => {
      const pages = Array.from({ length: 23 }, (_, rang) => ({ path: `ventes/page_${String(rang + 1).padStart(2, "0")}` }))
      const comptes = Array.from({ length: 22 }, (_, rang) => ({ label: `Mail ${String(rang + 1).padStart(2, "0")}` }))
      // L'équipe ne garde que son dossier et son Contexte ; dessous, 23 pages ; et 22 comptes à elle.
      const ventes = ref.id(TEAMS.ventes.id)
      await seed.admin`delete from platform.nodes where org_id = ${ref.org.id} and path like 'ventes/%' and path <> 'ventes/contexte'`
      await seed.admin`delete from platform.accounts where org_id = ${ref.org.id} and owner_team_id = ${ventes}`
      await ref.addNodes(pages)
      await ref.write({
        accounts: comptes.map((compte, rang) => ({
          id: `account:equipe-${rang}`,
          org_id: ORG.id,
          connector: "mail",
          label: compte.label,
          owner_kind: "team",
          owner_team_id: TEAMS.ventes.id,
        })),
      })
      const { db, sent } = spyDb(await ref.db("ada"))

      const erreur = await refus(deleteTeam(db, ref.identityOf("ada"), ventes))

      expect(erreur.code).toBe("conflict")
      expect(erreur.details).toEqual({
        reason: "team_owns_objects",
        nodes: pages.slice(0, 20).map((page) => page.path),
        accounts: comptes.slice(0, 20).map((compte) => compte.label),
        nodesTotal: 23,
        accountsTotal: 22,
      })
      expect(writesOf(sent)).toEqual([])
      expect([...(await seed.admin`select id from platform.teams where id = ${ventes}`)]).toEqual([{ id: ventes }])
    })
  })

  describe("listMembers order (AC4)", () => {
    it("should sort the people by name in French, an accented initial among its letter", async () => {
      // Une organisation à ce cas : cinq personnes, aucune équipe ; l'annuaire seul fait la liste.
      const org = await seed.createOrg()
      const zoe = seed.person()
      const emile = seed.person()
      await ref.write({
        members: [
          { org_id: org.id, user_id: zoe.id, email: zoe.email, name: "Zoé Blanc" },
          { org_id: org.id, user_id: PEOPLE.lea.id },
          { org_id: org.id, user_id: emile.id, email: emile.email, name: "Émile Durand" },
          { org_id: org.id, user_id: PEOPLE.claire.id },
          { org_id: org.id, user_id: PEOPLE.ada.id, role: "admin" },
        ],
      })
      const admin = ref.identityOf("ada", { org: { id: org.id, slug: org.slug, name: org.name, prefix: org.prefix, brand: {}, domains: null } })

      const membres = await listMembers(await ref.db("ada"), admin)

      expect(membres.map((membre) => membre.name)).toEqual(["Ada Martin", "Claire Morel", "Émile Durand", "Léa Roux", "Zoé Blanc"])
    })
  })
})
