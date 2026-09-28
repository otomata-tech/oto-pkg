// L'accueil porté d'oto-frontend (E05-S09, partie b, AC-b1) : le salut, la recherche qui ouvre la palette du
// rail, « Brancher un assistant » en aparté (adresse, état, dialogue vers les guides de `/connect`), le fil
// de la semaine par journée et le premier jour ; chaque lecture en échec dite avec « Réessayer »
// (`portage-ecrans.md § 4`). L'hôte est simulé par ce qu'il prête (`ContexteDeLHote`, la relecture) ; l'écran
// reçoit les données déjà lues, comme de sa page. E05-S11 : l'îlot principal porte les onglets « Activités »
// et « Contexte » (AC-12) ; la vue « Contexte » elle-même est éprouvée par `e05s11-contexte-servi.test.tsx`.
// E05-S12 (lot B) : le fil est fait d'activités et « Procédures les plus utilisées » remplace « Contenus récents » ; la
// ligne d'une activité, ses liens et la mise en page sont éprouvés par `e05s12-accueil.test.tsx`.
import type { AnchorHTMLAttributes } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Activity, ActivityPage, TreeNode } from "@otomata_tech/oto_platform/schemas"
import {
  ContexteDeLHote,
  ContexteDeRafraichissement,
  CoquilleOto,
  EcranDAccueil,
  EcranDAccueilChargement,
  RechercheDuRail,
  type DonneesDeLAccueil,
  type EcranDAccueilProps,
} from "@otomata_tech/oto_platform/ui"
import { simulerLesDialogues } from "../../helpers/dialogue"

// Le 26 septembre 2026 à midi, heure de Paris (UTC+2) : les journées du fil se comptent à Paris.
const MAINTENANT = new Date("2026-09-26T10:00:00Z")
const MOI = "0b6f1f0e-1c1a-4a8e-9a51-0d7c1a2b3c02"
const ADRESSE = "https://demo.example.test/api/mcp"
const ECHEC = "Une erreur est survenue. Réessayez."

const activite = (id: number, at: string, surcharge: Partial<Activity> = {}): Activity => ({
  id,
  at,
  userId: MOI,
  userName: "Claire Morel",
  verb: "published",
  kind: "page",
  path: `ventes/page_${id}`,
  title: `Page ${id}`,
  count: 1,
  ctx: null,
  ...surcharge,
})

const pageDe = (activities: Activity[]): ActivityPage => ({ activities, truncated: false })

const DONNEES: DonneesDeLAccueil = {
  nom: "Claire Morel",
  moi: MOI,
  activites: { data: pageDe([activite(1, "2026-09-26T08:10:00Z")]) },
  adresse: ADRESSE,
  connexions: { data: [] },
  procedures: { data: [] },
}

const CLAUDE = { famille: "claude.ai", signature: "claude-ai@1.0", date: "2026-09-24T09:00:00Z" }

const ARBRE: TreeNode[] = [{ path: "guide", kind: "page", title: "Guide de Démo", status: "published", children: [{ path: "ventes", kind: "page", title: "Ventes", status: "published", children: [] }] }]

/** Le lien de l'hôte : une ancre marquée, pour reconnaître ce qu'il rend. */
function LienDeLHote({ href, children, ...reste }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} data-lien="hote" {...reste}>
      {children}
    </a>
  )
}

const hote = vi.hoisted(() => ({ naviguer: vi.fn(), rafraichir: vi.fn() }))

/** L'écran sous la racine `.oto`, avec ce que l'hôte prête ; `rail` monte aussi la recherche du rail, et sa palette. */
function monter(donnees: EcranDAccueilProps["donnees"], { rail = false, onglet = "activites" }: { rail?: boolean; onglet?: EcranDAccueilProps["onglet"] } = {}) {
  render(
    <CoquilleOto pleinePage>
      <ContexteDeRafraichissement.Provider value={hote.rafraichir}>
        <ContexteDeLHote.Provider value={{ Lien: LienDeLHote, chemin: "/", naviguer: hote.naviguer }}>
          {rail && <RechercheDuRail arbre={{ tree: ARBRE, equipes: [] }} handle="claire" adresses={{ pages: "/n/" }} administre={false} />}
          <EcranDAccueil
            donnees={donnees}
            Lien={LienDeLHote}
            hrefDuJournal="/journal"
            hrefDeConversation={(code) => `/journal?conversation=${code}`}
            hrefDesGuides="/connect"
            prefixeDesPages="/n/"
            onglet={onglet}
            hrefDOnglet={(cle) => (cle === "activites" ? "/" : `/?onglet=${cle}`)}
            hrefDuProfil="/profil"
          />
        </ContexteDeLHote.Provider>
      </ContexteDeRafraichissement.Provider>
    </CoquilleOto>,
  )
}

