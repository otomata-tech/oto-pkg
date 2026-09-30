import type { AnchorHTMLAttributes } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { FlagView } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeRafraichissement, EcranDrapeaux, EcranDrapeauxChargement } from "@otomata_tech/oto_platform/ui"

// L'écran « Drapeaux » du tableau de bord (E08-S03 : AC8, AC12), sur le design system d'oto-frontend
// (E05-S09 partie d2) : le registre du paquet est vide en V1, la liste est donc simulée ; `fetch` simulé pour
// l'API, relecture fournie par un contexte de test.

const DRAPEAUX: FlagView[] = [
  { name: "nouvelle_grille", description: "Affiche la grille des tableaux en colonnes figées.", enabled: false },
  { name: "resume_court", description: "Coupe le résumé des procédures à une ligne.", enabled: true },
]

const fetchMock = vi.fn<typeof fetch>()
const rafraichir = vi.fn()

function reponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function Lien({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props}>{children}</a>
}

function rendre(resultat: { data: FlagView[] } | { error: string } = { data: DRAPEAUX }) {
  return render(
    <ContexteDeRafraichissement.Provider value={rafraichir}>
      <EcranDrapeaux resultat={resultat} Lien={Lien} ici="/admin/flags" />
    </ContexteDeRafraichissement.Provider>,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  rafraichir.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("EcranDrapeaux (AC8)", () => {
  it("should say each state in text and toggle a flag without a question, then have the page re-read", async () => {
    fetchMock.mockResolvedValue(reponse(200, { data: { flag: { ...DRAPEAUX[0], enabled: true } } }))
    rendre()

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Drapeaux")
    expect(screen.getByText("Désactivé")).toBeInTheDocument()
    expect(screen.getByText("Activé")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Désactiver resume_court" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Activer nouvelle_grille" }))

    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    // Le geste change de libellé avec la relecture : le focus l'attend au titre de la liste.
    expect(screen.getByRole("heading", { level: 2, name: "Drapeaux de l'organisation" })).toHaveFocus()
    const [url, init] = fetchMock.mock.calls[0]
    expect({ url, methode: init?.method, corps: JSON.parse(String(init?.body)) }).toEqual({
      url: "/api/platform/admin/flags",
      methode: "PATCH",
      corps: { name: "nouvelle_grille", enabled: true },
    })
  })

  it("should say flags changed meanwhile under the gesture", async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: { code: "conflict", message: "server text" } }))
    rendre()
    fireEvent.click(screen.getByRole("button", { name: "Activer nouvelle_grille" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Les drapeaux ont changé entre-temps : rechargez la page, puis recommencez.")
    expect(rafraichir).not.toHaveBeenCalled()
  })
})

describe("EcranDrapeaux, states (AC12)", () => {
  it("should say no flag is declared by this version (the V1 registry)", () => {
    rendre({ data: [] })
    expect(screen.getByText("Aucun drapeau n'est déclaré par cette version de la plateforme.")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("should render a busy status while loading, and say a failed read with a way to retry", () => {
    render(<EcranDrapeauxChargement />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
    cleanup()
    rendre({ error: "Une erreur est survenue. Réessayez." })
    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(screen.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/admin/flags")
  })
})
