import type { ComponentProps, ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { NodeView, TreeNode } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeLHote, EcranDeNoeud, EcranDeNoeudChargement } from "@otomata_tech/oto_platform/ui"
import { cheminsCites } from "../../../packages/plateforme/ui/noeud/corps-du-noeud"
import { avecCle, bloc, ID, PAGE, vueDuNoeud } from "../../helpers/noeud"

// L'écran d'un nœud (E05-S02 : AC1 à AC9, AC14, AC17, AC19 ; E05-S09, partie c1 : porté d'oto-frontend ;
// E05-S10, partie b : AC-a7, AC-b4, AC-b6), rendu comme la page de l'hôte le monte : lectures en
// `resultat`, lien de l'hôte marqué, adresse d'un chemin ; la navigation du fil passe par l'hôte
// (`ContexteDeLHote`), espionnée. Le panneau « Partager » a son fichier (`e05s10b-partage.test.tsx`). E05-S11 :
// « Contenus liés » en trois rubriques (AC-29), le titre d'un Contexte (AC-17), une page citée par son titre (AC-26, AC-27).

type EcranDeNoeudProps = ComponentProps<typeof EcranDeNoeud>

const naviguer = vi.fn()

afterEach(() => {
  cleanup()
  naviguer.mockReset()
})

function LienDeTest({ children, ...props }: { href: string; className?: string; "aria-current"?: "page"; children: ReactNode }) {
  return (
    <a data-lien-hote="" {...props}>
      {children}
    </a>
  )
}

const noeud = (path: string, kind: TreeNode["kind"], title: string, children: TreeNode[] = []): TreeNode => ({ path, kind, title, status: "published", children })

const ARBRE: TreeNode[] = [
  noeud("guide", "page", "Guide de Démo", [
    noeud("contexte", "context", "Contexte"),
    noeud("ventes", "page", "Ventes", [
      noeud("ventes/contexte", "context", "Contexte"),
      noeud("ventes/modele_relance", "page", "Modèle de relance", [noeud("ventes/modele_relance/exemple", "page", "Exemple")]),
    ]),
  ]),
]

function rendre(props: Partial<EcranDeNoeudProps> = {}) {
  return render(
    <ContexteDeLHote.Provider value={{ Lien: "a", chemin: "", naviguer }}>
      <EcranDeNoeud
        chemin="ventes/modele_relance"
        noeud={{ data: vueDuNoeud() }}
        arbre={{ data: { tree: ARBRE, truncated: false } }}
        equipes={{ data: [{ slug: "ventes", name: "Ventes" }] }}
        handle={null}
        nomOrganisation="Démo"
        versionPubliee={false}
        Lien={LienDeTest}
        hrefDuChemin={(chemin) => `/n/${chemin}`}
        prefixeDesPages="/n/"
        {...props}
      />
    </ContexteDeLHote.Provider>,
  )
}

const fil = () => within(screen.getByRole("navigation", { name: "Chemin" }))
const maillon = (nom: string) => fil().getByRole("button", { name: nom })
/** Les lignes du menu ouvert : leur nom et si elles sont cochées. */
const lignesDuMenu = () => within(screen.getByRole("menu")).getAllByRole("menuitemradio").map((ligne) => [ligne.textContent, ligne.getAttribute("aria-checked")])
// Une référence commence souvent par un chiffre (début d'un `id`) : un sélecteur `#…` la refuserait.
const ancre = (racine: HTMLElement, id: string) => racine.querySelector(`[id="${id}"]`)
const brouillon = (blocs = PAGE, baseRevision = 4): NodeView["draft"] => ({ baseRevision, savedAt: "2026-09-24T10:00:00Z", draftStamp: "2026-09-24T10:00:00.000000+00:00", blocks: blocs, title: null, summary: null, kind: null, meta: null })

