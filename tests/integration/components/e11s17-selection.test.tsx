import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderBlocks, type BlockView } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeRafraichissement } from "@otomata_tech/oto_platform/ui"
import { EditeurDeBlocs } from "../../../packages/plateforme/ui/noeud/editeur/editeur-de-blocs"
import { FileDOperations } from "../../../packages/plateforme/ui/noeud/editeur/file-d-operations"
import { bloc, ID, PAGE, simulerLAPI } from "../../helpers/noeud"

// La sélection de blocs de l'éditeur (E11-S17, lot a), sous sa file d'écriture : `fetch` simulé pour
// `POST /api/platform/nodes`, relecture espionnée. La page : le titre « Objet », le Texte « Objet de la relance », le code
// « select 1 » et la liste « Lire le devis, Écrire le brouillon ». Le rectangle et le glissé qui quitte son bloc se
// mesurent dans un navigateur (`tests/e2e/e11s17-selection.spec.ts`) : jsdom ne pose aucune boîte.

const rafraichir = vi.fn()
let api: ReturnType<typeof simulerLAPI>

function editeur(blocs: BlockView[]) {
  return (
    <ContexteDeRafraichissement.Provider value={rafraichir}>
      <FileDOperations chemin="ventes/modele_relance" revisionPubliee={4} tampon={null}>
        <EditeurDeBlocs blocs={blocs} revisionServie={4} prefixeDesPages="/n/" />
      </FileDOperations>
      <button type="button">Ailleurs</button>
    </ContexteDeRafraichissement.Provider>
  )
}

function monter(blocs: BlockView[] = PAGE) {
  const rendu = render(editeur(blocs))
  return { relire: (relus: BlockView[]) => rendu.rerender(editeur(relus)) }
}

const bouton = (nom: string) => screen.getByRole("button", { name: nom })
const poignee = (mots: string) => bouton(`Actions sur ce bloc — ${mots}`)

function champ(nom: string): HTMLTextAreaElement {
  const element = screen.getByRole("textbox", { name: nom })
  if (!(element instanceof HTMLTextAreaElement)) throw new Error(`champ « ${nom} » attendu`)
  return element
}

/** La zone des blocs : nommée « Blocs de la page », ou par le nombre de blocs sélectionnés. */
const zone = () => screen.getByRole("group", { name: /^(Blocs de la page|\d+ blocs? sélectionnés?)$/ })

/** Les blocs surlignés, par leur clé de rendu (l'`id` d'un bloc servi). */
const selectionnes = () => [...document.querySelectorAll("[data-selectionnee]")].map((rangee) => rangee.getAttribute("data-cle"))

/** La région vivante de la sélection, montée vide dans la zone des blocs (AC-a9). */
const regionDeLaSelection = () => within(zone()).getByRole("status")

const statut = (texte: string) => screen.getAllByRole("status").find((region) => region.textContent?.includes(texte))

const actif = (): HTMLElement => {
  if (!(document.activeElement instanceof HTMLElement)) throw new Error("un élément actif attendu")
  return document.activeElement
}

/** Les champs de la page, dans l'ordre, par leur nom. */
const champs = () => screen.getAllByRole("textbox").map((element) => element.getAttribute("aria-label"))

/** Ctrl+clic (⌘+clic) puis Maj+clic sur des poignées : une sélection, le focus sur la dernière poignée cliquée. */
function prendre(...gestes: [mots: string, geste: "ctrl" | "maj"][]) {
  for (const [mots, geste] of gestes) {
    act(() => poignee(mots).focus())
    fireEvent.click(poignee(mots), geste === "ctrl" ? { ctrlKey: true } : { shiftKey: true })
  }
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
  Reflect.deleteProperty(navigator, "clipboard")
})

