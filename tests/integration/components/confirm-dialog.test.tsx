// Le dialogue de confirmation du design system (M44) : ses deux boutons par défaut, remplaçables ou absents,
// et le focus rendu à ce qui l'a ouvert quand « Annuler » le démonte. Les confirmations du paquet qui le
// reprennent gardent leurs tests (`gestes-equipes.test.tsx`).
import { useState } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ConfirmDialog } from "../../../packages/plateforme/ui/ds/react/confirm-dialog"
import { simulerLesDialogues } from "../../helpers/dialogue"

const TITRE = "Supprimer Ventes ?"

const dialogue = () => within(screen.getByRole("dialog", { name: TITRE }))

beforeAll(simulerLesDialogues)

afterEach(cleanup)

describe("ConfirmDialog", () => {
  it("should carry « Annuler » then the destructive gesture, neither the default button nor the first focusable", () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const { rerender } = render(
      <ConfirmDialog open title={TITRE} onCancel={onCancel} confirmLabel="Supprimer l'équipe" onConfirm={onConfirm}>
        <p>Ses règles d&apos;accès tombent.</p>
      </ConfirmDialog>,
    )

    const boutons = dialogue().getAllByRole("button")
    // Le `<dialog>` natif focalise son premier élément focalisable : « Fermer », jamais le geste.
    expect(boutons.map((bouton) => bouton.textContent)).toEqual(["", "Annuler", "Supprimer l'équipe"])
    expect(boutons[0]).toHaveAccessibleName("Fermer")
    const [, annuler, geste] = boutons
    expect(annuler).toHaveAttribute("data-variant", "secondary")
    expect(geste).toHaveAttribute("data-variant", "danger")
    expect(geste).toHaveAttribute("type", "button")
    fireEvent.click(geste)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(annuler)
    expect(onCancel).toHaveBeenCalledTimes(1)

    rerender(
      <ConfirmDialog open title={TITRE} onCancel={onCancel} confirmLabel="Suppression…" onConfirm={onConfirm} busy>
        <p>Ses règles d&apos;accès tombent.</p>
      </ConfirmDialog>,
    )
    const enCours = dialogue().getByRole("button", { name: "Suppression…" })
    expect(enCours).toBeDisabled()
    expect(enCours).toHaveAttribute("aria-busy", "true")
    fireEvent.click(enCours)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("should name the refusal otherwise, or replace both buttons by the footer it receives", () => {
    const { rerender } = render(<ConfirmDialog open title={TITRE} onCancel={vi.fn()} cancelLabel="Garder l'invitation" confirmLabel="Annuler l'invitation" onConfirm={vi.fn()} />)
    expect(dialogue().getAllByRole("button").map((bouton) => bouton.textContent)).toEqual(["", "Garder l'invitation", "Annuler l'invitation"])

    rerender(<ConfirmDialog open title={TITRE} onCancel={vi.fn()} footer={<button type="button">Compris</button>} />)
    expect(dialogue().getAllByRole("button").map((bouton) => bouton.textContent)).toEqual(["", "Compris"])
  })

  it("should render no footer at all when it receives none", () => {
    render(<ConfirmDialog open title={TITRE} onCancel={vi.fn()} footer={null} />)

    expect(dialogue().getAllByRole("button").map((bouton) => bouton.getAttribute("aria-label"))).toEqual(["Fermer"])
    expect(screen.getByRole("dialog", { name: TITRE }).querySelector("footer")).toBeNull()
  })

  it("should give the focus back to its opener when « Annuler » takes it away", async () => {
    function Ouvreur() {
      const [ouvert, setOuvert] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOuvert(true)}>
            Supprimer…
          </button>
          {ouvert && <ConfirmDialog open title={TITRE} onCancel={() => setOuvert(false)} confirmLabel="Supprimer l'équipe" onConfirm={vi.fn()} />}
        </>
      )
    }
    render(<Ouvreur />)
    const ouvreur = screen.getByRole("button", { name: "Supprimer…" })
    ouvreur.focus()
    fireEvent.click(ouvreur)
    const annuler = dialogue().getByRole("button", { name: "Annuler" })
    // Au clavier, « Annuler » a le focus quand il est pressé : le démontage l'emporte avec le dialogue.
    annuler.focus()
    fireEvent.click(annuler)

    expect(screen.queryByRole("dialog", { name: TITRE })).toBeNull()
    await waitFor(() => expect(ouvreur).toHaveFocus())
  })
})
