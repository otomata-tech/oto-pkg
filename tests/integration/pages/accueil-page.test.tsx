// La page d'accueil `/` (E05-S09, partie b, AC-b1) : la session revérifiée par la page
// (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`), les lectures des services
// avec le client de la session, chacune passée par `resultatDe`, la semaine du journal prise au défaut de
// `/journal`, l'adresse du serveur tirée de l'origine de la requête, et les noms des services adaptés pour
// l'écran. Session de l'hôte et services du paquet simulés ; `connectAddress` et l'écran sont les vrais.
// E05-S11 (AC-12 à AC-14) : l'onglet est lu dans l'adresse ; sur « Contexte », la page lit l'aperçu sans
// phrase, puis chaque Contexte servi par son chemin, dont le niveau (décidé par le service) choisit l'éditeur.
import type { ReactNode } from "react"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { lastConnections, listActivities, loadNode, PlatformError, previewContext, usefulProcedures, type PlatformDb } from "@otomata_tech/oto_platform/server"
import AccueilPage, { metadata } from "@/app/(dashboard)/page"
import { getPlatformIdentitySafely, getRequestOrigin, type PlatformSession } from "@/lib/plateforme/session"
import { bloc, vueDuNoeud } from "../../helpers/noeud"
import { identityOf, ORG } from "../../helpers/reference-org"

vi.mock("@/lib/plateforme/session", () => ({ getPlatformIdentitySafely: vi.fn(), getRequestOrigin: vi.fn() }))

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
  listActivities: vi.fn(),
  usefulProcedures: vi.fn(),
  previewContext: vi.fn(),
  loadNode: vi.fn(),
}))

/** La page, son adresse réduite à ses paramètres (`?onglet=`). */
const page = (parametres: Record<string, string> = {}) => AccueilPage({ searchParams: Promise.resolve(parametres) })

const ECHEC = "Une erreur est survenue. Réessayez."
const IDENTITE = identityOf("lea", { org: { id: ORG.id, slug: "demo", name: "Démo", prefix: "demo", brand: {}, domains: null } })
const SESSION: PlatformSession = {
  user: { id: IDENTITE.user.id, email: IDENTITE.user.email },
  accessToken: "session-token",
  host: "demo.example.test",
  // Les services qui liraient la base sont simulés : un client vide suffit, sans le type du vrai.
  db: {} as PlatformDb,
}

/** Rend sous un `act` attendu : l'écran, suspendu sur ses lectures, se rend dans le même tour. */
async function montrer(page: ReactNode) {
  await act(async () => {
    render(page)
  })
}

const ilot = (nom: string) => within(screen.getByRole("region", { name: nom }))
/** Le panneau d'un onglet de l'îlot principal, nommé par son onglet (E05-S11, AC-12). */
const panneau = (nom: string) => within(screen.getByRole("tabpanel", { name: nom }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ data: { identity: IDENTITE, session: SESSION } })
  vi.mocked(getRequestOrigin).mockResolvedValue("https://demo.example.test")
  vi.mocked(listActivities).mockResolvedValue({
    truncated: false,
    activities: [
      { id: 7, at: "2026-09-20T08:05:00Z", userId: IDENTITE.user.id, userName: IDENTITE.user.name, verb: "ran", kind: "procedure", path: "ventes/relance", title: "Relancer les impayés", count: 1, ctx: "K7M2-9QXR" },
    ],
  })
  vi.mocked(usefulProcedures).mockResolvedValue([{ path: "ventes/relance", title: "Relancer les impayés" }])
  vi.mocked(lastConnections).mockResolvedValue([{ family: "Claude Code", signature: "claude-code@2.1.280", at: "2026-09-23T09:00:00Z" }])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("/ page session", () => {
  it("should send a visitor without a session to /login, reading nothing, and stay out of the index", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ error: { code: "unauthenticated" } })

    await expect(page()).rejects.toThrow("NEXT_REDIRECT:/login")
    expect(listActivities).not.toHaveBeenCalled()
    expect(lastConnections).not.toHaveBeenCalled()
    expect(metadata).toMatchObject({ title: "Accueil", robots: { index: false } })
  })

  it.each(["unknown_org", "not_member"] as const)("should send %s to /aucune-organisation, reading nothing", async (code) => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ error: { code } })

    await expect(page()).rejects.toThrow("NEXT_REDIRECT:/aucune-organisation")
    expect(listActivities).not.toHaveBeenCalled()
  })

  it("should send a request without origin to /aucune-organisation, as /connect does, reading nothing", async () => {
    vi.mocked(getRequestOrigin).mockResolvedValue(null)

    await expect(page()).rejects.toThrow("NEXT_REDIRECT:/aucune-organisation")
    expect(listActivities).not.toHaveBeenCalled()
  })
})

