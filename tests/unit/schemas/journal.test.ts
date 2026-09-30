import { describe, expect, it } from "vitest"
import { journalFiltersSchema, journalSectionSchema } from "@otomata_tech/oto_platform/schemas"

// Paramètres de l'adresse `/journal` (E05-S05, AC4) et sections de `read journal` (AC9, AC11).

const CLAIRE = "0b6f1f0e-1c1a-4a8e-9a51-0d7c1a2b3c02"
const NONE = { team: undefined, person: undefined, errors: undefined, cursor: undefined, conversation: undefined, calls: undefined }

// La lecture de chaque paramètre et son passage aux services : `tests/integration/pages/journal-page.test.tsx`.
describe("journalFiltersSchema (AC4)", () => {
  it("should fall back to the default of each unreadable value and name it", () => {
    const parsed = journalFiltersSchema.parse({ period: "12", team: "ventes", person: [CLAIRE, CLAIRE], errors: "oui", conversation: "k7m2" })
    expect(parsed).toEqual({ period: 7, ...NONE, ignored: ["period", "team", "person", "errors", "conversation"] })
  })

  it("should read an empty value as no filter, and 7 days without a period", () => {
    expect(journalFiltersSchema.parse({ team: "", person: "" })).toEqual({ period: 7, ...NONE, ignored: [] })
  })

  it("should ignore the former French names like any unknown parameter, without naming them (E11-S07, AC-b3)", () => {
    expect(journalFiltersSchema.parse({ periode: "30", personne: CLAIRE, erreurs: "1", curseur: "c-2", appels: "a-2" })).toEqual({ period: 7, ...NONE, ignored: [] })
  })
})

describe("journalSectionSchema (AC9, AC11)", () => {
  it("should accept today, week and a conversation code, nothing else", () => {
    for (const section of ["today", "week", "K7M2-9QXR"]) expect(journalSectionSchema.safeParse(section).success, section).toBe(true)
    for (const section of ["month", "K7M2", "journal"]) expect(journalSectionSchema.safeParse(section).success, section).toBe(false)
  })
})
