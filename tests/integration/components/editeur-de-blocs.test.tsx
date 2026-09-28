import { renderToStaticMarkup } from "react-dom/server"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BlockView } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeRafraichissement } from "@otomata_tech/oto_platform/ui"
import { ListeACiter } from "../../../packages/plateforme/ui/noeud/editeur/citer"
import { EditeurDeBlocs } from "../../../packages/plateforme/ui/noeud/editeur/editeur-de-blocs"
import { FileDOperations } from "../../../packages/plateforme/ui/noeud/editeur/file-d-operations"
import { bloc, ID, PAGE, simulerLAPI } from "../../helpers/noeud"

// L'éditeur de blocs (E05-S08, champs toujours montés ; E05-S02 pour ce qui ne dépend pas du mode ; E05-S10,
// partie a : menu de la poignée, glisser-déposer, blocs vides, un seul titre, publication seule, liens), sous
// sa file d'écriture : `fetch` simulé pour `POST /api/plateforme/nodes`, relecture de la page espionnée ; une
// relecture se joue en rerendant l'éditeur avec les blocs relus. « Ailleurs » est un bouton hors de
// l'éditeur : le focus qui y va quitte le champ et sa rangée, comme en suivant un lien.

type Montage = { blocs?: BlockView[]; niveau?: 2 | 3; tampon?: string | null; revision?: number }

// Le lien que l'écran serveur passe à l'éditeur, déjà rendu (AC9 d'E05-S02).
const VERSION_PUBLIEE = "/n/ventes/modele_relance?version=publiee"
/** Un bloc que l'écran n'écrit pas (un diagramme) : il se lit, se déplace, se duplique et se supprime. */
const DIAGRAMME = bloc("f5000000-0000-4000-8000-000000000005", "mermaid", "graph TD")
const rafraichir = vi.fn()
let api: ReturnType<typeof simulerLAPI>

function editeur({ blocs = PAGE, niveau = 2, tampon = null, revision = 4 }: Montage) {
  return (
    <ContexteDeRafraichissement.Provider value={rafraichir}>
      <FileDOperations chemin="ventes/modele_relance" revisionPubliee={revision} tampon={tampon}>
        <EditeurDeBlocs
          niveau={niveau}
          blocs={blocs}
          revisionServie={revision}
          phraseDePublication="La publication revient au responsable de l'équipe Ventes (Claire Morel) ou à un administrateur."
          prefixeDesPages="/n/"
          lienVersionPubliee={<a href={VERSION_PUBLIEE}>Voir la version publiée</a>}
        />
      </FileDOperations>
      <button type="button">Ailleurs</button>
    </ContexteDeRafraichissement.Provider>
  )
}

function monter(montage: Montage = {}) {
  const rendu = render(editeur(montage))
  return { relire: (relue: Montage) => rendu.rerender(editeur({ ...montage, ...relue })), demonter: rendu.unmount }
}

const bouton = (nom: string) => screen.getByRole("button", { name: nom })

function champ(nom: string): HTMLTextAreaElement {
  const element = screen.getByRole("textbox", { name: nom })
  if (!(element instanceof HTMLTextAreaElement)) throw new Error(`champ « ${nom} » attendu`)
  return element
}

/** Le focus dans un champ, puis un texte tapé : le différé de 1 200 ms est armé. */
function ecrire(element: HTMLTextAreaElement, texte: string) {
  act(() => element.focus())
  fireEvent.change(element, { target: { value: texte } })
}

/** Un texte tapé, puis Échap : il part, et le focus va à la poignée de la rangée. */
function ecrireEtEchapper(element: HTMLTextAreaElement, texte: string) {
  ecrire(element, texte)
  fireEvent.keyDown(element, { key: "Escape" })
}

/** Le focus quitte le champ et sa rangée. */
const ailleurs = () => act(() => bouton("Ailleurs").focus())

/** Un tour de boucle : la sortie d'un champ ou d'une rangée se décide au tour suivant. */
const unTour = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

const statut = (texte: string) => screen.getAllByRole("status").find((region) => region.textContent?.includes(texte))

/** Le menu d'un bloc, ouvert par un clic sur sa poignée (E05-S10, AC-a2). */
function menuDu(mots: string) {
  fireEvent.click(bouton(`Actions sur ce bloc — ${mots}`))
  return within(screen.getByRole("menu"))
}

/** Un geste du menu d'un bloc, par son nom (« Monter » porte son raccourci). */
function choisir(mots: string, geste: string | RegExp) {
  fireEvent.click(menuDu(mots).getByRole("menuitem", { name: geste }))
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

describe("EditeurDeBlocs, champs montés (AC1, AC9)", () => {
  it("should mount every writable block as a named field without a click, none focused, a heading in its element, the other blocks read, and no « Modifier ce bloc »", () => {
    monter({ blocs: [...PAGE, DIAGRAMME] })
    expect(screen.getAllByRole("textbox").map((element) => element.getAttribute("aria-label"))).toEqual([
      "Modifier ce titre — Objet",
      "Modifier ce texte — Objet de la relance",
      "Modifier ce code — select 1",
      "Modifier cette liste — Lire le devis Écrire",
    ])
    expect(document.activeElement).toBe(document.body)
    expect(champ("Modifier ce titre — Objet").closest("h2")).toHaveAttribute("id", "objet")
    // Une liste à puces écrite porte ses puces en fond, dessinées par le design system, pour l'œil seul ; sa
    // hauteur est celle de ses lignes dès le rendu du serveur, avant toute mesure (M30).
    const liste = champ("Modifier cette liste — Lire le devis Écrire")
    expect(liste).toHaveAttribute("data-kind", "list")
    expect(liste).not.toHaveAttribute("data-ordered")
    expect(liste).toHaveAttribute("rows", "2")
    // Un bloc qu'on n'écrit pas se lit dans sa rangée, avec sa gouttière (HN-E05S08-5).
    expect(screen.getByText("Diagramme (texte)")).toBeInTheDocument()
    for (const geste of ["Ajouter un bloc après — graph TD", "Actions sur ce bloc — graph TD", "Actions sur ce bloc — Objet de la relance"]) expect(bouton(geste)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Modifier ce bloc/ })).toBeNull()
    // Les lignes d'état sont montées vides : elles n'annoncent que ce qui change ensuite.
    for (const region of screen.getAllByRole("status")) expect(region).toBeEmptyDOMElement()
  })
})

