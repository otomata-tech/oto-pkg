// Boutons des fournisseurs de `/login` (E09-S03, AC8) : action simulée, rendue par `useActionState`.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BoutonsDeFournisseurs } from "@/app/(auth)/login/boutons-de-fournisseurs"
import { connexionFournisseurAction } from "@/lib/actions/auth"
import type { ActionResult } from "@/types"

vi.mock("@/lib/actions/auth", () => ({ connexionFournisseurAction: vi.fn() }))

const GOOGLE = "Continuer avec Google"
const MICROSOFT = "Continuer avec Microsoft"
const START_FAILED = "La connexion avec ce fournisseur n'a pas pu démarrer. Réessayez."

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("BoutonsDeFournisseurs (AC8)", () => {
  it("should show the button of the only enabled provider alone, Google or Microsoft", () => {
    render(<BoutonsDeFournisseurs google azure={false} />)
    expect(screen.getAllByRole("button").map((bouton) => bouton.textContent)).toEqual([GOOGLE])
    cleanup()

    render(<BoutonsDeFournisseurs google={false} azure />)
    expect(screen.getAllByRole("button").map((bouton) => bouton.textContent)).toEqual([MICROSOFT])
  })

  it("should render Google then Microsoft as text-only submit buttons of one form", () => {
    render(<BoutonsDeFournisseurs google azure />)

    const boutons = screen.getAllByRole("button")
    expect(boutons.map((bouton) => bouton.textContent)).toEqual([GOOGLE, MICROSOFT])
    expect(boutons.map((bouton) => [bouton.getAttribute("type"), bouton.getAttribute("name"), bouton.getAttribute("value")])).toEqual([
      ["submit", "fournisseur", "google"],
      ["submit", "fournisseur", "azure"],
    ])
    expect(boutons[0].closest("form")).not.toBeNull()
    expect(boutons[0].closest("form")).toBe(boutons[1].closest("form"))
    expect(boutons[0].querySelector("svg, img")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("should send the chosen provider to the action", async () => {
    vi.mocked(connexionFournisseurAction).mockResolvedValue({ error: START_FAILED })
    render(<BoutonsDeFournisseurs google azure />)

    fireEvent.click(screen.getByRole("button", { name: MICROSOFT }))

    await waitFor(() => expect(connexionFournisseurAction).toHaveBeenCalledTimes(1))
    const [etat, envoye] = vi.mocked(connexionFournisseurAction).mock.calls[0]
    expect(etat).toBeNull()
    expect(envoye.get("fournisseur")).toBe("azure")
  })

  it("should disable both buttons and mark the chosen one busy while sending", async () => {
    let repondre: (resultat: ActionResult<void>) => void = () => {}
    vi.mocked(connexionFournisseurAction).mockReturnValue(new Promise((resolve) => (repondre = resolve)))
    render(<BoutonsDeFournisseurs google azure />)

    fireEvent.click(screen.getByRole("button", { name: GOOGLE }))

    await waitFor(() => expect(screen.getByRole("button", { name: GOOGLE })).toBeDisabled())
    expect(screen.getByRole("button", { name: GOOGLE })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: MICROSOFT })).toBeDisabled()
    expect(screen.getByRole("button", { name: MICROSOFT })).toHaveAttribute("aria-busy", "false")

    await act(async () => repondre({ error: START_FAILED }))

    expect(screen.getByRole("button", { name: GOOGLE })).toBeEnabled()
    expect(screen.getByRole("button", { name: GOOGLE })).toHaveAttribute("aria-busy", "false")
  })

  it("should show the error of the action in an alert under the buttons, and free them", async () => {
    vi.mocked(connexionFournisseurAction).mockResolvedValue({ error: START_FAILED })
    render(<BoutonsDeFournisseurs google azure />)

    fireEvent.click(screen.getByRole("button", { name: GOOGLE }))

    const alerte = await screen.findByRole("alert")
    expect(alerte).toHaveTextContent(START_FAILED)
    const dernierBouton = screen.getByRole("button", { name: MICROSOFT })
    expect(dernierBouton.compareDocumentPosition(alerte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole("button", { name: GOOGLE })).toBeEnabled()
    expect(dernierBouton).toBeEnabled()
  })
})
