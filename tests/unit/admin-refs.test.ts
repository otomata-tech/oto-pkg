// @vitest-environment node
// Références plates du MCP admin (E08-S06, N1) : un schéma par forme, ses formes valides lues, ses
// formes refusées avec leur seul message (le refus exact d'AC4, AC6 et AC11), l'email en minuscules ;
// un texte hostile de la taille d'un appel lu en temps linéaire (`security-patterns.md § Validation des inputs`).
import { describe, expect, it } from "vitest"
import { MAX_ARGS_CHARS } from "../../packages/plateforme/mcp/server"
import { accountOwnerRefSchema, ownerRefSchema, subjectRefSchema } from "../../packages/plateforme/schemas"
import { TEMPS_LINEAIRE_MS } from "../helpers/temps-lineaire"

const OWNER = "owner must be team:<slug>, user:<email>, org or inherit"
const ACCOUNT_OWNER = "owner must be org or team:<slug>: a personal account is created by its owner, not by the platform team"
const SUBJECT = "subject must be team:<slug> or user:<email>"

/** Le message d'un refus, ou `null` pour une forme lue. */
function refusal(schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, value: unknown) {
  const parsed = schema.safeParse(value)
  return parsed.success ? null : parsed.error?.issues[0]?.message
}

describe("ownerRefSchema", () => {
  it("should read org, inherit, a team slug and a lowercased email, and refuse any other form", () => {
    expect(ownerRefSchema.parse("org")).toEqual({ kind: "org" })
    expect(ownerRefSchema.parse(" inherit ")).toEqual({ kind: "inherit" })
    expect(ownerRefSchema.parse("team:ventes")).toEqual({ kind: "team", slug: "ventes" })
    expect(ownerRefSchema.parse("user:Claire.Morel@Acme.test")).toEqual({ kind: "user", email: "claire.morel@acme.test" })
    for (const value of ["team:", "user:claire", "Team:ventes", "group:x", "", 12, `user:${"a".repeat(300)}@x.y`]) expect(refusal(ownerRefSchema, value), String(value)).toBe(OWNER)
  })
})

describe("accountOwnerRefSchema", () => {
  it("should read org and a team slug, and refuse a person and inherit as the owner of an account", () => {
    expect(accountOwnerRefSchema.parse("org")).toEqual({ kind: "org" })
    expect(accountOwnerRefSchema.parse("team:support")).toEqual({ kind: "team", slug: "support" })
    for (const value of ["user:claire.morel@acme.test", "inherit", "team:"]) expect(refusal(accountOwnerRefSchema, value), value).toBe(ACCOUNT_OWNER)
  })
})

describe("subjectRefSchema", () => {
  it("should read a team slug and a lowercased email, and refuse org and inherit as a rule subject", () => {
    expect(subjectRefSchema.parse("team:conseil")).toEqual({ kind: "team", slug: "conseil" })
    expect(subjectRefSchema.parse("user:MARC.PETIT@ACME.TEST")).toEqual({ kind: "user", email: "marc.petit@acme.test" })
    for (const value of ["org", "inherit", "team:", "user:marc"]) expect(refusal(subjectRefSchema, value), value).toBe(SUBJECT)
  })
})

describe("references as client text (security-patterns.md § Validation des inputs)", () => {
  it("should refuse hostile references of the largest size a call carries in linear time", () => {
    // `user:.+@.+` lisait ces textes en temps quadratique (revue 1 : 1 s à 64 000 caractères, des minutes à la taille d'un appel).
    const size = MAX_ARGS_CHARS
    const hostile: [string, string][] = [
      ["at signs, then a line break", `user:${"@".repeat(size - 7)}\nx`],
      ["a@ pairs, then a line break", `user:${"a@".repeat(Math.floor((size - 7) / 2))}\nx`],
      ["a long slug", `team:${"a".repeat(size - 6)}!`],
    ]
    const schemas: [string, typeof ownerRefSchema | typeof subjectRefSchema | typeof accountOwnerRefSchema, string][] = [
      ["owner", ownerRefSchema, OWNER],
      ["subject", subjectRefSchema, SUBJECT],
      ["account owner", accountOwnerRefSchema, ACCOUNT_OWNER],
    ]
    for (const [name, schema, message] of schemas) {
      for (const [what, value] of hostile) {
        const started = performance.now()
        expect(refusal(schema, value), `${name}, ${what}`).toBe(message)
        expect(performance.now() - started, `${name}, ${what}`).toBeLessThan(TEMPS_LINEAIRE_MS)
      }
    }
  })
})