describe("EditeurDeBlocs, envoi du texte (AC2)", () => {
  // Suivre un lien de l'arbre est une navigation du client, sans `beforeunload` : le texte part quand le focus quitte le champ.
  it("should send a modified field once when the focus leaves it, as when following a link, adopt the returned revision, say it, and send nothing unchanged", async () => {
    const lache = api.retenir()
    monter()
    const texte = champ("Modifier ce texte — Objet de la relance")
    ecrire(texte, "Objet revu")
    ailleurs()
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0]).toEqual({
      path: "ventes/modele_relance",
      base_revision: 4,
      ops: [{ op: "replace_block", block: ID.objet, revision: 3, input: { type: "paragraph", text: "Objet revu", data: {} } }],
    })
    expect(statut("Enregistrement…")).toHaveAttribute("aria-busy", "true")
    lache()
    await waitFor(() => expect(statut("Brouillon enregistré.")).toHaveAttribute("aria-busy", "false"))

    // ⌘S envoie sans quitter le champ, sur la révision rendue (4) ; un champ inchangé qu'on quitte n'envoie rien.
    ecrire(texte, "Objet revu encore")
    fireEvent.keyDown(texte, { key: "s", ctrlKey: true })
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1].ops?.[0]).toMatchObject({ op: "replace_block", block: ID.objet, revision: 4 })
    expect(document.activeElement).toBe(texte)
    ailleurs()
    act(() => champ("Modifier ce titre — Objet").focus())
    ailleurs()
    await unTour()
    expect(api.envoyes).toHaveLength(2)
  })

  it("should send a field's text 1 200 ms after the last keystroke, in a single replace_block", () => {
    monter()
    const texte = champ("Modifier ce texte — Objet de la relance")
    vi.useFakeTimers()
    ecrire(texte, "Objet r")
    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.change(texte, { target: { value: "Objet revu" } })
    act(() => vi.advanceTimersByTime(1_199))
    expect(api.envoyes).toHaveLength(0)
    act(() => vi.advanceTimersByTime(1))
    expect(api.envoyes.map((corps) => corps.ops)).toEqual([[{ op: "replace_block", block: ID.objet, revision: 3, input: { type: "paragraph", text: "Objet revu", data: {} } }]])
  })

  it("should keep a refused field's message under it, focus kept, send nothing, and give its last saved content back", async () => {
    monter()
    const titre = champ("Modifier ce titre — Objet")
    ecrireEtEchapper(titre, "x".repeat(201))
    const message = await screen.findByRole("alert")
    expect(message).toHaveTextContent("Un titre compte 200 caractères au plus.")
    expect(titre).toHaveAttribute("aria-describedby", message.id)
    expect(document.activeElement).toBe(titre)
    ailleurs()
    await unTour()
    expect(api.envoyes).toHaveLength(0)
    fireEvent.click(bouton("Annuler les modifications du bloc"))
    expect(champ("Modifier ce titre — Objet")).toHaveValue("Objet")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("should delete an emptied block with « Annuler » once the focus leaves its row, and keep an empty new block without sending", async () => {
    monter()
    ecrire(champ("Modifier ce texte — Objet de la relance"), "   ")
    // La poignée de la même rangée garde le bloc vide : il n'est retiré qu'à la sortie de sa rangée.
    act(() => bouton("Actions sur ce bloc — bloc vide").focus())
    await unTour()
    expect(api.envoyes).toHaveLength(0)
    ailleurs()
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "delete_block", block: ID.objet, revision: 3 }])
    expect(statut("Bloc supprimé.")).toBeDefined()
    expect(bouton("Annuler")).toBeInTheDocument()
    // Le focus parti ailleurs y reste : le bloc vidé ne le reprend pas pour son voisin.
    await unTour()
    expect(document.activeElement).toBe(bouton("Ailleurs"))

    // Un bloc neuf vide reste quand le focus le quitte (E05-S10, AC-a4), sans rien envoyer.
    fireEvent.click(bouton("Ajouter un bloc après — Objet"))
    await waitFor(() => expect(document.activeElement).toBe(champ("Modifier ce texte — bloc vide")))
    ailleurs()
    await unTour()
    expect(champ("Modifier ce texte — bloc vide")).toBeInTheDocument()
    expect(api.envoyes).toHaveLength(1)
  })

  // Sous Safari et Firefox macOS, un bouton cliqué ne prend pas le focus : le champ quitté le laisse à `<body>`.
  it("should keep an empty new block and open its menu when the click in its row leaves the focus to the page, as in Safari (M30)", async () => {
    monter()
    fireEvent.click(bouton("Ajouter un bloc après — Objet"))
    await waitFor(() => expect(document.activeElement).toBe(champ("Modifier ce texte — bloc vide")))
    const poignee = bouton("Actions sur ce bloc — bloc vide")
    fireEvent.pointerDown(poignee)
    act(() => champ("Modifier ce texte — bloc vide").blur())
    await unTour()
    expect(document.activeElement).toBe(document.body)
    fireEvent.pointerUp(poignee)
    fireEvent.click(poignee)
    expect(champ("Modifier ce texte — bloc vide")).toBeInTheDocument()
    expect(poignee).toHaveAttribute("aria-expanded", "true")
    expect(api.envoyes).toHaveLength(0)
  })

  // Une navigation du client (retour du navigateur) démonte l'éditeur sans `blur` ni `beforeunload`.
  it("should send the text still waiting for its 1 200 ms when the editor goes away without the field losing the focus (HN-E05S08-16)", async () => {
    const { unmount } = render(editeur({}))
    // Tapé sans focus : aucune sortie de champ ne l'envoie, seul le démontage.
    fireEvent.change(champ("Modifier ce texte — Objet de la relance"), { target: { value: "Objet revu" } })
    expect(api.envoyes).toHaveLength(0)
    unmount()
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "replace_block", block: ID.objet, revision: 3, input: { type: "paragraph", text: "Objet revu", data: {} } }])
  })
})

