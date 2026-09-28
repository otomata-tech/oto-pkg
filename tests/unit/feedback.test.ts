// @vitest-environment node
// `feedback` sans base (E03-S05) : numéro de ticket par organisation (AC2), aveu du doublon (AC3),
// et ordre des champs servis après leur déplacement dans `schemas/feedback.ts` (AC7). Les textes
// sont comparés mot pour mot : ce sont ceux que lit le modèle (H04, P14). Les tickets que
// `recordFeedback` lit et écrit (E01-S07 AC24) se prouvent sur une base réelle, portable :
// `tests/integration/feedback-record.test.ts` (E01-S10, lot e2a).
import { describe, expect, it } from "vitest"
import { buildTools } from "../../packages/plateforme/mcp/tools"
import { duplicateMessage, ticketNumber } from "../../packages/plateforme/server/feedback"

const ACME = { prefix: "acme", name: "Acme Énergies", domains: "sales, customer support, energy consulting" }

const duplicate = (ticket: string, shown: number) =>
  `Ticket ${ticket} was already reported ${shown} minute(s) ago with the same text; no new ticket was created. If the problem happened again, report what changed: another call, another argument or another moment.`

describe("ticketNumber (AC2)", () => {
  it("should pad the organisation's number to four digits", () => {
    expect(ticketNumber(7)).toBe("FB-0007")
    expect(ticketNumber(42)).toBe("FB-0042")
    expect(ticketNumber(1)).toBe("FB-0001")
  })

  it("should keep every digit beyond four", () => {
    expect(ticketNumber(12_345)).toBe("FB-12345")
  })
})

describe("duplicateMessage (AC3)", () => {
  it("should say how many minutes ago the ticket was filed, rounded", () => {
    expect(duplicateMessage("FB-0042", 1)).toBe(duplicate("FB-0042", 1))
    expect(duplicateMessage("FB-0042", 3)).toBe(duplicate("FB-0042", 3))
    expect(duplicateMessage("FB-0042", 9)).toBe(duplicate("FB-0042", 9))
    expect(duplicateMessage("FB-0042", 2.6)).toBe(duplicate("FB-0042", 3))
  })

  it("should say one minute for a ticket filed 20 seconds ago", () => {
    expect(duplicateMessage("FB-0042", 20 / 60)).toBe(duplicate("FB-0042", 1))
  })
})

describe("served contract of feedback (AC7)", () => {
  const feedback = buildTools(ACME, [])[5]

  // Schéma et annotations d'E03-S01 : instantané et `ANNOTATIONS` de `mcp-tools.test.ts`. L'instantané
  // trie les clés d'un objet (pretty-format) : seul ce test voit l'ordre des propriétés servies, que
  // le déplacement des champs dans `schemas/feedback.ts` pouvait changer.
  it("should serve the properties in the order of E03-S01: ctx, type, text, target", () => {
    expect(feedback.name).toBe("acme_feedback")
    // `inputSchema` est typé `Record<string, unknown>` : sa forme vient de `z.toJSONSchema`.
    const properties = feedback.inputSchema.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(["ctx", "type", "text", "target"])
  })
})
