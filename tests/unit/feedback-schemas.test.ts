// Les paramètres d'adresse de l'usage (AC2) et des retours (AC9), E08-S09 : une valeur absente ou
// illisible retombe sur son défaut, jamais passée brute à un service. `ticketSchema` et
// `feedbackStateChangeSchema` sont prouvés par le test d'AC11 (`usage-and-feedback.test.ts`).
import { describe, expect, it } from "vitest"
import { feedbackListQuerySchema, usageQuerySchema } from "@otomata_tech/oto_platform/schemas"

const VENTES = "0e8e5a3c-7f10-4a5b-8d3b-2b1c4d5e6f70"

describe("usageQuerySchema (AC2)", () => {
  it("should default to 30 days, fall back to 30 on an unknown window, and drop a malformed team", () => {
    expect(usageQuerySchema.parse({})).toEqual({ period: 30, team: undefined })
    expect(usageQuerySchema.parse({ period: "45", team: "ventes" })).toEqual({ period: 30, team: undefined })
    expect(usageQuerySchema.parse({ period: "7", team: VENTES })).toEqual({ period: 7, team: VENTES })
    expect(usageQuerySchema.parse({ period: ["7", "90"], team: "" })).toEqual({ period: 30, team: undefined })
  })

  it("should ignore the former French names like any unknown parameter (E11-S07, AC-b3)", () => {
    expect(usageQuerySchema.parse({ periode: "7", equipe: VENTES })).toEqual({ period: 30, team: undefined })
  })
})

describe("feedbackListQuerySchema (AC9)", () => {
  it("should default to the tickets to handle over 30 days, and fall back to each default on an unknown value", () => {
    expect(feedbackListQuerySchema.parse({})).toEqual({ state: "to_handle", type: undefined, period: 30, cursor: undefined })
    expect(feedbackListQuerySchema.parse({ state: "archived", type: "idea", period: "12", cursor: "" })).toEqual({
      state: "to_handle",
      type: undefined,
      period: 30,
      cursor: undefined,
    })
    expect(feedbackListQuerySchema.parse({ state: "declined", type: "gap", period: "90", cursor: "c-2" })).toEqual({
      state: "declined",
      type: "gap",
      period: 90,
      cursor: "c-2",
    })
  })

  it("should ignore the former French names like any unknown parameter (E11-S07, AC-b3)", () => {
    expect(feedbackListQuerySchema.parse({ etat: "all", periode: "7", curseur: "c-2" })).toEqual({ state: "to_handle", type: undefined, period: 30, cursor: undefined })
  })
})