describe("EditeurDeBlocs, clavier (AC3)", () => {
  it("should split at the caret on Enter, a heading giving a Texte, send both parts, and focus the part after", async () => {
    monter()
    const titre = champ("Modifier ce titre — Objet")
    act(() => titre.focus())
    titre.setSelectionRange(3, 3)
    fireEvent.keyDown(titre, { key: "Enter" })
    const suite = await screen.findByRole("textbox", { name: "Modifier ce texte — et" })
    await waitFor(() => expect(document.activeElement).toBe(suite))
    expect(suite).toHaveProperty("selectionStart", 0)
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes.map((corps) => corps.ops)).toEqual([
      [{ op: "replace_block", block: ID.titre, revision: 1, input: { type: "heading", text: "Obj", data: { level: 1 }, key: "objet" } }],
      [{ op: "insert_after", block: ID.titre, input: { type: "paragraph", text: "et", data: {} } }],
    ])
  })

  it("should turn a Texte into a heading by its prefix, leave a list on Enter on its last empty line, and merge into the block before on Backspace at the start", async () => {
    monter()
    ecrire(champ("Modifier ce texte — Objet de la relance"), "# Objet de la relance")
    // Le bloc change d'élément : son champ est remonté dans le titre, le focus l'y suit.
    const devenu = await screen.findByRole("textbox", { name: "Modifier ce titre — Objet de la relance" })
    expect(devenu.closest("h2")).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(devenu))
    fireEvent.keyDown(devenu, { key: "Escape" })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops?.[0]).toMatchObject({ op: "replace_block", block: ID.objet, input: { type: "heading", text: "Objet de la relance", data: { level: 1 } } })

    const liste = champ("Modifier cette liste — Lire le devis Écrire")
    ecrire(liste, "Lire le devis\nÉcrire le brouillon\n")
    liste.setSelectionRange(liste.value.length, liste.value.length)
    fireEvent.keyDown(liste, { key: "Enter" })
    await waitFor(() => expect(document.activeElement).toBe(champ("Modifier ce texte — bloc vide")))
    expect(champ("Modifier cette liste — Lire le devis Écrire")).toHaveValue("Lire le devis\nÉcrire le brouillon")

    const titre = champ("Modifier ce titre — Objet de la relance")
    act(() => titre.focus())
    titre.setSelectionRange(0, 0)
    fireEvent.keyDown(titre, { key: "Backspace" })
    const fondu = await screen.findByRole("textbox", { name: "Modifier ce titre — ObjetObjet de la relance" })
    await waitFor(() => expect(document.activeElement).toBe(fondu))
    expect(fondu).toHaveProperty("selectionStart", "Objet".length)
    await waitFor(() => expect(api.envoyes).toHaveLength(3))
    expect(api.envoyes.slice(1).map((corps) => corps.ops)).toEqual([
      [{ op: "replace_block", block: ID.titre, revision: 1, input: { type: "heading", text: "ObjetObjet de la relance", data: { level: 1 }, key: "objet" } }],
      [{ op: "delete_block", block: ID.objet, revision: 4 }],
    ])
  })

  it("should move a block with ⌥↑, the focus kept in its field, and send the text on Escape before focusing the row's handle", async () => {
    monter()
    const liste = champ("Modifier cette liste — Lire le devis Écrire")
    act(() => liste.focus())
    fireEvent.keyDown(liste, { key: "ArrowUp", altKey: true })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "move_block", block: ID.liste, after_block: ID.objet }])
    await waitFor(() => expect(document.activeElement).toBe(liste))

    ecrireEtEchapper(liste, "Lire")
    await waitFor(() => expect(document.activeElement).toBe(bouton("Actions sur ce bloc — Lire")))
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1].ops?.[0]).toMatchObject({ op: "replace_block", block: ID.liste, input: { data: { items: ["Lire"] } } })
  })
})

