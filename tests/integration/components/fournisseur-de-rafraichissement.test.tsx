import { useContext } from "react"
import Link from "next/link"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ContexteDeLHote, useRafraichir } from "@otomata_tech/oto_platform/ui"
import { FournisseurDeRafraichissement } from "@/app/(dashboard)/fournisseur-de-rafraichissement"
import { logoutAction } from "@/lib/actions/auth"

// La relecture que le layout `(dashboard)` donne aux îlots du paquet (E05-S03, AC3) : `router.refresh()`
// de l'App Router (simulé : hors de son routeur), jamais un rechargement du document ; et ce qu'il prête
// au rail (E05-S09, AC-a6) : son lien, l'adresse courante, `router.push` et la déconnexion.

const routeur = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))

vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/n/ventes" }))

vi.mock("@/lib/actions/auth", () => ({ logoutAction: vi.fn() }))

/** Un îlot du paquet qui relit la page après sa mutation. */
function Ilot() {
  const rafraichir = useRafraichir()
  return (
    <button type="button" onClick={rafraichir}>
      Relire
    </button>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("FournisseurDeRafraichissement (AC3)", () => {
  it("should give the islands the refresh of the router, without reloading the document", () => {
    const reload = vi.fn()
    vi.stubGlobal("location", { ...window.location, reload })
    render(
      <FournisseurDeRafraichissement>
        <Ilot />
      </FournisseurDeRafraichissement>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Relire" }))

    expect(routeur.refresh).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe("FournisseurDeRafraichissement, the host lent to the rail (E05-S09, AC-a6)", () => {
  /** Un îlot du rail : il lit ce que l'hôte lui prête. */
  function Rail() {
    const hote = useContext(ContexteDeLHote)
    return (
      <>
        <p>{`${hote.chemin} ${hote.Lien === Link ? "next/link" : "autre lien"}`}</p>
        <button type="button" onClick={() => hote.naviguer("/teams")}>
          Équipes
        </button>
        <button type="button" onClick={() => hote.deconnecter?.()}>
          Déconnexion
        </button>
      </>
    )
  }

  it("should lend next/link, the current path, router.push without reloading, and the host's logout", () => {
    render(
      <FournisseurDeRafraichissement>
        <Rail />
      </FournisseurDeRafraichissement>,
    )

    expect(screen.getByText("/n/ventes next/link")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Équipes" }))
    expect(routeur.push).toHaveBeenCalledWith("/teams")
    fireEvent.click(screen.getByRole("button", { name: "Déconnexion" }))
    expect(logoutAction).toHaveBeenCalledTimes(1)
  })
})
