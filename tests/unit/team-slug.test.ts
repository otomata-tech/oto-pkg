// @vitest-environment node
import { describe, expect, it } from "vitest"
import { teamSlug } from "@otomata_tech/oto_platform/server"

describe("teamSlug (HN-E05S03-8)", () => {
  it("should drop the accents, lower-case and join the words with _", () => {
    expect(teamSlug("Équipe Ventes Île-de-France")).toBe("equipe_ventes_ile_de_france")
  })

  it("should stay within [a-z0-9_], without _ at either end", () => {
    const slug = teamSlug("  Conseil & Stratégie (2026) ! ")
    expect(slug).toBe("conseil_strategie_2026")
    expect(slug).toMatch(/^[a-z0-9_]{1,40}$/)
  })

  it("should write the ligatures out", () => {
    expect(teamSlug("Cœur de métier")).toBe("coeur_de_metier")
  })

  it("should keep 40 characters at most, without a trailing _", () => {
    const slug = teamSlug(`${"a".repeat(39)} b`)
    expect(slug).toBe("a".repeat(39))
    expect(teamSlug("x".repeat(80))).toHaveLength(40)
  })

  it("should fall back to equipe for a name without letter nor digit", () => {
    expect(teamSlug("—")).toBe("equipe")
  })
})