describe("EditeurDeBlocs, menu de la poignée (E05-S10, AC-a2, AC-a5)", () => {
  it("should open under the handle a menu to move, restyle among one « Titre » and seven styles, duplicate and delete, with no such button outside it", async () => {
    monter()
    expect(screen.queryByRole("button", { name: /^(Monter|Descendre|Supprimer|Dupliquer)$/ })).toBeNull()
    fireEvent.click(bouton("Ajouter un bloc après — Objet de la relance"))
    const neuf = champ("Modifier ce texte — bloc vide")
    await waitFor(() => expect(document.activeElement).toBe(neuf))
    const poignee = bouton("Actions sur ce bloc — bloc vide")
    expect(poignee).toHaveAttribute("aria-haspopup", "menu")
    const menu = menuDu("bloc vide")
    expect(poignee).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("menu")).toHaveAttribute("data-side", "bottom")
    expect(menu.getAllByRole("menuitemradio").map((choix) => [choix.textContent, choix.getAttribute("aria-checked")])).toEqual([
      ["Texte", "true"],
      ["Titre", "false"],
      ["Liste à puces", "false"],
      ["Liste numérotée", "false"],
      ["Liste à cocher", "false"],
      ["Citation", "false"],
      ["Code", "false"],
    ])
    expect(menu.getAllByRole("menuitem").map((geste) => geste.querySelector(".oto-menu-label")?.textContent)).toEqual(["Monter", "Descendre", "Dupliquer", "Supprimer"])
    // Un bloc neuf vide qui change de style ne part pas : il part avec son texte.
    fireEvent.click(menu.getByRole("menuitemradio", { name: "Titre" }))
    const titre = champ("Modifier ce titre — bloc vide")
    await waitFor(() => expect(document.activeElement).toBe(titre))
    expect(api.envoyes).toHaveLength(0)
    ecrireEtEchapper(titre, "Budget")
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "insert_after", block: ID.objet, input: { type: "heading", text: "Budget", data: { level: 1 } } }])
    // L'ancre du bloc neuf est la référence que rend son écriture.
    await waitFor(() => expect(champ("Modifier ce titre — Budget").closest("h2")).toHaveAttribute("id", "e0000001"))
  })

  it("should open the menu from the keyboard, close it on Escape with the focus back on the handle, and move a block by « Monter », the last one not going down", async () => {
    monter()
    const poignee = bouton("Actions sur ce bloc — Lire le devis Écrire")
    // Au clavier : la flèche du bas ouvre le menu, comme Entrée ou Espace, qui cliquent le bouton.
    act(() => poignee.focus())
    fireEvent.keyDown(poignee, { key: "ArrowDown" })
    const menu = screen.getByRole("menu")
    await waitFor(() => expect(document.activeElement).toBe(menu))
    fireEvent.keyDown(menu, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(poignee)

    act(() => poignee.focus())
    fireEvent.click(poignee)
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: /^Descendre/ })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /^Monter/ }))
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "move_block", block: ID.liste, after_block: ID.objet }])
    await waitFor(() => expect(document.activeElement).toBe(champ("Modifier cette liste — Lire le devis Écrire")))
  })

  it("should give a block written by the assistant a menu without style, duplicate it, delete it with its revision, and bring it back by « Annuler » without id", async () => {
    monter({ blocs: [...PAGE.slice(0, 2), DIAGRAMME] })
    const menu = menuDu("graph TD")
    expect(menu.getByText("Ce bloc se modifie par votre assistant.")).toBeInTheDocument()
    expect(menu.queryAllByRole("menuitemradio")).toHaveLength(0)
    fireEvent.click(menu.getByRole("menuitem", { name: "Dupliquer" }))
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "insert_after", block: DIAGRAMME.id, input: { type: "mermaid", text: "graph TD", data: {} } }])
    expect(screen.getAllByText("Diagramme (texte)")).toHaveLength(2)

    // Le premier des deux, celui qui était servi.
    fireEvent.click(screen.getAllByRole("button", { name: "Actions sur ce bloc — graph TD" })[0])
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Supprimer" }))
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1].ops).toEqual([{ op: "delete_block", block: DIAGRAMME.id, revision: 3 }])
    // Le focus va au bloc d'avant, dans son champ, en fin de texte.
    const avant = champ("Modifier ce texte — Objet de la relance")
    await waitFor(() => expect(document.activeElement).toBe(avant))
    expect(avant).toHaveProperty("selectionStart", "Objet de la relance".length)
    expect(statut("Bloc supprimé.")).toBeDefined()

    fireEvent.click(bouton("Annuler"))
    await waitFor(() => expect(api.envoyes).toHaveLength(3))
    expect(api.envoyes[2].ops).toEqual([{ op: "insert_after", block: ID.objet, input: { type: "mermaid", text: "graph TD", data: {} } }])
  })

  it("should read a heading of level 2 or 3 as « Titre », in an h2, without rewriting its level", async () => {
    const ancien = { ...bloc("a7000000-0000-4000-8000-000000000007", "heading", "Suite", { level: 3 }), revision: 2 }
    monter({ blocs: [ancien] })
    expect(champ("Modifier ce titre — Suite").closest("h2")).not.toBeNull()
    expect(menuDu("Suite").getByRole("menuitemradio", { name: "Titre" })).toHaveAttribute("aria-checked", "true")
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    ecrireEtEchapper(champ("Modifier ce titre — Suite"), "Suite revue")
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops?.[0]).toMatchObject({ input: { type: "heading", text: "Suite revue", data: { level: 3 } } })
  })

  it("should settle the status line when a queued gesture has nothing left to send, its block deleted meanwhile", async () => {
    monter()
    const lache = api.retenir()
    ecrireEtEchapper(champ("Modifier ce titre — Objet"), "Objet revu")
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Texte revu")
    choisir("Texte revu", "Supprimer")
    lache()
    // Le remplacement du bloc supprimé ne part pas : seule sa suppression suit l'écriture retenue.
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1].ops).toEqual([{ op: "delete_block", block: ID.objet, revision: 3 }])
    await waitFor(() => expect(statut("Brouillon enregistré.")).toHaveAttribute("aria-busy", "false"))
  })

  it("should write the first block of an empty page at its start", async () => {
    monter({ blocs: [] })
    expect(screen.getByText("Cette page n'a pas encore de contenu.")).toBeInTheDocument()
    fireEvent.click(bouton("Commencer à écrire"))
    const premier = champ("Modifier ce texte — bloc vide")
    await waitFor(() => expect(document.activeElement).toBe(premier))
    ecrireEtEchapper(premier, "Premier bloc")
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "insert_after", input: { type: "paragraph", text: "Premier bloc", data: {} } }])
  })

  it("should tick a checklist line from its box, the state sent at once", async () => {
    const cases = bloc("c8000000-0000-4000-8000-000000000008", "checklist", null, { items: [{ text: "Lire", checked: false }, { text: "Écrire", checked: true }] })
    monter({ blocs: [cases] })
    expect(champ("Modifier cette liste à cocher — Lire Écrire")).toHaveValue("Lire\nÉcrire")
    const lire = screen.getByRole("checkbox", { name: "Cocher « Lire »" })
    expect(lire).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Cocher « Écrire »" })).toBeChecked()
    fireEvent.click(lire)
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops?.[0]).toMatchObject({ op: "replace_block", input: { type: "checklist", data: { items: [{ text: "Lire", checked: true }, { text: "Écrire", checked: true }] } } })
  })
})

describe("EditeurDeBlocs, blocs vides de suite (E05-S10, AC-a4)", () => {
  it("should add empty blocks one after the other, by a second « + » or by Enter on an empty block", async () => {
    monter()
    fireEvent.click(bouton("Ajouter un bloc après — Objet de la relance"))
    await waitFor(() => expect(document.activeElement).toBe(champ("Modifier ce texte — bloc vide")))
    fireEvent.click(bouton("Ajouter un bloc après — bloc vide"))
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Modifier ce texte — bloc vide" })).toHaveLength(2))
    const second = screen.getAllByRole("textbox", { name: "Modifier ce texte — bloc vide" })[1]
    await waitFor(() => expect(document.activeElement).toBe(second))
    fireEvent.keyDown(second, { key: "Enter" })
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Modifier ce texte — bloc vide" })).toHaveLength(3))
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole("textbox", { name: "Modifier ce texte — bloc vide" })[2]))
    ailleurs()
    await unTour()
    expect(screen.getAllByRole("textbox", { name: "Modifier ce texte — bloc vide" })).toHaveLength(3)
    expect(api.envoyes).toHaveLength(0)
  })
})

/** jsdom n'a pas de `PointerEvent` : sans lui, un événement de pointeur arrive sans bouton ni position. */
class PointerEventDeTest extends MouseEvent {
  readonly pointerId: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
  }
}

