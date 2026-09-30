// @vitest-environment node
// Les services par l'adresse, à la porte MCP (E09-S05 : AC6 à AC8 ; `mcp-patterns.md § 6` et § 10) :
// `c`, administratrice d'A et de B, que la RLS laisse lire et écrire les deux ; seule l'adresse appelée
// sépare A de B (HN-E09S05-3). Sessions par `connectMcp` (InMemoryTransport, câblées comme la route :
// `resolveMcpRequest`), sur l'hôte d'A et sur celui de B. Les appels d'AC6 se font une fois, en
// `beforeAll` : AC7 lit le journal et les `ctx` qu'ils ont écrits. Suite portable (E11-S14) : la porte
// reçoit un jeton signé localement ; les relectures passent par la connexion d'administration.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { isJsonObject } from "../../../packages/plateforme/server/json"
import { connectMcp, type McpSession } from "../../helpers/mcp"
import { hex } from "../../helpers/plateforme"
import { portable, sqlConfigured } from "../../helpers/sql"
import { MARKERS, preparer, type Isolation, type Place, type Row, type Who } from "./donnees"

const SETUP_TIMEOUT = 300_000
const NETWORK_TIMEOUT = 120_000
const SUITE = "isolation through MCP, by the address"
const TOOLS = ["context", "find", "read", "call", "write", "feedback"]
const FIND_QUERIES = ["tournées", "ZZ Marqueur", MARKERS.page.word, MARKERS.row.key]
const NEW_PAGE = `notes_isolation_${hex(3)}`
/**
 * Les lignes de journal des appels d'AC6, une par requête : `context`, chaque `find`, `read`, les deux
 * `call`, `write`, `feedback` et `prompts/list` sur l'adresse d'A, puis les deux lectures du journal.
 */
const AC6_LINES = 1 + FIND_QUERIES.length + 1 + 2 + 1 + 1 + 1 + 2

type Called = Awaited<ReturnType<McpSession["call"]>>
type Session = McpSession & { kind: string }
type Calls = {
  context: Called & { code: string }
  finds: Called[]
  read: Called
  tableOfB: Called
  commonTable: Called
  write: Called
  feedback: Called
  prompts: { name: string; title?: string; description?: string }[]
  journal: Called
  conversationOfB: Called
}

/** Les objets d'un champ de `structuredContent` (lignes, conversations), à la profondeur donnée. */
function recordsAt(called: Called, ...path: string[]): Row[] {
  let value: unknown = called.result.structuredContent
  for (const key of path) value = isJsonObject(value) ? value[key] : undefined
  return Array.isArray(value) ? value.filter(isJsonObject) : []
}

/** Minuscules, sans le gras des extraits (`**`) : un marqueur se cherche ainsi dans un résultat. */
const plain = (text: string) => text.replaceAll("*", "").toLowerCase()

/** Le résultat entier, texte et `structuredContent`, sans la demande qu'il répète. */
function shown(called: Called, echoed: string): string {
  return plain(`${called.text}\n${JSON.stringify(called.result.structuredContent ?? {})}`).split(plain(echoed)).join("")
}

