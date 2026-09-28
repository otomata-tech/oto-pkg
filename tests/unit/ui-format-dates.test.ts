import { describe, expect, it } from "vitest"
import { dateLisible } from "@otomata_tech/oto_platform/ui"
import { ilYA } from "../../packages/plateforme/ui/format/dates"

describe("dateLisible (HN-E05S03-5)", () => {
  it("should write a valid ISO date in French", () => {
    expect(dateLisible("2026-09-24T10:30:00Z")).toBe("24 septembre 2026")
  })

  it("should answer undefined for a missing or unreadable date", () => {
    expect(dateLisible(null)).toBeUndefined()
    expect(dateLisible(undefined)).toBeUndefined()
    expect(dateLisible("")).toBeUndefined()
    expect(dateLisible("pas une date")).toBeUndefined()
  })

  it("should read the day in Europe/Paris around midnight UTC", () => {
    // 23 h 30 UTC le 23 septembre : déjà le 24 à Paris (UTC+2 en été).
    expect(dateLisible("2026-09-23T23:30:00Z")).toBe("24 septembre 2026")
    // 23 h 30 UTC le 31 décembre : déjà le 1er janvier à Paris (UTC+1 en hiver) ; 22 h 30, encore le 31.
    expect(dateLisible("2026-12-31T23:30:00Z")).toBe("1 janvier 2027")
    expect(dateLisible("2026-12-31T22:30:00Z")).toBe("31 décembre 2026")
  })
})

describe("ilYA (E05-S02, AC2)", () => {
  const MAINTENANT = Date.parse("2026-09-24T12:00:00Z")
  const avant = (heures: number) => new Date(MAINTENANT - heures * 3_600_000).toISOString()

  it("should say the time elapsed on a frozen clock, yesterday up to its 36-hour border, and nothing for an unreadable date", () => {
    expect(ilYA(new Date(MAINTENANT - 20_000).toISOString(), MAINTENANT)).toBe("à l'instant")
    expect(ilYA(avant(3), MAINTENANT)).toBe("il y a 3 heures")
    // `Math.trunc` : 36 heures font un jour écoulé, jamais « avant-hier ».
    expect(ilYA(avant(36), MAINTENANT)).toBe("hier")
    expect(ilYA(avant(72), MAINTENANT)).toBe("il y a 3 jours")
    expect(ilYA("pas une date", MAINTENANT)).toBeUndefined()
    expect(ilYA(null, MAINTENANT)).toBeUndefined()
  })
})