describe("EditeurDeBlocs, glisser-déposer (E05-S10, AC-a3)", () => {
  afterEach(() => void Reflect.deleteProperty(window, "PointerEvent"))

  /** Chaque rangée fait 40 px, dans l'ordre du DOM : le milieu de la rangée n est à 40 n + 20. */
  const rangeesDe40Px = () =>
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const rang = [...document.querySelectorAll("[data-cle]")].indexOf(this)
      return new DOMRect(0, rang * 40, 600, 40)
    })

  it("should move the held block past each middle it crosses, send one move_block on drop, and not open its menu", async () => {
    Object.assign(window, { PointerEvent: PointerEventDeTest })
    monter()
    rangeesDe40Px()
    const poignee = bouton("Actions sur ce bloc — Lire le devis Écrire")
    fireEvent.pointerDown(poignee, { clientY: 140, button: 0, pointerId: 1 })
    fireEvent.pointerMove(poignee, { clientY: 138, pointerId: 1 })
    expect(poignee.closest("[data-cle]")).not.toHaveAttribute("data-state")
    fireEvent.pointerMove(poignee, { clientY: 95, pointerId: 1 })
    fireEvent.pointerMove(poignee, { clientY: 55, pointerId: 1 })
    expect(bouton("Actions sur ce bloc — Lire le devis Écrire").closest("[data-cle]")).toHaveAttribute("data-state", "moving")
    expect(api.envoyes).toHaveLength(0)
    fireEvent.pointerUp(poignee, { clientY: 55, pointerId: 1 })
    fireEvent.click(poignee)
    expect(screen.queryByRole("menu")).toBeNull()
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops).toEqual([{ op: "move_block", block: ID.liste, after_block: ID.titre }])
    expect(screen.getAllByRole("textbox").map((element) => element.getAttribute("aria-label"))).toEqual([
      "Modifier ce titre — Objet",
      "Modifier cette liste — Lire le devis Écrire",
      "Modifier ce texte — Objet de la relance",
      "Modifier ce code — select 1",
    ])
  })

  it("should put the block back in its place and send nothing when the system cancels the gesture (pointercancel)", async () => {
    Object.assign(window, { PointerEvent: PointerEventDeTest })
    monter()
    rangeesDe40Px()
    const ordre = () => screen.getAllByRole("textbox").map((element) => element.getAttribute("aria-label"))
    const avant = ordre()
    const poignee = bouton("Actions sur ce bloc — Lire le devis Écrire")
    fireEvent.pointerDown(poignee, { clientY: 140, button: 0, pointerId: 1 })
    fireEvent.pointerMove(poignee, { clientY: 95, pointerId: 1 })
    fireEvent.pointerMove(poignee, { clientY: 55, pointerId: 1 })
    expect(ordre()).not.toEqual(avant)
    fireEvent.pointerCancel(poignee, { pointerId: 1 })
    expect(ordre()).toEqual(avant)
    expect(poignee.closest("[data-cle]")).not.toHaveAttribute("data-state")
    await unTour()
    expect(api.envoyes).toHaveLength(0)
  })
})

describe("EditeurDeBlocs, publication seule (E05-S10, AC-a6)", () => {
  it("should offer no « Publier », and publish 3 s after the last keystroke, after the text, on the stamp it returned", async () => {
    monter({ niveau: 3 })
    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull()
    vi.useFakeTimers()
    const texte = champ("Modifier ce texte — Objet de la relance")
    ecrire(texte, "Objet r")
    await act(() => vi.advanceTimersByTimeAsync(2_000))
    fireEvent.change(texte, { target: { value: "Objet revu" } })
    await act(() => vi.advanceTimersByTimeAsync(2_999))
    expect(api.envoyes.map((corps) => corps.publish ?? false)).toEqual([false, false])
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(api.envoyes).toHaveLength(3)
    expect(api.envoyes[2]).toEqual({ path: "ventes/modele_relance", base_revision: 4, draft_stamp: "2026-09-24T10:00:02.000000+00:00", publish: true })
    expect(rafraichir).toHaveBeenCalledTimes(1)
    // Au niveau gestion : ni bandeau de brouillon, ni « Publié en révision N. » ; l'enregistrement se dit.
    expect(screen.queryByText(/^Brouillon non publié|^Publié en révision/)).toBeNull()
    expect(statut("Enregistré.")).toBeDefined()
    // Rien de plus sans frappe.
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(api.envoyes).toHaveLength(3)
  })

  it.each([
    ["the tab closed (pagehide)", () => window.dispatchEvent(new Event("pagehide"))],
    ["the tab hidden (visibilitychange)", () => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
      Reflect.deleteProperty(document, "visibilityState")
    }],
  ])("should send the waiting text then publish at once when %s", async (_cas, sortir) => {
    monter({ niveau: 3 })
    ecrire(champ("Modifier ce texte — Objet de la relance"), "Objet revu")
    act(sortir)
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[0].ops?.[0]).toMatchObject({ op: "replace_block", input: { text: "Objet revu" } })
    expect(api.envoyes[1]).toMatchObject({ publish: true })
    // L'écriture vidée à la sortie et la publication survivent à l'onglet fermé (`keepalive`).
    expect(api.fetchMock.mock.calls.map(([, init]) => init?.keepalive)).toEqual([true, true])
  })

  it("should send a text over the keepalive limit (64 KiB) without keepalive when the tab closes, so that it still leaves", async () => {
    monter({ niveau: 3 })
    ecrire(champ("Modifier ce texte — Objet de la relance"), "a".repeat(70_000))
    act(() => window.dispatchEvent(new Event("pagehide")))
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.fetchMock.mock.calls.map(([, init]) => init?.keepalive)).toEqual([undefined, true])
  })

  it("should publish when the host navigates away, the editor going with the page", async () => {
    const { demonter } = monter({ niveau: 3 })
    ecrire(champ("Modifier ce texte — Objet de la relance"), "Objet revu")
    demonter()
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1]).toMatchObject({ publish: true })
  })

  it("should say a stale publication, keep the text, and publish again on « Réessayer »", async () => {
    monter({ niveau: 3 })
    const texte = champ("Modifier ce texte — Objet de la relance")
    ecrireEtEchapper(texte, "Objet revu")
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    api.refuser("stale_revision", 409)
    act(() => window.dispatchEvent(new Event("pagehide")))
    expect(await screen.findByText("La page a changé pendant que vous écriviez : votre texte est gardé, il sera publié à votre prochaine modification.")).toHaveAttribute("role", "alert")
    expect(champ("Modifier ce texte — Objet revu")).toHaveValue("Objet revu")
    expect(rafraichir).toHaveBeenCalledTimes(1)
    fireEvent.click(bouton("Réessayer"))
    await waitFor(() => expect(api.envoyes).toHaveLength(3))
    expect(api.envoyes[2]).toMatchObject({ publish: true })
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("should not publish at the writing level, where the publication belongs to someone else", async () => {
    monter({ niveau: 2 })
    expect(screen.getByText("La publication revient au responsable de l'équipe Ventes (Claire Morel) ou à un administrateur.")).toBeInTheDocument()
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Objet revu")
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    act(() => window.dispatchEvent(new Event("pagehide")))
    await unTour()
    expect(api.envoyes).toHaveLength(1)
  })

  it("should ask before leaving the tab with a modified field, and no longer once it is sent", async () => {
    monter()
    const quitter = () => {
      const depart = new Event("beforeunload", { cancelable: true })
      window.dispatchEvent(depart)
      return depart.defaultPrevented
    }
    const texte = champ("Modifier ce texte — Objet de la relance")
    act(() => texte.focus())
    expect(quitter()).toBe(false)
    fireEvent.change(texte, { target: { value: "Objet revu" } })
    expect(quitter()).toBe(true)
    fireEvent.keyDown(texte, { key: "Escape" })
    await waitFor(() => expect(statut("Brouillon enregistré.")).toBeDefined())
    expect(quitter()).toBe(false)
  })
})