describe.skipIf(!sqlConfigured)(
  portable(SUITE),
  { timeout: NETWORK_TIMEOUT },
  () => {
    let data: Isolation & { nettoyer: () => Promise<void> }
    let calls: Calls
    let onA: Session
    let codeOnB: string
    const tokens = new Map<Who, string>()
    const agent = { a: `isolation-a-${hex(4)}`, b: `isolation-b-${hex(4)}` }

    function connect(place: Place, who: Who, userAgent: string): Promise<Session> {
      const accessToken = tokens.get(who)
      if (!accessToken) throw new Error(`${who} has no session`)
      return connectMcp({ host: place.host }, { id: data.people[who].id, email: data.people[who].email, accessToken }, userAgent)
    }

    /** Les chemins, titres et mots de B que rien ne doit citer sur l'adresse d'A, avec son nom, son préfixe et ses domaines. */
    function cited(text: string): string[] {
      const { page, procedure, table, row } = MARKERS
      const markers = [page.path, page.title, page.word, procedure.path, procedure.title, table.path, table.title, row.key, data.b.name, `${data.b.prefix}_`, data.b.domains]
      return markers.map(plain).filter((marker) => text.includes(marker))
    }

    beforeAll(async () => {
      data = await preparer()
      for (const who of ["a", "c"] as const) tokens.set(who, (await data.sessionOf(who)).accessToken)
      const onB = await connect(data.b, "c", agent.b)
      codeOnB = (await onB.openContext(MARKERS.procedure.phrase)).code
      await onB.flush()

      onA = await connect(data.a, "c", agent.a)
      const context = await onA.openContext(MARKERS.procedure.phrase)
      const ctx = context.code
      const finds = []
      for (const query of FIND_QUERIES) finds.push(await onA.call("find", { ctx, query }))
      const read = await onA.call("read", { ctx, path: MARKERS.page.path })
      const tableOfB = await onA.call("call", { ctx, function: "table.rows", arguments: { table: MARKERS.table.path } })
      const commonTable = await onA.call("call", { ctx, function: "table.rows", arguments: { table: MARKERS.row.table } })
      const write = await onA.call("write", {
        ctx,
        path: NEW_PAGE,
        title: "Notes d'isolation",
        summary: "Page écrite par c sur l'adresse d'A.",
        ops: [{ op: "add_section", section: "Notes", text: "Écrit sur l'adresse d'A." }],
      })
      const feedback = await onA.call("feedback", { ctx, type: "gap", text: "Il manque une carte des adresses de livraison." })
      const { prompts } = await onA.client.listPrompts()
      // Le journal de la session écrit d'abord, comme la route l'écrit après chaque requête : la lecture
      // du journal, dans une seconde requête (même personne, même agent), trouve la conversation de c sur A.
      await onA.flush()
      const reader = await connect(data.a, "c", agent.a)
      calls = {
        context,
        finds,
        read,
        tableOfB,
        commonTable,
        write,
        feedback,
        prompts,
        journal: await reader.call("read", { ctx, path: "journal" }),
        conversationOfB: await reader.call("read", { ctx, path: "journal", section: codeOnB }),
      }
      await reader.flush()
    }, SETUP_TIMEOUT)

    afterAll(async () => {
      await data?.nettoyer()
    }, SETUP_TIMEOUT)

    it("should keep c, of both organisations, in A on the address of A: context, find, read, call, write, feedback, prompts, journal (AC6)", async () => {
      const { fx, admin, a, b } = data
      expect({ isError: calls.context.isError, cited: cited(shown(calls.context, MARKERS.procedure.phrase)) }).toEqual({ isError: false, cited: [] })
      // `find` : les nœuds trouvés et leurs extraits, en champs et en texte ; seule la première ligne du texte répète la requête.
      const foundOf = (found: Called) => plain(`${found.text.split("\n").slice(1).join("\n")}\n${JSON.stringify(recordsAt(found, "matches"))}`)
      expect(calls.finds.map((found, index) => ({ query: FIND_QUERIES[index], isError: found.isError, cited: cited(foundOf(found)) }))).toEqual(
        FIND_QUERIES.map((query) => ({ query, isError: false, cited: [] })),
      )
      expect({ isError: calls.read.isError, text: calls.read.text.split(". ")[0] }).toEqual({ isError: true, text: `Unknown path ${MARKERS.page.path}` })
      // Première lecture en échec de la session : celle de la page de B (les lectures du journal viennent après).
      expect(onA.journal.find((line) => line.tool === `${a.prefix}_read` && line.is_error)?.error?.split(":")[0]).toBe("not_found")
      expect({ isError: calls.tableOfB.isError, error: onA.journal.find((line) => line.tool === `${a.prefix}_call` && line.is_error)?.error?.split(":")[0] }).toEqual({
        isError: true,
        error: "not_found",
      })

      // `ventes/suivi_prospects` existe dans les deux organisations : les lignes d'A seulement.
      const suiviOfA = await fx.nodeId(a.id, MARKERS.row.table)
      const rowsOfA = await admin<{ key: string }[]>`select key from platform.blocks where node_id = ${suiviOfA} and state = 'published' and type = 'row'`
      expect({ isError: calls.commonTable.isError, keys: recordsAt(calls.commonTable, "result", "rows").map((row) => String(row.key)).sort() }).toEqual({
        isError: false,
        keys: rowsOfA.map((row) => String(row.key)).sort(),
      })

      const written = await admin<{ id: string; org_id: string }[]>`select id, org_id from platform.nodes where path = ${NEW_PAGE} and org_id in ${admin([a.id, b.id])}`
      const blocks = await admin<{ org_id: string }[]>`select org_id from platform.blocks where node_id = any(${written.map((node) => node.id)}::uuid[])`
      expect({ isError: calls.write.isError, nodes: written.map((node) => node.org_id), blocks: [...new Set(blocks.map((block) => block.org_id))] }).toEqual({
        isError: false,
        nodes: [a.id],
        blocks: [a.id],
      })

      // Le ticket de c, relu par la connexion d'administration : dans A seulement, rattaché à la conversation d'A.
      const tickets = await admin`select org_id, ctx from platform.feedback where user_id = ${data.people.c.id} and org_id in ${admin([a.id, b.id])}`
      expect({ isError: calls.feedback.isError, cited: cited(shown(calls.feedback, "")), tickets: [...tickets] }).toEqual({
        isError: false,
        cited: [],
        tickets: [{ org_id: a.id, ctx: calls.context.code }],
      })

      const procedures = await admin<{ title: string }[]>`
        select title from platform.nodes where org_id = ${a.id} and kind = 'procedure' and status = 'published' order by path`
      expect(calls.prompts.map((prompt) => prompt.title)).toEqual(procedures.map((node) => node.title))
      expect(cited(plain(JSON.stringify(calls.prompts)))).toEqual([])

      // Le journal d'A : la conversation de c sur A, jamais celle de c sur B (qui existe), en liste ou par son code.
      const ofB = await admin`select id from platform.journal where org_id = ${b.id} and ctx = ${codeOnB}`
      const codesOfA = await admin<{ ctx: string }[]>`select ctx from platform.journal where org_id = ${a.id} and ctx is not null`
      const known = new Set(codesOfA.map((line) => line.ctx))
      const conversations = recordsAt(calls.journal, "conversations")
      expect({
        linesOfCOnB: ofB.length > 0,
        listed: conversations.some((conversation) => conversation.ctx === calls.context.code),
        foreign: conversations.filter((conversation) => !known.has(String(conversation.ctx))),
        codeOfB: shown(calls.journal, "").includes(plain(codeOnB)),
        conversationOfB: calls.conversationOfB.isError,
      }).toEqual({ linesOfCOnB: true, listed: true, foreign: [], codeOfB: false, conversationOfB: true })
    })

    it("should write each journal line and ctx of these calls in A, and refuse on B a ctx issued on A (AC7)", async () => {
      const { admin, a, b } = data
      const lines = await admin<{ org_id: string | null }[]>`select org_id from platform.journal where user_agent = ${agent.a}`
      expect(lines.length).toBe(AC6_LINES)
      expect([...new Set(lines.map((line) => line.org_id))]).toEqual([a.id])
      expect(await admin`select org_id from platform.ctx where code = ${calls.context.code}`).toEqual([{ org_id: a.id }])

      const onB = await connect(b, "c", `${agent.b}-ctx`)
      const refused = await onB.call("find", { ctx: calls.context.code, query: "tournées" })
      expect({ isError: refused.isError, text: refused.text, error: onB.journal.at(-1)?.error?.split(":")[0] }).toEqual({
        isError: true,
        text: `Missing or unknown ctx. Call ${b.prefix}_context first and pass its ctx code.`,
        error: "ctx_missing",
      })
    })

    it("should list the six tools of the address only, and refuse every call of a non-member (AC8)", async () => {
      const { a, b, people } = data
      const listOf = async (place: Place, who: Who) => (await (await connect(place, who, `isolation-list-${hex(3)}`)).client.listTools()).tools
      const [ofA, ofB] = [await listOf(a, "c"), await listOf(b, "c")]
      const citing = (tools: unknown, place: Place) => [place.name, `${place.prefix}_`, place.domains].filter((marker) => JSON.stringify(tools).includes(marker))
      expect({ onA: ofA.map((tool) => tool.name), onB: ofB.map((tool) => tool.name), aCitesB: citing(ofA, b), bCitesA: citing(ofB, a) }).toEqual({
        onA: TOOLS.map((tool) => `${a.prefix}_${tool}`),
        onB: TOOLS.map((tool) => `${b.prefix}_${tool}`),
        aCitesB: [],
        bCitesA: [],
      })

      const outsider = await connect(b, "a", `isolation-outsider-${hex(3)}`)
      expect(outsider.kind).toBe("not_member")
      expect((await outsider.client.listTools()).tools.map((tool) => tool.name)).toEqual(TOOLS.map((tool) => `${b.prefix}_${tool}`))
      const refusal = `You are signed in as ${people.a.email} but you are not a member of ${b.name}. Ask an administrator of ${b.name} to add you.`
      const answers = []
      for (const tool of TOOLS) answers.push(await outsider.call(tool, { ctx: "AAAA-BBBB" }))
      expect(answers.map((answer) => ({ isError: answer.isError, text: answer.text }))).toEqual(TOOLS.map(() => ({ isError: true, text: refusal })))
    })
  },
)