describe("EcranDeNoeud, en-tête (AC2 ; AC-a2)", () => {
  it("should show the header of the design system, without any tree in the content: trail, glyph and title, summary, meta and owner", () => {
    rendre()
    // L'arbre ne vit plus que dans le rail (AC-a2) : le contenu n'en rend aucun.
    expect(screen.queryByRole("navigation", { name: "Arbre des connaissances" })).toBeNull()
    expect(screen.getAllByRole("navigation")).toHaveLength(1)
    expect(fil().queryAllByRole("link")).toHaveLength(0)
    expect(maillon("Modèle de relance")).toHaveAttribute("aria-current", "page")
    expect(maillon("Ventes")).not.toHaveAttribute("aria-current")
    const titre = screen.getByRole("heading", { level: 1 })
    expect(titre).toHaveTextContent("Modèle de relance")
    expect(titre).toHaveClass("oto-page-title")
    expect(screen.getByText("Relancer un devis resté sans réponse.")).toBeInTheDocument()
    expect(screen.getByText("modifiée il y a 3 jours, par Claire Morel").closest("p")).toHaveClass("oto-screen-header-meta")
    // Le document est un îlot nommé par son titre, au corps de lecture du design system.
    expect(screen.getByRole("region", { name: "Modèle de relance" })).toHaveClass("oto-island")
  })

  it("should make each link of the trail open its siblings, the current one checked, each leading through the host, an invisible segment staying inert", async () => {
    rendre({ noeud: { data: vueDuNoeud({ path: "ventes/modele_relance/exemple", title: "Exemple", status: "draft", revision: 0, updatedByName: null }) } })
    expect(screen.getByText("modifiée il y a 3 jours")).toBeInTheDocument()

    // La section ouvre les espaces, chacun menant à son Contexte.
    fireEvent.click(maillon("Ventes"))
    expect(lignesDuMenu()).toEqual([
      ["Tout le monde", "false"],
      ["Ventes", "true"],
    ])
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Tout le monde" }))
    expect(naviguer).toHaveBeenCalledWith("/n/contexte")
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

    // Un ancêtre visible ouvre ses frères, lui coché ; le choisir y mène.
    fireEvent.click(maillon("Modèle de relance"))
    expect(lignesDuMenu()).toEqual([
      ["Contexte", "false"],
      ["Modèle de relance", "true"],
    ])
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Modèle de relance" }))
    expect(naviguer).toHaveBeenLastCalledWith("/n/ventes/modele_relance")
    cleanup()

    // Un segment invisible reste affiché, sans menu ni destination (H68 : rien n'est deviné) : un texte, jamais un
    // bouton qui ne ferait rien (M31).
    rendre({ noeud: { data: vueDuNoeud({ path: "ventes/archive/vieux", title: "Vieux" }) } })
    expect(fil().queryByRole("button", { name: "archive" })).toBeNull()
    expect(fil().getByText("archive").closest(".oto-breadcrumb-item")?.tagName).toBe("SPAN")
    expect(fil().getByText("Vieux").closest(".oto-breadcrumb-item")).toHaveAttribute("aria-current", "page")
  })
})