describe("EditeurDeBlocs, brouillon (AC9 d'E05-S02)", () => {
  it("should show a writer the draft banner once the first gesture is saved, without reread; a manager, only a draft found on opening", async () => {
    monter({ tampon: null })
    expect(screen.queryByText(/Brouillon non publié/)).toBeNull()
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Objet revu")
    expect(await screen.findByText("Brouillon non publié — ouvert sur la révision 4.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Voir la version publiée" })).toHaveAttribute("href", VERSION_PUBLIEE)
    expect(rafraichir).not.toHaveBeenCalled()
    cleanup()

    // Au niveau gestion, un brouillon trouvé à l'ouverture (écrit par un assistant) se dit, jusqu'à la première écriture.
    monter({ niveau: 3, tampon: "2026-09-24T09:00:00.000000+00:00" })
    expect(screen.getByText("Brouillon non publié — ouvert sur la révision 4.")).toBeInTheDocument()
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Objet revu")
    await waitFor(() => expect(screen.queryByText(/Brouillon non publié/)).toBeNull())
  })
})

describe("EditeurDeBlocs, liens d'un bloc (E05-S10, AC-a8, AC-a9 ; E05-S11, AC-26)", () => {
  it("should read a pasted address and a cited page as links in the sentence, over the same field, and no row of links under it", () => {
    monter()
    const adresse = "https://docs.exemple.fr/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit"
    const texte = champ("Modifier ce texte — Objet de la relance")
    ecrire(texte, `Voir ${adresse} et [[ventes/tarifs|les tarifs]]`)
    // Le rendu est posé sur le champ, dans sa case : le même `<textarea>`, jamais remonté, porte le texte brut.
    const rendu = texte.parentElement?.querySelector(".oto-block-rendu")
    if (!(rendu instanceof HTMLElement)) throw new Error("rendu au repos absent")
    expect(texte).toHaveAttribute("data-rendu")
    expect(screen.getByRole("textbox", { name: /^Modifier ce texte — Voir docs\.exemple\.fr et/ })).toBe(texte)
    expect(rendu).toHaveTextContent("Voir docs.exemple.fr et les tarifs")
    const web = within(rendu).getByRole("link", { name: "docs.exemple.fr" })
    expect(web).toHaveAttribute("href", adresse)
    expect(web).toHaveAttribute("title", adresse)
    expect(web).toHaveAttribute("target", "_blank")
    expect(web).toHaveAttribute("rel", "noopener noreferrer nofollow")
    expect(within(rendu).getByRole("link", { name: "les tarifs" })).toHaveAttribute("href", "/n/ventes/tarifs")
    expect(screen.queryByRole("group", { name: "Liens de ce bloc" })).toBeNull()
    // Sans lien, aucun rendu posé : le champ se lit tel quel.
    fireEvent.change(texte, { target: { value: "Voir le devis" } })
    expect(texte).not.toHaveAttribute("data-rendu")
    expect(document.querySelector(".oto-block-rendu")).toBeNull()
  })

  it("should search the readable contents after « @ », and insert the chosen one as a [[path|title]] link, sent as text", async () => {
    const ecriture = api.fetchMock.getMockImplementation()
    const recherches: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (adresse, init) => {
        if (!String(adresse).includes("/api/plateforme/search?")) return ecriture ? ecriture(adresse, init) : new Response(null, { status: 500 })
        recherches.push(String(adresse))
        const matches = [
          { path: "ventes/grille_tarifaire", kind: "page", title: "Grille tarifaire", snippet: null },
          { path: "ventes/grille_remises", kind: "table", title: "Grille des remises", snippet: null },
        ]
        return new Response(JSON.stringify({ data: { matches, more: 0 } }), { status: 200, headers: { "content-type": "application/json" } })
      }),
    )
    monter()
    const texte = champ("Modifier ce texte — Objet de la relance")
    ecrire(texte, "Voir @")
    expect(await screen.findByText("Tapez au moins deux lettres du contenu à citer.")).toBeInTheDocument()
    fireEvent.change(texte, { target: { value: "Voir @gri" } })
    const options = await screen.findAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(["Grille tarifaireventes/grille_tarifaire", "Grille des remisesventes/grille_remises"])
    expect(recherches).toEqual(["/api/plateforme/search?q=gri"])
    expect(texte).toHaveAttribute("aria-activedescendant", options[0].id)
    fireEvent.keyDown(texte, { key: "ArrowDown" })
    expect(texte).toHaveAttribute("aria-activedescendant", options[1].id)
    fireEvent.keyDown(texte, { key: "ArrowUp" })
    fireEvent.keyDown(texte, { key: "Enter" })
    await screen.findByRole("textbox", { name: "Modifier ce texte — Voir Grille tarifaire" })
    const lie = champ("Modifier ce texte — Voir Grille tarifaire")
    expect(lie).toHaveValue("Voir [[ventes/grille_tarifaire|Grille tarifaire]]")
    expect(screen.queryByRole("listbox")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(lie))
    expect(lie).toHaveProperty("selectionStart", lie.value.length)
    expect(screen.getByRole("link", { name: "Grille tarifaire" })).toHaveAttribute("href", "/n/ventes/grille_tarifaire")
    fireEvent.keyDown(lie, { key: "Escape" })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    expect(api.envoyes[0].ops?.[0]).toMatchObject({ op: "replace_block", input: { type: "paragraph", text: "Voir [[ventes/grille_tarifaire|Grille tarifaire]]" } })
  })

  it("should mount the status region of « @ » empty, its sentence coming after the mount", () => {
    // Le premier rendu, sans effet : la région y est vide ; monté, l'effet lui donne sa phrase.
    const liste = <ListeACiter id="citer" resultat={{ etat: "repos" }} actif={0} choisir={() => {}} />
    const conteneur = document.createElement("div")
    conteneur.innerHTML = renderToStaticMarkup(liste)
    expect(within(conteneur).getByRole("status")).toBeEmptyDOMElement()
    render(liste)
    expect(screen.getByRole("status")).toHaveTextContent("Tapez au moins deux lettres du contenu à citer.")
  })
})

