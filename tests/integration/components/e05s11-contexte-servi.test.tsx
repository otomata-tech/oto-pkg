// La vue « Contexte » de l'accueil (E05-S11, retours 4 et 6 de JB, AC-13 à AC-15) : les parties du texte que
// `context` servirait, empilées dans l'ordre, chacune nommée et à son ancre (sans chiffres depuis E05-S13) ; un Contexte que la personne peut écrire (niveau décidé par le service, lu par la page) s'y écrit en
// place avec l'éditeur d'une page, les autres se lisent ; la partie Privé renvoie à Profil ; les échecs se disent.
// `fetch` simulé pour `POST /api/plateforme/nodes`, relecture espionnée.
import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NodeView } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeRafraichissement } from "@otomata_tech/oto_platform/ui"
import { ContexteServi, type DonneesDuContexteServi } from "../../../packages/plateforme/ui/contexte/contexte-servi"
import { bloc, simulerLAPI, vueDuNoeud } from "../../helpers/noeud"

const rafraichir = vi.fn()
const ECHEC = "Une erreur est survenue. Réessayez."

function LienDeTest({ children, ...props }: { href: string; className?: string; children: ReactNode }) {
  return <a {...props}>{children}</a>
}

/** Les têtes des parties de Contexte (E05-S12, D109) : en-tête et ligne de faits. */
const TETES = {
  toutLeMonde: "## Context: everyone (contexte)\nOrganisation: Démo.",
  prive: "## Context: you only (private/lea/contexte)\nYou: Léa Martin (lea), member of Démo.",
  ventes: "## Context: team Ventes (ventes/contexte)\nTeam Ventes, your default team.",
}

const PARTIES = {
  code: "ctx: XXXX-XXXX",
  toutLeMonde: `${TETES.toutLeMonde}\nNous vendons des logiciels.`,
  prive: `${TETES.prive}\nSignature : Léa.`,
  ventes: `${TETES.ventes}\nTutoie les clients.`,
  avis: "[Context budget reached. Omitted: news. Use demo_find or demo_read for more.]",
}

const TEXTE = [PARTIES.code, PARTIES.toutLeMonde, PARTIES.prive, PARTIES.ventes, PARTIES.avis].join("\n\n")

const APERCU = {
  data: {
    text: TEXTE,
    budget: 20_000,
    blocks: [
      { name: "code", chars: PARTIES.code.length, status: "full", path: null, head: 0 },
      { name: "contexte", chars: PARTIES.toutLeMonde.length, status: "full", path: "contexte", head: TETES.toutLeMonde.length },
      { name: "private/lea/contexte", chars: PARTIES.prive.length, status: "full", path: "private/lea/contexte", head: TETES.prive.length },
      { name: "ventes/contexte", chars: PARTIES.ventes.length, status: "cut", path: "ventes/contexte", head: TETES.ventes.length },
      { name: "news", chars: 0, status: "omitted", path: null, head: 0 },
    ],
  },
}

const TOUT_LE_MONDE = bloc("a1000000-0000-4000-8000-000000000001", "paragraph", "Nous vendons des logiciels.")
const VENTES = bloc("b2000000-0000-4000-8000-000000000002", "paragraph", "Tutoie les clients.")

const PRIVE = bloc("c3000000-0000-4000-8000-000000000003", "paragraph", "Signature : Léa.")

/** Les trois Contextes servis, lus par la page, aux niveaux que le service donnerait à la personne. */
function contextes(niveaux: { toutLeMonde: NodeView["level"]; ventes: NodeView["level"]; prive: NodeView["level"] }): DonneesDuContexteServi["contextes"] {
  return {
    contexte: { data: vueDuNoeud({ id: "n-contexte", path: "contexte", kind: "context", level: niveaux.toutLeMonde, blocks: [TOUT_LE_MONDE] }) },
    "ventes/contexte": { data: vueDuNoeud({ id: "n-ventes", path: "ventes/contexte", kind: "context", level: niveaux.ventes, blocks: [VENTES] }) },
    "private/lea/contexte": { data: vueDuNoeud({ id: "n-prive", path: "private/lea/contexte", kind: "context", level: niveaux.prive, owner: { kind: "user", userName: "Léa Martin" }, blocks: [PRIVE] }) },
  }
}

/** Tout le monde en lecture (niveau 1), Ventes en gestion (3), le Contexte Privé en écriture (2). */
const CONTEXTES = contextes({ toutLeMonde: 1, ventes: 3, prive: 2 })

const DONNEES: DonneesDuContexteServi = { apercu: APERCU, contextes: CONTEXTES, equipes: [{ slug: "ventes", name: "Ventes" }], nomOrganisation: "Démo" }

function monter(donnees: Partial<DonneesDuContexteServi> = {}) {
  render(
    <ContexteDeRafraichissement.Provider value={rafraichir}>
      <ContexteServi donnees={{ ...DONNEES, ...donnees }} Lien={LienDeTest} prefixeDesPages="/n/" hrefDuProfil="/profil" ici="/?onglet=contexte" />
    </ContexteDeRafraichissement.Provider>,
  )
}

