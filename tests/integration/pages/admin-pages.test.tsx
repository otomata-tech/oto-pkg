// Les pages `/admin/usage` et `/admin/retours` (E08-S09, AC1) et les entrées d'administration du
// layout `(dashboard)` (E08-S03 N9) : l'accès décidé par l'identité, avant tout appel de service. E05-S13 :
// l'usage caché (AC-8), les retours au membre de l'équipe plateforme qui administre l'organisation (AC-9),
// « Journal » dans les réglages et un seul groupe sans sous-titre pour le client (AC-10). Session de l'hôte et
// services du paquet simulés ; `isOrgAdmin`, `handlesFeedback` et les écrans sont les vrais.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { listFeedback, listTeams, usageSummary, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"
import DashboardLayout from "@/app/(dashboard)/layout"
import RetoursPage, { metadata as retoursMetadata } from "@/app/(dashboard)/admin/retours/page"
import UsagePage from "@/app/(dashboard)/admin/usage/page"
import { getPlatformIdentitySafely, type PlatformSession } from "@/lib/plateforme/session"

vi.mock("@/lib/plateforme/session", () => ({ getPlatformIdentitySafely: vi.fn() }))

vi.mock("@/lib/actions/auth", () => ({ logoutAction: vi.fn() }))

// redirect() et notFound() lèvent dans Next : les mocks lèvent aussi, le rendu s'arrête comme en production.
// Le rail et le fournisseur de relecture du layout lisent le routeur, absent ici : `push` est celui
// du routeur simulé, par où une entrée du menu mène à sa page.
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push }),
}))

vi.mock("@otomata_tech/oto_platform/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/server")>()),
  usageSummary: vi.fn(),
  listTeams: vi.fn(),
  listFeedback: vi.fn(),
  // L'arbre du rail du layout (E05-S09) : vide ici.
  visibleTree: vi.fn(async () => ({ tree: [], truncated: false })),
}))

// Les services qui liraient la base sont simulés : un client vide suffit.
const SESSION: PlatformSession = { user: { id: "user-1", email: "claire@demo.test" }, accessToken: "session-token", host: "demo.localhost:3000", db: {} as PlatformDb }

/** `staff-member` : membre simple de l'organisation et de l'équipe plateforme, avec un accès en cours (fiche D17). */
type Profil = "admin" | "member" | "staff-member" | "staff-without-access"

function identite(profil: Profil): Identity {
  const staff = profil === "staff-member" || profil === "staff-without-access"
  return {
    org: { id: "org-1", slug: "demo", name: "Démo", prefix: "demo", brand: {}, domains: null },
    user: { id: SESSION.user.id, email: SESSION.user.email, name: "Claire Morel" },
    member: { role: profil === "admin" ? "admin" : "member", profile: {} },
    teams: [],
    isStaff: staff,
    viaGrant: false,
    hasOpenGrant: profil === "staff-member",
  }
}

const connecte = (profil: Profil) => ({ data: { identity: identite(profil), session: SESSION } })

const retours = () => RetoursPage({ searchParams: Promise.resolve({ periode: "7", etat: "all" }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listTeams).mockResolvedValue([])
  vi.mocked(listFeedback).mockResolvedValue({ tickets: [], counts: { open: 0, acknowledged: 0, resolved: 0, declined: 0 }, nextCursor: null })
})

afterEach(() => {
  cleanup()
})

describe("/admin/usage, hidden (E05-S13, AC-8)", () => {
  it.each(["admin", "staff-member", "member"] as const)("should render not found to %s, reading nothing", (profil) => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue(connecte(profil))

    expect(() => UsagePage()).toThrow("NEXT_NOT_FOUND")
    expect(getPlatformIdentitySafely).not.toHaveBeenCalled()
    for (const service of [usageSummary, listTeams]) expect(service).not.toHaveBeenCalled()
  })
})

describe("/admin/retours, reserved to the platform team (E08-S09, AC1 ; E05-S13, AC-9)", () => {
  // Chaque branche de `handlesFeedback` seule fausse : pas de l'équipe plateforme (administrateur, membre), de
  // l'équipe plateforme sans accès en cours ni rôle d'administrateur.
  it.each(["admin", "member", "staff-without-access"] as const)("should render not found to %s, calling no service", async (profil) => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue(connecte(profil))

    await expect(retours()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(listFeedback).not.toHaveBeenCalled()
  })

  it("should read the feedback with the session's client for the platform team, under its trail", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue(connecte("staff-member"))

    render(await retours())
    expect(listFeedback).toHaveBeenCalledWith(SESSION.db, identite("staff-member"), { state: undefined, type: undefined, days: 7, cursor: undefined })
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Retours des assistants")
    expect(within(screen.getByRole("navigation", { name: "Chemin" })).getByRole("link", { name: "Suivi de l’entreprise" })).toHaveAttribute("href", "/admin/retours")
  })

  it("should send a visitor without a session to /login, and say a failed identity", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ error: { code: "unauthenticated" } })
    await expect(retours()).rejects.toThrow("NEXT_REDIRECT:/login")

    vi.mocked(getPlatformIdentitySafely).mockResolvedValue(null)
    render(await retours())
    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(listFeedback).not.toHaveBeenCalled()
  })

  it("should title the page and keep it out of the index", () => {
    expect(retoursMetadata).toMatchObject({ title: "Retours des assistants", robots: { index: false } })
  })
})

// Depuis E05-S09 (AC-a4), les entrées sont celles du menu de l'entreprise, au haut du rail ; depuis E05-S11
// (AC-31, AC-33), « Réglages » puis « Suivi » ; Connecteurs est au pied du rail (AC-32), « Brancher un
// assistant » au menu du compte. E05-S13 : Usage caché (AC-8), Retours au staff (AC-9), Journal dans les
// réglages, un seul groupe sans sous-titre hors du staff (AC-10).
describe("(dashboard) layout administration entries (E08-S03 N9 ; E05-S09, AC-a4 ; E05-S13, AC-8 to AC-10)", () => {
  const ouvrir = () => {
    fireEvent.click(screen.getByRole("button", { name: /^Entreprise : Démo/ }))
    return screen.getByRole("menu")
  }

  it.each([
    ["admin", ["Organisation", "Équipes & accès", "Journal"]],
    ["member", ["Équipes & accès", "Journal"]],
    ["staff-member", ["Organisation", "Équipes & accès", "Journal", "Retours"]],
  ] as const)("should show the entries by right: %s", async (profil, attendues) => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue(connecte(profil))

    render(await DashboardLayout({ children: <p>Contenu</p> }))

    // Les sous-titres (un seul groupe, aucun) : `rail-application.test.tsx`.
    const menu = ouvrir()
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(attendues)
    // Une entrée mène à sa page, par le routeur de l'hôte.
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Journal" }))
    expect(push).toHaveBeenCalledWith("/journal")
  })
})
