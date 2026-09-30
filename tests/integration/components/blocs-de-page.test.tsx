import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { BlockView } from "@otomata_tech/oto_platform/schemas"
import { Reader } from "../../../packages/plateforme/ui/ds/react/reader"
import { CADRE_DU_TABLEAU } from "../../../packages/plateforme/ui/noeud/libelles"
import { RenduDUnBloc } from "../../../packages/plateforme/ui/noeud/rendu-des-blocs"
import { bloc } from "../../helpers/noeud"

// Les formes de page d'E10-S04 à l'écran, par `RenduDUnBloc` (lecture, éditeur au repos, page publique) :
// tableau simple (AC-a1), séparateur (AC-a2), repli (AC-a3), listes imbriquées (AC-b1), titres `h2` à `h6`
// (AC-b3), marques en ligne dans une cellule (AC-c1) ; aucun HTML injecté (`security-patterns.md § XSS Prevention`).

afterEach(cleanup)

function LienDeTest({ children, ...props }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a data-lien-hote="" {...props}>
      {children}
    </a>
  )
}

function rendre(blocs: BlockView[], baliseDeTitre?: "h3") {
  return render(
    <div>
      {blocs.map((un) => (
        <RenduDUnBloc key={un.id} bloc={un} Lien={LienDeTest} hrefDuChemin={(chemin) => `/n/${chemin}`} baliseDeTitre={baliseDeTitre} />
      ))}
    </div>,
  )
}

const id = (rang: number) => `${String(rang).padStart(8, "0")}-0000-4000-8000-000000000000`

describe("RenduDUnBloc — page markdown forms (E10-S04)", () => {
  it("should render a simple table with column headers, alignments, inline marks, and HTML as text (AC-a1)", () => {
    const { container } = rendre([
      bloc(id(1), "simple_table", null, {
        columns: ["Sujet", "Décision", "Montant"],
        rows: [["Devis \\| Acme", "~~Relancer~~<br>Appeler", "<script>alert(1)</script>"]],
        align: ["left", "center", "right"],
      }),
    ])
    const tableau = screen.getByRole("table")
    expect(tableau.closest("div")).toHaveAttribute("id", "00000001")
    expect(within(tableau).getAllByRole("columnheader").map((entete) => [entete.textContent, entete.getAttribute("scope"), entete.getAttribute("data-align")])).toEqual([
      ["Sujet", "col", null],
      ["Décision", "col", "center"],
      ["Montant", "col", "end"],
    ])
    const cellules = within(tableau).getAllByRole("cell")
    expect(cellules.map((cellule) => cellule.textContent)).toEqual(["Devis | Acme", "RelancerAppeler", "<script>alert(1)</script>"])
    expect(cellules[1].querySelector("s")?.textContent).toBe("Relancer")
    expect(cellules[1].querySelector("br")).not.toBeNull()
    expect(container.querySelector("script")).toBeNull()
  })

  // 1.1.5 : la colonne de lecture est centrée (`content.css`) ; un tableau, enfant direct du corps de lecture, s'en élargit
  // et défile dans son propre cadre, que le clavier atteint. Les largeurs se mesurent au navigateur, pas sous jsdom.
  it("should render each table, simple or written as text, in its own named keyboard-focusable scroll frame, a direct child of the reading body", () => {
    const { container } = render(
      <Reader>
        <RenduDUnBloc bloc={bloc(id(9), "simple_table", null, { columns: ["A", "B"], rows: [["1", "2"]] })} Lien={LienDeTest} hrefDuChemin={(chemin) => `/n/${chemin}`} />
        <RenduDUnBloc bloc={bloc(id(10), "paragraph", "| A | B |\n|---|---|\n| 1 | 2 |", {})} Lien={LienDeTest} hrefDuChemin={(chemin) => `/n/${chemin}`} />
      </Reader>,
    )
    const corps = container.querySelector(".oto-island-body[data-reading]")
    const simple = screen.getByRole("region", { name: CADRE_DU_TABLEAU.simple })
    const texte = screen.getByRole("region", { name: CADRE_DU_TABLEAU.texte })
    expect(corps).toHaveAttribute("data-reading", "")
    expect(simple).toHaveClass("oto-table-wrap")
    expect(within(simple).getByRole("table")).toBeInTheDocument()
    expect(texte.tagName).toBe("PRE")
    expect(texte).toHaveClass("oto-code")
    for (const cadre of [simple, texte]) {
      expect(cadre.parentElement).toBe(corps)
      expect(cadre).toHaveAttribute("tabindex", "0")
    }
  })

  it("should render a divider as a horizontal rule without an added role (AC-a2)", () => {
    const { container } = rendre([bloc(id(2), "divider", null, {})])
    const filet = container.querySelector("hr")
    expect(filet).toHaveAttribute("id", "00000002")
    expect(filet).toHaveAttribute("data-orientation", "horizontal")
    expect(filet).not.toHaveAttribute("role")
  })

  it("should render a toggle closed, its summary as title, open it, its body with kept lines and each fence as code, HTML as text (AC-a3)", () => {
    const { container } = rendre([bloc(id(3), "toggle", "Ligne un\nLigne <script>deux</script>\n```sql\nselect 1\n```", { summary: "Voir **le détail**" })])
    const repli = container.querySelector("details")
    expect(repli).toHaveAttribute("id", "00000003")
    expect(repli).not.toHaveAttribute("open")
    const resume = container.querySelector("summary")
    expect(resume?.textContent).toBe("Voir le détail")
    expect(resume?.querySelector("strong strong")?.textContent).toBe("le détail")
    if (resume) fireEvent.click(resume)
    expect(repli).toHaveAttribute("open")
    expect(repli?.querySelector("p")?.textContent).toBe("Ligne un\nLigne <script>deux</script>")
    expect(repli?.querySelector("figure code")?.textContent).toBe("select 1")
    expect(repli?.querySelector("figcaption")?.textContent).toBe("Code · sql")
    expect(container.querySelector("script")).toBeNull()
  })

  it("should render nested lists as nested ul and ol, each with its start (AC-b1)", () => {
    const { container } = rendre([
      bloc(id(4), "list", null, {
        items: ["a", { text: "b", children: { items: ["c", { text: "d", children: { items: ["e"], ordered: true, start: 3 } }] } }],
        ordered: true,
        start: 2,
      }),
    ])
    const premiere = container.querySelector("ol")
    expect(premiere).toHaveAttribute("start", "2")
    expect(container.querySelector("div > ol > li > ul > li > ol")).toHaveAttribute("start", "3")
    expect(container.querySelector("div > ol > li > ul > li > ol > li")?.textContent).toBe("e")
  })

  it("should give a heading of level N the tag h(N+1), bounded to h6, and h(N+2) under baliseDeTitre h3 (AC-b3)", () => {
    const titres = [1, 2, 3, 4, 5].map((niveau) => bloc(id(10 + niveau), "heading", `Niveau ${niveau}`, { level: niveau }))
    rendre(titres)
    expect(screen.getAllByRole("heading").map((titre) => titre.tagName)).toEqual(["H2", "H3", "H4", "H5", "H6"])
    cleanup()
    rendre(titres, "h3")
    expect(screen.getAllByRole("heading").map((titre) => titre.tagName)).toEqual(["H3", "H4", "H5", "H6", "H6"])
  })
})
