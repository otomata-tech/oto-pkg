import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EcranConnexion, EcranConnexionChargement, type AdresseDeConnexion, type DerniereConnexion } from "@otomata_tech/oto_platform/ui"
import { connectAddress } from "../../../packages/plateforme/server/connect"
import { section } from "../../helpers/ecran"
import { identityOf, ORG } from "../../helpers/reference-org"

// L'écran « Brancher un assistant » (E02-S04 : AC1 à AC8, AC11), porté sur le design system d'oto-frontend
// (E05-S09, partie d3), rendu comme la page de l'hôte le monte : adresse de `connectAddress`, prompts et
// connexions en `resultat`.

// Slug, nom et préfixe distincts : le nom de serveur de Claude Code est le préfixe, et lui seul (AC5).
const ACME = identityOf("lea", { org: { id: ORG.id, slug: "acme-energies", name: "Acme Énergies", prefix: "acme", brand: {}, domains: null } })
const URL_ACME = "https://acme.example.test/api/mcp"
const PHRASE = "Quand une demande concerne mon travail, commence par l'outil de contexte du connecteur « Acme Énergies »."
const ECHEC = "Une erreur est survenue. Réessayez."
const GUIDES = ["claude.ai et Claude Desktop", "ChatGPT", "Claude Code"]

type Props = Parameters<typeof EcranConnexion>[0]

/** Comme la page de l'hôte : les noms anglais du service vers les formes de l'écran. */
function adresseDe(origine: string): AdresseDeConnexion {
  const { url, name, cliName, preferenceSentence } = connectAddress(ACME, origine)
  return { url, nom: name, nomCli: cliName, phrase: preferenceSentence }
}

function LienDeTest({ children, ...props }: { href: string; className?: string; "aria-current"?: "page"; children: ReactNode }) {
  return <a {...props}>{children}</a>
}

function rendre(props: Partial<Props> = {}) {
  // La barre finale de l'origine prouve qu'aucun `/` double n'entre dans l'adresse (AC1).
  return render(
    <EcranConnexion adresse={adresseDe("https://acme.example.test/")} prompts={{ data: [] }} connexions={{ data: [] }} Lien={LienDeTest} ici="/connect" {...props} />,
  )
}

function poserLePressePapiers(writeText: (texte: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
}

/** Les textes d'une étape qui porte une copie : paragraphes et valeurs, sans la région de statut. */
const textes = (etape: HTMLElement) => [...etape.querySelectorAll("p:not([role]), code")].map((element) => element.textContent)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  // jsdom n'a pas de presse-papiers : celui d'un test ne passe pas au suivant.
  Reflect.deleteProperty(navigator, "clipboard")
})

describe("EcranConnexion address (AC1)", () => {
  it("should show the whole address in code, copy exactly it, say « Copié » in a region mounted empty, then clear it", async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    poserLePressePapiers(writeText)
    rendre()
    const bloc = section("Adresse du serveur")

    const valeur = within(bloc).getByText(URL_ACME)
    expect(valeur.tagName).toBe("CODE")
    expect(valeur).toHaveClass("break-words")
    expect(valeur).not.toHaveClass("truncate")
    expect(within(bloc).getByText("Une adresse par organisation : si vous travaillez pour plusieurs organisations, ajoutez un connecteur pour chacune.")).toBeInTheDocument()
    const statut = within(bloc).getByRole("status")
    expect(statut).toBeEmptyDOMElement()
    const bouton = within(bloc).getByRole("button", { name: "Copier l'adresse du serveur" })
    // Le libellé visible est « Copier » ; la cible n'est lue que par le nom accessible, qui commence par lui.
    expect(bouton).toHaveTextContent(/^Copier$/)

    await act(async () => fireEvent.click(bouton))
    expect(writeText).toHaveBeenCalledWith(URL_ACME)
    expect(statut).toHaveTextContent("Copié")

    act(() => vi.advanceTimersByTime(2000))
    expect(statut).toBeEmptyDOMElement()
  })

  it("should say the copy failed when the clipboard refuses it", async () => {
    poserLePressePapiers(vi.fn().mockRejectedValue(new DOMException("Write permission denied.", "NotAllowedError")))
    rendre()
    const bloc = section("Adresse du serveur")

    fireEvent.click(within(bloc).getByRole("button", { name: "Copier l'adresse du serveur" }))

    expect(await within(bloc).findByText("Copie impossible : sélectionnez le texte.")).toHaveAttribute("role", "status")
  })

  it("should build the address of the organisation from the origin of the request", () => {
    expect(connectAddress(ACME, "http://localhost:3000").url).toBe("http://localhost:3000/api/mcp")
  })
})

