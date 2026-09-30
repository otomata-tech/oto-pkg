// La page du formulaire de dépôt (E10-S02 lot f, AC-f15 ; ADR-018 § 8) : `/upload/<token>` revérifie la session, lit la
// destination du ticket de la personne (`uploadForm`, qui ne consomme rien) et la montre ; le refus du service (une autre
// personne, un lien servi ou expiré) se dit par la phrase de l'écran, sans zone de dépôt ; un fichier choisi part tel quel
// à la route à session du ticket, « Déposé » s'annonce en `role="status"`, qui reçoit le focus ; un refus en
// `role="alert"`, la zone restant offerte s'il laisse le lien valable, retirée sinon, le focus sur l'alerte. Session de
// l'hôte et service simulés ; l'écran est le vrai.
import type { ReactElement } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformError, uploadForm, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"
import { UPLOAD_BYTES_MAX } from "@otomata_tech/oto_platform/schemas"
import DepotPage from "@/app/(dashboard)/upload/[token]/page"
import { getPlatformIdentitySafely, type PlatformSession } from "@/lib/plateforme/session"

vi.mock("@/lib/plateforme/session", () => ({ getPlatformIdentitySafely: vi.fn() }))

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock("@otomata_tech/oto_platform/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/server")>()),
  uploadForm: vi.fn(),
}))

const LEA = "0b6f1f0e-1c1a-4a8e-9a51-0d7c1a2b3c02"
const JETON = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"

// Le service qui lirait la base est simulé : un client vide suffit.
const SESSION: PlatformSession = { user: { id: LEA, email: "lea@demo.test" }, accessToken: "session-token", host: "localhost:3000", db: {} as PlatformDb }

const IDENTITE: Identity = {
  org: { id: "org-1", slug: "demo", name: "Démo", prefix: "demo", brand: {}, domains: null },
  user: { id: LEA, email: SESSION.user.email, name: "Léa Martin" },
  member: { role: "member", profile: { handle: "lea" } },
  teams: [],
  isStaff: false,
  viaGrant: false,
  hasOpenGrant: false,
}

const page = () => DepotPage({ params: Promise.resolve({ token: JETON }) })

async function monter(element: Promise<ReactElement>) {
  const rendu = await element
  await act(async () => {
    render(rendu)
  })
}

/** Le champ de fichier de la zone de dépôt (un `<input type="file">` nommé par sa zone). */
const champ = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error("no file input")
  return input
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ data: { identity: IDENTITE, session: SESSION } })
  vi.mocked(uploadForm).mockResolvedValue({ path: "ventes/rapports/mars", kind: "md", mode: "create", name: null, expiresAt: "2026-09-30T08:15:00.000Z" })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("/upload/<token> (AC-f15)", () => {
  it("should send a visitor without a session to the login page, reading no ticket", async () => {
    vi.mocked(getPlatformIdentitySafely).mockResolvedValue({ error: { code: "unauthenticated" } })
    await expect(page()).rejects.toThrow("NEXT_REDIRECT:/login")
    expect(uploadForm).not.toHaveBeenCalled()
  })

  it("should say in the screen's sentence a link of another person, served or expired, with no drop zone", async () => {
    vi.mocked(uploadForm).mockRejectedValue(new PlatformError("not_found", "Unknown upload link."))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await monter(page())
    expect(uploadForm).toHaveBeenCalledWith(SESSION.db, IDENTITE, JETON)
    expect(screen.getByRole("alert")).toHaveTextContent("Ce lien de dépôt est inconnu, déjà utilisé, expiré, ou demandé par une autre personne.")
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it("should show the destination, send the file as is to the form route, announce it dropped and move the focus there", async () => {
    const envoi = vi.fn(async () => Response.json({ data: { path: "ventes/rapports/mars", revision: 1, status: "published", url: "https://demo.oto.test/n/ventes/rapports/mars" } }))
    vi.stubGlobal("fetch", envoi)
    await monter(page())
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Déposer un fichier")
    expect(screen.getByText("ventes/rapports/mars")).toBeInTheDocument()
    expect(screen.getByText("une page tirée d'un fichier Markdown (création)")).toBeInTheDocument()
    expect(champ()).toHaveAttribute("accept", ".md,.markdown,text/markdown")
    const fichier = new File(["## Mars\n\nLe rapport."], "mars.md", { type: "text/markdown" })

    fireEvent.change(champ(), { target: { files: [fichier] } })

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Déposé dans ventes/rapports/mars."))
    expect(envoi).toHaveBeenCalledWith(`/api/platform/uploads/${JETON}/form`, { method: "POST", credentials: "same-origin", body: fichier })
    expect(document.querySelector('input[type="file"]')).toBeNull()
    // La zone qui tenait le focus est partie : il va à l'annonce, jamais à <body> (M4).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("status")))
  })

  it("should say a refusal made before the link is served in an alert and keep the drop zone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "too_large", message: "The file is over 1 MB." } }, { status: 413 })))
    await monter(page())

    fireEvent.change(champ(), { target: { files: [new File([new Uint8Array(UPLOAD_BYTES_MAX + 1)], "gros.md")] } })

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Le fichier dépasse 1 Mo : joignez-le depuis la page."))
    expect(screen.getByRole("status")).toHaveTextContent("")
    expect(champ()).toBeInTheDocument()
  })

  it.each([
    ["invalid_arguments", 400, "Ce fichier ne convient pas à cette destination"],
    ["too_large", 413, "Le fichier dépasse 1 Mo"],
    ["not_found", 404, "Ce lien de dépôt est inconnu, déjà utilisé"],
  ])("should remove the drop zone after a %s refusal that served the link, say it, and move the focus to the alert", async (code, status, dit) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code, message: "Refused." } }, { status })))
    await monter(page())

    fireEvent.change(champ(), { target: { files: [new File(["x"], "petit.md")] } })

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(dit))
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByText("Ce lien ne peut plus servir : demandez-en un nouveau à l'assistant.")).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")))
  })
})
