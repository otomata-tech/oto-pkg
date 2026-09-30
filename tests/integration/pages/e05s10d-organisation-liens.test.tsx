// La page `/admin/organization` et ses liens publics (E05-S10, AC-d7) : lus par `listShares` pour qui administre
// l'organisation, jamais pour un membre. Session de l'hôte et services du paquet simulés ; `isOrgAdmin` et
// l'écran sont les vrais.
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readOrgView } from "@otomata_tech/oto_platform/api"
import { listShares, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"
import OrganisationPage from "@/app/(dashboard)/admin/organization/page"
import { getPlatformIdentitySafely, type PlatformSession } from "@/lib/plateforme/session"

vi.mock("@/lib/plateforme/session", () => ({ getPlatformIdentitySafely: vi.fn() }))

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@otomata_tech/oto_platform/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/server")>()),
  listShares: vi.fn(),
  // Le Contexte de Tout le monde de la même page (E05-S11, AC-24), vide ici.
  loadNode: vi.fn(async () => ({ blocks: [] })),
  // L'aperçu du Contexte servi de la même page (E05-S13, lot A), vide ici.
  previewContext: vi.fn(async () => ({ text: "", blocks: [], budget: 20_000, served: null, candidates: [] })),
}))

vi.mock("@otomata_tech/oto_platform/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/api")>()),
  readOrgView: vi.fn(),
}))

const SESSION: PlatformSession = { user: { id: "user-1", email: "claire@demo.test" }, accessToken: "session-token", host: "demo.localhost:3000", db: {} as PlatformDb }

function identite(role: "admin" | "member"): Identity {
  return {
    org: { id: "org-1", slug: "demo", name: "Démo", prefix: "demo", brand: {}, domains: null },
    user: { id: SESSION.user.id, email: SESSION.user.email, name: "Claire Morel" },
    member: { role, profile: {} },
    teams: [],
    isStaff: false,
    viaGrant: false,
    hasOpenGrant: false,
  }
}

beforeEach(() => {
  vi.mocked(readOrgView).mockResolvedValue({ name: "Démo", slug: "demo", prefix: "demo", tools: [], hosts: [], domains: "", routing: { threshold: null, gap: null }, contact: null })
  vi.mocked(listShares).mockResolvedValue([{ id: "9a8b7c6d-5e4f-4a3b-8c2d-000000000001", path: "ventes/tarifs", title: "Tarifs 2026", includeChildren: false, createdAt: "2026-09-27T08:00:00.000Z", createdByName: "Léa Martin" }])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("/admin/organization public links (AC-d7)", () => {
  it("should read the public links with the session's client for an administrator", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ data: { identity: identite("admin"), session: SESSION } })
    const page = await OrganisationPage({ searchParams: Promise.resolve({}) })
    await act(async () => {
      render(page)
    })

    expect(listShares).toHaveBeenCalledWith(SESSION.db, identite("admin"))
    expect(within(screen.getByRole("region", { name: "Liens publics" })).getByRole("link", { name: "Tarifs 2026" })).toHaveAttribute("href", "/n/ventes/tarifs")
  })

  it("should not read them for a member, who is told the page is reserved", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ data: { identity: identite("member"), session: SESSION } })
    render(await OrganisationPage({ searchParams: Promise.resolve({}) }))

    expect(listShares).not.toHaveBeenCalled()
    expect(screen.queryByRole("region", { name: "Liens publics" })).toBeNull()
  })
})