describe("EditeurDeBlocs, selection from the keyboard (E11-S17, AC-a2, AC-a3, AC-a9)", () => {
  it("should select the block on Escape, extend it with Maj+↑↓, move it with ↑↓ without opening the menu, give the field back on Enter and empty it on Escape", async () => {
    monter()
    for (const region of screen.getAllByRole("status")) expect(region).toBeEmptyDOMElement()
    expect(zone()).toHaveAccessibleName("Blocs de la page")
    const texte = champ("Modifier ce texte — Objet de la relance")
    act(() => texte.focus())
    fireEvent.keyDown(texte, { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(poignee("Objet de la relance")))
    expect(selectionnes()).toEqual([ID.objet])
    expect(regionDeLaSelection()).toHaveTextContent("1 bloc sélectionné")
    expect(poignee("Objet de la relance")).toHaveAccessibleDescription("Bloc sélectionné")

    fireEvent.keyDown(actif(), { key: "ArrowDown", shiftKey: true })
    expect(selectionnes()).toEqual([ID.objet, ID.code])
    expect(document.activeElement).toBe(poignee("select 1"))
    expect(regionDeLaSelection()).toHaveTextContent("2 blocs sélectionnés")
    expect(zone()).toHaveAccessibleName("2 blocs sélectionnés")
    fireEvent.keyDown(actif(), { key: "ArrowUp", shiftKey: true })
    expect(selectionnes()).toEqual([ID.objet])

    // ↓ seule déplace la sélection d'un bloc : la flèche n'ouvre pas le menu de la poignée.
    fireEvent.keyDown(actif(), { key: "ArrowDown" })
    expect(selectionnes()).toEqual([ID.code])
    expect(screen.queryByRole("menu")).toBeNull()

    // Entrée rend le focus au champ du bloc, curseur à la fin ; le focus dans un champ vide la sélection.
    fireEvent.keyDown(actif(), { key: "Enter" })
    const code = champ("Modifier ce code — select 1")
    expect(document.activeElement).toBe(code)
    expect(code).toHaveProperty("selectionStart", "select 1".length)
    expect(selectionnes()).toEqual([])
    expect(regionDeLaSelection()).toBeEmptyDOMElement()

    fireEvent.keyDown(code, { key: "Escape" })
    await waitFor(() => expect(selectionnes()).toEqual([ID.code]))
    fireEvent.keyDown(actif(), { key: "Escape" })
    expect(selectionnes()).toEqual([])
    expect(document.activeElement).toBe(poignee("select 1"))
    expect(poignee("select 1")).not.toHaveAccessibleDescription("Bloc sélectionné")
    expect(api.envoyes).toEqual([])
  })

  it("should select every block on a second Ctrl+A, close the menu the first one opened, and move the focus to the editor", () => {
    monter()
    const texte = champ("Modifier ce texte — Objet de la relance")
    act(() => texte.focus())
    // Une sélection partielle : Ctrl+A reste au champ.
    texte.setSelectionRange(0, 5)
    fireEvent.keyDown(texte, { key: "a", ctrlKey: true })
    expect(selectionnes()).toEqual([])
    // La première fois : tout le texte, le menu de la poignée ouvert (E05-S11, AC-28).
    texte.setSelectionRange(0, texte.value.length)
    fireEvent.keyUp(texte, { key: "a", ctrlKey: true })
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.keyDown(texte, { key: "a", ctrlKey: true })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(selectionnes()).toEqual([ID.titre, ID.objet, ID.code, ID.liste])
    expect(document.activeElement).toBe(zone())
    expect(zone()).toHaveAccessibleName("4 blocs sélectionnés")
    // Le focus parti hors de l'éditeur vide la sélection.
    act(() => bouton("Ailleurs").focus())
    expect(selectionnes()).toEqual([])
  })

  it("should select every block on the first ⌘A of an empty block", () => {
    monter([...PAGE.slice(0, 2), bloc("e5000000-0000-4000-8000-000000000005", "paragraph", "")])
    const vide = champ("Modifier ce texte — bloc vide")
    act(() => vide.focus())
    fireEvent.keyDown(vide, { key: "a", metaKey: true })
    expect(selectionnes()).toHaveLength(3)
  })
})

describe("EditeurDeBlocs, selection from the handles (E11-S17, AC-a4)", () => {
  it("should toggle a block on Ctrl+clic or ⌘+clic and extend on Maj+clic without opening the menu, and empty the selection on a plain click elsewhere", () => {
    monter()
    prendre(["Objet de la relance", "ctrl"])
    expect(selectionnes()).toEqual([ID.objet])
    expect(screen.queryByRole("menu")).toBeNull()
    prendre(["Lire le devis Écrire", "maj"])
    expect(selectionnes()).toEqual([ID.objet, ID.code, ID.liste])
    act(() => poignee("select 1").focus())
    fireEvent.click(poignee("select 1"), { metaKey: true })
    expect(selectionnes()).toEqual([ID.objet, ID.liste])
    expect(screen.queryByRole("menu")).toBeNull()
    // Un clic simple sur un bloc hors de la sélection : son menu, comme avant, et la sélection vidée.
    fireEvent.click(poignee("Objet"))
    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(selectionnes()).toEqual([])
  })

  it("should leave ↓ to the handle of a block outside the selection: its menu opens, the selection stays (HN-E11S17-a5)", () => {
    monter()
    prendre(["Objet de la relance", "ctrl"])
    act(() => poignee("select 1").focus())
    fireEvent.keyDown(poignee("select 1"), { key: "ArrowDown" })
    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(selectionnes()).toEqual([ID.objet])
  })

  it("should delete every selected block from « Supprimer » in the menu of one of them, in one write", async () => {
    monter()
    prendre(["Objet", "ctrl"], ["select 1", "ctrl"])
    fireEvent.click(poignee("select 1"))
    expect(selectionnes()).toEqual([ID.titre, ID.code])
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Supprimer" }))
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([
      { op: "delete_block", block: ID.titre, revision: 1 },
      { op: "delete_block", block: ID.code, revision: 3 },
    ])
    expect(champs()).toEqual(["Modifier ce texte — Objet de la relance", "Modifier cette liste — Lire le devis Écrire"])
  })
})

describe("EditeurDeBlocs, gestures on a selection (E11-S17, AC-a6 to AC-a8, AC-a10)", () => {
  it("should delete the selection in one write of N delete_block, say it with one « Annuler » that brings them all back in one write, then publish alone", async () => {
    monter()
    vi.useFakeTimers()
    prendre(["Objet de la relance", "ctrl"], ["Lire le devis Écrire", "maj"])
    fireEvent.keyDown(actif(), { key: "Delete" })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(api.envoyes).toHaveLength(1)
    expect(api.envoyes[0].ops).toEqual([
      { op: "delete_block", block: ID.objet, revision: 3 },
      { op: "delete_block", block: ID.code, revision: 3 },
      { op: "delete_block", block: ID.liste, revision: 3 },
    ])
    expect(champs()).toEqual(["Modifier ce titre — Objet"])
    expect(statut("3 blocs supprimés.")).toBeDefined()
    // Le focus va à la poignée du bloc d'avant.
    expect(document.activeElement).toBe(poignee("Objet"))
    // La publication seule suit, 3 s après le geste (AC-a10).
    await act(() => vi.advanceTimersByTimeAsync(3_000))
    expect(api.envoyes[1]).toMatchObject({ publish: true })

    fireEvent.click(bouton("Annuler"))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(api.envoyes).toHaveLength(3)
    // Une seule écriture : chaque bloc après le titre, du dernier au premier, sans `id`.
    expect(api.envoyes[2].ops?.map((op) => [op.op, op.block, op.input?.type])).toEqual([
      ["insert_after", ID.titre, "list"],
      ["insert_after", ID.titre, "code"],
      ["insert_after", ID.titre, "paragraph"],
    ])
    expect(api.envoyes[2].ops?.[2].input).toMatchObject({ text: "Objet de la relance" })
    expect(champs()).toEqual(["Modifier ce titre — Objet", "Modifier ce texte — Objet de la relance", "Modifier ce code — select 1", "Modifier cette liste — Lire le devis Écrire"])
    expect(statut("3 blocs supprimés.")).toBeUndefined()
  })

  it("should bring the blocks back on Ctrl+Z while the announcement is shown, and keep an empty Texte when every block goes (E11-S05, AC-g1)", async () => {
    monter()
    const texte = champ("Modifier ce texte — Objet de la relance")
    act(() => texte.focus())
    texte.setSelectionRange(0, texte.value.length)
    fireEvent.keyDown(texte, { key: "a", ctrlKey: true })
    fireEvent.keyDown(zone(), { key: "Backspace" })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops?.map((op) => op.block)).toEqual([ID.titre, ID.objet, ID.code, ID.liste])
    expect(champs()).toEqual(["Modifier ce texte — bloc vide"])
    const vide = champ("Modifier ce texte — bloc vide")
    expect(vide).toHaveAttribute("placeholder")
    // ⌘Z dans un champ reste au champ, même pendant l'annonce : la touche n'est pas prise, rien ne part (HN-E11S17-a3).
    act(() => vide.focus())
    expect(fireEvent.keyDown(vide, { key: "z", ctrlKey: true })).toBe(true)
    expect(statut("4 blocs supprimés.")).toBeDefined()
    expect(api.envoyes).toHaveLength(1)
    expect(champs()).toEqual(["Modifier ce texte — bloc vide"])
    // Sur la poignée, il annule le geste annoncé.
    act(() => poignee("bloc vide").focus())
    fireEvent.keyDown(actif(), { key: "z", ctrlKey: true })
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1].ops).toHaveLength(4)
    expect(champs()).toHaveLength(4)
  })

  it("should refuse the whole gesture when a block of the selection is in conflict, and say so", async () => {
    const { relire } = monter()
    api.refuser("stale_revision", 409)
    const texte = champ("Modifier ce texte — Objet de la relance")
    act(() => texte.focus())
    fireEvent.change(texte, { target: { value: "Texte de Léa" } })
    fireEvent.keyDown(texte, { key: "Escape" })
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    relire([PAGE[0], { ...bloc(ID.objet, "paragraph", "Texte de Claire"), revision: 4 }, PAGE[2], PAGE[3]])
    await screen.findByRole("textbox", { name: "Texte final" })
    // Du code au bloc en conflit : Maj+clic prend la plage, quelle que soit la sélection d'avant.
    prendre(["select 1", "ctrl"], ["Texte de Léa", "maj"])
    expect(selectionnes()).toEqual([ID.objet, ID.code])
    fireEvent.keyDown(actif(), { key: "Delete" })
    await waitFor(() => expect(statut("Réglez d'abord le bloc en conflit.")).toBeDefined())
    expect(api.envoyes).toHaveLength(1)
    expect(champ("Modifier ce code — select 1")).toBeInTheDocument()
  })

  it("should delete 51 selected blocks in one write, beyond the 50 operations of an assistant (fiche D153)", async () => {
    const blocs = Array.from({ length: 51 }, (_, rang) => bloc(`f${String(rang).padStart(7, "0")}-0000-4000-8000-000000000051`, "paragraph", `Bloc ${rang + 1}`))
    monter(blocs)
    const premier = champ("Modifier ce texte — Bloc 1")
    act(() => premier.focus())
    premier.setSelectionRange(0, premier.value.length)
    fireEvent.keyDown(premier, { key: "a", ctrlKey: true })
    expect(zone()).toHaveAccessibleName("51 blocs sélectionnés")
    fireEvent.keyDown(zone(), { key: "Delete" })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops?.map((op) => [op.op, op.block])).toEqual(blocs.map((un) => ["delete_block", un.id]))
    expect(statut("51 blocs supprimés.")).toBeDefined()
  })

  it("should say a group write refused for itself, offer to reload rather than retry, and let the next writes go", async () => {
    monter()
    api.refuser("invalid_arguments", 400)
    prendre(["Objet de la relance", "ctrl"], ["select 1", "ctrl"])
    fireEvent.keyDown(actif(), { key: "Delete" })
    expect(await screen.findByText("Ce geste sur plusieurs blocs a été refusé : rechargez la page pour retrouver les blocs enregistrés.")).toHaveAttribute("role", "alert")
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull()
    expect(bouton("Recharger la page")).toBeInTheDocument()
    expect(rafraichir).not.toHaveBeenCalled()
    // Le corps refusé a quitté la file : le geste suivant part.
    const titre = champ("Modifier ce titre — Objet")
    act(() => titre.focus())
    fireEvent.change(titre, { target: { value: "Objet revu" } })
    fireEvent.keyDown(titre, { key: "Escape" })
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1].ops?.[0]).toMatchObject({ op: "replace_block", block: ID.titre })
  })

  it("should copy the markdown of the blocks, the same as the .md export, then cut them: copy first, one write of deletes after", async () => {
    const writeText = vi.fn<(texte: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    monter()
    prendre(["Objet", "ctrl"], ["Objet de la relance", "ctrl"])
    fireEvent.keyDown(actif(), { key: "c", ctrlKey: true })
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith(renderBlocks(PAGE.slice(0, 2)))
    expect(writeText.mock.calls[0][0]).toContain("Objet de la relance")
    await waitFor(() => expect(statut("2 blocs copiés en markdown.")).toBeDefined())
    expect(api.envoyes).toEqual([])

    fireEvent.keyDown(actif(), { key: "x", metaKey: true })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(api.envoyes[0].ops?.map((op) => op.op)).toEqual(["delete_block", "delete_block"])
  })

  it("should delete nothing when the clipboard refuses the cut", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => Promise.reject(new Error("refusé"))) }, configurable: true })
    monter()
    prendre(["Objet de la relance", "ctrl"])
    fireEvent.keyDown(actif(), { key: "x", ctrlKey: true })
    await waitFor(() => expect(statut("Copie impossible : le navigateur refuse l'accès au presse-papiers.")).toBeDefined())
    expect(api.envoyes).toEqual([])
    expect(champ("Modifier ce texte — Objet de la relance")).toBeInTheDocument()
  })

  it("should move the group with Alt+↓ in one write of move_block, in page order, and put each block back on « Annuler »", async () => {
    monter()
    prendre(["Objet de la relance", "ctrl"], ["select 1", "ctrl"])
    fireEvent.keyDown(actif(), { key: "ArrowDown", altKey: true })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([
      { op: "move_block", block: ID.objet, after_block: ID.liste },
      { op: "move_block", block: ID.code, after_block: ID.objet },
    ])
    expect(champs()).toEqual(["Modifier ce titre — Objet", "Modifier cette liste — Lire le devis Écrire", "Modifier ce texte — Objet de la relance", "Modifier ce code — select 1"])
    expect(statut("2 blocs déplacés.")).toBeDefined()
    // Le focus reste sur la poignée d'où part le geste, la sélection aussi.
    await waitFor(() => expect(document.activeElement).toBe(poignee("select 1")))
    expect(selectionnes()).toEqual([ID.objet, ID.code])

    fireEvent.click(bouton("Annuler"))
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1].ops).toEqual([
      { op: "move_block", block: ID.objet, after_block: ID.titre },
      { op: "move_block", block: ID.code, after_block: ID.objet },
    ])
    expect(champs()).toEqual(["Modifier ce titre — Objet", "Modifier ce texte — Objet de la relance", "Modifier ce code — select 1", "Modifier cette liste — Lire le devis Écrire"])
  })
})
