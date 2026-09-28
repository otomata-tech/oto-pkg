import { describe, expect, it } from "vitest"
import { journalFiltersSchema, journalSectionSchema } from "@otomata_tech/oto_platform/schemas"

// Paramètres de l'adresse `/journal` (E05-S05, AC4) et sections de `read journal` (AC9, AC11).

const CLAIRE = "0b6f1f0e-1c1a-4a8e-9a51-0d7c1a2b3c02"
const NONE = { equipe: undefined, personne: undefined, erreurs: undefined, curseur: undefined, conversation: undefined, appels: undefined }

// La lecture de chaque paramètre et son passage aux services : `tests/integration/pages/journal-page.test.tsx`.
describe("journalFiltersSchema (AC4)", () => {
  it("should fall back to the default of each unreadable value and name it", () => {
    const parsed = journalFiltersSchema.parse({ periode: "12", equipe: "ventes", personne: [CLAIRE, CLAIRE], erreurs: "oui", conversation: "k7m2" })
    expect(parsed).toEqual({ periode: 7, ...NONE, ignored: ["periode", "equipe", "personne", "erreurs", "conversation"] })
  })

  it("should read an empty value as no filter, and 7 days without a period", () => {
    expect(journalFiltersSchema.parse({ equipe: "", personne: "" })).toEqual({ periode: 7, ...NONE, ignored: [] })
  })
})

describe("journalSectionSchema (AC9, AC11)", () => {
  it("should accept today, week and a conversation code, nothing else", () => {
    for (const section of ["today", "week", "K7M2-9QXR"]) expect(journalSectionSchema.safeParse(section).success, section).toBe(true)
    for (const section of ["month", "K7M2", "journal"]) expect(journalSectionSchema.safeParse(section).success, section).toBe(false)
  })
})
