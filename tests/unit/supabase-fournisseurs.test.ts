// @vitest-environment node
// Fournisseurs activés sur le projet (E09-S03, AC1) : `GET /auth/v1/settings` simulé ; l'URL et la
// clé publique sont des valeurs de test, jamais celles de `.env.local`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fournisseursActives } from "@/lib/supabase/fournisseurs"

const PROJECT_URL = "https://ref.supabase.test"
const ANON_KEY = "anon-key-for-tests"
const NONE = { google: false, azure: false }

function answer(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } })
}

function settings(external: Record<string, unknown>): string {
  return JSON.stringify({ external: { email: true, github: false, ...external }, disable_signup: false })
}

let log: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT_URL)
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY)
  log = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("fournisseursActives (AC1)", () => {
  it("should read the public settings with the anon key, cached 300 seconds", async () => {
    const fetchMock = vi.fn(async () => answer(settings({ google: true, azure: false })))
    vi.stubGlobal("fetch", fetchMock)

    expect(await fournisseursActives()).toEqual({ google: true, azure: false })
    expect(fetchMock).toHaveBeenCalledWith(`${PROJECT_URL}/auth/v1/settings`, {
      headers: { apikey: ANON_KEY },
      next: { revalidate: 300 },
    })
    expect(log).not.toHaveBeenCalled()
  })

  it("should count a provider as enabled only when it is the boolean true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(settings({ google: "true", azure: 1 }))))

    expect(await fournisseursActives()).toEqual(NONE)
  })

  it("should enable nothing and log when the answer is not 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(JSON.stringify({ message: "Invalid API key" }), 401)))

    expect(await fournisseursActives()).toEqual(NONE)
    expect(log).toHaveBeenCalled()
  })
})
