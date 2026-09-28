// @vitest-environment node
// Le journal servi au modèle par `read {path: "journal"}` (E05-S05 : AC9, AC10, AC11) : textes figés
// du contrat, comparés à l'octet, sur des pages et des conversations fabriquées, sans base. La lecture
// elle-même (portée, filtres, curseurs) est jouée par `journal-read.test.ts`, la porte MCP par
// `mcp-read-journal.test.ts`.
import { describe, expect, it } from "vitest"
import type { ConversationSummary, JournalCall, JournalPage } from "../../packages/plateforme/schemas"
import { renderJournalForModel } from "../../packages/plateforme/server/journal-model"
import { MAX_RESULT_CHARS } from "../../packages/plateforme/server/tool-output"
import { identityOf } from "../helpers/reference-org"

const SERVIE: ConversationSummary = {
  ctx: "K7M2-9QXR",
  startedAt: "2026-09-23T14:02:07.000Z",
  lastAt: "2026-09-23T14:09:12.000Z",
  userId: "user-claire",
  userName: "Claire Morel",
  host: "claude-ai@0.1.0",
  context: true,
  procedurePath: "ventes/qualifier_prospects",
  request: null,
  calls: 9,
  errors: 1,
}
const DEMANDE: ConversationSummary = {
  ...SERVIE,
  ctx: "P4QR-2XYZ",
  startedAt: "2026-09-23T12:00:00.000Z",
  lastAt: "2026-09-23T12:01:30.000Z",
  userName: "Léa Roux",
  host: "openai-mcp@1.0.0",
  procedurePath: null,
  request: "combien de prospects à Valbrune",
  calls: 3,
  errors: 0,
}
// Sans appel `context` visible, d'une personne retirée, sans hôte, à cheval sur minuit UTC.
const SANS_CONTEXTE: ConversationSummary = {
  ...DEMANDE,
  ctx: "ZZZZ-0001",
  startedAt: "2026-09-22T23:58:00.000Z",
  lastAt: "2026-09-23T00:03:00.000Z",
  userId: null,
  userName: null,
  host: null,
  context: false,
  request: null,
  calls: 2,
}

function page(conversations: ConversationSummary[], extra: Partial<JournalPage> = {}): JournalPage {
  const calls = conversations.reduce((sum, conversation) => sum + conversation.calls, 0)
  const withErrors = conversations.filter((conversation) => conversation.errors > 0).length
  return { conversations, total: conversations.length, calls, withErrors, truncated: false, restarted: false, nextCursor: null, ...extra }
}

const list = (served: JournalPage, section: "today" | "week" = "today") =>
  renderJournalForModel(identityOf("ada"), { kind: "list", section, list: { page: served, rank: 0, cursorAt: (rank) => `rank-${rank}` } })

function call(rank: number, fields: Partial<JournalCall>): JournalCall {
  return { id: 100 + rank, rank, ts: "2026-09-23T14:02:07.000Z", tool: "context", target: null, teamName: null, accountLabel: null, durationMs: 180, isError: false, error: null, args: {}, ...fields }
}