const partie = (nom: string) => within(screen.getByRole("region", { name: nom }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  rafraichir.mockReset()
})

describe("la vue « Contexte » (AC-13)", () => {
  it("should stack every served part in order, each named and at its anchor, without figures (E05-S13, AC-13)", () => {
    monter()
    const parties = screen.getAllByRole("region")
    expect(parties.map((une) => [une.getAttribute("aria-labelledby") ? within(une).getByRole("heading", { level: 2 }).textContent : une.getAttribute("aria-label"), une.id])).toEqual([
      ["Règles Oto", "regles"],
      ["Contexte : Tout le monde", "contexte-tout-le-monde"],
      ["Contexte : Privé", "contexte-prive"],
      ["Contexte : équipe Ventes", "contexte-ventes"],
      ["Nouveautés", "nouveautes"],
      ["Fin du texte", ""],
    ])
    // E05-S13 (AC-13) : ni taille, ni état, ni note des versions, ni total.
    expect(document.body.textContent).not.toMatch(/caractères|reflète les versions/)
    // Une partie en lecture : ses faits tels que servis (sans l'en-tête `## Context: …`, HN-E05S13-13), puis son
    // corps tel que servi, dans sa carte ; l'avis de fin, en français.
    expect(partie("Contexte : Tout le monde").getAllByText(/./, { selector: "pre" }).map((texte) => texte.textContent)).toEqual(["Organisation: Démo.", "Nous vendons des logiciels."])
    expect(partie("Fin du texte").getByText("Budget atteint : l'assistant ne lit pas Nouveautés.")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("## Context:")
  })
})

describe("écrire un Contexte dans la vue (AC-14)", () => {
  it("should write in place the Contextes the person can write, read the others as served, and send the private part to Profil", () => {
    monter()
    // Gestion (Ventes) et écriture (Privé) : l'éditeur d'une page, ses champs toujours montés.
    expect(partie("Contexte : équipe Ventes").getByRole("textbox", { name: "Modifier ce texte — Tutoie les clients." })).toBeInTheDocument()
    expect(partie("Contexte : Privé").getByRole("textbox", { name: "Modifier ce texte — Signature : Léa." })).toBeInTheDocument()
    expect(partie("Contexte : Privé").getByText("La publication revient à Léa Martin.")).toBeInTheDocument()
    // Lecture (Tout le monde) : le texte servi, aucun champ.
    expect(partie("Contexte : Tout le monde").queryByRole("textbox")).toBeNull()
    expect(partie("Contexte : Tout le monde").getByText("Organisation: Démo.", { selector: "pre" })).toBeInTheDocument()
    expect(partie("Contexte : Privé").getByRole("link", { name: "Modifier dans Profil" })).toHaveAttribute("href", "/profil")
  })

  it("should publish a written Contexte on its own path, then read the view again", async () => {
    const api = simulerLAPI()
    monter()
    const champ = partie("Contexte : équipe Ventes").getByRole("textbox", { name: "Modifier ce texte — Tutoie les clients." })
    fireEvent.change(champ, { target: { value: "Tutoie les clients, toujours." } })
    fireEvent.keyDown(champ, { key: "Escape" })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))
    act(() => window.dispatchEvent(new Event("pagehide")))
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes.map((corps) => [corps.path, corps.publish ?? false])).toEqual([
      ["ventes/contexte", false],
      ["ventes/contexte", true],
    ])
    await waitFor(() => expect(rafraichir).toHaveBeenCalled())
  })
})

describe("la vue « Contexte », états (AC-15)", () => {
  it("should say a failed preview with « Réessayer » on the view's address", () => {
    monter({ apercu: { error: ECHEC } })
    expect(screen.getByRole("alert")).toHaveTextContent(`L'aperçu n'a pas pu être calculé.${ECHEC}`)
    expect(screen.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/?onglet=contexte")
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("should say an omitted part is not read, and a Contexte that could not be read, its served text kept", () => {
    monter({ contextes: { ...CONTEXTES, contexte: { error: ECHEC } } })
    expect(partie("Nouveautés").getByText("Cette partie ne tient pas dans le budget : l'assistant ne la lit pas.")).toBeInTheDocument()
    expect(partie("Contexte : Tout le monde").getByText("Organisation: Démo.", { selector: "pre" })).toBeInTheDocument()
    expect(partie("Contexte : Tout le monde").getByRole("alert")).toHaveTextContent(ECHEC)
  })

  it("should read everything when no Contexte is writable", () => {
    monter({ contextes: contextes({ toutLeMonde: 1, ventes: 1, prive: 1 }) })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getAllByText(/^(Organisation:|You:|Team )/, { selector: "pre" })).toHaveLength(3)
  })
})
