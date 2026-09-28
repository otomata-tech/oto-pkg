import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPlatformDb, PlatformError, resolveIdentity } from "@otomata_tech/oto_platform/server"
import { getPlatformIdentity, getPlatformIdentitySafely } from "@/lib/plateforme/session"

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth })),
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "acme.test" })),
}))

// Le paquet est simulé à sa frontière : seule la résolution de l'identité est pilotée.
vi.mock("@otomata_tech/oto_platform/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/server")>()),
  createPlatformDb: vi.fn(() => ({})),
  resolveIdentity: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  auth.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "claire@acme.test" } }, error: null })
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "session-token" } }, error: null })
})

describe("getPlatformIdentitySafely", () => {
  it("should answer null and log the context when the identity cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(resolveIdentity).mockRejectedValue(new PlatformError("internal", "Internal error."))

    expect(await getPlatformIdentitySafely("(dashboard) layout")).toBeNull()
    expect(log).toHaveBeenCalledWith("(dashboard) layout : résolution de l'identité impossible", expect.any(PlatformError))
  })

  it("should pass a refusal through as a result", async () => {
    vi.mocked(resolveIdentity).mockRejectedValue(new PlatformError("not_member", "Not a member."))

    expect(await getPlatformIdentitySafely("(dashboard) layout")).toEqual({ error: { code: "not_member" } })
  })

  it("should answer unauthenticated without a verified user", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    expect(await getPlatformIdentitySafely("(dashboard) layout")).toEqual({ error: { code: "unauthenticated" } })
    expect(resolveIdentity).not.toHaveBeenCalled()
  })
})

describe("getPlatformSession", () => {
  it("should give the package client the caller verified by getUser, never the account of the cookie session (E01-S10)", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "claire@acme.test", user_metadata: { full_name: "Claire Morel" } } },
      error: null,
    })
    // Le compte que porte la session lue dans les cookies : `getSession()` ne le vérifie pas.
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token", user: { id: "user-2", email: "autre@acme.test", user_metadata: { full_name: "Autre" } } } },
      error: null,
    })

    await getPlatformIdentity()

    expect(createPlatformDb).toHaveBeenCalledWith({
      caller: { userId: "user-1", email: "claire@acme.test", name: "Claire Morel" },
    })
  })
})