describe("/ page reads (AC-b1)", () => {
  it("should read the week of activities, the connections and six useful procedures with the session client, and show them with the address of the request origin, nothing of the Contexte on « Activités »", async () => {
    await montrer(await page())

    expect(listActivities).toHaveBeenCalledWith(SESSION.db, IDENTITE, { periodDays: 7 })
    expect(usefulProcedures).toHaveBeenCalledWith(SESSION.db, IDENTITE, 6)
    expect(lastConnections).toHaveBeenCalledWith(SESSION.db, IDENTITE)
    expect(screen.getByRole("heading", { level: 1, name: `Bonjour ${IDENTITE.member.profile.name}` })).toBeInTheDocument()
    expect(panneau("Activités").getByRole("link", { name: /^Vous avez lancé la procédure Relancer les impayés/ })).toHaveAttribute("href", "/journal?conversation=K7M2-9QXR")
    expect(ilot("Procédures les plus utilisées").getByRole("link", { name: "Relancer les impayés" })).toHaveAttribute("href", "/n/ventes/relance")
    expect(ilot("Brancher un assistant").getByRole("listitem")).toHaveTextContent("Claude Code · dernière connexion le 23 septembre 2026")
    // Un assistant est branché : l'adresse, lue à l'origine de la requête, est dans le dialogue.
    expect(screen.getByText("https://demo.example.test/api/mcp", { selector: "code" })).toBeInTheDocument()
    expect(previewContext).not.toHaveBeenCalled()
    expect(loadNode).not.toHaveBeenCalled()
  })

  it("should say a failed read in its island only, the rest of the home shown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(listActivities).mockRejectedValue(new PlatformError("internal", "Internal error."))

    await montrer(await page())

    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(panneau("Activités").getByRole("alert")).toHaveTextContent(ECHEC)
    expect(ilot("Brancher un assistant").getByRole("listitem")).toHaveTextContent("Claude Code")
  })

  it("should say once that the home could not be read when the identity cannot be resolved, reading nothing", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue(null)

    await montrer(await page())

    expect(screen.getByRole("alert")).toHaveTextContent(ECHEC)
    expect(screen.getByRole("heading", { level: 1, name: "Bonjour" })).toBeInTheDocument()
    expect(listActivities).not.toHaveBeenCalled()
    expect(lastConnections).not.toHaveBeenCalled()
  })
})

