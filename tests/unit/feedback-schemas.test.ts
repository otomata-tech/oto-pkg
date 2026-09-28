// Les paramètres d'adresse de l'usage (AC2) et des retours (AC9), E08-S09 : une valeur absente ou
// illisible retombe sur son défaut, jamais passée brute à un service. `ticketSchema` et
// `feedbackStateChangeSchema` sont prouvés par le test d'AC11 (`usage-and-feedback.test.ts`).
import { describe, expect, it } from "vitest"
import { feedbackListQuerySchema, usageQuerySchema } from "@otomata_tech/oto_platform/schemas"

const VENTES = "0e8e5a3c-7f10-4a5b-8d3b-2b1c4d5e6f70"

describe("usageQuerySchema (AC2)", () => {
  it("should default to 30 days, fall back to 30 on an unknown window, and drop a malformed team", () => {
    expect(usageQuerySchema.parse({})).toEqual({ periode: 30, equipe: undefined })
    expect(usageQuerySchema.parse({ periode: "45", equipe: "ventes" })).toEqual({ periode: 30, equipe: undefined })
    expect(usageQuerySchema.parse({ periode: "7", equipe: VENTES })).toEqual({ periode: 7, equipe: VENTES })
    expect(usageQuerySchema.parse({ periode: ["7", "90"], equipe: "" })).toEqual({ periode: 30, equipe: undefined })
  })
})

describe("feedbackListQuerySchema (AC9)", () => {
  it("should default to the tickets to handle over 30 days, and fall back to each default on an unknown value", () => {
    expect(feedbackListQuerySchema.parse({})).toEqual({ etat: "to_handle", type: undefined, periode: 30, curseur: undefined })
    expect(feedbackListQuerySchema.parse({ etat: "archived", type: "idea", periode: "12", curseur: "" })).toEqual({
      etat: "to_handle",
      type: undefined,
      periode: 30,
      curseur: undefined,
    })
    expect(feedbackListQuerySchema.parse({ etat: "declined", type: "gap", periode: "90", curseur: "c-2" })).toEqual({
      etat: "declined",
      type: "gap",
      periode: 90,
      curseur: "c-2",
    })
  })
})
