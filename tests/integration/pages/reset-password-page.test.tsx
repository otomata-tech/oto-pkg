import { redirect } from "next/navigation"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
// Le formulaire de `/reset-password` (M01), porté d'oto-frontend (E05-S09, partie d3) : la page, serveur,
// pose le gabarit (`ecrans-d-authentification.test.tsx`). Les cas ci-dessous restent ceux de M01, sans
// les classes CSS (M11).
import { FormulaireNouveauMotDePasse as ResetPasswordPage } from "@/app/(auth)/reset-password/formulaire-nouveau-mot-de-passe"
import { resetPasswordAction } from "@/lib/actions/auth"

vi.mock("@/lib/actions/auth", () => ({ resetPasswordAction: vi.fn() }))

const BOUTON = "Enregistrer le mot de passe"

// Rejets non gérés du test de la redirection. Next 15 rejette l'appel d'une action qui redirige avec
// l'erreur de `redirect()` ; la page la relance (`unstable_rethrow`, le vrai) et l'App Router la suit
// en écoutant `unhandledrejection` sur `window`. jsdom n'émet pas cet événement : Node émet
// `unhandledRejection`, recueilli ici — un autre écouteur que le sien existant, Vitest ne le compte
// pas en erreur.
const rejets: unknown[] = []
const recueillir = (raison: unknown) => {
  rejets.push(raison)
}

afterEach(() => {
  process.off("unhandledRejection", recueillir)
  rejets.length = 0
  cleanup()
  vi.clearAllMocks()
})

/** L'erreur que Next remet à l'appelant d'une action qui redirige : celle que lève `redirect()`. */
function redirectionDeNext(): unknown {
  try {
    redirect("/")
  } catch (redirection) {
    return redirection
  }
}

function envoyer() {
  fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "nouveau-secret" } })
  fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "nouveau-secret" } })
  fireEvent.click(screen.getByRole("button", { name: BOUTON }))
}

describe("ResetPasswordPage", () => {
  it("should show the error of the action and free the button", async () => {
    vi.mocked(resetPasswordAction).mockResolvedValue({ error: "Une erreur est survenue. Réessayez." })
    render(<ResetPasswordPage />)

    envoyer()

    const alerte = await screen.findByRole("alert")
    expect(alerte).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(screen.getByRole("button", { name: BOUTON })).toBeEnabled()
  })

  it("should say the request failed and free the button when the action cannot be reached", async () => {
    vi.mocked(resetPasswordAction).mockRejectedValue(new TypeError("Failed to fetch"))
    render(<ResetPasswordPage />)

    envoyer()

    expect(await screen.findByRole("alert")).toHaveTextContent("La connexion au serveur a échoué. Réessayez.")
    expect(screen.getByRole("button", { name: BOUTON })).toBeEnabled()
  })

  it("should hand the redirection of a successful reset back to Next, without any error message", async () => {
    const redirection = redirectionDeNext()
    vi.mocked(resetPasswordAction).mockRejectedValue(redirection)
    process.on("unhandledRejection", recueillir)
    render(<ResetPasswordPage />)

    envoyer()

    // Le bouton libéré date du `finally` : une erreur posée avant la relance serait rendue avec lui.
    await waitFor(() => {
      expect(rejets).toHaveLength(1)
      expect(rejets[0]).toBe(redirection)
      expect(screen.getByRole("button", { name: BOUTON })).toBeEnabled()
    })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
