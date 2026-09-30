// @vitest-environment node
// Code `ctx` (E03-S01, AC10 et AC11, H27), sans base : format de Crockford, textes exacts servis au
// modèle, et garde qui refuse un code mal formé avant la base. Émission, garde et borne des nouveautés
// sur une vraie base : `tests/integration/server-ctx.test.ts` (E01-S10, partie e1a).
import { describe, expect, it } from "vitest"
import { CTX_PATTERN } from "../../packages/plateforme/schemas"
import { changedCtxMessage, CTX_ALPHABET, missingCtxMessage, newCtxCode, requireCtx, staleCtxMessage } from "../../packages/plateforme/server/ctx"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import type { Identity } from "../../packages/plateforme/server/identity"

const IDENTITY: Identity = {
  org: { id: "org-1", slug: "acme", name: "Acme Énergies", prefix: "acme", brand: {}, domains: null },
  user: { id: "user-1", email: "claire@example.test", name: "Claire Morel" },
  member: { role: "member", profile: {} },
  teams: [],
  isStaff: false,
  viaGrant: false,
  hasOpenGrant: false,
}

// Toute lecture en base lève : ce qui passe ici ne l'a pas touchée. Un Proxy vide n'a pas le type du
// client : l'assertion le fait passer pour lui.
const untouchable = new Proxy(
  {},
  {
    get() {
      throw new Error("database touched")
    },
  },
) as unknown as PlatformDb

describe("newCtxCode (AC10)", () => {
  it("should generate 1,000 codes in Crockford's alphabet, matching CTX_PATTERN", () => {
    const crockford = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/
    for (let i = 0; i < 1000; i += 1) {
      const code = newCtxCode()
      expect(code).toMatch(crockford)
      expect(code).toMatch(CTX_PATTERN)
    }
    expect(CTX_ALPHABET).toHaveLength(32)
  })
})

describe("messages (H27)", () => {
  it("should say exactly what to do when the ctx is missing or stale", () => {
    expect(missingCtxMessage("acme")).toBe("Missing or unknown ctx. Call acme_context first and pass its ctx code.")
    expect(staleCtxMessage("acme")).toBe(
      "context has changed: call acme_context again with the same request, then retry this call.",
    )
  })

  // E11-S03, AC-a5 : les Contextes changés, dans l'ordre des parties, bornés comme toute liste d'un refus.
  it("should name the changed Contextes, bounded to 20", () => {
    expect(staleCtxMessage("acme", ["contexte", "ventes/contexte"])).toBe(
      "context has changed (contexte, ventes/contexte): call acme_context again with the same request, then retry this call.",
    )
    const many = Array.from({ length: 22 }, (_, index) => `equipe${index}/contexte`)
    expect(staleCtxMessage("acme", many)).toContain(", equipe19/contexte, … and 2 more): call acme_context again")
  })

  // E11-S19 (AC-b1) : le refus porte le nouveau code, la consigne de rejouer avec lui, puis les Contextes changés.
  it("should give the new ctx, the instruction to retry with it, then the changed contexts", () => {
    expect(changedCtxMessage("acme", ["ventes/contexte"], "7K3Q-M2XA", "## Context: team Ventes (ventes/contexte)\nTutoie.")).toBe(
      "context has changed (ventes/contexte). New ctx: 7K3Q-M2XA: retry this call with it, and pass it to every acme_ tool from now on. The changed contexts, as served now:\n\n## Context: team Ventes (ventes/contexte)\nTutoie.",
    )
  })
})

describe("requireCtx (AC11)", () => {
  it("should refuse a missing, non-string or malformed code before the database", async () => {
    for (const raw of [undefined, 42, "", "ZZZZ", "X".repeat(100_000)]) {
      await expect(requireCtx(untouchable, IDENTITY, raw)).rejects.toMatchObject({ code: "ctx_missing", message: missingCtxMessage("acme") })
      // `feedback` (E11-S03, AC-a6) : un code périmé passe, un code absent jamais.
      await expect(requireCtx(untouchable, IDENTITY, raw, { staleAllowed: true })).rejects.toMatchObject({ code: "ctx_missing" })
    }
  })
})
