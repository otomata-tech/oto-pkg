// @vitest-environment node
// Lecture du journal (E05-S05 : AC4 à AC7) sur une base réelle (E01-S10, lot t1-e2a) : l'organisation O de
// la fixture (`seedReferenceOrg`), sans règle d'accès, et P, l'autre organisation de Léa ; chaque test écrit
// ses lignes de journal. La RLS d'isolation rend à chaque personne tout le journal de ses organisations, P
// compris pour Léa : la portée (H74) est prouvée par le service lui-même (`security-patterns.md § Droits
// dans le service`). Les outils portent le préfixe jetable de O, et un code de conversation sa valeur tirée,
// que `ref.readable` rend simulée. En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Identity } from "../../packages/plateforme/server/identity"
import { getConversation, listConversations, readConversations, type ConversationFilters } from "../../packages/plateforme/server/journal-read"
import { errorCode, errorFor, hidesContent, journalReader, targetFor } from "../../packages/plateforme/server/journal-rows"
import { ACCOUNTS, identityOf, ORG, OTHER_ORG, PEOPLE, TEAMS, teamOf, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Row } from "../helpers/simulated-db"
import { dbSpy } from "../helpers/spy-t1-c1a"
import { seedWithAdmin, sqlConfigured, type SeededData, portable } from "../helpers/sql"

const NOW = new Date("2026-09-23T15:00:00.000Z")
/** `minutes` avant `NOW`, comme la base rend un `timestamptz` (UTC, sans fraction nulle). */
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString().replace(".000Z", "+00:00")

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

let seed: SeededData
let ref: ReferenceOrgSql

type Line = { ctx: string | null; person: Person; tool: string; at: string; team?: "ventes" | "support"; target?: string; error?: boolean; org?: string; account?: string; message?: string }

/** Une ligne de `journal` telle que la porte MCP l'écrit (E03-S01) : outil préfixé, signature du host ; son id, la base le tire. */
function line(spec: Line): Row {
  return {
    ts: spec.at,
    org_id: spec.org ?? ORG.id,
    user_id: PEOPLE[spec.person].id,
    team_id: spec.team ? TEAMS[spec.team].id : null,
    account_id: spec.account ?? null,
    ctx: spec.ctx,
    method: "tools/call",
    tool: `${ref.org.prefix}_${spec.tool}`,
    target: spec.target ?? null,
    args: {},
    is_error: spec.error === true,
    error: spec.error ? (spec.message ?? "invalid_arguments: Unknown column « statut ».") : null,
    duration_ms: 120,
    host: "claude-ai@0.1.0",
    user_agent: "Claude-User",
  }
}

/** Les lignes du test, écrites dans l'ordre : la base leur tire des ids croissants, l'ordre d'écriture. */
const write = (rows: Row[]) => ref.write({ journal: rows })

