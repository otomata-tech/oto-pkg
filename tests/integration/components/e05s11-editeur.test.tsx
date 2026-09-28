import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BlockView } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeRafraichissement } from "@otomata_tech/oto_platform/ui"
import { EditeurDeBlocs } from "../../../packages/plateforme/ui/noeud/editeur/editeur-de-blocs"
import { FileDOperations } from "../../../packages/plateforme/ui/noeud/editeur/file-d-operations"
import { TitreModifiable } from "../../../packages/plateforme/ui/noeud/en-tete-modifiable"
import type { CiblesDesLiens } from "../../../packages/plateforme/ui/noeud/en-ligne"
import { bloc, PAGE, simulerLAPI } from "../../helpers/noeud"

// L'éditeur d'une page après les retours de JB (E05-S11, lot b) : l'indication d'enregistrement dans la carte du
// document, qui se tait 5 s après la dernière écriture réussie, titre compris (AC-1, AC-2) ; les pages citées lues
// dans la phrase au repos (AC-26, AC-27) ; tout le texte d'un bloc sélectionné ouvre le menu de sa poignée, sans
// prendre le focus (AC-28). Sous la file d'écriture, `fetch` simulé pour `POST /api/plateforme/nodes`. La position
// de l'indication (rien ne bouge) se mesure dans un navigateur : `tests/e2e/e05s11-page.spec.ts`.

// Le lien que l'écran serveur passe à l'éditeur, déjà rendu.
const VERSION_PUBLIEE = "/n/ventes/modele_relance?version=publiee"
const rafraichir = vi.fn()
let api: ReturnType<typeof simulerLAPI>

type Montage = { blocs?: BlockView[]; cibles?: CiblesDesLiens; liens?: Promise<{ data: Record<string, unknown> }> }

function monter({ blocs = PAGE, cibles, liens }: Montage = {}) {
  const page = (contenu: ReactNode) => (
    <ContexteDeRafraichissement.Provider value={rafraichir}>
      <FileDOperations chemin="ventes/modele_relance" revisionPubliee={4} tampon={null}>
        {contenu}
      </FileDOperations>
      <button type="button">Ailleurs</button>
    </ContexteDeRafraichissement.Provider>
  )
  return render(
    page(
      <>
        <h1>
          <TitreModifiable titre="Modèle de relance" revisionServie={4} tamponServi={null} />
        </h1>
        <EditeurDeBlocs
          niveau={3}
          blocs={blocs}
          revisionServie={4}
          phraseDePublication="La publication revient aux administrateurs de Démo."
          prefixeDesPages="/n/"
          lienVersionPubliee={<a href={VERSION_PUBLIEE}>Voir la version publiée</a>}
          cibles={cibles}
          liens={liens}
        />
      </>,
    ),
  )
}

function champ(nom: string): HTMLTextAreaElement {
  const element = screen.getByRole("textbox", { name: nom })
  if (!(element instanceof HTMLTextAreaElement)) throw new Error(`champ « ${nom} » attendu`)
  return element
}

/** L'indication d'enregistrement de la carte : une seule région pour les blocs, le titre et la publication. */
function indication(): HTMLElement {
  const region = document.querySelector<HTMLElement>(".oto-indication-d-enregistrement")
  if (!region) throw new Error("indication d'enregistrement absente")
  return region
}

