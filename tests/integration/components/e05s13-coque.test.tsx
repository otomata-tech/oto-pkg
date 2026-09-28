// E05-S13, lot B (retours du soir de JB) : la colonne de la Corbeille (AC-11), le titre d'une section du rail qui
// la plie (AC-12), plus de « Déplacer » en tête d'un contenu (AC-20). Le rangement du menu de l'entreprise (AC-10) :
// `rail-application.test.tsx`, `ecran-organisation.test.tsx` (fil) et `pages/admin-pages.test.tsx` (adresses par
// droit) ; « Commencer à écrire » (AC-21) : `ecran-de-noeud.test.tsx` et `editeur-de-blocs.test.tsx`.
import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { NodeView, TreeNode } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeLHote, ContexteDeRafraichissement, CoquilleOto, EcranDeLaCorbeille, EcranDeNoeud, RailSection } from "@otomata_tech/oto_platform/ui"
import { vueDuNoeud } from "../../helpers/noeud"

afterEach(() => {
  cleanup()
})

describe("EcranDeLaCorbeille, the purge column (AC-11)", () => {
  it("should head the purge column « Suppr. définitivement le », the date unchanged", () => {
    const item = { path: "conseil", title: "Conseil", kind: "page" as const, deletedAt: "2026-09-20T08:00:00Z", count: 1, purgeAt: "2026-10-20T08:00:00Z" }
    render(
      <CoquilleOto>
        <ContexteDeLHote.Provider value={{ Lien: "a", chemin: "/corbeille", naviguer: vi.fn() }}>
          <EcranDeLaCorbeille resultat={{ data: [item] }} prefixeDesPages="/n/" />
        </ContexteDeLHote.Provider>
      </CoquilleOto>,
    )

    const table = within(screen.getByRole("table", { name: "Les contenus à la corbeille" }))
    const entetes = table.getAllByRole("columnheader").map((entete) => entete.textContent)
    expect(entetes).toContain("Suppr. définitivement le")
    expect(entetes).not.toContain("Purge le")
    const [ligne] = table.getAllByRole("row").slice(1)
    expect(within(ligne).getAllByRole("cell")[entetes.indexOf("Suppr. définitivement le")]).toHaveTextContent("20 octobre 2026")
  })
})

describe("RailSection, folded by its title (AC-12)", () => {
  const AJOUTS = [{ label: "Page", onSelect: vi.fn() }]

  it("should fold and unfold by its title, one button carrying the chevron and the title, the « + » apart", () => {
    const plier = vi.fn()
    const { rerender } = render(<RailSection label="Ventes" expanded onToggle={plier} controls="arbre-ventes" addItems={AJOUTS} />)

    const pli = screen.getByRole("button", { name: "Replier Ventes" })
    // Un seul contrôle : le titre visible est dans le bouton, atteint au clavier comme tout bouton natif.
    expect(pli.tagName).toBe("BUTTON")
    expect(pli).toHaveTextContent("Ventes")
    expect(pli).not.toHaveAttribute("tabindex")
    expect(pli).toHaveAttribute("aria-expanded", "true")
    expect(pli).toHaveAttribute("aria-controls", "arbre-ventes")
    // Le « + » reste un bouton à part, hors du pli.
    const plus = screen.getByRole("button", { name: "Créer dans Ventes" })
    expect(pli).not.toContainElement(plus)
    expect(screen.getAllByRole("button")).toHaveLength(2)

    fireEvent.click(within(pli).getByText("Ventes"))
    expect(plier).toHaveBeenCalledWith(false)

    rerender(<RailSection label="Ventes" expanded={false} onToggle={plier} controls="arbre-ventes" addItems={AJOUTS} />)
    const replie = screen.getByRole("button", { name: "Déplier Ventes" })
    expect(replie).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(replie)
    expect(plier).toHaveBeenLastCalledWith(true)
  })

  it("should keep the link of a title that opens a page, the chevron alone folding", () => {
    const plier = vi.fn()
    render(<RailSection label="Ventes" to="/n/ventes" expanded onToggle={plier} controls="arbre-ventes" />)

    expect(screen.getByRole("link", { name: "Ventes" })).toHaveAttribute("href", "/n/ventes")
    const pli = screen.getByRole("button", { name: "Replier Ventes" })
    expect(pli).not.toHaveTextContent("Ventes")
    fireEvent.click(pli)
    expect(plier).toHaveBeenCalledWith(false)
  })
})

describe("EcranDeNoeud, no « Déplacer » in the header (AC-20)", () => {
  const ARBRE: TreeNode[] = [
    {
      path: "guide",
      kind: "page",
      title: "Guide de Démo",
      status: "published",
      children: [{ path: "ventes", kind: "page", title: "Ventes", status: "published", children: [] }],
    },
  ]

  function Lien({ children, ...props }: { href: string; children: ReactNode }) {
    return <a {...props}>{children}</a>
  }

  // Au niveau gestion, là où il était offert (E05-S10, AC-b4) : une page, une procédure, un tableau, un Contexte.
  it.each<[string, Partial<NodeView>]>([
    ["a page", {}],
    ["a procedure", { kind: "procedure" }],
    ["a table", { kind: "table", blocks: [] }],
    ["a Contexte", { kind: "context", path: "ventes/contexte" }],
  ])("should offer no « Déplacer » on %s, even at the management level", (_cas, surcharge) => {
    render(
      <ContexteDeRafraichissement.Provider value={vi.fn()}>
        <EcranDeNoeud
          chemin="ventes/modele_relance"
          noeud={{ data: vueDuNoeud({ level: 3, childrenTotal: 1, ...surcharge }) }}
          arbre={{ data: { tree: ARBRE, truncated: false } }}
          equipes={{ data: [{ slug: "ventes", name: "Ventes" }] }}
          handle="claire"
          nomOrganisation="Démo"
          versionPubliee={false}
          Lien={Lien}
          hrefDuChemin={(chemin) => `/n/${chemin}`}
          prefixeDesPages="/n/"
        />
      </ContexteDeRafraichissement.Provider>,
    )

    expect(screen.queryByRole("button", { name: /^Déplacer/ })).toBeNull()
  })
})