describe("read journal: conversations of a period (AC9)", () => {
  it("should serve the exact list, most recent first, procedure or request, and the same data in fields", () => {
    const served = list(page([SERVIE, DEMANDE, SANS_CONTEXTE]))
    expect(served.text).toBe(
      [
        "# Journal — last 24 hours",
        "Scope: every call of Acme Test.",
        "3 conversations, 14 calls, 1 with errors. Most recent first.",
        "- K7M2-9QXR · Claire Morel · claude-ai@0.1.0 · started 2026-09-23 14:02 UTC · last 14:09 UTC · procedure ventes/qualifier_prospects · 9 calls · 1 error",
        "- P4QR-2XYZ · Léa Roux · openai-mcp@1.0.0 · started 2026-09-23 12:00 UTC · last 12:01 UTC · request « combien de prospects à Valbrune » · 3 calls · 0 errors",
        "- ZZZZ-0001 · removed person · unknown host · started 2026-09-22 23:58 UTC · last 2026-09-23 00:03 UTC · 2 calls · 0 errors",
        'Read a conversation with acme_read {"path": "journal", "section": "<code>"}.',
      ].join("\n"),
    )
    expect(served.data).toEqual({
      section: "today",
      scope: "org",
      total: 3,
      calls: 14,
      with_errors: 1,
      truncated: false,
      next_cursor: null,
      conversations: [
        {
          ctx: "K7M2-9QXR",
          person: "Claire Morel",
          host: "claude-ai@0.1.0",
          started_at: SERVIE.startedAt,
          last_at: SERVIE.lastAt,
          procedure: "ventes/qualifier_prospects",
          request: null,
          calls: 9,
          errors: 1,
        },
        expect.objectContaining({ ctx: "P4QR-2XYZ", procedure: null, request: "combien de prospects à Valbrune" }),
        expect.objectContaining({ ctx: "ZZZZ-0001", person: null, host: null }),
      ],
    })
    expect([served.nextActions, served.target, served.teamId]).toEqual([["acme_read"], "journal", null])
  })

  it("should say the scope of each caller, and serve an empty week", () => {
    const scope = (person: "lea" | "claire") =>
      renderJournalForModel(identityOf(person), { kind: "list", section: "today", list: { page: page([]), rank: 0, cursorAt: String } }).text.split("\n")[1]
    expect(scope("lea")).toBe("Scope: your own calls.")
    expect(scope("claire")).toBe("Scope: your calls and the calls of team Ventes.")
    expect(list(page([]), "week").text).toBe(["# Journal — last 7 days", "Scope: every call of Acme Test.", "No conversation in the last 7 days."].join("\n"))
  })
})

describe("read journal: one conversation (AC10)", () => {
  it("should serve the exact header and one line per call, the masked arguments of a failed call below it", () => {
    const calls = [
      call(1, { target: "ventes/qualifier_prospects" }),
      call(2, { ts: "2026-09-23T14:02:30.000Z", tool: "call", target: "table.schema", teamName: "Ventes", accountLabel: "Mail Ventes", durationMs: 1240 }),
      call(3, {
        ts: "2026-09-23T14:03:40.000Z",
        tool: "call",
        target: "table.write",
        teamName: "Ventes",
        durationMs: 120,
        isError: true,
        error: "invalid_arguments: Unknown column « statut ».",
        args: { table: "ventes/suivi_prospects", api_token: "[masked]" },
      }),
    ]
    const summary = { ...SERVIE, calls: 3 }
    const served = renderJournalForModel(identityOf("claire"), {
      kind: "conversation",
      section: "K7M2-9QXR",
      read: { detail: { summary, calls, nextCursor: null }, restarted: false, cursorAfter: String },
    })
    expect(served.text).toBe(
      [
        "# Conversation K7M2-9QXR",
        "Claire Morel · claude-ai@0.1.0 · started 2026-09-23 14:02 UTC · last 14:09 UTC · procedure ventes/qualifier_prospects · 3 calls · 1 error",
        "1. 14:02:07 context ventes/qualifier_prospects · 180 ms · OK",
        "2. 14:02:30 call table.schema · team Ventes · account Mail Ventes · 1.2 s · OK",
        "3. 14:03:40 call table.write · team Ventes · 120 ms · ERROR invalid_arguments: Unknown column « statut ».",
        '   args {"table":"ventes/suivi_prospects","api_token":"[masked]"}',
      ].join("\n"),
    )
    expect(served.data?.calls).toEqual([
      expect.objectContaining({ rank: 1, tool: "context", is_error: false }),
      expect.objectContaining({ rank: 2, team: "Ventes", account: "Mail Ventes", duration_ms: 1240 }),
      { rank: 3, at: calls[2].ts, tool: "call", target: "table.write", team: "Ventes", account: null, duration_ms: 120, is_error: true, error: calls[2].error, args: calls[2].args },
    ])
  })
})

