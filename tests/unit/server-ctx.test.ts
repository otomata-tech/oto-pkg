// @vitest-environment node
// Code `ctx` (E03-S01, AC10 et AC11, H27), sans base : format de Crockford, textes exacts servis au
// modèle, et garde qui refuse un code mal formé avant la base. Émission, garde et borne des nouveautés
// sur une vraie base : `tests/integration/server-ctx.test.ts` (E01-S10, partie e1a).
import { describe, expect, it } from "vitest"
import { CTX_PATTERN } from "../../packages/plateforme/schemas"
import { CTX_ALPHABET, missingCtxMessage, newCtxCode, requireCtx, staleCtxMessage } from "../../packages/plateforme/server/ctx"
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
})

describe("requireCtx (AC11)", () => {
  it("should refuse a missing, non-string or malformed code before the database", async () => {
    for (const raw of [undefined, 42, "", "ZZZZ", "X".repeat(100_000)]) {
      await expect(requireCtx(untouchable, IDENTITY, raw)).rejects.toMatchObject({ code: "ctx_missing", message: missingCtxMessage("acme") })
    }
  })
})
