// Schéma partagé d'un signalement (E03-S05) : bornes et liste fermée qu'E03-S01 sert, lues par la
// face `./schemas` comme les autres faces du paquet.
import { describe, expect, it } from "vitest"
import { feedbackInputSchema, feedbackTypeSchema } from "@otomata_tech/oto_platform/schemas"

describe("feedbackTypeSchema", () => {
  it("should accept the three types and nothing else", () => {
    for (const type of ["friction", "gap", "error"]) expect(feedbackTypeSchema.safeParse(type).success, type).toBe(true)
    for (const type of ["bogus", "Gap", ""]) expect(feedbackTypeSchema.safeParse(type).success, type).toBe(false)
  })
})

describe("feedbackInputSchema", () => {
  it("should trim the text and the target, and keep the target optional", () => {
    expect(feedbackInputSchema.parse({ type: "gap", text: "  Il manque un export.  ", target: " table.rows " })).toEqual({
      type: "gap",
      text: "Il manque un export.",
      target: "table.rows",
    })
    expect(feedbackInputSchema.parse({ type: "error", text: "x" })).toEqual({ type: "error", text: "x" })
  })

  it("should take a text of 1 to 4,000 characters, blank refused", () => {
    expect(feedbackInputSchema.safeParse({ type: "gap", text: "x".repeat(4000) }).success).toBe(true)
    for (const text of ["", "   ", "x".repeat(4001)]) {
      expect(feedbackInputSchema.safeParse({ type: "gap", text }).success, `${text.length} characters`).toBe(false)
    }
  })

  it("should take a target of 1 to 200 characters, blank refused", () => {
    expect(feedbackInputSchema.safeParse({ type: "gap", text: "x", target: "t".repeat(200) }).success).toBe(true)
    for (const target of ["", "  ", "t".repeat(201)]) {
      expect(feedbackInputSchema.safeParse({ type: "gap", text: "x", target }).success, `${target.length} characters`).toBe(false)
    }
  })

  it("should require the type and the text", () => {
    expect(feedbackInputSchema.safeParse({ text: "x" }).success).toBe(false)
    expect(feedbackInputSchema.safeParse({ type: "gap" }).success).toBe(false)
  })
})