beforeEach(() => {
  api = simulerLAPI()
  rafraichir.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("EditeurDeBlocs, indication d'enregistrement (E05-S11, AC-1, AC-2)", () => {
  it("should say « Enregistrement… » then « Enregistré. » in the card, silent 5 s after the last successful write, the title included", async () => {
    vi.useFakeTimers()
    monter()
    // Dans la carte du document (l'îlot de lecture), montée vide.
    expect(indication()).toHaveAttribute("role", "status")
    expect(indication().closest(".oto-island-body")).not.toBeNull()
    expect(indication()).toBeEmptyDOMElement()

    const texte = champ("Modifier ce texte — Objet de la relance")
    act(() => texte.focus())
    fireEvent.change(texte, { target: { value: "Objet revu" } })
    fireEvent.keyDown(texte, { key: "Escape" })
    expect(indication()).toHaveTextContent("Enregistrement…")
    expect(indication()).toHaveAttribute("aria-busy", "true")
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(indication()).toHaveTextContent("Enregistré.")
    expect(indication()).toHaveAttribute("aria-busy", "false")

    // Une nouvelle écriture, celle du titre écrit en place, le remplace par « Enregistrement… », dans la même région.
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    const titre = champ("Titre")
    act(() => titre.focus())
    fireEvent.change(titre, { target: { value: "Modèle revu" } })
    act(() => titre.blur())
    expect(indication()).toHaveTextContent("Enregistrement…")
    expect(within(screen.getByRole("heading", { level: 1 })).queryByRole("status")).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(api.envoyes.at(-1)).toMatchObject({ title: "Modèle revu" })
    expect(indication()).toHaveTextContent("Enregistré.")

    // La publication seule part 3 s après la dernière frappe, et se dit de même ; 5 s après elle, plus rien.
    await act(() => vi.advanceTimersByTimeAsync(3_000))
    expect(api.envoyes.at(-1)).toMatchObject({ publish: true })
    expect(indication()).toHaveTextContent("Enregistré.")
    await act(() => vi.advanceTimersByTimeAsync(4_999))
    expect(indication()).toHaveTextContent("Enregistré.")
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(indication()).toBeEmptyDOMElement()
  })

  it("should keep the alert of a refused write and say nothing in the card", async () => {
    monter()
    api.refuser("forbidden", 403)
    const texte = champ("Modifier ce texte — Objet de la relance")
    act(() => texte.focus())
    fireEvent.change(texte, { target: { value: "Objet revu" } })
    fireEvent.keyDown(texte, { key: "Escape" })
    expect(await screen.findByRole("alert")).toHaveTextContent(/Vous n'avez pas le droit de modifier cette page/)
    expect(indication()).toBeEmptyDOMElement()
  })
})

describe("EditeurDeBlocs, pages citées au repos (E05-S11, AC-26, AC-27)", () => {
  it("should read a cited page by its title in the sentence, a page with no visible target as plain text, and follow a moved one once the links are read", async () => {
    let servir: (lu: { data: Record<string, unknown> }) => void = () => {}
    const liens = new Promise<{ data: Record<string, unknown> }>((resolve) => (servir = resolve))
    const cibles: CiblesDesLiens = { "ventes/grille": { titre: "Grille tarifaire", chemin: "ventes/grille" }, "ventes/perdue": null, "ventes/ancien": null }
    await act(async () => {
      monter({ blocs: [bloc(PAGE[1].id, "paragraph", "Voir [[ventes/grille]], [[ventes/perdue]] et [[ventes/ancien]].")], cibles, liens })
    })
    const texte = screen.getByRole("textbox", { name: /^Modifier ce texte — Voir/ })
    const rendu = texte.parentElement?.querySelector<HTMLElement>(".oto-block-rendu")
    if (!rendu) throw new Error("rendu au repos absent")
    expect(rendu).toHaveTextContent("Voir Grille tarifaire, perdue et ancien.")
    expect(within(rendu).getAllByRole("link").map((lien) => [lien.textContent, lien.getAttribute("href")])).toEqual([["Grille tarifaire", "/n/ventes/grille"]])
    // Le texte brut reste celui du champ : c'est lui qui s'écrit au focus.
    expect(texte).toHaveValue("Voir [[ventes/grille]], [[ventes/perdue]] et [[ventes/ancien]].")
    await act(async () => {
      servir({ data: { links_out: [{ path: "ventes/ancien", status: "moved", title: "Nouveau", moved_to: "conseil/nouveau" }], links_out_total: 1, links_in: [], links_in_total: 0 } })
    })
    await waitFor(() => expect(within(rendu).getByRole("link", { name: "Nouveau" })).toHaveAttribute("href", "/n/conseil/nouveau"))
  })
})

describe("EditeurDeBlocs, tout sélectionner (E05-S11, AC-28)", () => {
  /** La sélection posée dans le champ (⌘A, un glissé), puis la touche relâchée, où React relit la sélection (`onSelect`). */
  function selectionner(element: HTMLTextAreaElement, debut: number, fin: number) {
    element.setSelectionRange(debut, fin)
    fireEvent.keyUp(element, { key: "a", ctrlKey: true })
  }

  it("should open the menu of the handle when the whole text is selected, without taking the focus, and close it on Escape or the next keystroke", () => {
    monter()
    const texte = champ("Modifier ce texte — Objet de la relance")
    const poignee = screen.getByRole("button", { name: "Actions sur ce bloc — Objet de la relance" })
    act(() => texte.focus())

    // Une sélection partielle n'ouvre rien.
    selectionner(texte, 0, 5)
    expect(screen.queryByRole("menu")).toBeNull()

    selectionner(texte, 0, texte.value.length)
    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(poignee).toHaveAttribute("aria-expanded", "true")
    expect(document.activeElement).toBe(texte)

    // Échap le ferme, rien d'autre : le focus reste dans le texte.
    fireEvent.keyDown(texte, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(texte)
    expect(api.envoyes).toHaveLength(0)

    // La frappe suivante le ferme, et s'écrit ; une touche de modification seule ne le ferme pas.
    selectionner(texte, 0, texte.value.length)
    fireEvent.keyDown(texte, { key: "Control" })
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.keyDown(texte, { key: "x" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(texte)

    // Un choix du menu ouvert par la sélection s'exécute.
    selectionner(texte, 0, texte.value.length)
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Dupliquer" }))
    expect(screen.getAllByRole("textbox", { name: "Modifier ce texte — Objet de la relance" })).toHaveLength(2)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("should open nothing when the selected text is empty", () => {
    monter()
    const texte = champ("Modifier ce texte — Objet de la relance")
    act(() => texte.focus())
    fireEvent.change(texte, { target: { value: "   " } })
    selectionner(texte, 0, 3)
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