/** Les conversations d'AC5 : Léa (membre de Ventes), Claire (responsable de Ventes), Paul (Support), Ada (admin). */
function scopeRows(): Row[] {
  return [
    line({ ctx: "LEA1-0001", person: "lea", tool: "context", at: minutesAgo(60), target: "ventes/qualifier_prospects" }),
    line({ ctx: "LEA1-0001", person: "lea", tool: "read", at: minutesAgo(59), target: "ventes/qualifier_prospects" }),
    line({ ctx: "LEA1-0001", person: "lea", tool: "call", at: minutesAgo(58), target: "table.write", team: "ventes", error: true }),
    line({ ctx: null, person: "lea", tool: "context", at: minutesAgo(57) }),
    line({ ctx: "CLA1-0001", person: "claire", tool: "context", at: minutesAgo(50), target: "Combien de prospects à Valbrune ?" }),
    line({ ctx: "CLA1-0001", person: "claire", tool: "call", at: minutesAgo(49), target: "table.rows", team: "ventes" }),
    line({ ctx: "PAU1-0001", person: "paul", tool: "context", at: minutesAgo(40) }),
    line({ ctx: "PAU1-0001", person: "paul", tool: "call", at: minutesAgo(39), target: "mail.create_draft", team: "support" }),
    line({ ctx: "ADA1-0001", person: "ada", tool: "context", at: minutesAgo(30) }),
    // Léa est aussi membre de P : sa conversation là-bas, que la base lui rend, ne sort jamais à l'adresse de O.
    line({ ctx: "LEAP-0001", person: "lea", tool: "context", at: minutesAgo(20), org: OTHER_ORG.id }),
  ]
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

/** La première page des conversations que `person` voit, sous son identité, ou sous `identity`. */
async function list(person: Person, filters: Partial<ConversationFilters> = {}, identity: Identity = ref.identityOf(person)) {
  return listConversations(await ref.db(person), identity, { periodDays: 7, ...filters })
}

/** Les conversations montrées et leur nombre d'appels, codes rendus simulés. */
const shown = (page: Awaited<ReturnType<typeof listConversations>>) => ref.readable(page.conversations.map((conversation) => [conversation.ctx, conversation.calls]))

describe.skipIf(!sqlConfigured)(portable("journal reading on a real database (E01-S10 t1)"), { timeout: NETWORK_TIMEOUT }, () => {
  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed, { nodes: [{ path: "ventes/qualifier_prospects", kind: "procedure", title: "Qualifier les prospects" }] })
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  // Chaque test part d'un journal vide dans O et dans P, puis écrit ses lignes.
  beforeEach(async () => {
    await seed.admin`delete from platform.journal where org_id in ${seed.admin([ref.org.id, ref.other.id])}`
  })

  describe("listConversations: scope decided by the service (AC5, H74, H123)", () => {
    it("should serve each person their scope, the other organisation never, the filter posed in the query", async () => {
      await write(scopeRows())

      // Léa : ses conversations, pas celle de P ; Claire : les siennes et les appels portés par Ventes.
      expect(shown(await list("lea"))).toEqual([["LEA1-0001", 3]])
      expect(shown(await list("claire"))).toEqual([["CLA1-0001", 2], ["LEA1-0001", 1]])
      expect(shown(await list("paul"))).toEqual([["PAU1-0001", 2]])
      expect(shown(await list("ada"))).toEqual([["ADA1-0001", 1], ["PAU1-0001", 2], ["CLA1-0001", 2], ["LEA1-0001", 3]])

      // La base rend à chacun tout le journal de ses organisations : une portée appliquée après la lecture,
      // bornée aux 2 000 appels les plus récents (AC6), perdrait ceux de Léa et de Claire derrière 2 001 appels
      // de Paul, plus récents, hors de leur portée. Posée dans la requête, elle les sert encore.
      await write(Array.from({ length: 2001 }, () => line({ ctx: "PAU9-0001", person: "paul", tool: "read", at: minutesAgo(10) })))
      expect(shown(await list("lea"))).toEqual([["LEA1-0001", 3]])
      expect(shown(await list("claire"))).toEqual([["CLA1-0001", 2], ["LEA1-0001", 1]])
    })
  })

  describe("listConversations: served procedure (AC3, HN-E05S05-4)", () => {
    it("should link the served procedure only when the caller reads it, otherwise keep the request cut at 80 characters", async () => {
      await write([
        line({ ctx: "PAU2-0001", person: "paul", tool: "context", at: minutesAgo(5), target: "ventes/qualifier_prospects" }),
        line({ ctx: "PAU3-0001", person: "paul", tool: "context", at: minutesAgo(4), target: `Relance les devis en attente ${"x".repeat(100)}` }),
        line({ ctx: "PAU4-0001", person: "paul", tool: "read", at: minutesAgo(3) }),
      ])
      type Conversations = Awaited<ReturnType<typeof listConversations>>["conversations"]
      const routing = (conversations: Conversations) =>
        ref.readable(conversations.map(({ ctx, userName, context, procedurePath, request }) => [ctx, userName, context, procedurePath, request]))
      // La demande est coupée une fois, ici, pour l'écran comme pour le modèle : 80 caractères, « … » compris.
      expect(routing((await list("ada")).conversations)).toEqual([
        ["PAU4-0001", "Paul Girard", false, null, null],
        ["PAU3-0001", "Paul Girard", true, null, `Relance les devis en attente ${"x".repeat(50)}…`],
        ["PAU2-0001", "Paul Girard", true, "ventes/qualifier_prospects", null],
      ])
      // Paul ne lit pas la procédure de Ventes : sa cible reste la demande, sans lien.
      expect(routing((await list("paul")).conversations)[2]).toEqual(["PAU2-0001", "Paul Girard", true, null, "ventes/qualifier_prospects"])
    })
  })

  describe("listConversations: filters (AC4)", () => {
    it("should follow the team, the person, errors only and the period", async () => {
      await write([...scopeRows(), line({ ctx: "OLD1-0001", person: "ada", tool: "context", at: minutesAgo(10 * 24 * 60) })])

      expect(shown(await list("ada", { teamId: ref.id(TEAMS.ventes.id) }))).toEqual([["CLA1-0001", 1], ["LEA1-0001", 1]])
      expect(shown(await list("ada", { userId: ref.people.claire.id }))).toEqual([["CLA1-0001", 2]])
      expect(shown(await list("ada", { errorsOnly: true }))).toEqual([["LEA1-0001", 3]])
      expect((await list("ada", { periodDays: 7 })).total).toBe(4)
      expect(ref.readable((await list("ada", { periodDays: 30 })).conversations.map((conversation) => conversation.ctx))).toContain("OLD1-0001")
    })
  })

  describe("listConversations: pages on a frozen window, and the 2,000-row bound (AC6)", () => {
    function conversations(count: number): Row[] {
      return Array.from({ length: count }, (_, index) =>
        line({ ctx: `C${String(index).padStart(3, "0")}-0000`, person: "lea", tool: "context", at: minutesAgo(count - index) }),
      )
    }

    it("should cut 51 conversations into two pages, neither repeated nor lost, a call arrived meanwhile left out", async () => {
      await write(conversations(51))
      const db = await ref.db("lea")
      const lea = ref.identityOf("lea")
      const first = await listConversations(db, lea, { periodDays: 7 })
      expect(first.conversations).toHaveLength(50)
      expect(first.nextCursor).not.toBeNull()

      await write([line({ ctx: "NEW1-0000", person: "lea", tool: "context", at: minutesAgo(0) })])
      const second = await listConversations(db, lea, { periodDays: 7, cursor: first.nextCursor ?? "" })

      const codes = ref.readable([...first.conversations, ...second.conversations].map((conversation) => conversation.ctx))
      expect(ref.readable(second.conversations.map((conversation) => conversation.ctx))).toEqual(["C000-0000"])
      expect(new Set(codes).size).toBe(51)
      expect(codes).not.toContain("NEW1-0000")
      expect(second).toMatchObject({ total: 51, restarted: false, nextCursor: null })
    })

    it("should restart from the top on an unreadable cursor or one of another reading", async () => {
      await write(conversations(3))
      const first = await readConversations(await ref.db("lea"), ref.identityOf("lea"), { periodDays: 7 })
      for (const cursor of ["not-a-cursor", first.cursorAt(1)]) {
        const page = await list("claire", { cursor })
        expect(page.restarted, cursor).toBe(true)
      }
      const again = await list("lea", { periodDays: 30, cursor: first.cursorAt(1) })
      expect(again.restarted).toBe(true)
    })

    it("should read 2,001 rows by pages of 1,000 and say the period holds more than 2,000 calls", async () => {
      // Au-delà de 1 000 lignes par lecture, PostgREST tronque sans erreur : sans pages, 1 000 appels au plus.
      await write(Array.from({ length: 2001 }, (_, index) => line({ ctx: "BIG1-0000", person: "lea", tool: "read", at: minutesAgo(2001 - index) })))
      expect(await list("lea")).toMatchObject({ truncated: true, total: 1, calls: 2000 })
    })
  })

  describe("getConversation (AC7)", () => {
    it("should read 1,201 calls by pages of 1,000, serve 200 of them, then the next ones after the cursor, rank included", async () => {
      // Au-delà d'une page de PostgREST (1 000 lignes par lecture) : la lecture croissante des appels reprend
      // après le dernier id lu (`supabase-patterns.md § Error Handling`).
      await write(Array.from({ length: 1201 }, (_, index) => line({ ctx: "LONG-0001", person: "lea", tool: "read", at: minutesAgo(1300 - index), target: `page_${index + 1}` })))
      const db = await ref.db("lea")
      const lea = ref.identityOf("lea")
      const code = ref.id("LONG-0001")
      const first = await getConversation(db, lea, code)
      expect(first?.calls).toHaveLength(200)
      expect(ref.readable(first?.summary)).toMatchObject({ ctx: "LONG-0001", calls: 1201, userName: "Léa Roux" })
      const second = await getConversation(db, lea, code, { cursor: first?.nextCursor ?? "" })
      expect(second?.calls.map((call) => [call.rank, call.target]).slice(0, 2)).toEqual([[201, "page_201"], [202, "page_202"]])
      expect(second?.calls).toHaveLength(200)
      expect(second?.nextCursor).not.toBeNull()
    })

    it("should give the same null for an unknown, malformed or out-of-scope code", async () => {
      await write(scopeRows())
      const db = await ref.db("lea")
      const lea = ref.identityOf("lea")
      // Celle de Claire, hors de la portée de Léa ; celle de Léa dans P, que la base lui rend.
      for (const code of ["ZZZZ-9999", "not-a-code", ref.id("CLA1-0001"), ref.id("LEAP-0001")]) {
        expect(await getConversation(db, lea, code), code).toBeNull()
      }
    })

    it("should show a call's bare tool, team, duration, error cut at 500 characters, and the label of a readable account only", async () => {
      // Une erreur écrite hors de `writeJournal` (script Démo, import) peut dépasser la borne de l'écrivain.
      const message = `invalid_arguments: ${"m".repeat(600)}`
      await write([
        line({ ctx: "CLA2-0001", person: "claire", tool: "context", at: minutesAgo(5), target: "ventes/qualifier_prospects" }),
        line({ ctx: "CLA2-0001", person: "claire", tool: "call", at: minutesAgo(4), target: "mail.send_draft", team: "ventes", error: true, account: ACCOUNTS.claire.id, message }),
      ])
      const code = ref.id("CLA2-0001")
      const claire = await getConversation(await ref.db("claire"), ref.identityOf("claire"), code)
      const ada = await getConversation(await ref.db("ada"), ref.identityOf("ada"), code)
      expect(claire?.summary).toMatchObject({ context: true, procedurePath: "ventes/qualifier_prospects", request: null, errors: 1 })
      expect(claire?.calls[1]).toMatchObject({
        rank: 2,
        tool: "call",
        target: "mail.send_draft",
        teamName: "Ventes",
        accountLabel: "Mail Claire",
        durationMs: 120,
        isError: true,
        error: `invalid_arguments: ${"m".repeat(480)}…`,
      })
      // Le compte personnel de Claire n'est pas lisible par l'administratrice (H67).
      expect(ada?.calls[1].accountLabel).toBeNull()
    })

    it("should bind every read of the list and of a conversation to the organisation of the address, the call details and the names of teams, accounts and procedures included (security, M32)", async () => {
      // Ces lectures reçoivent des identifiants déjà lus dans la portée : leur filtre d'organisation ne change
      // aucune ligne servie ici. La preuve est donc celle de chaque requête : l'organisation y est liée.
      await write([
        line({ ctx: "CLA3-0001", person: "claire", tool: "context", at: minutesAgo(3), target: "ventes/qualifier_prospects" }),
        line({ ctx: "CLA3-0001", person: "claire", tool: "call", at: minutesAgo(2), target: "mail.send_draft", team: "ventes", account: ACCOUNTS.claire.id }),
      ])
      const spy = dbSpy()
      const db = spy.wrap(await ref.db("claire"))
      const claire = ref.identityOf("claire")
      await listConversations(db, claire, { periodDays: 7 })
      const detail = await getConversation(db, claire, ref.id("CLA3-0001"))
      expect(detail?.calls[1]).toMatchObject({ teamName: "Ventes", accountLabel: "Mail Claire" })

      const named = spy.calls.filter((call) => call.tables.some((table) => ["journal", "teams", "accounts", "nodes"].includes(table)))
      expect(["journal", "teams", "accounts", "nodes"].filter((table) => !named.some((call) => call.tables.includes(table)))).toEqual([])
      expect(named.filter((call) => !JSON.stringify(call.values).includes(claire.org.id)).map((call) => call.text)).toEqual([])
    })
  })

  describe("the journal of another person's personal space (D44, M14)", () => {
    const withArgs = (spec: Line, args: unknown): Row => ({ ...line(spec), args })
    const STALE = "stale_revision: stale revision: private/lea/notes is at revision 3, not 2. Nothing was written. Current state:\n## Réunion\nMes notes privées"

    /** Une conversation de Léa : son espace, un nœud de Ventes, l'espace d'Ada, un tableau à elle, deux refus. */
    function personalRows(): Row[] {
      const at = (minutes: number) => ({ ctx: "LEA5-0001", person: "lea" as const, at: minutesAgo(minutes) })
      return [
        withArgs({ ...at(9), tool: "context", target: "private/lea/relances" }, { phrase: "Relance mes clients" }),
        withArgs({ ...at(8), tool: "write", target: "private/lea/notes" }, { path: "private/lea/notes", ops: [{ op: "append", text: "Mes notes privées" }] }),
        withArgs({ ...at(7), tool: "write", target: "ventes/devis" }, { path: "ventes/devis", ops: [{ op: "append", text: "Devis Valbrune" }] }),
        withArgs({ ...at(6), tool: "write", target: "private/ada/idees" }, { path: "private/ada/idees", ops: [{ op: "append", text: "Pour Ada" }] }),
        // Refusé avant que le service ne pose sa cible : le chemin n'est que dans les arguments, la page dans l'erreur.
        withArgs({ ...at(5), tool: "write", error: true, message: STALE }, { path: "private/lea/notes", base_revision: 2, ops: [{ op: "append", text: "Suite" }] }),
        // La cible d'un `call` est sa fonction : le tableau lu n'est que dans ses arguments.
        withArgs({ ...at(4), tool: "call", target: "table.rows" }, { function: "table.rows", arguments: { table: "private/lea/budget", q: "loyer" } }),
        // Plus de 2 ko d'arguments, stockés tronqués par l'écrivain : le chemin est dans le texte coupé ; un code à chiffre (H04).
        withArgs(
          { ...at(3), tool: "write", error: true, message: "unavailable_in_v1: Creating tables is not available yet in this version." },
          { _truncated: true, head: '{"ctx":"LEA5-0001","kind":"table","ops":[{"op":"append","text":"Cher journal"}],"path":"private/lea/journal' },
        ),
      ]
    }

    type Detail = Awaited<ReturnType<typeof getConversation>>
    const seen = (detail: Detail) => detail?.calls.map(({ tool, target, args, error, hidden }) => ({ tool, target, args, error, hidden }))

    it("should serve anyone but the author only the tool, time, outcome, error code and target cut to private/<handle>, the reader's own space and a team node whole", async () => {
      const rows = personalRows()
      await write(rows)
      const code = ref.id("LEA5-0001")
      const ada = await getConversation(await ref.db("ada"), ref.identityOf("ada"), code)
      const [, , devis, idees] = rows
      const forAda = [
        { tool: "context", target: "private/lea", args: null, error: null, hidden: true },
        { tool: "write", target: "private/lea", args: null, error: null, hidden: true },
        { tool: "write", target: "ventes/devis", args: devis.args, error: null },
        { tool: "write", target: "private/ada/idees", args: idees.args, error: null },
        { tool: "write", target: null, args: null, error: "stale_revision", hidden: true },
        { tool: "call", target: "table.rows", args: null, error: null, hidden: true },
        { tool: "write", target: null, args: null, error: "unavailable_in_v1", hidden: true },
      ]
      expect(seen(ada)).toEqual(forAda)
      // La demande coupée elle aussi, au détail comme à la liste (écran et `read journal`).
      expect(ada?.summary).toMatchObject({ procedurePath: null, request: "private/lea" })
      expect(ref.readable((await list("ada")).conversations[0])).toMatchObject({ ctx: "LEA5-0001", request: "private/lea" })
      // Un chemin personnel en clé d'argument compte comme en valeur.
      expect(hidesContent(journalReader(identityOf("ada")), { user_id: PEOPLE.lea.id, target: "table.rows" }, { arguments: { "private/lea/budget": { q: "loyer" } } })).toBe(true)

      // Sam, de l'équipe plateforme, non membre, sans espace personnel (H73) : tout espace personnel lui est celui d'autrui.
      const staff = await getConversation(await ref.db("s"), ref.identityOf("s"), code)
      expect(seen(staff)).toEqual(forAda.with(3, { tool: "write", target: "private/ada", args: null, error: null, hidden: true }))

      // Léa, l'autrice, lit ses lignes entières.
      const lea = await getConversation(await ref.db("lea"), ref.identityOf("lea"), code)
      expect(seen(lea)).toEqual(rows.map((row) => ({ tool: String(row.tool).replace(`${ref.org.prefix}_`, ""), target: row.target, args: row.args, error: row.error })))
      expect(lea?.summary.request).toBe("private/lea/relances")
    })

    it("should cut to private/<handle> each path under another person's space that an error names, for anyone but the author, the reader's own space whole (D52, M14b)", async () => {
      // Un appel sur un tableau de Ventes : ni sa cible ni ses arguments ne visent un espace personnel, son
      // refus nomme le tableau de Léa et celui que Marc lui partage (N35).
      const listed = "not_found: Unknown table ventes/suivi. Tables you can read: private/lea/budget, private/marc/budget, ventes/prospects."
      // `private` plus bas dans un chemin n'est pas un espace personnel.
      const plain = "not_found: Unknown table ventes/private/marc/suivi. Tables you can read: ventes/prospects."
      const failed = (minutes: number, message: string) =>
        withArgs(
          { ctx: "LEA6-0001", person: "lea", tool: "call", at: minutesAgo(minutes), target: "table.rows", team: "ventes", error: true, message },
          { function: "table.rows", arguments: { table: "ventes/suivi" } },
        )
      await write([failed(5, listed), failed(4, plain)])
      const errors = async (person: Person, reader: Identity = ref.identityOf(person)) =>
        (await getConversation(await ref.db(person), reader, ref.id("LEA6-0001")))?.calls.map((call) => call.error)

      expect(await errors("ada")).toEqual(["not_found: Unknown table ventes/suivi. Tables you can read: private/lea, private/marc, ventes/prospects.", plain])
      // Marc, s'il menait Ventes, lirait son propre espace entier, celui de Léa coupé.
      const marc = ref.identityOf("marc", { teams: [{ ...teamOf("ventes", "marc"), role: "lead" }] })
      expect(await errors("marc", marc)).toEqual(["not_found: Unknown table ventes/suivi. Tables you can read: private/lea, private/marc/budget, ventes/prospects.", plain])
      // Léa, l'autrice, lit ses messages entiers.
      expect(await errors("lea")).toEqual([listed, plain])
    })
  })
})