describe("EcranConnexion connector name (AC2)", () => {
  it("should recommend the organisation name, with its copy and why", () => {
    rendre()
    const bloc = section("Nom du connecteur")

    expect(within(bloc).getByText("Acme Énergies").tagName).toBe("CODE")
    expect(within(bloc).getByRole("button", { name: "Copier le nom du connecteur" })).toBeInTheDocument()
    expect(within(bloc).getByText("Donnez ce nom au connecteur : c'est lui que l'assistant voit.")).toBeInTheDocument()
  })
})

describe("EcranConnexion guides (AC3 to AC5)", () => {
  it("should guide claude.ai in an ordered list, with the preference sentence to copy and its warning (AC3)", () => {
    rendre()
    const guide = section("claude.ai et Claude Desktop")
    const etapes = within(guide).getAllByRole("listitem")

    expect(guide.querySelector("ol")).toContainElement(etapes[0])
    expect(etapes.map((etape) => (etape.querySelector("button") ? textes(etape) : etape.textContent))).toEqual([
      "Dans claude.ai, ouvrez Paramètres → Connecteurs, puis ajoutez un connecteur personnalisé.",
      `Nom : Acme Énergies ; adresse : ${URL_ACME}.`,
      "Connectez-vous avec votre compte Acme Énergies, puis cliquez sur « Autoriser ».",
      "Sur la fiche du connecteur, menu ⋯ → « Actualiser la liste d'outils ». Refaites ce geste après chaque mise à jour annoncée.",
      [
        "Ajoutez cette phrase à vos préférences personnelles de claude.ai :",
        PHRASE,
        "Vous avez plusieurs connecteurs d'organisation ? N'ajoutez pas cette phrase : elle attirerait les demandes des autres.",
      ],
      "Rechargez la page, attendez quelques secondes, puis ouvrez une nouvelle conversation.",
    ])
    expect(within(etapes[4]).getByRole("button", { name: "Copier la phrase de préférences" })).toBeInTheDocument()
  })

  it("should guide ChatGPT step by step, with nothing to add to its instructions (AC4)", () => {
    rendre()
    const guide = section("ChatGPT")

    expect(within(guide).getAllByRole("listitem").map((etape) => etape.textContent)).toEqual([
      "Activez le mode développeur dans les paramètres de ChatGPT.",
      `Créez un connecteur : nom Acme Énergies, adresse ${URL_ACME}, authentification OAuth.`,
      "Connectez-vous avec votre compte Acme Énergies, puis cliquez sur « Autoriser ».",
      "Sur la fiche du connecteur, cliquez sur « Actualiser » : sans ce geste, aucun outil n'apparaît.",
      "Dans une nouvelle conversation, sélectionnez le connecteur (@Acme Énergies) la première fois.",
    ])
    expect(
      within(guide).getByText("Aucune phrase à ajouter dans ChatGPT. Si plusieurs comptes sont connectés au même connecteur, ChatGPT utilise le compte principal."),
    ).toBeInTheDocument()
  })

  it("should give the two Claude Code commands to copy, named by the organisation prefix, and their help (AC5)", () => {
    rendre()
    const guide = section("Claude Code")
    const [ajout, connexion, session] = within(guide).getAllByRole("listitem")

    expect(textes(ajout)).toEqual([`claude mcp add --transport http acme ${URL_ACME}`])
    expect(within(ajout).getByRole("button", { name: "Copier la commande d'ajout du serveur" })).toBeInTheDocument()
    expect(textes(connexion)).toEqual([
      "claude mcp login acme",
      "Dans un terminal interactif : le navigateur s'ouvre pour la connexion et l'autorisation.",
    ])
    expect(within(connexion).getByRole("button", { name: "Copier la commande de connexion" })).toBeInTheDocument()
    expect(session.textContent).toBe("Ouvrez une nouvelle session ; la commande /mcp montre l'état du serveur.")
  })
})

