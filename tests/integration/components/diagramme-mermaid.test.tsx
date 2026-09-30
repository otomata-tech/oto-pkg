import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BlockView } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeRafraichissement } from "@otomata_tech/oto_platform/ui"
import { EditeurDeBlocs } from "../../../packages/plateforme/ui/noeud/editeur/editeur-de-blocs"
import { FileDOperations } from "../../../packages/plateforme/ui/noeud/editeur/file-d-operations"
import { RenduDUnBloc } from "../../../packages/plateforme/ui/noeud/rendu-des-blocs"
import { ouvrirLeChamp } from "../../helpers/champ-du-bloc"
import { bloc, ID, simulerLAPI } from "../../helpers/noeud"

// Un bloc `mermaid` (1.1.3) à la lecture, par `RenduDUnBloc` : le texte rendu d'abord, puis le dessin de mermaid,
// chargé dans le navigateur ; un texte que mermaid ne lit pas garde son texte et le dit ; le thème suit `.dark`. Dans
// l'éditeur : la forme « Diagramme », son champ au dessin du code, son dessin dessous hors du focus.
// Mermaid est simulé : sous jsdom, sans mise en page SVG, le vrai met plus de 20 s à se charger et ne mesure rien. Il
// n'est résolu que depuis le paquet (pnpm) : le chemin simulé est le sien. L'assainissement du SVG (DOMPurify, mode
// `strict`) est celui de mermaid, non rejoué ici.

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }))
vi.mock("mermaid", () => ({ default: mermaid }))

const LU = "0000000d-0000-4000-8000-000000000000"
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>A</text></svg>'

/** jsdom n'a pas `getBBox` : sans lui le composant garde le texte, comme un navigateur sans mise en page SVG. */
function mesurer(): void {
  Object.defineProperty(SVGGraphicsElement.prototype, "getBBox", { configurable: true, value: () => ({ x: 0, y: 0, width: 40, height: 16 }) })
}

beforeEach(() => {
  mermaid.initialize.mockReset()
  mermaid.render.mockReset()
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(SVGGraphicsElement.prototype, "getBBox")
  document.documentElement.classList.remove("dark")
})

function lire(texte: string) {
  return render(<RenduDUnBloc bloc={bloc(LU, "mermaid", texte)} Lien="a" hrefDuChemin={(chemin) => `/n/${chemin}`} />)
}

describe("DiagrammeMermaid — a mermaid block at reading (1.1.3)", () => {
  it("should serve its text, legend and anchor, and load nothing without SVG layout", async () => {
    const { container } = lire("graph TD; A-->B")
    expect(screen.getByText("Diagramme (texte)")).toBeInTheDocument()
    expect(screen.getByText("graph TD; A-->B")).toBeInTheDocument()
    expect(container.querySelector(`[id="${LU.slice(0, 8)}"]`)).not.toBeNull()
    await act(async () => {})
    expect(mermaid.render).not.toHaveBeenCalled()
    expect(screen.queryByText("Diagramme invalide")).toBeNull()
  })

  it("should keep the text and say the diagram is invalid when mermaid cannot read it", async () => {
    mesurer()
    mermaid.render.mockRejectedValue(new Error("Parse error on line 1"))
    lire("ceci n'est pas un diagramme")
    expect(await screen.findByText("Diagramme invalide")).toBeInTheDocument()
    expect(screen.getByText("ceci n'est pas un diagramme")).toBeInTheDocument()
    expect(screen.queryByRole("img")).toBeNull()
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true }))
  })

  it("should draw a valid diagram, named by its title, with its text behind « Voir le code »", async () => {
    mesurer()
    mermaid.render.mockResolvedValue({ svg: SVG })
    lire("---\ntitle: Circuit des devis\n---\ngraph TD; A-->B")
    const dessin = await screen.findByRole("img", { name: "Diagramme : Circuit des devis" })
    expect(dessin.querySelector("svg")).not.toBeNull()
    expect(screen.getByText("Voir le code").closest("details")).toContainElement(screen.getByText("Diagramme (texte)"))
    expect(mermaid.render).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-[\w-]+$/), "---\ntitle: Circuit des devis\n---\ngraph TD; A-->B")
  })

  it("should draw in the dark theme under .dark, and draw again when the mode changes", async () => {
    mesurer()
    mermaid.render.mockResolvedValue({ svg: SVG })
    document.documentElement.classList.add("dark")
    lire("graph TD; A-->B")
    await screen.findByRole("img", { name: "Diagramme : graph TD; A-->B" })
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "dark" }))
    document.documentElement.classList.remove("dark")
    await waitFor(() => expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "neutral" })))
    const [premier, second] = mermaid.render.mock.calls.map(([cible]) => cible)
    expect(second).not.toBe(premier)
  })
})

function editer(blocs: BlockView[]) {
  const api = simulerLAPI()
  render(
    <ContexteDeRafraichissement.Provider value={vi.fn()}>
      <FileDOperations chemin="ventes/modele_relance" revisionPubliee={4} tampon={null}>
        <EditeurDeBlocs blocs={blocs} revisionServie={4} prefixeDesPages="/n/" />
      </FileDOperations>
      <button type="button">Ailleurs</button>
    </ContexteDeRafraichissement.Provider>,
  )
  return api
}

describe("DiagrammeMermaid — the « Diagramme » form of the editor (1.1.3)", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("should write a diagram in a field drawn as code, draw it below out of focus only, and send it as a mermaid block", async () => {
    mesurer()
    mermaid.render.mockResolvedValue({ svg: SVG })
    const api = editer([bloc(ID.code, "mermaid", "graph TD; A-->B")])
    const champ = screen.getByRole("textbox", { name: "Modifier ce diagramme — graph TD; A-->B" })
    expect(champ).toHaveAttribute("data-kind", "code")
    await screen.findByRole("img", { name: "Diagramme : graph TD; A-->B" })
    expect(screen.queryByText("Voir le code")).toBeNull()
    // Pendant la frappe, pas de dessin. Le bloc lu cède sa place au champ ouvert (1.1.3).
    const ouvert = ouvrirLeChamp("Modifier ce diagramme — graph TD; A-->B")
    expect(screen.queryByRole("img")).toBeNull()
    fireEvent.change(ouvert, { target: { value: "graph LR; A-->C" } })
    act(() => screen.getByRole("button", { name: "Ailleurs" }).focus())
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "replace_block", block: ID.code, revision: 3, input: { type: "mermaid", text: "graph LR; A-->C", data: {} } }])
    await screen.findByRole("img", { name: "Diagramme : graph LR; A-->C" })
  })

  it("should insert an empty « Diagramme » from the « + » without sending it nor drawing it", async () => {
    mesurer()
    const api = editer([bloc(ID.objet, "paragraph", "Objet de la relance")])
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un bloc après — Objet de la relance" }))
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Diagramme" }))
    await screen.findByRole("textbox", { name: "Modifier ce diagramme — bloc vide" })
    act(() => screen.getByRole("button", { name: "Ailleurs" }).focus())
    await act(async () => {})
    // Quitté, le champ peut s'être démonté (1.1.3) : le bloc se relit, il reste.
    expect(screen.getByRole("textbox", { name: "Modifier ce diagramme — bloc vide" })).toBeInTheDocument()
    expect(api.envoyes).toEqual([])
    expect(mermaid.render).not.toHaveBeenCalled()
    expect(screen.queryByText("Diagramme invalide")).toBeNull()
  })
})
