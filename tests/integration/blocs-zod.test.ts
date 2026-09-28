// @vitest-environment node
// Base d'accord avec les schémas Zod des blocs (E01-S06 : AC36) : chaque cas de `BLOCK_CASES` passe par
// une insertion de la connexion d'administration (brouillon d'une page jetable, tableau jetable pour une
// ligne) ; la base rend le verdict du cas. Le verdict de `blockInputSchema` sur les mêmes cas est dans
// `tests/unit/schemas/blocks.test.ts`. Suite portable depuis E01-S10 f2 (plus de PostgREST) : le job
// `bare-postgres` la joue.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { DOCUMENT_CASES, ROW_CASES } from "../helpers/block-cases"
import { codeOf, createSqlFixtures, SQL_SKIP_REASON, sqlConfigured, type SqlFixtures } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000
const SUITE = "block schemas and database agree"

describe.skipIf(!sqlConfigured)(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let fx: SqlFixtures
  let page: string
  let table: string
  let position = 0

  /** Verdict de la base : `valid`, ou le code du refus. Le cas tel quel : `org_id` est posé par `blocks_guard` (N9), `data` passe en JSON. */
  async function databaseVerdict(block: Record<string, unknown>): Promise<string> {
    const target = block.type === "row" ? { node_id: table, state: "published" } : { node_id: page, state: "draft", position: (position += 1024) }
    const row = Object.fromEntries(
      Object.entries({ ...target, ...block }).map(([column, value]) => [column, column === "data" ? fx.admin.json(JSON.parse(JSON.stringify(value))) : value]),
    )
    return (await codeOf(fx.admin`insert into platform.blocks ${fx.admin(row)}`)) ?? "valid"
  }

  beforeAll(async () => {
    fx = createSqlFixtures()
    const org = await fx.createOrg()
    const tree = await fx.createTree(org.id)
    page = await fx.createNode(org.id, { parentId: tree.root, path: "cas", title: "Cas" })
    table = await fx.createNode(org.id, { parentId: tree.root, path: "lignes", kind: "table", title: "Lignes" })
    await fx.admin`select * from platform.open_draft(${page})`
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await fx?.cleanup()
  }, SETUP_TIMEOUT)

  it("should give the database verdict of every block case", async () => {
    const cases = [...DOCUMENT_CASES, ...ROW_CASES]
    const verdicts: Record<string, string> = {}
    for (const c of cases) verdicts[c.name] = await databaseVerdict(c.block)

    // Un cas invalide est refusé par une contrainte (23514) ou par l'unicité d'une clé (23505).
    const refused = expect.stringMatching(/^(23514|23505)$/)
    expect(verdicts).toEqual(Object.fromEntries(cases.map((c) => [c.name, c.valid ? "valid" : refused])))
  })
})
