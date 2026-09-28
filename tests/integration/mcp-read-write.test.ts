// @vitest-environment node
// `read` et `write` sur le vrai projet (E03-S03), les deux seuls tests de la story dont la base est le
// sujet : AC38, bout en bout par `InMemoryTransport` sous le jeton de chaque personne (`open_draft`,
// blocs sous leurs invariants et leurs droits de colonne, `publish_node`, `links`) ; AC25, part de la
// base : deux personnes écrivent deux blocs différents du même brouillon en même temps (ADR-011,
// Conséquences). Organisation de référence jetable (H120), sessions par `fx.sessionFor`. Marqué Supabase :
// la porte reçoit le jeton d'une session de Supabase Auth ; depuis E01-S10 f2, les relectures passent par
// la connexion d'administration, plus par PostgREST.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { connectMcp } from "../helpers/mcp"
import { createFixtures, hex, SKIP_REASON, supabaseConfigured, type Fixtures, type ReferenceOrg } from "../helpers/plateforme"
import { SQL_SKIP_REASON, sqlConfigured, testAdminSql, type TestSql } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Ces tests supposent le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que
// 20260928120000 n'est pas appliquée au projet (`database-patterns.md § Règles`).
const privatePending = await privateFolderPending()

const NETWORK_TIMEOUT = 120_000
const configured = supabaseConfigured && sqlConfigured
const SUITE = "read and write through MCP on the cloud project"

type Person = "lea" | "claire"

describe.skipIf(!configured || privatePending)(
  privateFolderSuite(configured ? SUITE : `${SUITE} (${supabaseConfigured ? SQL_SKIP_REASON : SKIP_REASON})`, privatePending),
  { timeout: NETWORK_TIMEOUT },
  () => {
    let fx: Fixtures
    let admin: TestSql
    let ref: ReferenceOrg
    const tokens = {} as Record<Person, string>

    beforeAll(async () => {
      fx = createFixtures()
      admin = testAdminSql()
      ref = await fx.buildReferenceOrg()
      for (const person of ["lea", "claire"] as const) tokens[person] = (await fx.sessionFor(ref.people[person])).accessToken
    }, NETWORK_TIMEOUT)

    afterAll(async () => {
      try {
        await fx?.cleanup()
      } finally {
        await admin?.end({ timeout: 5 })
      }
    }, NETWORK_TIMEOUT)

    async function session(person: Person, userAgent: string) {
      const connected = await connectMcp({ host: ref.host }, { id: ref.people[person].id, email: ref.people[person].email, accessToken: tokens[person] }, userAgent)
      const { code } = await connected.openContext("Écris le compte rendu de la réunion")
      /** Un appel d'outil ; ses deux canaux portent le même texte (H26). */
      const call = async (tool: string, args: Record<string, unknown>) => {
        const answer = await connected.call(tool, { ctx: code, ...args })
        expect(answer.isError, `${tool}: ${answer.text}`).toBe(false)
        expect((answer.result.structuredContent as { text?: string } | undefined)?.text).toBe(answer.text)
        return answer
      }
      return { ...connected, call, code }
    }

    it("should chain context, write, publish, read with references, write one block and read the draft, journaled per call (AC38)", async () => {
      const agent = `rw-${hex(4)}`
      const lea = await session("lea", agent)
      const claire = await session("claire", agent)
      const path = `ventes/cr_${hex(3)}`
      const created = await lea.call("write", {
        path,
        title: "CR de la réunion",
        summary: "Compte rendu de test.",
        ops: [{ op: "add_section", section: "Décisions", text: "Lancer la pré-étude.\n\nRelancer Acme." }],
      })
      expect(created.text.split("\n")[0]).toMatch(new RegExp(`^Draft of ${path} created \\(revision 0\\): added « Décisions »`))
      expect((await claire.call("write", { path, base_revision: 0, publish: true })).text).toBe(`Published ${path} revision 1 (1 section, 3 blocks).`)

      const section = await lea.call("read", { path, section: "Décisions", refs: true })
      const blockRef = /<!-- ref: (\S+) -->\nRelancer Acme\./.exec(section.text)?.[1]
      expect(blockRef).toBeTruthy()
      await lea.call("write", { path, base_revision: 1, ops: [{ op: "replace_block", block: blockRef, text: "Relancer Acme vendredi." }] })
      const draft = await lea.call("read", { path, draft: true })
      expect(draft.text).toContain("\n\n## Décisions\n\nLancer la pré-étude.\n\nRelancer Acme vendredi.")
      const node = await fx.nodeId(ref.org.id, path)
      const blocks = await admin<{ id: string }[]>`select id, text, revision, provenance from platform.blocks where node_id = ${node} and state = 'draft'`
      // La provenance posée par l'adaptateur MCP : l'assistant de Léa, avec le `ctx` de la conversation (AC28).
      expect(blocks.find((block) => block.id.startsWith(String(blockRef)))).toMatchObject({
        text: "Relancer Acme vendredi.",
        revision: 2,
        provenance: { origin: "agent", by: ref.people.lea.id, ctx: lea.code },
      })

      await Promise.all([lea.flush(), claire.flush()])
      const lines = await admin<{ user_id: string | null; tool: string | null; target: string | null; team_id: string | null; is_error: boolean }[]>`
        select user_id, tool, target, team_id, is_error from platform.journal
        where org_id = ${ref.org.id} and user_agent = ${agent} and method = 'tools/call' order by id`
      // Chaque session écrit ses lignes d'un coup : l'ordre se lit par personne.
      const of = (person: Person) =>
        lines
          .filter((line) => line.user_id === ref.people[person].id && line.tool !== `${ref.org.prefix}_context`)
          .map((line) => [line.tool, line.target, line.team_id, line.is_error])
      const expected = (tools: string[]) => tools.map((tool) => [`${ref.org.prefix}_${tool}`, path, ref.teams.ventes, false])
      expect([of("lea"), of("claire")]).toEqual([expected(["write", "read", "write", "read"]), expected(["write"])])
    })

    it("should keep both changes when two people write two different blocks of the same draft at once (AC25)", async () => {
      const path = `ventes/devis_${hex(3)}`
      const node = await fx.createNode(ref.org.id, { parentId: ref.nodes.ventes, path, title: "Devis" })
      await fx.publishBlocks(node, [{ type: "paragraph", text: "Premier." }, { type: "paragraph", text: "Second." }])
      const [first, second] = await fx.draftBlocks(node, [{ type: "paragraph", text: "Premier." }, { type: "paragraph", text: "Second." }], { title: "Devis en cours" })
      const agent = `rw-${hex(4)}`
      const [lea, claire] = await Promise.all([session("lea", agent), session("claire", agent)])
      await Promise.all([
        lea.call("write", { path, base_revision: 1, ops: [{ op: "replace_block", block: first.slice(0, 8), text: "Premier, par Léa." }] }),
        claire.call("write", { path, base_revision: 1, ops: [{ op: "replace_block", block: second.slice(0, 8), text: "Second, par Claire." }] }),
      ])
      const blocks = await admin<{ id: string; text: string | null }[]>`select id, text from platform.blocks where node_id = ${node} and state = 'draft' order by position`
      expect(blocks.map((block) => [block.id, block.text])).toEqual([
        [first, "Premier, par Léa."],
        [second, "Second, par Claire."],
      ])
    })
  },
)