describe("EditeurDeBlocs, conflit au bloc (AC6)", () => {
  it("should reread on stale_revision, put the changed block in conflict with the final text prefilled by the saved version, lock the other fields, then save the final text on the new revision", async () => {
    const { relire } = monter()
    api.refuser("stale_revision", 409)
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Texte de Léa")
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    // Le champ reste monté : ce qu'on y tape entre le refus et la relecture va dans « Votre texte ».
    ecrire(champ("Modifier ce texte — Texte de Léa"), "Texte de Léa, suite")
    const claire = [PAGE[0], { ...bloc(ID.objet, "paragraph", "Texte de Claire"), revision: 4 }, PAGE[2], PAGE[3]]
    relire({ blocs: claire })

    expect(await screen.findByText("Ce bloc a changé pendant que vous écriviez. Votre texte n'a pas été enregistré : composez le texte final à partir de la version enregistrée.")).toHaveAttribute("role", "alert")
    expect(screen.getByRole("textbox", { name: "Votre texte, non enregistré" })).toHaveValue("Texte de Léa, suite")
    expect(screen.getByRole("textbox", { name: "Version enregistrée" })).toHaveValue("Texte de Claire")
    expect(screen.getByRole("textbox", { name: "Texte final" })).toHaveValue("Texte de Claire")
    expect(bouton("Copier mon texte")).toBeInTheDocument()
    // Les autres champs se lisent sans s'écrire, et le disent (HN-E05S08-3).
    const autre = champ("Modifier ce titre — Objet")
    expect(autre).toHaveAttribute("readonly")
    act(() => autre.focus())
    await waitFor(() => expect(statut("Réglez d'abord le bloc en conflit.")).toBeDefined())
    choisir("Objet", "Supprimer")
    expect(api.envoyes).toHaveLength(1)

    // Un second refus pendant la résolution : la nouvelle version s'affiche, le texte final est gardé.
    fireEvent.change(screen.getByRole("textbox", { name: "Texte final" }), { target: { value: "Texte final" } })
    api.refuser("stale_revision", 409)
    fireEvent.click(bouton("Enregistrer le texte final"))
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(2))
    relire({ blocs: [PAGE[0], { ...bloc(ID.objet, "paragraph", "Texte de Claire, bis"), revision: 5 }, PAGE[2], PAGE[3]] })
    expect(await screen.findByText("Le bloc a encore changé.")).toHaveAttribute("role", "alert")
    expect(screen.getByRole("textbox", { name: "Version enregistrée" })).toHaveValue("Texte de Claire, bis")
    expect(screen.getByRole("textbox", { name: "Texte final" })).toHaveValue("Texte final")
    expect(screen.getByRole("textbox", { name: "Votre texte, non enregistré" })).toHaveValue("Texte de Léa, suite")

    // Au clavier : le focus sur le geste, puis le geste ; le panneau part avec son bouton, le focus va à la poignée du bloc réglé.
    act(() => bouton("Enregistrer le texte final").focus())
    fireEvent.click(bouton("Enregistrer le texte final"))
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Texte final" })).toBeNull())
    expect(api.envoyes[api.envoyes.length - 1].ops).toEqual([
      { op: "replace_block", block: ID.objet, revision: 5, input: { type: "paragraph", text: "Texte final", data: {} } },
    ])
    await waitFor(() => expect(document.activeElement).toBe(bouton("Actions sur ce bloc — Texte final")))
    expect(champ("Modifier ce titre — Objet")).not.toHaveAttribute("readonly")
  })

  it("should keep a block modified while being deleted, and let an abandoned text give way to the saved version, the queue running again", async () => {
    const { relire } = monter()
    // Léa supprime B, que Claire vient de modifier : B est gardé et reparaît, relu.
    api.refuser("stale_revision", 409)
    choisir("Objet de la relance", "Supprimer")
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    const claire = [PAGE[0], { ...bloc(ID.objet, "paragraph", "Texte de Claire"), revision: 4 }, PAGE[2], PAGE[3]]
    relire({ blocs: claire })
    expect(await screen.findByText("Ce bloc a été modifié pendant que vous le supprimiez : il est gardé.")).toHaveAttribute("role", "alert")
    expect(champ("Modifier ce texte — Texte de Claire")).toHaveValue("Texte de Claire")

    // Léa écrit B, que Claire modifie de nouveau : conflit ; elle abandonne son texte.
    api.refuser("stale_revision", 409)
    ecrireEtEchapper(champ("Modifier ce texte — Texte de Claire"), "Texte de Léa")
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(2))
    relire({ blocs: [PAGE[0], { ...bloc(ID.objet, "paragraph", "Texte de Claire, bis"), revision: 5 }, PAGE[2], PAGE[3]] })
    fireEvent.click(await screen.findByRole("button", { name: "Abandonner mon texte" }))
    expect(screen.getByText("Abandonner votre texte et garder la version enregistrée ?")).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(bouton("Garder")))
    fireEvent.keyDown(bouton("Garder"), { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(bouton("Abandonner mon texte")))
    fireEvent.click(bouton("Abandonner mon texte"))
    fireEvent.click(bouton("Abandonner"))
    await waitFor(() => expect(document.activeElement).toBe(bouton("Actions sur ce bloc — Texte de Claire, bis")))
    expect(screen.queryByRole("textbox", { name: "Texte final" })).toBeNull()
    expect(champ("Modifier ce texte — Texte de Claire, bis")).toHaveValue("Texte de Claire, bis")

    // La file repart : le geste suivant part, sur la version gardée.
    const envoyes = api.envoyes.length
    ecrireEtEchapper(champ("Modifier cette liste — Lire le devis Écrire"), "Lire")
    await waitFor(() => expect(api.envoyes).toHaveLength(envoyes + 1))
    expect(api.envoyes[envoyes].ops?.[0]).toMatchObject({ op: "replace_block", block: ID.liste, revision: 3 })
  })

  it("should offer to reinsert a text whose block was deleted meanwhile, and ask for a retry when the page was published meanwhile", async () => {
    const { relire } = monter()
    api.refuser("stale_revision", 409)
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Texte de Léa")
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    relire({ blocs: [PAGE[0], PAGE[2], PAGE[3]] })
    expect(await screen.findByText("Ce bloc a été supprimé du brouillon pendant que vous écriviez.")).toBeInTheDocument()
    act(() => bouton("Réinsérer mon texte").focus())
    fireEvent.click(bouton("Réinsérer mon texte"))
    await waitFor(() => expect(document.activeElement).toBe(bouton("Actions sur ce bloc — Texte de Léa")))
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1].ops).toEqual([{ op: "insert_after", block: ID.titre, input: { type: "paragraph", text: "Texte de Léa", data: {} } }])

    api.refuser("stale_revision", 409)
    ecrireEtEchapper(champ("Modifier cette liste — Lire le devis Écrire"), "Lire le devis")
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(2))
    relire({ blocs: [PAGE[0], PAGE[2], PAGE[3]], revision: 5 })
    expect(await screen.findByText("La page a changé pendant que vous écriviez : réessayez.")).toHaveAttribute("role", "alert")
    fireEvent.click(bouton("Réessayer"))
    await waitFor(() => expect(api.envoyes).toHaveLength(4))
    expect(api.envoyes[3]).toMatchObject({ base_revision: 5, ops: [{ op: "replace_block", block: ID.liste, revision: 3 }] })
  })
})