describe("the journal of another person's personal space (D44, M14)", () => {
  it("should decide in linear time on hostile texts far larger than the 2,048 characters the writer keeps (security)", () => {
    const n = 40_000
    const reader = journalReader(identityOf("ada"))
    const lea = { user_id: PEOPLE.lea.id, target: null }
    const within = (what: string, run: () => unknown) => {
      const started = performance.now()
      run()
      expect(performance.now() - started, what).toBeLessThan(250)
    }
    within("quoted paths in a cut text", () => hidesContent(reader, lea, { _truncated: true, head: '"private/'.repeat(n / 7) }))
    within("spaces before a path", () => hidesContent(reader, lea, { path: `${" ".repeat(n)}private/lea` }))
    within("a handle without end", () => hidesContent(reader, lea, [`private/${"a".repeat(n)}`]))
    within("a target", () => targetFor(reader, PEOPLE.lea.id, `${" ".repeat(n)}private/${"a".repeat(n)}`))
    within("an error without code", () => errorCode("a".repeat(n)))
    within("personal paths in an error", () => errorFor(reader, PEOPLE.lea.id, " private/a/b".repeat(n / 10)))
    within("personal paths glued in one word of an error", () => errorFor(reader, PEOPLE.lea.id, "«private/a/b".repeat(n / 10)))
    within("punctuation after a personal path in an error", () => errorFor(reader, PEOPLE.lea.id, `private/a/b${",".repeat(n)}`))
    within("old personal paths in an error", () => errorFor(reader, PEOPLE.lea.id, " perso/a/b".repeat(n / 10)))
    within("the first letter of both folders in an error", () => errorFor(reader, PEOPLE.lea.id, "p".repeat(n)))
    within("both folders in an error", () => errorFor(reader, PEOPLE.lea.id, "perso/a/b private/a/b ".repeat(n / 22)))
    within("old quoted paths in a cut text", () => hidesContent(reader, lea, { _truncated: true, head: '"perso/'.repeat(n / 7) }))
  })

  it("should cut a line that names the old folder, written before D107 or by a caller using the alias, to perso/<handle> as it cuts private/<handle>", () => {
    const ada = journalReader(identityOf("ada"))
    const byLea = { user_id: PEOPLE.lea.id, target: null }
    expect(targetFor(ada, PEOPLE.lea.id, "perso/lea/notes")).toBe("perso/lea")
    expect(targetFor(ada, PEOPLE.lea.id, "perso/ada/idees")).toBe("perso/ada/idees")
    expect(hidesContent(ada, byLea, { path: "perso/lea/notes" })).toBe(true)
    expect(hidesContent(ada, byLea, { _truncated: true, head: '{"kind":"page","path":"perso/lea/journal' })).toBe(true)
    expect(hidesContent(ada, byLea, { path: "perso/ada/idees" })).toBe(false)
    expect(errorFor(ada, PEOPLE.lea.id, "not_found: private/lea/a, perso/marc/b, perso/ada/c, ventes/perso/d.")).toBe(
      "not_found: private/lea, perso/marc, perso/ada/c, ventes/perso/d.",
    )
  })
})