const ilot = (nom: string) => within(screen.getByRole("region", { name: nom }))
/** Le panneau d'un onglet de l'îlot principal, nommé par son onglet (AC-12). */
const panneau = (nom: string) => within(screen.getByRole("tabpanel", { name: nom }))
const paletteOuverte = () => document.querySelector("dialog.oto-palette")?.hasAttribute("open") ?? false
/** L'adresse sur la carte, hors du dialogue qui la porte aussi (toujours monté, fermé). */
const adresseSurLaCarte = () => ilot("Brancher un assistant").queryAllByText(ADRESSE, { selector: "code" }).filter((code) => code.closest("dialog") === null)

beforeAll(simulerLesDialogues)

beforeEach(() => {
  vi.clearAllMocks()
  // Seule l'horloge est figée : les minuteries des dialogues courent.
  vi.useFakeTimers({ now: MAINTENANT, toFake: ["Date"] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("home screen (AC-b1)", () => {
  it("should greet the person and lay out the activities, the search, Brancher un assistant and the useful procedures", () => {
    monter({ data: DONNEES })

    expect(screen.getByRole("heading", { level: 1, name: "Bonjour Claire Morel" })).toBeInTheDocument()
    expect(within(screen.getByRole("search")).getByRole("searchbox", { name: "Chercher" })).toBeInTheDocument()
    expect(ilot("Brancher un assistant").getByRole("heading", { level: 2, name: "Brancher un assistant" })).toBeInTheDocument()
    expect(panneau("Activités").getByRole("link", { name: "Tout le journal" })).toHaveAttribute("href", "/journal")
    expect(ilot("Procédures les plus utilisées").getByRole("heading", { level: 2, name: "Procédures les plus utilisées" })).toBeInTheDocument()
    // E05-S12 (AC-18) : « Contenus récents » quitte l'accueil.
    expect(screen.queryByRole("region", { name: "Contenus récents" })).toBeNull()
  })

  it("should list the activities by Paris day, newest first", () => {
    const activites = [
      activite(4, "2026-09-26T08:10:00Z"),
      // 00:30 à Paris le 26 : encore aujourd'hui, bien qu'il soit le 25 en UTC.
      activite(3, "2026-09-25T22:30:00Z"),
      activite(2, "2026-09-25T20:00:00Z"),
      activite(1, "2026-09-22T09:00:00Z"),
    ]
    monter({ data: { ...DONNEES, activites: { data: pageDe(activites) } } })

    // Les journées et leurs lignes, dans l'ordre du document : chaque ligne sous le titre de sa journée.
    const ordre = [...screen.getByRole("tabpanel", { name: "Activités" }).querySelectorAll("h2, a[href^='/n/']")].map((element) =>
      element.tagName === "H2" ? element.textContent : element.getAttribute("href"),
    )
    expect(ordre).toEqual(["Aujourd'hui", "/n/ventes/page_4", "/n/ventes/page_3", "Hier", "/n/ventes/page_2", "22 septembre 2026", "/n/ventes/page_1"])
  })
})

describe("home screen first day (AC-b1 ; E05-S12, AC-16)", () => {
  const vide: ActivityPage = pageDe([])

  it.each<[string, Partial<DonneesDeLAccueil>, boolean]>([
    ["no activity this week and no assistant ever connected", { activites: { data: vide }, connexions: { data: [] } }, true],
    ["an activity this week", { connexions: { data: [] } }, false],
    ["an assistant connected", { activites: { data: vide }, connexions: { data: [CLAUDE] } }, false],
    ["a failed read of the journal", { activites: { error: ECHEC }, connexions: { data: [] } }, false],
    ["a failed read of the connections", { activites: { data: vide }, connexions: { error: ECHEC } }, false],
  ])("with %s, should show the first day: %s", (_cas, surcharge, premierJour) => {
    monter({ data: { ...DONNEES, ...surcharge } })

    // Le premier jour prend la place du fil, dans l'onglet « Activités » (HN-E05S11-11), et retire l'îlot des
    // procédures ; « Brancher un assistant » et l'onglet « Contexte » restent.
    expect(panneau("Activités").queryByText("Rien n'a encore tourné") !== null).toBe(premierJour)
    expect(panneau("Activités").queryByRole("link", { name: "Tout le journal" }) !== null).toBe(!premierJour)
    expect(screen.queryByRole("region", { name: "Procédures les plus utilisées" }) !== null).toBe(!premierJour)
    expect(screen.getByRole("region", { name: "Brancher un assistant" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Contexte" })).toBeInTheDocument()
  })

  it("should say an empty week without any action when an assistant is connected", () => {
    monter({ data: { ...DONNEES, activites: { data: vide }, connexions: { data: [CLAUDE] } } })

    expect(panneau("Activités").getByText("Aucune activité cette semaine")).toBeInTheDocument()
    expect(panneau("Activités").queryByRole("button")).toBeNull()
  })
})

describe("home screen tabs (E05-S11, AC-12)", () => {
  it("should carry « Activités » and « Contexte » in the main island, « Activités » open by default, arrows, Home and End moving the focus, a tab opening its address", () => {
    monter({ data: DONNEES })

    const barre = screen.getByRole("tablist", { name: "Onglets de l'accueil" })
    const onglets = within(barre).getAllByRole("tab")
    expect(onglets.map((onglet) => [onglet.textContent, onglet.getAttribute("aria-selected")])).toEqual([
      ["Activités", "true"],
      ["Contexte", "false"],
    ])
    expect(screen.getByRole("region", { name: "Activités et contexte" })).toContainElement(barre)
    onglets[0].focus()
    fireEvent.keyDown(barre, { key: "ArrowRight" })
    expect(document.activeElement).toBe(onglets[1])
    fireEvent.keyDown(barre, { key: "Home" })
    expect(document.activeElement).toBe(onglets[0])
    fireEvent.keyDown(barre, { key: "End" })
    expect(document.activeElement).toBe(onglets[1])
    fireEvent.click(onglets[1])
    expect(hote.naviguer).toHaveBeenCalledWith("/?onglet=contexte")
  })

  it("should show what the assistant reads in the « Contexte » panel when that tab is open", () => {
    const apercu = {
      text: "ctx: XXXX-XXXX\n\n## You\n\n## Context: everyone (contexte)\nNous vendons.",
      budget: 20_000,
      blocks: [
        { name: "code", chars: 14, status: "full", path: null },
        { name: "private", chars: 6, status: "full", path: null },
        { name: "contexte", chars: 45, status: "full", path: "contexte" },
      ],
    }
    monter({ data: { ...DONNEES, contexte: { apercu: { data: apercu }, contextes: {}, equipes: [], nomOrganisation: "Démo" } } }, { onglet: "contexte" })

    expect(screen.getByRole("tab", { name: "Contexte" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByRole("tabpanel", { name: "Activités" })).toBeNull()
    // L'ancre de la partie Tout le monde : la même avant et après le regroupement des faits (E05-S12, D109).
    expect(panneau("Contexte").getByRole("region", { name: "Contexte : Tout le monde" })).toHaveAttribute("id", "contexte-tout-le-monde")
    expect(panneau("Contexte").getByRole("link", { name: "Modifier dans Profil" })).toHaveAttribute("href", "/profil")
  })
})

describe("home screen Brancher un assistant (AC-b1, HN-E05S09-3)", () => {
  it("should give the whole address to copy and say that no assistant is connected yet", () => {
    monter({ data: DONNEES })

    const carte = ilot("Brancher un assistant")
    expect(adresseSurLaCarte()).toHaveLength(1)
    expect(carte.getByRole("button", { name: "Copier l'adresse du serveur" })).toBeInTheDocument()
    expect(carte.getByText("Aucun assistant branché")).toBeInTheDocument()
  })

  it("should name each connected assistant with its last connection, the address leaving the card for the dialog", () => {
    monter({ data: { ...DONNEES, connexions: { data: [CLAUDE, { famille: "Claude Code", signature: "claude-code@2.1", date: "2026-09-20T09:00:00Z" }] } } })

    const carte = ilot("Brancher un assistant")
    expect(carte.getAllByRole("listitem").map((ligne) => ligne.textContent)).toEqual([
      "claude.ai · dernière connexion le 24 septembre 2026",
      "Claude Code · dernière connexion le 20 septembre 2026",
    ])
    expect(adresseSurLaCarte()).toEqual([])
  })

  it("should open on « Brancher » the dialog with the address and the guides of /connect, and close it", async () => {
    monter({ data: { ...DONNEES, connexions: { data: [CLAUDE] } } })

    fireEvent.click(ilot("Brancher un assistant").getByRole("button", { name: "Brancher" }))

    const dialogue = within(screen.getByRole("dialog", { name: "Brancher un assistant" }))
    expect(dialogue.getByText(ADRESSE, { selector: "code" })).toBeInTheDocument()
    const guides = dialogue.getByRole("link", { name: /Guides d'installation/ })
    expect(guides).toHaveAttribute("href", "/connect")
    expect(guides.dataset.lien).toBe("hote")
    fireEvent.click(dialogue.getAllByRole("button", { name: "Fermer" })[0])
    // Le dialogue du design system reste monté : il est fermé quand il ne porte plus `open`.
    await waitFor(() => expect(document.querySelector("dialog.oto-dialog")?.hasAttribute("open")).toBe(false))
  })
})

describe("home screen search (AC-b1)", () => {
  it("should open the rail's palette from the home field, on a click and on Enter", async () => {
    monter({ data: DONNEES }, { rail: true })
    const champ = within(screen.getByRole("search")).getByRole("searchbox", { name: "Chercher" })

    fireEvent.click(champ)
    expect(paletteOuverte()).toBe(true)

    // Échap : le `<dialog>` émet `cancel`, que la palette rend à sa fermeture (jsdom ne l'émet pas seul).
    fireEvent(screen.getByRole("dialog", { name: "Palette de commandes" }), new Event("cancel"))
    await waitFor(() => expect(paletteOuverte()).toBe(false))
    const formulaire = champ.closest("form")
    if (!formulaire) throw new Error("champ hors du formulaire de recherche")
    fireEvent.submit(formulaire)
    expect(paletteOuverte()).toBe(true)
  })
})

describe("home screen failed reads (portage-ecrans.md § 4 ; E05-S12, AC-16, AC-18)", () => {
  it.each<[string, "tabpanel" | "region", Partial<DonneesDeLAccueil>]>([
    ["Activités", "tabpanel", { activites: { error: ECHEC } }],
    ["Brancher un assistant", "region", { connexions: { error: ECHEC } }],
    ["Procédures les plus utilisées", "region", { procedures: { error: ECHEC } }],
  ])("should say a failed read in « %s » with « Réessayer », which reads the page again", (nom, role, surcharge) => {
    monter({ data: { ...DONNEES, ...surcharge } })

    const zone = within(screen.getByRole(role, { name: nom }))
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(zone.getByRole("alert")).toHaveTextContent(`Chargement impossible${ECHEC}`)
    fireEvent.click(zone.getByRole("button", { name: "Réessayer" }))
    expect(hote.rafraichir).toHaveBeenCalledTimes(1)
  })

  it("should keep the address on the card when the connections cannot be read", () => {
    monter({ data: { ...DONNEES, connexions: { error: ECHEC } } })

    expect(adresseSurLaCarte()).toHaveLength(1)
  })

  it("should say once that the home could not be read when the identity could not, the search still there", () => {
    monter({ error: ECHEC })

    expect(screen.getByRole("heading", { level: 1, name: "Bonjour" })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(`Chargement impossible${ECHEC}`)
    expect(screen.getByRole("search")).toBeInTheDocument()
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("should announce the loading of the home", () => {
    render(<EcranDAccueilChargement />)

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status")).toHaveTextContent("Chargement de l'accueil…")
  })
})
