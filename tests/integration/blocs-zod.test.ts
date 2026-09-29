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

  // E10-S04 : `block_search_text` re-versionnée rend, pour chaque forme d'avant elle, le texte de la ligne de base
  // V1 (recopiée ici) : `search_tsv`, colonne STORED, n'est pas recalculée.
  it("should give the searchable text of the V1 baseline for every earlier valid case, and read the new forms", async () => {
    const earlier = [...DOCUMENT_CASES, ...ROW_CASES].filter((c) => c.valid && !["simple_table", "divider", "toggle"].includes(String(c.block.type)) && !JSON.stringify(c.block).includes("children"))
    for (const c of earlier) {
      const data = fx.admin.json(JSON.parse(JSON.stringify(c.block.data ?? {})))
      const [row] = await fx.admin`
        select platform.block_search_text(${String(c.block.type)}, ${(c.block.text as string | undefined) ?? null}, ${data}, ${(c.block.key as string | undefined) ?? null}) as now,
               concat_ws(' ', ${(c.block.key as string | undefined) ?? null}::text, ${(c.block.text as string | undefined) ?? null}::text,
                 case ${String(c.block.type)}::text
                   when 'row' then (select string_agg(v #>> '{}', ' ') from jsonb_path_query(${data}::jsonb, 'lax $.* ? (@.type() == "string" || @.type() == "number")') v)
                   when 'list' then (select string_agg(v #>> '{}', ' ') from jsonb_path_query(${data}::jsonb, 'lax $.items[*] ? (@.type() == "string")') v)
                   when 'checklist' then (select string_agg(v #>> '{}', ' ') from jsonb_path_query(${data}::jsonb, 'lax $.items[*].text ? (@.type() == "string")') v)
                   when 'call' then concat_ws(' ', ${data}::jsonb ->> 'function', (select string_agg(v #>> '{}', ' ') from jsonb_path_query(${data}::jsonb -> 'args', 'strict $.** ? (@.type() == "string")') v))
                   when 'reference' then ${data}::jsonb ->> 'path'
                   when 'image' then ${data}::jsonb ->> 'alt'
                 end) as v1`
      expect(row.now, c.name).toBe(row.v1)
    }
    const text = async (type: string, blockText: string | null, data: unknown) =>
      (await fx.admin`select platform.block_search_text(${type}, ${blockText}, ${fx.admin.json(JSON.parse(JSON.stringify(data)))}, null) as t`)[0].t
    expect(await text("list", null, { items: ["a", { text: "b", children: { items: ["c", { text: "d", children: { items: ["e"] } }] } }] })).toBe("a b c d e")
    expect(await text("simple_table", null, { columns: ["Nom", "Prix"], rows: [["Devis", "12"]] })).toBe("Nom Prix Devis 12")
    expect(await text("toggle", "Le corps", { summary: "Le résumé" })).toBe("Le corps Le résumé")
  })
})
