// @vitest-environment node
// `setNodeRule` et `removeRule` (E05-S03, AC17, AC19) sur une vraie base (E01-S10, lot t1-e1) quand
// l'équipe propriétaire du nœud, lue pour le journal (H07), ne se lit pas : l'échec part avant toute
// écriture, jamais après une règle posée ou retirée (une réponse 500 sur une base changée). La panne de
// `node_owner` (`57014`, délai dépassé), que la base ne produit pas à la demande, est rendue par l'espion
// (`spyDb`, option `fail`). Et `setNodeRule` quand la règle du même sujet est posée puis retirée pendant
// sa pose, par la connexion d'administration juste avant l'insertion puis avant la relecture (option
// `before`) : un conflit, jamais une panne. O vient de `seedReferenceOrg`, une graine pour le fichier ;
// chaque test a son couple nœud-sujet. La base réelle, sans panne, est couverte par
// `tests/integration/regles-services.test.ts`.
// En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformError, removeRule, setNodeRule } from "@otomata_tech/oto_platform/server"
import { TEAMS } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { seedWithAdmin, spyDb, sqlConfigured, writesOf, type SeededData, type SentQuery, portable } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

const SUITE = "rules services on a real database, when the owner of the node cannot be read or the rule comes and goes"

/** Le nœud des trois cas (propriétaire hérité : l'équipe Ventes, par son dossier). */
const PATH = "ventes/devis"

/** La lecture du propriétaire effectif, en panne : délai dépassé. */
const ownerUnreadable = (query: SentQuery) => (query.target === "node_owner" ? { code: "57014" } : null)

async function refus(promesse: Promise<unknown>): Promise<unknown> {
  return promesse.then(
    () => null,
    (raison: unknown) => raison,
  )
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
    // `fromDatabaseError` et les conflits journalisent côté serveur.
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const support = () => ref.id(TEAMS.support.id)

  /** Les règles du nœud, relues par la connexion d'administration : ce qu'un échec laisse identique. */
  const rulesOfNode = async () => [...(await seed.admin`select id, subject_team_id, subject_user_id, level from platform.access_rules where node_id = ${ref.nodeId(PATH)} order by id`)]

  describe("rules services when the owner of the node cannot be read (AC19)", () => {
    it("should fail before posing the rule, never after", async () => {
      const before = await rulesOfNode()
      const { db, sent } = spyDb(await ref.db("ada"), { fail: ownerUnreadable })

      const erreur = await refus(setNodeRule(db, ref.identityOf("ada"), { path: PATH, subject: { kind: "team", id: support() }, level: "read" }))

      expect(erreur).toBeInstanceOf(PlatformError)
      expect(erreur).toMatchObject({ code: "internal" })
      expect(writesOf(sent)).toEqual([])
      expect(await rulesOfNode()).toEqual(before)
    })

    it("should fail before removing the rule, never after", async () => {
      // Une règle à ce cas : Marc, en lecture.
      const [rule] = await ref.addRules([{ node: PATH, user: "marc", level: "read" }])
      const before = await rulesOfNode()
      const { db, sent } = spyDb(await ref.db("ada"), { fail: ownerUnreadable })

      const erreur = await refus(removeRule(db, ref.identityOf("ada"), rule))

      expect(erreur).toBeInstanceOf(PlatformError)
      expect(erreur).toMatchObject({ code: "internal" })
      expect(writesOf(sent)).toEqual([])
      expect(await rulesOfNode()).toEqual(before)
    })
  })

  describe("setNodeRule when the rule of the same subject comes and goes meanwhile (AC17)", () => {
    it("should say the rules changed, never an internal error", async () => {
      // Aucune règle de Support sur le nœud ; l'insertion bute sur la règle qu'une autre transaction pose
      // juste avant (`23505`), et que la même retire avant la relecture.
      const node = ref.nodeId(PATH)
      let phase: "read" | "posed" | "removed" = "read"
      const { db, sent } = spyDb(await ref.db("ada"), {
        before: async (query) => {
          if (query.target !== "access_rules") return
          if (phase === "read" && query.op === "insert") {
            phase = "posed"
            await seed.admin`insert into platform.access_rules (org_id, node_id, subject_team_id, level) values (${ref.org.id}, ${node}, ${support()}, 'read')`
          } else if (phase === "posed" && query.op === "select") {
            phase = "removed"
            await seed.admin`delete from platform.access_rules where node_id = ${node} and subject_team_id = ${support()}`
          }
        },
      })

      const erreur = await refus(setNodeRule(db, ref.identityOf("ada"), { path: PATH, subject: { kind: "team", id: support() }, level: "read" }))

      expect(erreur).toBeInstanceOf(PlatformError)
      expect(erreur).toMatchObject({ code: "conflict" })
      expect(phase).toBe("removed")
      expect(writesOf(sent).map((query) => [query.op, query.target])).toEqual([["insert", "access_rules"]])
    })
  })
})
