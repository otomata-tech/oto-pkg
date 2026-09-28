// @vitest-environment node
// Schémas du MCP admin (E08-S02) : l'adresse, le slug et le préfixe à leurs bornes, qui sont celles des
// checks de la base (`org_domains.host`, `create_org`, `orgs.prefix`), et un réglage vide refusé (AC17).
import { describe, expect, it } from "vitest"
import { hostSchema, orgSlugSchema, orgUpdateSchema } from "@otomata_tech/oto_platform/schemas"
// Interne au paquet : la face `./schemas` n'en sort que `orgCreateSchema`, qui le compose.
import { toolPrefixSchema } from "../../packages/plateforme/schemas/admin"

describe("hostSchema (H10)", () => {
  it("should lower-case and trim an address, accept localhost, and refuse a scheme, a port or a path", () => {
    expect(hostSchema.parse("  App.Acme.COM ")).toBe("app.acme.com")
    expect(hostSchema.parse("localhost")).toBe("localhost")
    for (const refused of ["https://app.acme.com", "app.acme.com:3000", "app.acme.com/mcp", "-acme.com", ""]) {
      expect(hostSchema.safeParse(refused).success, refused).toBe(false)
    }
  })
})

describe("orgSlugSchema and toolPrefixSchema (N18, ADR-002 § 3)", () => {
  it("should accept a slug of 2 to 40 DNS characters and a prefix of 2 to 12, starting with a letter", () => {
    for (const slug of ["ab", "acme-2", "a".repeat(40)]) expect(orgSlugSchema.safeParse(slug).success, slug).toBe(true)
    for (const slug of ["a", "a".repeat(41), "-acme", "acme-", "Acme", "acme_2"]) expect(orgSlugSchema.safeParse(slug).success, slug).toBe(false)
    for (const prefix of ["ab", "acme2", "a".repeat(12)]) expect(toolPrefixSchema.safeParse(prefix).success, prefix).toBe(true)
    for (const prefix of ["a", "a".repeat(13), "2acme", "acme-2"]) expect(toolPrefixSchema.safeParse(prefix).success, prefix).toBe(false)
  })
})

describe("orgUpdateSchema (AC17)", () => {
  it("should refuse an update without any setting, naming the settings", () => {
    const parsed = orgUpdateSchema.safeParse({ org: "acme" })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      "Nothing to update: pass at least one of name, domains, display_name, theme, logo_url, routing_threshold, routing_gap.",
    ])
    expect(orgUpdateSchema.safeParse({ org: "acme", display_name: "" }).data?.display_name).toBeNull()
  })
})