describe("EcranDeNoeud, la ligne sous le titre (E05-S10, AC-a7)", () => {
  it("should keep « modifiée <quand>, par <qui> » and open, on hover and on focus, a tooltip with the type, state, revision and owner", async () => {
    rendre({ noeud: { data: vueDuNoeud({ owner: { kind: "user", userName: "Claire Morel" } }) } })
    const meta = screen.getByText("modifiée il y a 3 jours, par Claire Morel")
    expect(meta.closest("p")).toHaveClass("oto-screen-header-meta")
    // Ni type, ni état, ni révision dans la ligne : ils passent dans l'infobulle.
    expect(document.querySelector(".oto-screen-header-meta")?.textContent).toBe("modifiée il y a 3 jours, par Claire Morel")
    expect(screen.queryByText(/^Propriétaire :/)).toBeNull()
    expect(screen.queryByRole("tooltip")).toBeNull()

    act(() => meta.focus())
    const infobulle = await screen.findByRole("tooltip")
    expect(meta).toHaveAttribute("aria-describedby", infobulle.id)
    const faits = within(infobulle)
      .getAllByRole("term")
      .map((intitule) => [intitule.textContent, intitule.nextElementSibling?.textContent])
    expect(faits).toEqual([
      ["Type", "Page"],
      ["État", "Publiée"],
      ["Révision", "4"],
      ["Propriétaire", "Claire Morel (Privé)"],
    ])
    fireEvent.keyDown(meta, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()

    fireEvent.mouseEnter(meta)
    expect(await screen.findByRole("tooltip")).toBeInTheDocument()
    cleanup()

    // Un tableau jamais publié : l'accord au masculin, l'état et ses lignes dans l'infobulle.
    rendre({ noeud: { data: vueDuNoeud({ kind: "table", status: "draft", revision: 0, blocks: [], rowsTotal: 12, updatedByName: null }) } })
    const tableau = screen.getByText("modifié il y a 3 jours")
    act(() => tableau.focus())
    expect(await screen.findByRole("tooltip")).toHaveTextContent("TypeTableauÉtatBrouillonRévisionjamais publiéLignes12 lignesPropriétaireéquipe Ventes (responsable : Claire Morel)")
  })
})

describe("EcranDeNoeud, contenus liés et blocs (AC4 ; E05-S10, AC-b6)", () => {
  const ENFANT = { path: "ventes/modele_relance/exemple", title: "Exemple", summary: "Un cas réel.", kind: "procedure" as const, status: "published" as const }
  const LIENS = {
    links_out: [
      { path: "ventes/grille", key: "tarifs", title: "Grille", status: "ok" },
      { path: "ventes/grille", key: "remises", title: "Grille", status: "ok" },
      { path: "ventes/ancien", status: "moved", title: "Nouveau", moved_to: "conseil/nouveau" },
      { path: "ventes/perdu", status: "missing" },
    ],
    links_out_total: 4,
    links_in: [{ path: "conseil/guide", title: "Guide du conseil" }],
    links_in_total: 1,
  }
  const repli = () => {
    const details = screen.getByText("Contenus liés").closest("details")
    if (!details) throw new Error("repli Contenus liés absent")
    return details
  }

  it("should fold « Contenus liés (N) » above the content, outside the card of blocks, with its sub-pages, what it mentions and what mentions it (E05-S11, AC-29)", async () => {
    await act(async () => {
      rendre({ noeud: { data: vueDuNoeud({ children: [ENFANT], childrenTotal: 1 }) }, liens: Promise.resolve({ data: LIENS }) })
    })
    // Le bandeau est hors de l'îlot du document, dans la même colonne ; son résumé compte les trois rubriques.
    await waitFor(() => expect(repli().querySelector("summary")).toHaveTextContent("Contenus liés51 procédure · 3 mentionnés · mentionné dans 1 contenu"))
    const bandeau = repli()
    expect(bandeau).not.toHaveAttribute("open")
    expect(bandeau.closest(".oto-island")).toBeNull()
    const ilot = screen.getByRole("region", { name: "Modèle de relance" })
    expect(bandeau.parentElement).toBe(ilot.parentElement)
    expect(bandeau.compareDocumentPosition(ilot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const sousPages = within(within(bandeau).getByRole("list", { name: "Sous-pages" }))
    expect(sousPages.getByRole("link", { name: /^Exemple/ })).toHaveAttribute("href", "/n/ventes/modele_relance/exemple")
    expect(sousPages.getByRole("link", { name: /^Exemple/ })).toHaveTextContent("ExempleProcédure · Un cas réel.")
    const mentionnes = within(within(bandeau).getByRole("list", { name: "Mentionnés" }))
    // Deux ancres d'un même contenu : une ligne ; un contenu rangé ailleurs mène à sa nouvelle place ; sans cible, un texte.
    expect(mentionnes.getAllByRole("link").map((lien) => [lien.textContent, lien.getAttribute("href")])).toEqual([
      ["Grille", "/n/ventes/grille"],
      ["Nouveaudéplacé vers conseil/nouveau", "/n/conseil/nouveau"],
    ])
    expect(mentionnes.getByText("ventes/perdu").closest("li")).toHaveAttribute("data-broken")
    expect(mentionnes.getByText("sans cible")).toBeInTheDocument()
    const mentionneDans = within(within(bandeau).getByRole("list", { name: "Mentionné dans" }))
    expect(mentionneDans.getAllByRole("link").map((lien) => [lien.textContent, lien.getAttribute("href")])).toEqual([["Guide du conseil", "/n/conseil/guide"]])
  })

  it("should leave out each empty section of « Contenus liés » (E05-S11, AC-29)", async () => {
    await act(async () => {
      rendre({ liens: Promise.resolve({ data: { links_out: [], links_out_total: 0, links_in: [{ path: "conseil/guide", title: "Guide du conseil" }], links_in_total: 1 } }) })
    })
    await waitFor(() => expect(repli().querySelector("summary")).toHaveTextContent("Contenus liés1mentionné dans 1 contenu"))
    expect(within(repli()).getAllByRole("list").map((liste) => liste.getAttribute("aria-label"))).toEqual(["Mentionné dans"])
  })

  it("should count what the service did not serve, say a failed read of the links, and fold nothing when nothing is linked", async () => {
    // Le service ne sert que les premiers nœuds dessous : le nombre est le total.
    rendre({ noeud: { data: vueDuNoeud({ children: [ENFANT], childrenTotal: 60 }) } })
    expect(repli().querySelector("summary")).toHaveTextContent("Contenus liés601 procédure")
    expect(within(repli()).getByText("et 59 autres")).toBeInTheDocument()
    // Sans les liens de l'hôte, ni « Mentionnés » ni « Mentionné dans ».
    expect(within(repli()).getAllByRole("list").map((liste) => liste.getAttribute("aria-label"))).toEqual(["Sous-pages"])
    cleanup()

    await act(async () => {
      rendre({ liens: Promise.resolve({ error: "Une erreur est survenue. Réessayez." }) })
    })
    await waitFor(() => expect(within(repli()).getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez."))
    expect(within(repli()).getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/n/ventes/modele_relance")
    cleanup()

    await act(async () => {
      rendre({ liens: Promise.resolve({ data: { links_out: [], links_out_total: 0, links_in: [], links_in_total: 0 } }) })
    })
    expect(screen.getByRole("region", { name: "Modèle de relance" })).toBeInTheDocument()
    expect(screen.queryByText("Contenus liés")).toBeNull()
  })

  it("should render each block by its type, in order, with its reference as anchor, its inline text marked and no HTML injected", () => {
    const blocs = [
      avecCle(bloc(ID.titre, "heading", "Objet", { level: 1 }), "objet"),
      bloc("10000000-0000-4000-8000-000000000010", "heading", "Détails", { level: 3 }),
      bloc("20000000-0000-4000-8000-000000000020", "paragraph", "Ligne un\nLigne <b>deux</b>"),
      bloc("21000000-0000-4000-8000-000000000021", "paragraph", "Voir **[[ventes/grille#tarifs|les tarifs]]**, `sql` et *vite*"),
      bloc("30000000-0000-4000-8000-000000000030", "paragraph", "| a | b |\n| 1 | 2 |"),
      bloc("40000000-0000-4000-8000-000000000040", "list", null, { items: ["Lire", "Écrire"], ordered: true, start: 3 }),
      bloc("50000000-0000-4000-8000-000000000050", "checklist", null, { items: [{ text: "Relire", checked: true }, { text: "Envoyer", checked: false }] }),
      bloc("60000000-0000-4000-8000-000000000060", "code", "select 1", { language: "sql" }),
      bloc("70000000-0000-4000-8000-000000000070", "call", null, { function: "mail.create_draft", args: { to: "x" } }),
      bloc("80000000-0000-4000-8000-000000000080", "mermaid", "graph TD"),
      bloc("90000000-0000-4000-8000-000000000090", "image", "Le plan", { src: "https://exemple.test/plan.png", alt: "Plan" }),
      bloc("a0000000-0000-4000-8000-0000000000a0", "image", null, { src: "javascript:alert(1)", alt: "Piège" }),
      bloc("b0000000-0000-4000-8000-0000000000b0", "callout", "Attention au **délai**"),
      bloc("c0000000-0000-4000-8000-0000000000c0", "reference", null, { path: "ventes/suivi", view: { limit: 5 } }),
      bloc("d0000000-0000-4000-8000-0000000000d0", "row", null),
    ]
    const { container } = rendre({ noeud: { data: vueDuNoeud({ blocks: blocs }) }, arbre: { data: { tree: [...ARBRE, noeud("ventes/grille", "page", "Grille")], truncated: false } } })
    expect(screen.getByRole("heading", { level: 2, name: "Objet" })).toHaveAttribute("id", "objet")
    // Un titre prend la balise de son niveau (E10-S04, AC-b3, qui remplace E05-S10 AC-a5) : un niveau 3 en `h4`.
    expect(screen.getByRole("heading", { level: 4, name: "Détails" })).toHaveAttribute("id", "10000000")
    const paragraphe = ancre(container, "20000000")
    expect(paragraphe?.tagName).toBe("P")
    expect(paragraphe?.textContent).toBe("Ligne un\nLigne <b>deux</b>")
    expect(container.querySelector("b")).toBeNull()
    // Le texte en ligne (AC5) : le lien interne est celui de l'hôte, vers le bloc de clé `tarifs`, en gras ; sa
    // cible est une page de l'arbre visible (E05-S11, AC-26).
    const tarifs = screen.getByRole("link", { name: "les tarifs" })
    expect(tarifs).toHaveAttribute("href", "/n/ventes/grille#tarifs")
    expect(tarifs).toHaveAttribute("data-lien-hote")
    expect(tarifs.parentElement?.tagName).toBe("STRONG")
    expect(screen.getByText("sql").tagName).toBe("CODE")
    expect(screen.getByText("vite").tagName).toBe("EM")
    expect(ancre(container, "30000000")?.tagName).toBe("PRE")
    expect(ancre(container, "40000000")).toHaveAttribute("start", "3")
    expect(ancre(container, "40000000")?.tagName).toBe("OL")
    expect(within(screen.getByText("Relire").closest("li") ?? document.body).getByText("(fait)")).toBeInTheDocument()
    expect(within(screen.getByText("Envoyer").closest("li") ?? document.body).getByText("(à faire)")).toBeInTheDocument()
    expect(screen.getByText("Code · sql")).toBeInTheDocument()
    // Un appel déjà écrit se lit comme un texte (M59) : sa fonction, puis ses arguments.
    expect(ancre(container, "70000000")?.tagName).toBe("P")
    expect(ancre(container, "70000000")?.textContent).toBe('Appel de mail.create_draft : { "to": "x" }')
    expect(screen.getByText("Diagramme (texte)")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Plan" })).toHaveAttribute("src", "https://exemple.test/plan.png")
    // L'hôte de l'image ne reçoit pas l'adresse de la page qui l'affiche.
    expect(screen.getByRole("img", { name: "Plan" })).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(screen.getByText("Le plan").tagName).toBe("FIGCAPTION")
    expect(screen.getByText("Image non affichée : adresse non sûre. Piège")).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "Piège" })).toBeNull()
    expect(within(screen.getByRole("note")).getByText("délai").tagName).toBe("STRONG")
    // Un contenu cité est un encart, rangé ailleurs, son nom portant le lien de l'hôte.
    const cite = screen.getByRole("link", { name: "ventes/suivi" })
    expect(cite).toHaveAttribute("href", "/n/ventes/suivi")
    expect(cite.closest(".oto-embed")).toHaveTextContent("rangé ailleurs")
    expect(screen.getByText("Bloc de type « row » non affiché ici.")).toBeInTheDocument()
  })
})

describe("EcranDeNoeud, pages citées dans la phrase (E05-S11, AC-26, AC-27)", () => {
  const CITANT = bloc("21000000-0000-4000-8000-000000000021", "paragraph", "Voir [[ventes/grille]], [[ventes/grille|la grille]], [[ventes/ancien]] et [[ventes/perdu]].")
  /** Le paragraphe rendu du bloc citant, qui doit être là. */
  const citant = () => {
    const element = ancre(document.body, "21000000")
    if (!(element instanceof HTMLElement)) throw new Error("le bloc 21000000 n'est pas rendu")
    return element
  }

  it("should name each cited page by its label, else its title, a page with no visible target in plain text, then follow a moved one once the links are read", async () => {
    let servir: (lu: { data: Record<string, unknown> }) => void = () => {}
    const liens = new Promise<{ data: Record<string, unknown> }>((resolve) => (servir = resolve))
    const arbre = [...ARBRE, noeud("ventes/grille", "page", "Grille tarifaire")]
    await act(async () => {
      rendre({ noeud: { data: vueDuNoeud({ blocks: [CITANT] }) }, arbre: { data: { tree: arbre, truncated: false } }, liens })
    })
    const paragraphe = () => within(citant())
    // Avant les liens : le titre lu dans l'arbre, le libellé écrit ; hors de l'arbre, un texte sans lien, par son dernier segment.
    expect(paragraphe().getAllByRole("link").map((lien) => [lien.textContent, lien.getAttribute("href")])).toEqual([
      ["Grille tarifaire", "/n/ventes/grille"],
      ["la grille", "/n/ventes/grille"],
    ])
    expect(ancre(document.body, "21000000")?.textContent).toBe("Voir Grille tarifaire, la grille, ancien et perdu.")
    // Les liens lus : un contenu déplacé mène à sa nouvelle place, sous son titre ; un contenu sans cible reste un texte.
    await act(async () => {
      servir({ data: { links_out: [{ path: "ventes/ancien", status: "moved", title: "Nouveau", moved_to: "conseil/nouveau" }, { path: "ventes/perdu", status: "missing" }], links_out_total: 2, links_in: [], links_in_total: 0 } })
    })
    await waitFor(() => expect(paragraphe().getByRole("link", { name: "Nouveau" })).toHaveAttribute("href", "/n/conseil/nouveau"))
    expect(paragraphe().queryByRole("link", { name: "perdu" })).toBeNull()
    expect(ancre(document.body, "21000000")?.textContent).toBe("Voir Grille tarifaire, la grille, Nouveau et perdu.")
  })

  it("should keep the link of a page missing from a truncated tree, named by its last segment: the page may lie past the cut", () => {
    const arbre = [...ARBRE, noeud("ventes/grille", "page", "Grille tarifaire")]
    rendre({ noeud: { data: vueDuNoeud({ blocks: [CITANT] }) }, arbre: { data: { tree: arbre, truncated: true } } })
    const paragraphe = within(citant())
    expect(paragraphe.getAllByRole("link").map((lien) => [lien.textContent, lien.getAttribute("href")])).toEqual([
      ["Grille tarifaire", "/n/ventes/grille"],
      ["la grille", "/n/ventes/grille"],
      ["ancien", "/n/ventes/ancien"],
      ["perdu", "/n/ventes/perdu"],
    ])
  })

  it("should read the pages cited by a table cell, a toggle summary and body outside its fences, and a sub-item (E10-S04, AC-a4)", () => {
    const blocs = [
      bloc("22000000-0000-4000-8000-000000000022", "simple_table", null, { columns: ["Nom", "Page"], rows: [["Devis", "[[ventes/cellule]]"]] }),
      bloc("23000000-0000-4000-8000-000000000023", "toggle", "Voir [[ventes/corps]].\n```\n[[ventes/cloture]]\n```\nFin.", { summary: "Le [[ventes/resume]]" }),
      bloc("24000000-0000-4000-8000-000000000024", "list", null, { items: [{ text: "Lire", children: { items: ["[[ventes/sous_element]]"] } }] }),
    ]
    expect(cheminsCites(blocs)).toEqual(["ventes/cellule", "ventes/resume", "ventes/corps", "ventes/sous_element"])
  })
})

describe("EcranDeNoeud, titre d'un Contexte (E05-S11, AC-17)", () => {
  it.each([
    ["Tout le monde", "contexte", null],
    ["a team", "ventes/contexte", null],
    ["Privé", "private/claire/contexte", "claire"],
  ] as const)("should title the Contexte of %s « Contexte · <section> », never in place, the saved title unchanged", (_section, path, handle) => {
    const titres = { contexte: "Contexte · Tout le monde", "ventes/contexte": "Contexte · Ventes", "private/claire/contexte": "Contexte · Privé" }
    rendre({ chemin: path, handle, noeud: { data: vueDuNoeud({ path, kind: "context", title: "Contexte de l'organisation", level: 3 }) } })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(titres[path])
    expect(screen.queryByRole("textbox", { name: "Titre" })).toBeNull()
    expect(screen.queryByText("Contexte de l'organisation")).toBeNull()
    expect(fil().getByText(titres[path]).closest(".oto-breadcrumb-item")).toHaveAttribute("aria-current", "page")
  })
})

describe("EcranDeNoeud, états (AC6, AC7)", () => {
  it("should say the same sentence for an unknown, invisible or malformed page, with a way to Tout le monde", () => {
    rendre({ chemin: "Ventes", noeud: { data: null } })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page introuvable")
    expect(screen.getByText("Cette page n'existe pas ou ne vous est pas partagée.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Aller à Tout le monde" })).toHaveAttribute("href", "/n/contexte")
  })

  it("should render the loading state, a failed read with « Réessayer » on the same address, an empty page, and a table without editor", () => {
    render(<EcranDeNoeudChargement />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Chargement de la page…")
    cleanup()

    rendre({ noeud: { error: "Une erreur est survenue. Réessayez." }, arbre: { error: "Une erreur est survenue. Réessayez." }, versionPubliee: true })
    expect(screen.getByRole("alert")).toHaveTextContent("Ce contenu n'a pas pu être chargéUne erreur est survenue. Réessayez.")
    expect(screen.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/n/ventes/modele_relance?version=publiee")
    cleanup()

    // Les équipes illisibles : la page le dit, le fil ne devine pas la section d'équipe.
    rendre({ equipes: { error: "Une erreur est survenue. Réessayez." } })
    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(screen.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/n/ventes/modele_relance")
    expect(fil().queryByText("Tout le monde")).toBeNull()
    expect(fil().getByText("ventes")).toBeInTheDocument()
    cleanup()

    rendre({ noeud: { data: vueDuNoeud({ blocks: [] }) } })
    expect(screen.getByText("Cette page n'a pas encore de contenu.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Commencer à écrire" })).toBeNull()
    cleanup()

    rendre({ noeud: { data: vueDuNoeud({ blocks: [], level: 2 }) } })
    expect(screen.getByRole("button", { name: "Commencer à écrire" })).toBeInTheDocument()
    cleanup()

    rendre({ noeud: { data: vueDuNoeud({ kind: "table", blocks: [], level: 2 }) }, complement: <p>La grille du tableau</p> })
    expect(screen.getByText("La grille du tableau")).toBeInTheDocument()
    expect(screen.queryByText("Cette page n'a pas encore de contenu.")).toBeNull()
    expect(screen.queryByRole("button", { name: /^Actions sur ce bloc/ })).toBeNull()
  })
})

describe("EcranDeNoeud, contrôles selon le niveau (AC8, AC20)", () => {
  it("should give no control to a reader", () => {
    rendre()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /^Actions sur ce bloc/ })).toBeNull()
  })

  // « Déplacer » a quitté l'en-tête (E05-S13, AC-20) : `tests/integration/components/e05s13-coque.test.tsx`.
  it("should give a writer the block controls and the title and summary in place, and say who publishes; a manager publishes without a button, a table's draft included", () => {
    rendre({ noeud: { data: vueDuNoeud({ level: 2 }) } })
    expect(screen.getByRole("button", { name: "Ajouter un bloc après — Objet de la relance" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Actions sur ce bloc — Objet de la relance" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Modifier ce texte — Objet de la relance" })).toHaveValue("Objet de la relance")
    // Le titre et le résumé s'écrivent en place (E05-S10, AC-a1) : le titre dans le `<h1>`, le résumé à sa place.
    expect(screen.getByRole("textbox", { name: "Titre" })).toHaveValue("Modèle de relance")
    expect(screen.getByRole("textbox", { name: "Titre" }).closest("h1")).not.toBeNull()
    expect(screen.getByRole("textbox", { name: "Résumé" })).toHaveValue("Relancer un devis resté sans réponse.")
    expect(screen.getByText("La publication revient au responsable de l'équipe Ventes (Claire Morel) ou à un administrateur.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull()
    cleanup()

    rendre({ noeud: { data: vueDuNoeud({ level: 2, path: "conseil/tarifs", owner: { kind: "org" } }) } })
    expect(screen.getByText("La publication revient aux administrateurs de Démo.")).toBeInTheDocument()
    cleanup()

    // Au niveau gestion, aucun bouton « Publier » ni phrase : la publication part seule (E05-S10, AC-a6).
    rendre({ noeud: { data: vueDuNoeud({ level: 3, draft: brouillon() }) } })
    expect(screen.getByRole("group", { name: "Publication" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull()
    expect(screen.queryByText(/^La publication revient/)).toBeNull()
    cleanup()

    // Un tableau n'a pas d'éditeur de blocs, mais son brouillon se voit et se publie (AC9, AC17), son en-tête écrit en place (AC-a10).
    rendre({ noeud: { data: vueDuNoeud({ kind: "table", blocks: [], level: 3, draft: brouillon([]) }) }, complement: <p>La grille du tableau</p> })
    expect(screen.getByText("Brouillon non publié — ouvert sur la révision 4.")).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Publication" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Titre" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Résumé" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Actions sur ce bloc/ })).toBeNull()
  })

  it("should open a node just created from the rail with its title field focused and selected, and no other node (E05-S10, AC-b3)", async () => {
    rendre({ noeud: { data: vueDuNoeud({ level: 3, title: "Sans titre", summary: "À compléter.", status: "draft", revision: 0, blocks: [] }) } })
    const titre = screen.getByRole("textbox", { name: "Titre" })
    await waitFor(() => expect(document.activeElement).toBe(titre))
    // Sélectionné entier : la première frappe remplace « Sans titre ».
    expect(titre).toHaveProperty("selectionStart", 0)
    expect(titre).toHaveProperty("selectionEnd", "Sans titre".length)
    cleanup()

    // Déjà publié, ou déjà nommé : le focus reste où il est.
    for (const surcharge of [{ title: "Sans titre", revision: 4 }, { title: "Modèle de relance", status: "draft" as const, revision: 0 }]) {
      rendre({ noeud: { data: vueDuNoeud({ level: 3, ...surcharge }) } })
      expect(document.activeElement).toBe(document.body)
      cleanup()
    }
  })
})

describe("EcranDeNoeud, brouillon (AC9)", () => {
  it("should show a writer the draft under its banner, and the published version on ?version=publiee; a reader sees neither", () => {
    const blocsDuBrouillon = [bloc(ID.objet, "paragraph", "Texte du brouillon")]
    rendre({ noeud: { data: vueDuNoeud({ level: 2, draft: brouillon(blocsDuBrouillon) }) } })
    expect(screen.getByText("Brouillon non publié — ouvert sur la révision 4.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Voir la version publiée" })).toHaveAttribute("href", "/n/ventes/modele_relance?version=publiee")
    expect(screen.getByDisplayValue("Texte du brouillon")).toBeInTheDocument()
    expect(screen.queryByText("Objet de la relance")).toBeNull()
    cleanup()

    // La version publiée se lit, comme pour un lecteur : aucun champ (E05-S08, AC1).
    rendre({ noeud: { data: vueDuNoeud({ level: 2, draft: brouillon(blocsDuBrouillon) }) }, versionPubliee: true })
    expect(screen.getByText("Version publiée (révision 4).")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Revenir au brouillon" })).toHaveAttribute("href", "/n/ventes/modele_relance")
    expect(screen.getByText("Objet de la relance")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).toBeNull()
    cleanup()

    rendre({ noeud: { data: vueDuNoeud({ level: 2, status: "draft", revision: 0, blocks: [], draft: brouillon(blocsDuBrouillon, 0) }) } })
    expect(screen.getByText("Brouillon non publié — cette page n'a jamais été publiée.")).toBeInTheDocument()
    cleanup()

    rendre({ versionPubliee: true })
    expect(screen.queryByText(/^Brouillon non publié|^Version publiée/)).toBeNull()
    expect(screen.queryByRole("link", { name: "Revenir au brouillon" })).toBeNull()
  })
})

describe("EcranDeNoeud, sections toujours visibles comme titres (AC14 ; E05-S08, AC7)", () => {
  const TITRES = [
    avecCle(bloc(ID.titre, "heading", "Objet", { level: 1 }), "objet"),
    bloc(ID.objet, "paragraph", "Objet de la relance"),
    bloc("10000000-0000-4000-8000-000000000010", "heading", "Détails **utiles**", { level: 2 }),
    bloc("20000000-0000-4000-8000-000000000020", "heading", "Cas", { level: 3 }),
  ]
  // Le nom d'un titre : son texte rendu, ou, pour un titre écrit, le texte de son champ sans balisage (`aria-label`).
  const plan = () => screen.getAllByRole("heading").map((titre) => [titre.tagName, titre.getAttribute("aria-label") ?? titre.textContent])

  it("should give a writer the reader's outline, each heading field mounted in its heading element", () => {
    rendre({ noeud: { data: vueDuNoeud({ blocks: TITRES }) } })
    const lecteur = plan()
    // Un titre de niveau N en `h(N+1)` (E10-S04, AC-b3, qui remplace E05-S10 AC-a5), au repos dans l'éditeur aussi.
    expect(lecteur).toEqual([
      ["H1", "Modèle de relance"],
      ["H2", "Objet"],
      ["H3", "Détails utiles"],
      ["H4", "Cas"],
    ])
    cleanup()

    rendre({ noeud: { data: vueDuNoeud({ blocks: TITRES, level: 2 }) } })
    expect(plan()).toEqual(lecteur)
    const champ = screen.getByRole("textbox", { name: "Modifier ce titre — Détails utiles" })
    expect(champ).toHaveValue("Détails **utiles**")
    expect(champ.closest("h3")).toHaveAttribute("id", "10000000")
  })
})

describe("EcranDeNoeud, accès et partage (AC19 ; E05-S10, AC-b5)", () => {
  const partage = (surcharge: Partial<NonNullable<EcranDeNoeudProps["partage"]>> = {}): EcranDeNoeudProps["partage"] => ({
    regles: { data: { path: "ventes/modele_relance", title: "Modèle de relance", owner: { kind: "team", teamName: "Ventes" }, viewerLevel: 3, rules: [] } },
    sujets: { data: { equipes: [{ id: "t-conseil", nom: "Conseil" }], personnes: [] } },
    gestionAccordable: false,
    moi: null,
    ...surcharge,
  })

  it("should open « Partager » from « Partager · <espace> » of the header, clear a search on a first Escape, close on the next and give the focus back", async () => {
    rendre({ partage: partage() })
    const partager = screen.getByRole("button", { name: "Partager · Ventes" })
    expect(partager).toHaveAttribute("aria-expanded", "false")
    act(() => partager.focus())
    fireEvent.click(partager)
    const panneau = screen.getByRole("dialog", { name: "Partager — Ventes" })
    expect(partager).toHaveAttribute("aria-expanded", "true")
    await waitFor(() => expect(document.activeElement).toBe(panneau))
    const champ = within(panneau).getByRole("combobox", { name: "Ajouter une personne ou une équipe" })
    fireEvent.change(champ, { target: { value: "cons" } })
    fireEvent.keyDown(champ, { key: "Escape" })
    expect(champ).toHaveValue("")
    expect(screen.getByRole("dialog", { name: "Partager — Ventes" })).toBeInTheDocument()
    fireEvent.keyDown(champ, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(partager)
  })

  it.each([
    ["the rules", { regles: { error: "Une erreur est survenue. Réessayez." } }],
    ["the teams or members", { sujets: { error: "Une erreur est survenue. Réessayez." } }],
  ] as const)("should say a failed read of %s in the panel, with « Réessayer » on the same address", (_lecture, panne) => {
    rendre({ partage: partage(panne), versionPubliee: true })
    fireEvent.click(screen.getByRole("button", { name: "Partager · Ventes" }))
    const panneau = within(screen.getByRole("dialog", { name: "Partager — Ventes" }))
    expect(panneau.getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(panneau.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/n/ventes/modele_relance?version=publiee")
    expect(panneau.queryByRole("combobox")).toBeNull()
  })
})