describe("EditeurDeBlocs, refus et pannes (AC18 d'E05-S02)", () => {
  it("should say a refusal near the kept text, and copy it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    monter()
    api.refuser("forbidden", 403)
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Texte refusé")
    expect(await screen.findByText("Vous n'avez pas le droit de modifier cette page. Votre texte est toujours là : copiez-le avant de quitter l'écran.")).toHaveAttribute("role", "alert")
    fireEvent.click(bouton("Copier mon texte"))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Texte refusé"))
    expect(await screen.findByRole("button", { name: "Texte copié" })).toBeInTheDocument()
    expect(champ("Modifier ce texte — Texte refusé")).toHaveValue("Texte refusé")
  })

  it("should keep the following gestures waiting behind a network failure, and send them after « Réessayer »", async () => {
    monter()
    api.couper()
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Texte 1")
    expect(await screen.findByText("La requête n'a pas abouti. Réessayez dans un instant : votre texte est toujours là.")).toHaveAttribute("role", "alert")
    ecrireEtEchapper(champ("Modifier cette liste — Lire le devis Écrire"), "Lire")
    expect(api.envoyes).toHaveLength(1)

    // L'alerte part avec « Réessayer » : le focus va à la poignée du bloc du geste refusé.
    act(() => bouton("Réessayer").focus())
    fireEvent.click(bouton("Réessayer"))
    await waitFor(() => expect(document.activeElement).toBe(bouton("Actions sur ce bloc — Texte 1")))
    await waitFor(() => expect(api.envoyes).toHaveLength(3))
    expect(api.envoyes[1].ops?.[0]).toMatchObject({ op: "replace_block", block: ID.objet, input: { text: "Texte 1" } })
    expect(api.envoyes[2].ops?.[0]).toMatchObject({ op: "replace_block", block: ID.liste, input: { data: { items: ["Lire"] } } })
  })

  // Une relecture ne dit rien de ces refus : une personne retirée ou une organisation partie quitteraient l'écran sans leur texte.
  it.each([
    { cas: "not_found", code: "not_found", statut: 404, message: "Ce bloc ou cette page n'existe plus. Votre texte est toujours là : copiez-le avant de recharger.", gestes: ["Copier mon texte", "Recharger la page"] },
    { cas: "too_large", code: "too_large", statut: 413, message: "Ce bloc est trop long, ou la page est pleine : découpez le texte ou placez-le dans une autre page.", gestes: ["Réessayer"] },
    { cas: "an expired session (forbidden, 401)", code: "forbidden", statut: 401, message: "Votre session a expiré. Reconnectez-vous.", gestes: ["Copier mon texte", "Réessayer"] },
    { cas: "not_member", code: "not_member", statut: 403, message: "Vous ne faites plus partie de cette organisation.", gestes: ["Copier mon texte"] },
    { cas: "unknown_org", code: "unknown_org", statut: 404, message: "Cette adresse ne sert plus d'organisation. Rechargez la page.", gestes: ["Copier mon texte"] },
  ])("should say $cas near the kept text, without rereading the page", async ({ code, statut: statutHttp, message, gestes }) => {
    monter()
    api.refuser(code, statutHttp)
    ecrireEtEchapper(champ("Modifier ce texte — Objet de la relance"), "Texte long")
    expect(await screen.findByText(message)).toHaveAttribute("role", "alert")
    for (const geste of gestes) expect(bouton(geste)).toBeInTheDocument()
    expect(rafraichir).not.toHaveBeenCalled()
  })
})
