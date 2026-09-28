// Le gabarit des écrans d'authentification, porté d'oto-frontend (E05-S09, partie d3 ; E05-S07, AC1,
// AC2, AC5) : un `main`, le panneau de marque, qui porte le seul `h1` et la seule promesse lus, à toute
// largeur (sous `lg`, hors de l'écran : contrôlé dans le navigateur, `ecrans-d-authentification.spec.ts`),
// la marque compacte, son dessin caché aux technologies d'assistance, la barre de repères et sa mention
// d'hébergement (M27), la ligne de l'organisation de l'adresse, l'îlot, la légende.
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EcranDAuthentification, type MarqueDOrganisation } from "@otomata_tech/oto_platform/ui"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const LOGO = "https://example.com/logo.png"
const FORET: MarqueDOrganisation = { theme: "foret", logo: LOGO, nomAffiche: "Démo Forêt" }
const PROMESSE =
  "Confiez vos procédures à des agents : ils lisent votre contexte, font le travail, et vous demandent votre accord quand il le faut."

function rendre(marque: MarqueDOrganisation | null, legende?: string) {
  return render(
    <EcranDAuthentification marque={marque} legende={legende}>
      <section aria-label="Îlot de test">Îlot</section>
    </EcranDAuthentification>,
  )
}

/** `true` quand `b` suit `a` dans le document ; `false` quand l'un des deux manque. */
function suit(a: Element | null | undefined, b: Element | null | undefined): boolean {
  if (!a || !b) return false
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe("EcranDAuthentification brand (AC-d3, M27 ; E05-S07, AC1, AC2)", () => {
  it("should render a single main and a single h1, the product, in the brand panel with the promise and its key word", () => {
    const { container } = rendre(null)

    expect(container.querySelectorAll("main")).toHaveLength(1)
    const titres = screen.getAllByRole("heading", { level: 1 })
    expect(titres.map((titre) => titre.textContent)).toEqual(["Oto"])
    const panneau = screen.getByRole("region", { name: "Oto" })
    expect(panneau).toContainElement(titres[0])
    expect(within(panneau).getByText("accord").tagName).toBe("SPAN")
  })

  it("should hide the compact brand, a drawing of the panel, from assistive technologies", () => {
    rendre(null)

    const promesseCompacte = screen.getByText(PROMESSE)
    expect(promesseCompacte.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByRole("region", { name: "Oto" })).not.toContainElement(promesseCompacte)
  })

  it("should date the bar with the year in Paris and say where the data is hosted (M27)", () => {
    // 23 h 30 à Greenwich le 31 décembre : déjà le 1er janvier à Paris.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"))

    rendre(null)

    const panneau = screen.getByRole("region", { name: "Oto" })
    expect(within(panneau).getByText("© 2027 Oto")).toBeInTheDocument()
    expect(within(panneau).getByText("Données hébergées en France")).toBeInTheDocument()
  })

  it("should hide every mark of Oto from assistive technologies", () => {
    const { container } = rendre(null)

    const marks = container.querySelectorAll(".oto-mark")
    // Le filigrane et le mark du panneau, le mark de la marque compacte.
    expect(marks).toHaveLength(3)
    for (const mark of marks) {
      expect(mark.closest('[aria-hidden="true"]')).not.toBeNull()
      expect(mark.querySelector("circle")).toHaveAttribute("r", "44")
    }
  })
})

describe("EcranDAuthentification organisation line (E05-S07, AC5)", () => {
  it("should show the logo, decorative, then the display name, above the island", () => {
    rendre(FORET)

    const logo = document.querySelector("img")
    expect(logo).toHaveAttribute("src", LOGO)
    expect(logo).toHaveAttribute("alt", "")
    expect(logo).toHaveAttribute("aria-hidden", "true")
    expect(logo).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(logo).toHaveAttribute("width", "32")
    expect(logo).toHaveAttribute("height", "32")
    const ligne = logo?.parentElement
    expect(ligne).toHaveTextContent(/^Démo Forêt$/)
    expect(ligne?.nextElementSibling).toBe(screen.getByRole("region", { name: "Îlot de test" }))
  })

  it("should show no organisation line without a brand", () => {
    const { container } = rendre(null)

    expect(screen.getByRole("region", { name: "Îlot de test" }).previousElementSibling).toBeNull()
    expect(container.querySelector("img")).toBeNull()
  })

  it("should render the legend under the island when given, and nothing otherwise", () => {
    const { rerender } = rendre(null, "Pas encore de compte ?")

    const legende = screen.getByText("Pas encore de compte ?")
    expect(legende.tagName).toBe("P")
    expect(suit(screen.getByRole("region", { name: "Îlot de test" }), legende)).toBe(true)

    rerender(
      <EcranDAuthentification marque={null}>
        <section aria-label="Îlot de test">Îlot</section>
      </EcranDAuthentification>,
    )
    expect(screen.getByRole("region", { name: "Îlot de test" }).nextElementSibling).toBeNull()
  })
})
