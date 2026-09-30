import { randomUUID } from "crypto"
import { describe, expect, it } from "vitest"
import {
  createTeamSchema,
  equipesListesSchema,
  equipesSearchSchema,
  teamMemberSchema,
  teamRoleSchema,
  updateMemberSchema,
  updateTeamSchema,
} from "@otomata_tech/oto_platform/schemas"

describe("createTeamSchema (AC11)", () => {
  it("should trim the name", () => {
    expect(createTeamSchema.parse({ name: "  Conseil " }).name).toBe("Conseil")
  })

  it("should refuse an empty name, spaces only included", () => {
    expect(createTeamSchema.safeParse({ name: "" }).success).toBe(false)
    expect(createTeamSchema.safeParse({ name: "   " }).success).toBe(false)
  })

  it("should accept 60 characters and refuse 61", () => {
    expect(createTeamSchema.safeParse({ name: "x".repeat(60) }).success).toBe(true)
    expect(createTeamSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false)
  })
})

describe("updateTeamSchema (AC12)", () => {
  it("should refuse an empty object", () => {
    expect(updateTeamSchema.safeParse({}).success).toBe(false)
  })

  it("should accept a null lead, « Sans responsable »", () => {
    expect(updateTeamSchema.parse({ leadUserId: null })).toEqual({ leadUserId: null })
  })

  it("should accept a new name and a lead together, and refuse a lead that is not a UUID", () => {
    const leadUserId = randomUUID()
    expect(updateTeamSchema.parse({ name: " Ventes Nord ", leadUserId })).toEqual({ name: "Ventes Nord", leadUserId })
    expect(updateTeamSchema.safeParse({ leadUserId: "claire" }).success).toBe(false)
  })

  it("should no longer carry team rules (P39)", () => {
    expect(updateTeamSchema.safeParse({ rules: "Toujours vouvoyer." }).success).toBe(false)
  })
})

describe("teamMemberSchema (AC13)", () => {
  it("should accept a UUID and refuse anything else", () => {
    expect(teamMemberSchema.safeParse({ userId: randomUUID() }).success).toBe(true)
    expect(teamMemberSchema.safeParse({ userId: "lea" }).success).toBe(false)
  })
})

describe("updateMemberSchema (AC7 ; E05-S13, fiche D128)", () => {
  it("should accept admin and member, and no longer a default team", () => {
    expect(updateMemberSchema.parse({ role: "admin" })).toEqual({ role: "admin" })
    expect(updateMemberSchema.safeParse({ defaultTeamId: null }).success).toBe(false)
  })

  it("should refuse an empty object", () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false)
  })
})

describe("teamRoleSchema (E05-S13, AC-24)", () => {
  it("should accept lead and member, and nothing else", () => {
    expect(teamRoleSchema.parse({ role: "lead" })).toEqual({ role: "lead" })
    expect(teamRoleSchema.parse({ role: "member" })).toEqual({ role: "member" })
    for (const body of [{}, { role: "admin" }, { role: null }]) expect(teamRoleSchema.safeParse(body).success).toBe(false)
  })
})

describe("equipesSearchSchema (AC1 ; E05-S13, AC-5 ; E11-S07, AC-b2)", () => {
  it("should read the two tabs", () => {
    for (const tab of ["members", "teams"]) {
      expect(equipesSearchSchema.parse({ tab }).tab).toBe(tab)
    }
  })

  it("should fall back to members for an unknown, removed, missing, repeated or former French tab", () => {
    expect(equipesSearchSchema.parse({ tab: "reglages" }).tab).toBe("members")
    expect(equipesSearchSchema.parse({ tab: "rules" }).tab).toBe("members")
    expect(equipesSearchSchema.parse({ tab: "equipes" }).tab).toBe("members")
    expect(equipesSearchSchema.parse({}).tab).toBe("members")
    expect(equipesSearchSchema.parse({ tab: ["teams", "members"] }).tab).toBe("members")
    expect(equipesSearchSchema.parse({ onglet: "teams" }).tab).toBe("members")
  })
})

describe("equipesListesSchema (E05-S09 d1 ; E11-S07, AC-b2)", () => {
  it("should read filter, sort and order under their English names, and ignore the former French ones", () => {
    expect(equipesListesSchema.parse({ q: "a", filter: "invitations", sort: "people", order: "desc" })).toEqual({ q: "a", filter: "invitations", sort: "people", order: "desc" })
    expect(equipesListesSchema.parse({ filtre: "invitations", tri: "personnes", sens: "desc" })).toEqual({ q: "", filter: undefined, sort: undefined, order: "asc" })
  })
})
