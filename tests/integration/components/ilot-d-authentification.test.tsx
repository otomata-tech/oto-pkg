// L'îlot des écrans d'authentification, porté d'oto-frontend (E05-S09, partie d3 ; E05-S07, AC6) : îlot
// nommé par son titre, région d'annonce montée vide, repli du focus sur le titre à l'arrivée d'un statut,
// pied facultatif.
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { IlotDAuthentification } from "@otomata_tech/oto_platform/ui"

afterEach(cleanup)

const MESSAGE = "Si une invitation ou un compte existe pour cette adresse, un lien de connexion vient de partir."

function ilot(statut?: string) {
  return (
    <IlotDAuthentification titre="Se connecter" statut={statut}>
      <button type="button">Recevoir un lien de connexion</button>
    </IlotDAuthentification>
  )
}

/** La région d'annonce de l'îlot : la première, montée d'emblée ; l'`Alert` du statut s'y loge. */
const region = () => screen.getAllByRole("status")[0]

describe("IlotDAuthentification (AC-d3 ; E05-S07, AC6)", () => {
  it("should be a section named by its title, an h2 out of the tab order", () => {
    render(ilot())

    const titre = screen.getByRole("heading", { level: 2, name: "Se connecter" })
    const section = screen.getByRole("region", { name: "Se connecter" })
    expect(section.tagName).toBe("SECTION")
    expect(section).toContainElement(titre)
    expect(titre).toHaveAttribute("tabindex", "-1")
  })

  it("should open its body with the status region, mounted empty", () => {
    render(ilot())

    const statuts = screen.getAllByRole("status")
    expect(statuts).toHaveLength(1)
    expect(statuts[0]).toBeEmptyDOMElement()
    expect(statuts[0].parentElement?.firstElementChild).toBe(statuts[0])
    expect(statuts[0].parentElement).toContainElement(screen.getByRole("button", { name: "Recevoir un lien de connexion" }))
  })

  it("should write the status in the region, once, and move the focus to the title", () => {
    const { rerender } = render(ilot())
    const titre = screen.getByRole("heading", { level: 2 })

    rerender(ilot(MESSAGE))

    expect(within(region()).getByText(MESSAGE)).toBeInTheDocument()
    expect(screen.getAllByText(MESSAGE)).toHaveLength(1)
    // Une seule région vivante : l'`Alert` du statut n'en est pas une seconde, imbriquée (M31).
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(document.activeElement).toBe(titre)
  })

  it("should focus the title again when the status is emptied, then set again", () => {
    const { rerender } = render(ilot(MESSAGE))
    const titre = screen.getByRole("heading", { level: 2 })
    const bouton = screen.getByRole("button", { name: "Recevoir un lien de connexion" })
    bouton.focus()

    rerender(ilot(""))
    expect(region()).toBeEmptyDOMElement()
    expect(document.activeElement).toBe(bouton)

    rerender(ilot(MESSAGE))
    expect(region()).toHaveTextContent(MESSAGE)
    expect(document.activeElement).toBe(titre)
  })

  it("should render the foot in a footer, and no footer without it", () => {
    const { container, rerender } = render(ilot())
    expect(container.querySelector("footer")).toBeNull()

    rerender(
      <IlotDAuthentification titre="Connexion" pied={<button type="submit">Continuer</button>}>
        <p>Cliquez pour ouvrir votre session.</p>
      </IlotDAuthentification>,
    )

    expect(screen.getByRole("button", { name: "Continuer" }).closest("footer")).not.toBeNull()
  })
})
