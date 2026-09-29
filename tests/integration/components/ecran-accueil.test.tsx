// L'accueil porté d'oto-frontend (E05-S09, partie b, AC-b1) : le salut, la recherche qui ouvre la palette du
// rail, « Brancher mon Claude, ChatGPT ou Mistral » en aparté (état, fenêtre du guide, E11-S09), le fil
// de la semaine par journée et le premier jour ; chaque lecture en échec dite avec « Réessayer »
// (`portage-ecrans.md § 4`). L'hôte est simulé par ce qu'il prête (`ContexteDeLHote`, la relecture) ; l'écran
// reçoit les données déjà lues, comme de sa page. E11-S10 (AC-e3) : l'îlot principal, « Activités », sans onglets ;
// la vue « Contexte » a son écran (`contexte-page.test.tsx`, `e05s11-contexte-servi.test.tsx`).
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
const ADRESSE = { url: "https://demo.example.test/api/mcp", nom: "Démo", nomCli: "demo", phrase: "Commence par le contexte de « Démo »." }
const BRANCHER = "Brancher mon Claude, ChatGPT ou Mistral"
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
function monter(donnees: EcranDAccueilProps["donnees"], { rail = false }: { rail?: boolean } = {}) {
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
            prefixeDesPages="/n/"
          />
        </ContexteDeLHote.Provider>
      </ContexteDeRafraichissement.Provider>
    </CoquilleOto>,
  )
}

const ilot = (nom: string) => within(screen.getByRole("region", { name: nom }))
/** L'îlot principal, « Activités » (E11-S10, AC-e3). */
const activites = () => ilot("Activités")
const paletteOuverte = () => document.querySelector("dialog.oto-palette")?.hasAttribute("open") ?? false
/** Ce que la carte montre d'une valeur à copier, hors de la fenêtre qui porte le guide. */
const copiesSurLaCarte = () =>
  [...ilot(BRANCHER).queryAllByText(ADRESSE.url, { selector: "code" }), ...ilot(BRANCHER).queryAllByRole("button", { name: /^Copier/ })].filter(
    (element) => element.closest("dialog") === null,
  )

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
  it("should greet the person and lay out the activities, the search, Brancher mon Claude, ChatGPT ou Mistral and the useful procedures", () => {
    monter({ data: DONNEES })

    expect(screen.getByRole("heading", { level: 1, name: "Bonjour Claire Morel" })).toBeInTheDocument()
    expect(within(screen.getByRole("search")).getByRole("searchbox", { name: "Chercher" })).toBeInTheDocument()
    expect(ilot(BRANCHER).getByRole("heading", { level: 2, name: BRANCHER })).toBeInTheDocument()
    expect(activites().getByRole("link", { name: "Tout le journal" })).toHaveAttribute("href", "/journal")
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

    // Les journées et leurs lignes, dans l'ordre du document : chaque ligne sous le titre de sa journée, un
    // niveau sous le titre « Activités » de l'îlot.
    const ordre = [...screen.getByRole("region", { name: "Activités" }).querySelectorAll("h2, h3, a[href^='/n/']")].map((element) =>
      element.tagName === "A" ? element.getAttribute("href") : `${element.tagName} ${element.textContent}`,
    )
    expect(ordre).toEqual(["H2 Activités", "H3 Aujourd'hui", "/n/ventes/page_4", "/n/ventes/page_3", "H3 Hier", "/n/ventes/page_2", "H3 22 septembre 2026", "/n/ventes/page_1"])
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

    // Le premier jour prend la place du fil, dans l'îlot « Activités » (HN-E05S11-11), et retire l'îlot des
    // procédures ; « Brancher » reste.
    expect(activites().queryByText("Rien n'a encore tourné") !== null).toBe(premierJour)
    expect(activites().queryByRole("link", { name: "Tout le journal" }) !== null).toBe(!premierJour)
    expect(screen.queryByRole("region", { name: "Procédures les plus utilisées" }) !== null).toBe(!premierJour)
    expect(screen.getByRole("region", { name: BRANCHER })).toBeInTheDocument()
  })

  it("should say an empty week without any action when an assistant is connected", () => {
    monter({ data: { ...DONNEES, activites: { data: vide }, connexions: { data: [CLAUDE] } } })

    expect(activites().getByText("Aucune activité cette semaine")).toBeInTheDocument()
    expect(activites().queryByRole("button")).toBeNull()
  })
})

