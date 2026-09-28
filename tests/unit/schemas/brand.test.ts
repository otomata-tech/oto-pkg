import fs from "fs"
import path from "path"
import { describe, expect, expectTypeOf, it } from "vitest"
import {
  brandInputSchema,
  OTO_THEMES,
  THEME_LABELS,
  type BrandInput,
  type Theme,
} from "@otomata_tech/oto_platform/schemas"
import type { ThemeOto } from "../../../packages/plateforme/ui/components/coquille-oto"

const VALIDE: BrandInput = { theme: "foret", logo_url: "https://example.com/logo.png", display_name: "Démo Forêt" }

/** Les messages des champs refusés, par chemin. */
function refus(input: unknown): Record<string, string> {
  const result = brandInputSchema.safeParse(input)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]))
}

describe("brandInputSchema", () => {
  it("should keep a valid brand as is", () => {
    expect(brandInputSchema.parse(VALIDE)).toEqual(VALIDE)
  })

  it("should read empty or blank fields as null, and accept null", () => {
    expect(brandInputSchema.parse({ theme: "cobalt", logo_url: "", display_name: "   " })).toEqual({
      theme: "cobalt",
      logo_url: null,
      display_name: null,
    })
    expect(brandInputSchema.parse({ theme: "cobalt", logo_url: null, display_name: null })).toEqual({
      theme: "cobalt",
      logo_url: null,
      display_name: null,
    })
  })

  it("should trim the display name and the logo address", () => {
    const parsed = brandInputSchema.parse({ ...VALIDE, logo_url: " https://example.com/l.png ", display_name: " Démo " })
    expect(parsed.logo_url).toBe("https://example.com/l.png")
    expect(parsed.display_name).toBe("Démo")
  })

  it.each(["http://example.com/logo.png", "javascript:alert(1)"])(
    "should refuse the logo %s with the https message",
    (logo) => {
      expect(refus({ ...VALIDE, logo_url: logo })).toEqual({ logo_url: "L'adresse du logo doit commencer par https://" })
    },
  )

  it("should refuse a logo address of 2 049 characters", () => {
    const logo = `https://example.com/${"a".repeat(2049 - "https://example.com/".length)}`
    expect(logo).toHaveLength(2049)
    expect(refus({ ...VALIDE, logo_url: logo })).toEqual({ logo_url: "2 048 caractères au plus." })
  })

  it("should refuse a display name of 81 characters and keep one of 80", () => {
    expect(refus({ ...VALIDE, display_name: "x".repeat(81) })).toEqual({ display_name: "80 caractères au plus." })
    expect(brandInputSchema.safeParse({ ...VALIDE, display_name: "x".repeat(80) }).success).toBe(true)
  })

  it("should refuse a theme outside the eight", () => {
    expect(Object.keys(refus({ ...VALIDE, theme: "rose" }))).toEqual(["theme"])
  })

  // E05-S11 (AC-36) : la langue de l'organisation, facultative ; `null` la retire.
  it("should take the language fr, en or null as optional, and refuse another", () => {
    expect(brandInputSchema.parse({ ...VALIDE, language: "en" })).toEqual({ ...VALIDE, language: "en" })
    expect(brandInputSchema.parse({ ...VALIDE, language: null })).toEqual({ ...VALIDE, language: null })
    expect(brandInputSchema.parse(VALIDE)).not.toHaveProperty("language")
    expect(Object.keys(refus({ ...VALIDE, language: "de" }))).toEqual(["language"])
  })

  it("should refuse a missing field and a body that is not an object", () => {
    expect(Object.keys(refus({ theme: "foret" }))).toEqual(["logo_url", "display_name"])
    expect(Object.keys(refus("foret"))).toEqual([""])
  })
})

describe("OTO_THEMES (AC2)", () => {
  it("should hold exactly the eight theme blocks of ui/styles/oto.css", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../../packages/plateforme/ui/styles/oto.css"), "utf8")
    const blocs = [...css.matchAll(/\.oto\[data-oto-theme="([a-z]+)"\]/g)].map((m) => m[1])
    expect(blocs).toHaveLength(8)
    expect([...OTO_THEMES].sort()).toEqual([...blocs].sort())
  })

  it("should name every theme with its family", () => {
    expect(Object.keys(THEME_LABELS).sort()).toEqual([...OTO_THEMES].sort())
    expect(THEME_LABELS.foret).toEqual(["Forêt", "vert"])
  })

  it("should make ThemeOto the type inferred from themeSchema", () => {
    expectTypeOf<ThemeOto>().toEqualTypeOf<Theme>()
  })
})
