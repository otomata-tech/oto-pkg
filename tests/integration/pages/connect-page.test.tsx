// La page `/connect` (E02-S04 : AC1, AC6 à AC10) : la session revérifiée par la page
// (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`), les deux lectures des
// services avec le client de la session, chacune passée par `resultatDe`, et les noms des services
// adaptés pour l'écran. Session de l'hôte et services du paquet simulés ; `connectAddress` et l'écran
// sont les vrais.
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { lastConnections, listPrompts, PlatformError, type PlatformDb } from "@otomata_tech/oto_platform/server"
import ConnectLoading from "@/app/(dashboard)/connect/loading"
import ConnectPage, { metadata } from "@/app/(dashboard)/connect/page"
import { getPlatformIdentity, getRequestOrigin, type PlatformSession } from "@/lib/plateforme/session"
import { section } from "../../helpers/ecran"
import { identityOf, ORG } from "../../helpers/reference-org"

vi.mock("@/lib/plateforme/session", () => ({ getPlatformIdentity: vi.fn(), getRequestOrigin: vi.fn() }))

// redirect() lève NEXT_REDIRECT dans Next : le mock lève aussi, le rendu s'arrête comme en production.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock("@otomata_tech/oto_platform/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/server")>()),
  lastConnections: vi.fn(),
  listPrompts: vi.fn(),
}))

const ECHEC = "Une erreur est survenue. Réessayez."
const IDENTITE = identityOf("lea", { org: { id: ORG.id, slug: "acme-energies", name: "Acme Énergies", prefix: "acme", brand: {}, domains: null } })
const SESSION: PlatformSession = {
  user: { id: IDENTITE.user.id, email: IDENTITE.user.email },
  accessToken: "session-token",
  host: "acme.example.test",
  // Les services qui liraient la base sont simulés : un client vide suffit, sans le type du vrai.
  db: {} as PlatformDb,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPlatformIdentity).mockResolvedValue({ data: { identity: IDENTITE, session: SESSION } })
  vi.mocked(getRequestOrigin).mockResolvedValue("https://acme.example.test")
  vi.mocked(listPrompts).mockResolvedValue([{ name: "qualifier_prospects", title: "Qualifier un prospect", description: "Qualifie un prospect entrant." }])
  vi.mocked(lastConnections).mockResolvedValue([{ family: "Claude Code", signature: "claude-code@2.1.280", at: "2026-09-23T09:00:00Z" }])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("/connect page session (AC9)", () => {
  it("should send a visitor without a session to the login page, back to /connect afterwards, reading nothing", async () => {
    vi.mocked(getPlatformIdentity).mockResolvedValue({ error: { code: "unauthenticated" } })

    await expect(ConnectPage()).rejects.toThrow("NEXT_REDIRECT:/login?redirect=%2Fconnect")
    expect(listPrompts).not.toHaveBeenCalled()
    expect(lastConnections).not.toHaveBeenCalled()
  })

  it.each(["unknown_org", "not_member"] as const)("should send %s to /aucune-organisation, reading nothing", async (code) => {
    vi.mocked(getPlatformIdentity).mockResolvedValue({ error: { code } })

    await expect(ConnectPage()).rejects.toThrow("NEXT_REDIRECT:/aucune-organisation")
    expect(listPrompts).not.toHaveBeenCalled()
    expect(lastConnections).not.toHaveBeenCalled()
  })
})

describe("/connect page reads (AC1, AC6, AC7)", () => {
  it("should read with the session client, and show the address of the request origin, each procedure by its title and each connection", async () => {
    render(await ConnectPage())

    expect(listPrompts).toHaveBeenCalledWith(SESSION.db, IDENTITE)
    expect(lastConnections).toHaveBeenCalledWith(SESSION.db, IDENTITE)
    expect(within(section("Adresse du serveur")).getByText("https://acme.example.test/api/mcp")).toBeInTheDocument()
    expect(within(section("À essayer")).getByRole("listitem")).toHaveTextContent("Qualifier un prospect")
    expect(screen.queryByText("qualifier_prospects")).toBeNull()
    expect(within(section("Vos connexions")).getByRole("listitem")).toHaveTextContent(
      "Claude Code : dernière connexion le 23 septembre 2026 (claude-code@2.1.280)",
    )
  })
})

describe("/connect page failed reads (AC8)", () => {
  it.each<[string, string, () => void]>([
    ["À essayer", "Vos connexions", () => vi.mocked(listPrompts).mockRejectedValue(new PlatformError("internal", "Internal error."))],
    ["Vos connexions", "À essayer", () => vi.mocked(lastConnections).mockRejectedValue(new PlatformError("internal", "Internal error."))],
  ])("should say a failed read in « %s » only, with « Réessayer » on /connect, « %s » still shown", async (titre, autre, echouer) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    echouer()

    render(await ConnectPage())

    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(within(section(titre)).getByRole("alert")).toHaveTextContent(ECHEC)
    expect(within(section(titre)).getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/connect")
    expect(within(section(autre)).getByRole("listitem")).toBeInTheDocument()
  })
})

describe("/connect page metadata and loading (AC8, AC10)", () => {
  it("should be titled Brancher un assistant and not indexed", () => {
    expect(metadata).toMatchObject({ title: "Brancher un assistant", robots: { index: false } })
  })

  it("should show the loading state while the page loads", () => {
    render(<ConnectLoading />)

    expect(screen.getByRole("status")).toHaveTextContent("Chargement de la page de branchement…")
  })
})