describe("EcranConnexion prompts to try (AC6)", () => {
  const TITRES = [
    "Qualifier un prospect",
    "Relancer les devis en attente",
    "Préparer un rendez-vous",
    "Répondre à un ticket",
    "Clore le mois",
    "Sixième procédure",
    "Septième procédure",
  ]

  it("should list the first five procedures by their title, in the order received, each with its copy", () => {
    rendre({ prompts: { data: TITRES.map((titre) => ({ titre })) } })
    const bloc = section("À essayer")

    expect(within(bloc).getAllByRole("listitem").map((prompt) => prompt.querySelector("code")?.textContent)).toEqual(TITRES.slice(0, 5))
    for (const titre of TITRES.slice(0, 5)) {
      expect(within(bloc).getByRole("button", { name: `Copier le prompt « ${titre} »` })).toBeInTheDocument()
    }
  })

  it("should suggest a first question when no procedure is published", () => {
    rendre({ prompts: { data: [] } })

    expect(within(section("À essayer")).getByText("Aucune procédure publiée pour l'instant. Essayez : « Qu'est-ce que je peux te demander ici ? »")).toBeInTheDocument()
  })
})

describe("EcranConnexion connections (AC7)", () => {
  it("should give one line per assistant family, newest first, with its readable date and signature", () => {
    const connexions: DerniereConnexion[] = [
      { famille: "ChatGPT", signature: "openai-mcp@1.0.0", date: "2026-09-24T10:00:00Z" },
      { famille: "Claude Code", signature: "claude-code@2.1.280", date: "2026-09-23T09:00:00Z" },
      { famille: "claude.ai", signature: "claude-ai@0.1.0", date: "2026-09-22T08:00:00Z" },
      { famille: "Client non identifié", signature: "?@?", date: "2026-09-21T06:00:00Z" },
    ]
    rendre({ connexions: { data: connexions } })

    expect(within(section("Vos connexions")).getAllByRole("listitem").map((ligne) => ligne.textContent)).toEqual([
      "ChatGPT : dernière connexion le 24 septembre 2026 (openai-mcp@1.0.0)",
      "Claude Code : dernière connexion le 23 septembre 2026 (claude-code@2.1.280)",
      "claude.ai : dernière connexion le 22 septembre 2026 (claude-ai@0.1.0)",
      "Client non identifié : dernière connexion le 21 septembre 2026 (?@?)",
    ])
  })

  it("should say that no assistant has connected yet", () => {
    rendre({ connexions: { data: [] } })

    expect(within(section("Vos connexions")).getByText("Aucun assistant ne s'est encore connecté à Acme Énergies avec votre compte.")).toBeInTheDocument()
  })
})

describe("EcranConnexion states (AC8)", () => {
  it.each<[string, Partial<Props>]>([
    ["À essayer", { prompts: { error: ECHEC } }],
    ["Vos connexions", { connexions: { error: ECHEC } }],
  ])("should say a failed read in « %s » only, with « Réessayer », the address and the guides still shown", (titre, echec) => {
    rendre(echec)

    expect(screen.getByRole("alert")).toHaveTextContent(ECHEC)
    expect(within(section(titre)).getByRole("alert")).toBeInTheDocument()
    expect(within(section(titre)).getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/connect")
    expect(within(section("Adresse du serveur")).getByText(URL_ACME)).toBeInTheDocument()
    for (const guide of GUIDES) expect(screen.getByRole("heading", { level: 2, name: guide })).toBeInTheDocument()
  })

  it("should render a busy loading state with a readable label", () => {
    render(<EcranConnexionChargement />)

    const statut = screen.getByRole("status")
    expect(statut).toHaveAttribute("aria-busy", "true")
    expect(statut).toHaveTextContent("Chargement de la page de branchement…")
  })
})

describe("EcranConnexion structure (AC11, AC-d3)", () => {
  it("should title the page once, give each section its island and its h2, and keep values selectable in code", () => {
    rendre({ prompts: { data: [{ titre: "Qualifier un prospect" }] } })

    expect(screen.getAllByRole("heading", { level: 1 }).map((titre) => titre.textContent)).toEqual(["Brancher un assistant"])
    expect(
      screen.getByText("Ajoutez Acme Énergies à votre assistant : il se connectera avec votre compte et agira dans la limite de vos droits."),
    ).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 2 }).map((titre) => titre.textContent)).toEqual([
      "Adresse du serveur",
      "Nom du connecteur",
      ...GUIDES,
      "À essayer",
      "Vos connexions",
    ])
    for (const titre of screen.getAllByRole("heading", { level: 2 })) {
      expect(screen.getByRole("region", { name: titre.textContent ?? "" })).toContainElement(titre)
    }
    // L'anneau de focus des copies est celui du design system (`--focus-ring`, encre).
    const boutons = screen.getAllByRole("button")
    expect(boutons).toHaveLength(6)
    for (const bouton of boutons) {
      expect(bouton.parentElement?.querySelector("code")).toHaveClass("select-all")
    }
  })
})