describe("read journal: a call on another person's personal space (D44, M14)", () => {
  it("should serve its tool, time, outcome, error code and cut target, and say its arguments are not shown", () => {
    const calls = [
      call(1, { tool: "write", target: "private/lea", args: null, hidden: true }),
      call(2, { ts: "2026-09-23T14:03:40.000Z", tool: "write", isError: true, error: "stale_revision", args: null, hidden: true }),
    ]
    const served = renderJournalForModel(identityOf("ada"), {
      kind: "conversation",
      section: "LEA5-0001",
      read: { detail: { summary: { ...DEMANDE, ctx: "LEA5-0001", calls: 2, errors: 1 }, calls, nextCursor: null }, restarted: false, cursorAfter: String },
    })
    expect(served.text.split("\n").slice(2)).toEqual([
      "1. 14:02:07 write private/lea · 180 ms · OK",
      "2. 14:03:40 write · 180 ms · ERROR stale_revision",
      "   args not shown: call on another person's personal space",
    ])
    const fields = { target: null, team: null, account: null, duration_ms: 180, args: null, args_hidden: true }
    expect(served.data?.calls).toEqual([
      { ...fields, rank: 1, at: calls[0].ts, tool: "write", target: "private/lea", is_error: false, error: null },
      { ...fields, rank: 2, at: calls[1].ts, tool: "write", is_error: true, error: "stale_revision" },
    ])
  })
})

describe("read journal: past 45,000 characters (AC11, H26)", () => {
  it("should cut a conversation at a call line and say how to read the rest with its cursor", () => {
    const long = { note: "n".repeat(300), text: "t".repeat(300) }
    const calls = Array.from({ length: 200 }, (_, index) => call(index + 1, { tool: "call", target: "table.write", isError: true, error: "invalid_arguments: x", args: long }))
    const served = renderJournalForModel(identityOf("claire"), {
      kind: "conversation",
      section: "LONG-0001",
      read: { detail: { summary: { ...SERVIE, ctx: "LONG-0001", calls: 250 }, calls, nextCursor: "after-200" }, restarted: false, cursorAfter: (id) => `after-${id}` },
    })
    const lines = served.text.split("\n")
    const shown = Array.isArray(served.data?.calls) ? served.data.calls.length : 0
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThan(200)
    expect(lines.at(-1)).toBe(`Continue with acme_read {"path": "journal", "section": "LONG-0001", "cursor": "after-${100 + shown}"}.`)
    expect(served.data?.next_cursor).toBe(`after-${100 + shown}`)
    // Coupé à la ligne : l'appel servi en dernier garde sa ligne d'arguments, juste avant la consigne.
    expect(lines.at(-2)?.startsWith("   args ")).toBe(true)
    expect(JSON.stringify({ ...served.data, text: served.text, next_actions: served.nextActions }).length).toBeLessThanOrEqual(MAX_RESULT_CHARS)
  })

  it("should point a full page of conversations to the next page", () => {
    expect(list(page([SERVIE], { total: 51, nextCursor: "page-2" })).text.split("\n").at(-1)).toBe(
      'Continue with acme_read {"path": "journal", "section": "today", "cursor": "page-2"}.',
    )
  })

  it("should say a period of more than 2,000 calls is grouped on the most recent only, counts written as read writes them", () => {
    const served = list(page([{ ...SERVIE, calls: 2000 }], { truncated: true }))
    expect(served.text.split("\n").slice(2, 5)).toEqual([
      "1 conversation, 2,000 calls, 1 with errors. Most recent first.",
      "More than 2,000 calls in this period: only the most recent are grouped here.",
      "- K7M2-9QXR · Claire Morel · claude-ai@0.1.0 · started 2026-09-23 14:02 UTC · last 14:09 UTC · procedure ventes/qualifier_prospects · 2,000 calls · 1 error",
    ])
    expect(served.data?.truncated).toBe(true)
  })
})