describe("home screen main island (E11-S10, AC-e3)", () => {
  it("should title the main island « Activités » without any tab, and read no Contexte", () => {
    monter({ data: DONNEES })

    expect(activites().getByRole("heading", { level: 2, name: "Activités" })).toBeInTheDocument()
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.queryByRole("tab", { name: "Contexte" })).toBeNull()
    expect(screen.queryByRole("region", { name: /^Contexte/ })).toBeNull()
  })
})

describe("home screen Brancher mon Claude, ChatGPT ou Mistral (E11-S09, AC-9, AC-10)", () => {
  it.each<[string, Partial<DonneesDeLAccueil>]>([
    ["no connection", { connexions: { data: [] } }],
    ["a connection", { connexions: { data: [CLAUDE] } }],
    ["a failed read of the connections", { connexions: { error: ECHEC } }],
  ])("should never show the address nor any copy on the card, with %s (AC-9)", (_cas, surcharge) => {
    monter({ data: { ...DONNEES, ...surcharge } })

    expect(copiesSurLaCarte()).toEqual([])
  })

  it("should say that no assistant is connected yet", () => {
    monter({ data: DONNEES })

    expect(ilot(BRANCHER).getByText("Aucun assistant branché")).toBeInTheDocument()
  })

  it("should name each connected assistant with its last connection", () => {
    monter({ data: { ...DONNEES, connexions: { data: [CLAUDE, { famille: "Claude Code", signature: "claude-code@2.1", date: "2026-09-20T09:00:00Z" }] } } })

    expect(ilot(BRANCHER).getAllByRole("listitem").map((ligne) => ligne.textContent)).toEqual([
      "claude.ai · dernière connexion le 24 septembre 2026",
      "Claude Code · dernière connexion le 20 septembre 2026",
    ])
  })

  it("should open on « Brancher » the large window on the guide, on the tab of the latest family, without any link to /connect, and close it (AC-10)", async () => {
    monter({ data: { ...DONNEES, connexions: { data: [{ famille: "Claude Code", signature: "claude-code@2.1", date: "2026-09-24T09:00:00Z" }, CLAUDE] } } })
    fireEvent.click(ilot(BRANCHER).getByRole("button", { name: "Brancher" }))

    const fenetre = screen.getByRole("dialog", { name: BRANCHER })
    expect(fenetre).toHaveAttribute("data-size", "lg")
    const dedans = within(fenetre)
    expect(dedans.getByText("Ajoutez Démo à votre assistant : il agira avec votre compte, dans la limite de vos droits.")).toBeInTheDocument()
    expect(dedans.getByRole("tab", { name: "Claude Code" })).toHaveAttribute("aria-selected", "true")
    expect(dedans.queryByRole("link", { name: /Guides d'installation/ })).toBeNull()
    expect(fenetre.querySelector("a[href='/connect']")).toBeNull()
    fireEvent.click(within(fenetre.querySelector("footer") ?? fenetre).getByRole("button", { name: "Fermer" }))
    // Le dialogue du design system reste monté : il est fermé quand il ne porte plus `open`.
    await waitFor(() => expect(fenetre.hasAttribute("open")).toBe(false))
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
  it.each<[string, Partial<DonneesDeLAccueil>]>([
    ["Activités", { activites: { error: ECHEC } }],
    [BRANCHER, { connexions: { error: ECHEC } }],
    ["Procédures les plus utilisées", { procedures: { error: ECHEC } }],
  ])("should say a failed read in « %s » with « Réessayer », which reads the page again", (nom, surcharge) => {
    monter({ data: { ...DONNEES, ...surcharge } })

    const zone = within(screen.getByRole("region", { name: nom }))
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(zone.getByRole("alert")).toHaveTextContent(`Chargement impossible${ECHEC}`)
    fireEvent.click(zone.getByRole("button", { name: "Réessayer" }))
    expect(hote.rafraichir).toHaveBeenCalledTimes(1)
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