// E05-S11 (AC-12 à AC-14) : l'onglet « Contexte », ce que lit l'assistant ; les Contextes lus par leur chemin.
describe("/ page, « Contexte » tab (E05-S11)", () => {
  const TEXTE = "ctx: XXXX-XXXX\n\n## Context: everyone (contexte)\nNous vendons.\n\n## Context: team Ventes (ventes/contexte)\nTutoie."
  const APERCU = {
    text: TEXTE,
    budget: 20_000,
    blocks: [
      { name: "code", chars: 14, status: "full" as const, path: null },
      { name: "contexte", chars: 45, status: "full" as const, path: "contexte" },
      { name: "ventes/contexte", chars: 49, status: "full" as const, path: "ventes/contexte" },
    ],
    served: null,
    candidates: [],
  }

  beforeEach(() => {
    vi.mocked(previewContext).mockResolvedValue(APERCU)
    // Le service décide des niveaux : Tout le monde en lecture, Ventes en gestion.
    vi.mocked(loadNode).mockImplementation(async (_db, _identite, { path }) =>
      path === "contexte"
        ? vueDuNoeud({ id: "n-contexte", path, kind: "context", level: 1 })
        : vueDuNoeud({ id: "n-ventes", path, kind: "context", level: 3, blocks: [bloc("b2000000-0000-4000-8000-000000000002", "paragraph", "Tutoie.")] }),
    )
  })

  it("should read the preview without a phrase, then each served Contexte by its path, with the session client, writing in place the one the service lets the person write", async () => {
    await montrer(await page({ onglet: "contexte" }))

    expect(previewContext).toHaveBeenCalledWith(SESSION.db, IDENTITE, {})
    expect(vi.mocked(loadNode).mock.calls.map(([db, identite, lu]) => [db, identite, lu.path])).toEqual([
      [SESSION.db, IDENTITE, "contexte"],
      [SESSION.db, IDENTITE, "ventes/contexte"],
    ])
    expect(screen.getByRole("tab", { name: "Contexte" })).toHaveAttribute("aria-selected", "true")
    const vue = panneau("Contexte")
    expect(within(vue.getByRole("region", { name: "Contexte : Tout le monde" })).queryByRole("textbox")).toBeNull()
    expect(within(vue.getByRole("region", { name: "Contexte : équipe Ventes" })).getByRole("textbox", { name: "Modifier ce texte — Tutoie." })).toBeInTheDocument()
  })

  // E05-S12 (AC-7, HN-E05S12-C10) : le Contexte d'une partie non servie se lit aussi ; absent (`not_found`), sa
  // partie garde sa tête sans alerte ; toute autre panne se dit dans sa partie.
  it("should read the Contexte of a part not served, say its failed read, and say nothing of an absent one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const conseil = "## Context: team Conseil (conseil/contexte)\nTeam Conseil."
    const support = "## Context: team Support (support/contexte)\nTeam Support."
    vi.mocked(previewContext).mockResolvedValue({
      ...APERCU,
      text: [TEXTE, conseil, support].join("\n\n"),
      blocks: [
        ...APERCU.blocks,
        { name: "conseil/contexte", chars: conseil.length, status: "full", path: null, head: conseil.length },
        { name: "support/contexte", chars: support.length, status: "full", path: null, head: support.length },
      ],
    })
    vi.mocked(loadNode).mockImplementation(async (_db, _identite, { path }) => {
      if (path === "conseil/contexte") throw new PlatformError("not_found", "Not found.")
      if (path === "support/contexte") throw new PlatformError("internal", "Internal error.")
      return vueDuNoeud({ id: `n-${path}`, path, kind: "context", level: 1 })
    })

    await montrer(await page({ onglet: "contexte" }))

    expect(vi.mocked(loadNode).mock.calls.map(([, , lu]) => lu.path)).toEqual(["contexte", "ventes/contexte", "conseil/contexte", "support/contexte"])
    const vue = panneau("Contexte")
    expect(within(vue.getByRole("region", { name: /conseil/i })).queryByRole("alert")).toBeNull()
    expect(within(vue.getByRole("region", { name: /support/i })).getByRole("alert")).toHaveTextContent(ECHEC)
  })

  it("should open « Activités » on an unknown tab, reading nothing of the Contexte", async () => {
    await montrer(await page({ onglet: "inconnu" }))

    expect(screen.getByRole("tab", { name: "Activités" })).toHaveAttribute("aria-selected", "true")
    expect(previewContext).not.toHaveBeenCalled()
  })
})
