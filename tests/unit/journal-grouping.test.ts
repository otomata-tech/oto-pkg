// @vitest-environment node
// Regroupement des lignes du journal en conversations (E05-S05, AC3) : fonction pure, sans base.
import { describe, expect, it } from "vitest"
import { groupConversations, type JournalRow } from "../../packages/plateforme/server/journal-rows"

function row(fields: Partial<JournalRow> & Pick<JournalRow, "id" | "ts">): JournalRow {
  return { user_id: "user-1", team_id: null, ctx: "AAAA-0001", tool: "acme_read", target: null, is_error: false, host: null, user_agent: null, ...fields }
}

describe("groupConversations (AC3)", () => {
  it("should group by ctx, the most recent last call first, with start, host, context target, calls and errors, rows without ctx left out", () => {
    const rows = [
      row({ id: 1, ts: "2026-09-23T14:02:00.000Z", ctx: "K7M2-9QXR", tool: "acme_context", target: "ventes/qualifier_prospects", user_agent: "Claude-User" }),
      // K7M2 commence avant P4QR mais finit après : seul le tri par dernier appel la met en tête.
      row({ id: 2, ts: "2026-09-23T14:12:00.000Z", ctx: "K7M2-9QXR", tool: "acme_call", target: "table.write", is_error: true, host: "claude-ai@0.1.0" }),
      // La forme nue du nom d'outil est lue aussi (HN-E05S05-6).
      row({ id: 3, ts: "2026-09-23T14:10:00.000Z", ctx: "P4QR-2XYZ", user_id: "user-2", tool: "context", target: "Combien de prospects ?" }),
      row({ id: 4, ts: "2026-09-23T14:11:00.000Z", ctx: null, tool: "acme_context" }),
      row({ id: 5, ts: "2026-09-23T14:01:00.000Z", ctx: "ZZZZ-0001", user_agent: "openai-mcp/1.0.0" }),
    ]
    expect(groupConversations(rows, "acme")).toEqual([
      {
        ctx: "K7M2-9QXR",
        startedAt: "2026-09-23T14:02:00.000Z",
        lastAt: "2026-09-23T14:12:00.000Z",
        userId: "user-1",
        host: "claude-ai@0.1.0",
        contextTarget: "ventes/qualifier_prospects",
        calls: 2,
        errors: 1,
      },
      {
        ctx: "P4QR-2XYZ",
        startedAt: "2026-09-23T14:10:00.000Z",
        lastAt: "2026-09-23T14:10:00.000Z",
        userId: "user-2",
        host: null,
        contextTarget: "Combien de prospects ?",
        calls: 1,
        errors: 0,
      },
      {
        ctx: "ZZZZ-0001",
        startedAt: "2026-09-23T14:01:00.000Z",
        lastAt: "2026-09-23T14:01:00.000Z",
        userId: "user-1",
        host: "openai-mcp/1.0.0",
        contextTarget: undefined,
        calls: 1,
        errors: 0,
      },
    ])
  })
})
