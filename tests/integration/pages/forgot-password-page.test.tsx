import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
// Le formulaire de `/forgot-password` (M01), porté d'oto-frontend (E05-S09, partie d3) : la page, serveur,
// pose le gabarit (`ecrans-d-authentification.test.tsx`). Les cas ci-dessous restent ceux de M01, sans
// les classes CSS (M11) ; au succès, le formulaire laisse la place à la confirmation.
import { FormulaireMotDePasseOublie as ForgotPasswordPage } from "@/app/(auth)/forgot-password/formulaire-mot-de-passe-oublie"
import { forgotPasswordAction } from "@/lib/actions/auth"

vi.mock("@/lib/actions/auth", () => ({ forgotPasswordAction: vi.fn() }))

const CONFIRMATION = "Si un compte existe, un email vous a été envoyé."

beforeEach(() => {
  vi.mocked(forgotPasswordAction).mockResolvedValue({ data: { message: CONFIRMATION } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function envoyer(email: string) {
  fireEvent.change(screen.getByLabelText("Adresse mail"), { target: { value: email } })
  fireEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }))
}

describe("ForgotPasswordPage", () => {
  it("should announce the confirmation in a status region mounted empty, the form gone", async () => {
    render(<ForgotPasswordPage />)
    const region = screen.getByRole("status")
    expect(region).toBeEmptyDOMElement()

    envoyer("claire@acme.test")

    await within(region).findByText(CONFIRMATION)
    expect(vi.mocked(forgotPasswordAction).mock.calls[0][0].get("email")).toBe("claire@acme.test")
    expect(screen.queryByLabelText("Adresse mail")).toBeNull()
    expect(screen.queryByRole("button", { name: "Envoyer le lien" })).toBeNull()
  })

  it("should say the request failed and free the button when the action cannot be reached", async () => {
    vi.mocked(forgotPasswordAction).mockRejectedValue(new TypeError("Failed to fetch"))
    render(<ForgotPasswordPage />)

    envoyer("claire@acme.test")

    const alerte = await screen.findByRole("alert")
    expect(alerte).toHaveTextContent("La connexion au serveur a échoué. Réessayez.")
    expect(screen.getByRole("button", { name: "Envoyer le lien" })).toBeEnabled()
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })
})
