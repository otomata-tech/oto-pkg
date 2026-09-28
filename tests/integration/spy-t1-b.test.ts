// @vitest-environment node
// La face SQL de l'espion des tests de service sur base réelle (`spyDb`, `tests/helpers/spy-t1-b.ts`, E01-S10,
// lot t1-b) : chaque instruction d'une transaction `db.tx` relevée, texte et valeurs liées, puis exécutée
// telle quelle ; et ce qu'en lisent les preuves des tests des nœuds : `isWrite` (aucune écriture ne part
// d'un refus), `draftReads` (un lecteur sans l'écriture ne lit pas le brouillon), `touches`,
// `functionCalls`. Aucun module n'était sur la face SQL au lot t1-b : sans ce test, un défaut de cette face
// rendrait ces preuves vides, sans échec, à la conversion des nœuds (HN-E01S10-t1b-9). Depuis la partie b2,
// le crochet y agit aussi (courses et refus des tests des nœuds) : une fois par instruction, avant son
// envoi. Portable : un appelant d'`asCaller` sans organisation, à qui la RLS d'isolation ne rend aucune
// ligne, sur le projet comme sur un Postgres nu.
import { randomUUID } from "crypto"
import { describe, expect, it } from "vitest"
import { draftReads, functionCalls, isWrite, spyDb, touches } from "../helpers/spy-t1-b"
import { asCaller, SQL_SKIP_REASON, sqlConfigured } from "../helpers/sql"

const NETWORK_TIMEOUT = 30_000

describe.skipIf(!sqlConfigured)(sqlConfigured ? "spyDb on the SQL face" : `spyDb on the SQL face (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  it("should record each statement of a transaction with its bound values, and run it as written", async () => {
    const spied = spyDb(asCaller(randomUUID()))
    const node = randomUUID()
    const counted = await spied.db.tx(async (sql) => {
      await sql`select base_revision from platform.node_drafts where node_id = ${node}`
      return sql<{ n: number }[]>`select count(*)::int as n from platform.blocks where node_id = ${node} and state = ${"draft"}`
    })
    expect(counted).toEqual([{ n: 0 }])
    expect(spied.calls).toEqual([
      { kind: "sql", text: "select base_revision from platform.node_drafts where node_id = $", values: [node] },
      { kind: "sql", text: "select count(*)::int as n from platform.blocks where node_id = $ and state = $", values: [node, "draft"] },
    ])
  })

  it("should tell the reads of a draft, the writes (`with` statements included) and the functions called from the other statements", async () => {
    const spied = spyDb(asCaller(randomUUID()))
    const node = randomUUID()
    await spied.db.tx(async (sql) => {
      await sql`select base_revision from platform.node_drafts where node_id = ${node}`
      await sql`select id from platform.blocks where node_id = ${node} and state = ${"draft"}`
      await sql`select id from platform.blocks where node_id = ${node} and state = 'draft'`
      // Des lectures qui ne sont ni du brouillon ni des écritures : un verrou de ligne, une colonne `updated_by`.
      await sql`select id, updated_by from platform.blocks where node_id = ${node} and state = 'published' for update`
      await sql`with moved as (update platform.blocks set position = position where id = ${node} and state = ${"published"} returning id) select count(*) from moved`
      await sql`delete from platform.blocks where id = ${node} and state = ${"published"}`
    })
    // `open_draft` d'un nœud inconnu : la base le refuse, l'espion l'a relevé avant l'envoi.
    await expect(spied.db.tx((sql) => sql`select * from platform.open_draft(${node})`)).rejects.toThrow()
    expect(spied.calls).toHaveLength(7)
    const [drafts, boundDraft, writtenDraft, locked, moved, deleted, opened] = spied.calls
    expect(draftReads(spied.calls)).toEqual([drafts, boundDraft, writtenDraft])
    expect(spied.calls.filter(isWrite)).toEqual([moved, deleted, opened])
    expect(functionCalls(spied.calls, "open_draft")).toEqual([opened])
    expect(functionCalls(spied.calls, "publish_node")).toEqual([])
    expect(spied.calls.filter((call) => touches(call, "blocks"))).toEqual([boundDraft, writtenDraft, locked, moved, deleted])
    expect(spied.calls.filter((call) => touches(call, "node_drafts"))).toEqual([drafts])
  })

  it("should call the hook once per statement, before sending it, and send nothing when the hook refuses it", async () => {
    // Retenue par le crochet, l'instruction n'est pas partie ; dans une transaction, postgres.js guette chaque
    // requête par `catch`, qui repasse par son `then` : le crochet ne joue pourtant qu'une fois.
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = () => resolve()
    })
    const hooked: string[] = []
    const spied = spyDb(asCaller(randomUUID()), async (call) => {
      hooked.push(call.kind === "sql" ? call.text : call.kind)
      await held
    })
    let answered = false
    const running = spied.db.tx((sql) => sql<{ one: number }[]>`select 1 as one`).then((rows) => {
      answered = true
      return rows
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect([hooked, answered]).toEqual([["select 1 as one"], false])
    release()
    expect(await running).toEqual([{ one: 1 }])
    expect(hooked).toEqual(["select 1 as one"])
    // Refusée, l'instruction rend le code du crochet : envoyée, `open_draft` d'un nœud inconnu en rendrait un
    // autre (`42501`). Aussi quand elle part par `execute`, qui n'appelle pas `then` : le crochet attend dans
    // `handle()` (`testing-strategy.md § Anti-patterns`).
    const refusedCalls: string[] = []
    const refused = spyDb(asCaller(randomUUID()), (call) => {
      refusedCalls.push(call.kind === "sql" ? call.text : call.kind)
      return functionCalls([call], "open_draft").length > 0 ? { code: "57014" } : null
    })
    await expect(refused.db.tx((sql) => sql`select * from platform.open_draft(${randomUUID()})`)).rejects.toMatchObject({ code: "57014" })
    await expect(refused.db.tx((sql) => sql`select * from platform.open_draft(${randomUUID()})`.execute())).rejects.toMatchObject({ code: "57014" })
    expect(refusedCalls).toEqual(["select * from platform.open_draft($)", "select * from platform.open_draft($)"])
  })
})
