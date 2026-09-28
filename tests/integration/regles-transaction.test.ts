// @vitest-environment node
// La pose d'une règle devancée (E05-S03 AC17, HN-E05S03-39) sur la face SQL (E01-S10, lot e1b1, AC-x4) :
// la règle du même sujet, posée par une autre transaction entre la lecture du service et son insertion,
// voit son niveau remplacé, sans doublon ni panne ; l'insertion qui n'écrit rien (`on conflict do nothing`)
// et la mise à jour qui la suit tiennent dans la même transaction. La course est jouée par la connexion
// d'administration juste avant l'insertion (`spyDb`, option `before`) ; `recordDb` relève où finit chaque
// transaction. O vient de `seedReferenceOrg`, une graine pour le fichier. La règle posée puis retirée
// pendant la pose (un conflit) est le cas de `tests/unit/rules-owner-team.test.ts`.
// Portable depuis E01-S10 f2 (la partie e1a est fusionnée, le mode de transition tombe) : le job
// `bare-postgres` le joue.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { setNodeRule } from "@otomata_tech/oto_platform/server"
import { TEAMS } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { portable, recordDb, seedWithAdmin, spyDb, sqlConfigured, writesOf, type SeededData, type SentRequest } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000
const SUITE = "setNodeRule raced by the rule of the same subject, on the SQL face"

/** Le nœud du cas (propriétaire hérité : l'équipe Ventes), sans règle dans la graine. */
const PATH = "ventes/devis"

/** Une requête du client, comme `recordDb` la relève : une instruction de la face SQL et ses tables, ou la fin de sa transaction. */
function step(request: SentRequest): string {
  return request.kind === "statement" ? `${request.op} ${request.names.join(",")}` : "end"
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

  it("should replace the level of the rule posed between its read and its insertion, in the transaction of the insertion (AC17, AC-x4)", async () => {
    const node = ref.nodeId(PATH)
    const support = ref.id(TEAMS.support.id)
    let raced: string | undefined
    const spied = spyDb(await ref.db("ada"), {
      before: async (query) => {
        if (raced || query.target !== "access_rules" || query.op !== "insert") return
        const [row] = await seed.admin<{ id: string }[]>`
          insert into platform.access_rules (org_id, node_id, subject_team_id, level)
          values (${ref.org.id}, ${node}, ${support}, 'read') returning id`
        raced = row.id
      },
    })
    const recorded = recordDb(spied.db)

    const set = await setNodeRule(recorded.db, ref.identityOf("ada"), { path: PATH, subject: { kind: "team", id: support }, level: "write" })

    expect(raced).toBeDefined()
    expect(set.data).toMatchObject({ id: raced, level: "write", created: false })
    const rules = await seed.admin`select id, level from platform.access_rules where node_id = ${node} and subject_team_id = ${support}`
    expect([...rules]).toEqual([{ id: raced, level: "write" }])
    expect(writesOf(spied.sent).map((query) => [query.op, query.target])).toEqual([
      ["insert", "access_rules"],
      ["update", "access_rules"],
    ])
    // La fin de la transaction : la relecture, l'insertion sans ligne, la relecture, la mise à jour.
    const steps = recorded.requests.map(step)
    expect(steps.slice(-5)).toEqual(["select access_rules", "insert access_rules", "select access_rules", "update access_rules", "end"])
    // Une seule transaction pour toute l'opération, décisions comprises (M32, HN-E01S10-e1b1-1) : une seule fin,
    // la dernière ; le nœud, les faits de son niveau et le sujet se lisent avant la première écriture.
    expect(steps.filter((one) => one === "end")).toEqual(["end"])
    expect(steps.slice(0, steps.indexOf("insert access_rules"))).toEqual(expect.arrayContaining(["select nodes", "select access_rules", "select teams"]))
  })
})
