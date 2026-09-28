// La page `/corbeille` (E05-S10, partie b2, AC-b11) : la session revérifiée par la page
// (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`), puis `listTrash` lu avec le
// client de la session ; une panne de l'identité ou un refus du service se disent dans l'écran. Session de
// l'hôte et service du paquet simulés ; l'écran est le vrai.
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { listTrash, PlatformError, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"
import CorbeillePage, { metadata } from "@/app/(dashboard)/corbeille/page"
import { getPlatformIdentitySafely, type PlatformSession } from "@/lib/plateforme/session"

vi.mock("@/lib/plateforme/session", () => ({ getPlatformIdentitySafely: vi.fn() }))

// redirect() lève NEXT_REDIRECT dans Next : le mock lève aussi, le rendu s'arrête comme en production.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock("@otomata_tech/oto_platform/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/server")>()),
  listTrash: vi.fn(),
}))

const CLAIRE = "0b6f1f0e-1c1a-4a8e-9a51-0d7c1a2b3c02"

// Le service qui lirait la base est simulé : un client vide suffit.
const SESSION: PlatformSession = { user: { id: CLAIRE, email: "claire@demo.test" }, accessToken: "session-token", host: "demo.localhost:3000", db: {} as PlatformDb }
const IDENTITE: Identity = {
  org: { id: "org-1", slug: "demo", name: "Démo", prefix: "demo", brand: {}, domains: null },
  user: { id: CLAIRE, email: SESSION.user.email, name: "Claire Morel" },
  member: { role: "member", profile: {} },
  teams: [],
  isStaff: false,
  viaGrant: false,
  hasOpenGrant: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("/corbeille page", () => {
  it("should send a visitor without a session to /login, reading nothing, and stay out of the index", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ error: { code: "unauthenticated" } })
    await expect(CorbeillePage()).rejects.toThrow("NEXT_REDIRECT:/login")
    expect(listTrash).not.toHaveBeenCalled()
    expect(metadata).toMatchObject({ title: "Corbeille", robots: { index: false } })
  })

  it("should send a person who is not a member of the organisation to /aucune-organisation, reading nothing", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ error: { code: "not_member" } })
    await expect(CorbeillePage()).rejects.toThrow("NEXT_REDIRECT:/aucune-organisation")
    expect(listTrash).not.toHaveBeenCalled()
  })

  it("should say the bin failed, reading nothing, when the identity cannot be resolved", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue(null)
    render(await CorbeillePage())
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Corbeille")
    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(listTrash).not.toHaveBeenCalled()
  })

  it("should say a refusal of the bin service in the screen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ data: { identity: IDENTITE, session: SESSION } })
    vi.mocked(listTrash).mockRejectedValue(new PlatformError("forbidden", "Reading the bin is refused."))
    render(await CorbeillePage())
    expect(screen.getByRole("alert")).toHaveTextContent("Vous n'avez pas le droit de faire cela.")
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("should read the bin with the session's client, and list it with « Restaurer » on each content", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ data: { identity: IDENTITE, session: SESSION } })
    vi.mocked(listTrash).mockResolvedValue([{ path: "conseil", title: "Conseil", kind: "page", deletedAt: "2026-09-20T08:00:00Z", count: 3, purgeAt: "2026-10-20T08:00:00Z" }])
    render(await CorbeillePage())
    expect(listTrash).toHaveBeenCalledWith(SESSION.db, IDENTITE)
    const table = screen.getByRole("table", { name: "Les contenus à la corbeille" })
    expect(within(table).getByRole("button", { name: "Restaurer « Conseil »" })).toBeInTheDocument()
  })
})
