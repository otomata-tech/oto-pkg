// Écran de consentement OAuth (E02-S02 : AC9 à AC14, AC17, AC19, AC21), sur le design system porté
// d'oto-frontend (E05-S09, partie d3) : états, détails, avis au non-membre, erreurs de décision, boutons
// pendant l'envoi. La Server Action de l'hôte est simulée.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BoutonsDeDecision } from "../../../packages/plateforme/ui/oauth/boutons-de-decision"
import { Consentement, ConsentementChargement } from "../../../packages/plateforme/ui/oauth/consentement"
import type { DemandeDeConsentement } from "../../../packages/plateforme/ui/oauth/types"

const ID = "a2b3c4d5e6f7g2h3i4j5k6l7m2n3o4p5"
const DEMANDE: DemandeDeConsentement = {
  authorizationId: ID,
  client: { nom: "Claude", site: "https://claude.ai/", logo: "https://claude.ai/logo.png" },
  compte: "claire@example.invalid",
  adresseDeRetour: "https://claude.ai/api/mcp/auth_callback",
  acces: [
    { scope: "openid", libelle: "Vous identifier (openid)" },
    { scope: "email", libelle: "Lire votre adresse email (email)" },
    { scope: "profile", libelle: "Lire votre nom (profile)" },
    { scope: "offline_access", libelle: "Rester connecté sans vous le redemander (offline_access)" },
  ],
  organisation: { etat: "connue", nom: "Acme Énergies", membre: true, marque: { theme: "manuscrit", logo: null, nomAffiche: "Acme Énergies" } },
}
const INVALIDE = "Ce lien ne porte pas de demande d'autorisation valide. Relancez la connexion depuis votre assistant."
// Le jeton ne porte pas l'adresse : il vaut pour les organisations dont la personne est membre (HN-E02S02-28).
const NON_MEMBRE =
  "Vous n'êtes pas membre de Delta Logistique : l'assistant ne pourra rien y faire. Il aura pourtant accès à votre compte, donc aux organisations dont vous êtes membre : refusez si vous n'avez pas lancé cette connexion vous-même. Pour Delta Logistique, demandez l'accès à l'un de ses administrateurs."

const decider = vi.fn<(formData: FormData) => Promise<void>>(async () => {})

function afficher(demande: Partial<DemandeDeConsentement> = {}, erreur?: "decision") {
  return render(<Consentement resultat={{ data: { ...DEMANDE, ...demande } }} decider={decider} erreur={erreur} />)
}

/** Valeur (`dd`) d'un terme de la liste de définitions. */
function detail(terme: string): HTMLElement {
  const dt = screen.getByText(terme, { selector: "dt" })
  const dd = dt.nextElementSibling
  if (!(dd instanceof HTMLElement) || dd.tagName !== "DD") throw new Error(`no dd after ${terme}`)
  return dd
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("Consentement: error state (AC9, AC10)", () => {
  it("should show « Autorisation impossible » and the message in an alert, without any button", () => {
    render(<Consentement resultat={{ error: INVALIDE }} decider={decider} />)

    expect(screen.getAllByRole("heading", { level: 1 }).map((titre) => titre.textContent)).toEqual(["Autorisation impossible"])
    expect(screen.getByRole("alert")).toHaveTextContent(INVALIDE)
    expect(screen.queryByRole("button")).toBeNull()
    expect(document.querySelector("form")).toBeNull()
  })
})

describe("Consentement: the request (AC12)", () => {
  it("should name the client in the only h1, with its site and its logo", () => {
    afficher()

    expect(screen.getAllByRole("heading", { level: 1 }).map((titre) => titre.textContent)).toEqual([
      "Claude demande l'accès à votre compte",
    ])
    expect(screen.getByRole("link", { name: "https://claude.ai/" })).toHaveAttribute("href", "https://claude.ai/")
    const logo = document.querySelector("img")
    expect(logo).toHaveAttribute("src", "https://claude.ai/logo.png")
    expect(logo).toHaveAttribute("alt", "")
    expect(logo).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(logo).toHaveAttribute("width", "40")
    expect(logo).toHaveAttribute("height", "40")
    expect(logo).toHaveStyle({ width: "40px", height: "40px" })
  })

  it("should list the organisation, the account, the return address and the accesses in order", () => {
    afficher()

    expect([...document.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual([
      "Organisation",
      "Compte",
      "Adresse de retour",
      "Accès demandés",
    ])
    expect(detail("Organisation")).toHaveTextContent("Acme Énergies")
    expect(detail("Compte")).toHaveTextContent("claire@example.invalid")
    expect(within(detail("Adresse de retour")).getByText(DEMANDE.adresseDeRetour).tagName).toBe("CODE")
    expect(within(detail("Accès demandés")).getAllByRole("listitem").map((ligne) => ligne.textContent)).toEqual([
      "Vous identifier (openid)",
      "Lire votre adresse email (email)",
      "Lire votre nom (profile)",
      "Rester connecté sans vous le redemander (offline_access)",
    ])
  })

  it("should put Refuser and Autoriser in one form, with the request id", () => {
    afficher()

    const refuser = screen.getByRole("button", { name: "Refuser" })
    const autoriser = screen.getByRole("button", { name: "Autoriser" })
    const formulaire = refuser.closest("form")
    expect(formulaire).not.toBeNull()
    expect(autoriser.closest("form")).toBe(formulaire)
    expect([refuser, autoriser].map((bouton) => [bouton.getAttribute("type"), bouton.getAttribute("name"), bouton.getAttribute("value")])).toEqual([
      ["submit", "decision", "deny"],
      ["submit", "decision", "approve"],
    ])
    expect(formulaire?.querySelector('input[type="hidden"][name="authorization_id"]')).toHaveAttribute("value", ID)
    expect(refuser).toBeEnabled()
    expect(autoriser).toBeEnabled()
  })

  it("should render neither a site link nor a logo the server refused", () => {
    afficher({ client: { nom: "Client sans nom", site: null, logo: null } })

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Client sans nom demande l'accès à votre compte")
    expect(screen.queryByRole("link")).toBeNull()
    expect(document.querySelector("img")).toBeNull()
  })

  // Défense en profondeur : un hôte peut construire la demande sans passer par `consentRequest`.
  it("should check the site and the logo itself, http and https only", () => {
    afficher({ client: { nom: "Claude", site: "javascript:alert(1)", logo: "data:image/png;base64,AAAA" } })

    expect(screen.queryByRole("link")).toBeNull()
    expect(document.querySelector("img")).toBeNull()
    expect(document.querySelectorAll('[href^="javascript:"], [src^="data:"]')).toHaveLength(0)
  })

  it("should say that no particular access is asked, rather than render an empty list", () => {
    afficher({ acces: [] })

    expect(detail("Accès demandés")).toHaveTextContent("Aucun accès particulier demandé")
    expect(within(detail("Accès demandés")).queryByRole("list")).toBeNull()
  })

  it("should show no status and no alert for a member without error", () => {
    afficher()

    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("Consentement: the organisation (AC13, AC14)", () => {
  it("should warn a non-member under the details, the buttons still enabled (AC13)", () => {
    afficher({ organisation: { etat: "connue", nom: "Delta Logistique", membre: false, marque: { theme: "manuscrit", logo: null, nomAffiche: "Delta Logistique" } } })

    const avis = screen.getByRole("status")
    expect(avis).toHaveTextContent(NON_MEMBRE)
    expect(document.querySelector("dl")?.compareDocumentPosition(avis)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.getByRole("button", { name: "Refuser" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Autoriser" })).toBeEnabled()
  })

  it("should name the host of an unknown address (AC14)", () => {
    afficher({ organisation: { etat: "inconnue", hote: "delta.example.test" } })

    expect(detail("Organisation")).toHaveTextContent("Adresse inconnue (delta.example.test)")
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByRole("button", { name: "Autoriser" })).toBeEnabled()
  })

  it("should say « Non déterminée » for an undetermined organisation (AC14)", () => {
    afficher({ organisation: { etat: "indeterminee" } })

    expect(detail("Organisation")).toHaveTextContent("Non déterminée")
    expect(screen.getByRole("button", { name: "Autoriser" })).toBeEnabled()
  })

  it("should name the administration MCP, without the non-member notice (HN-E02S02-28)", () => {
    afficher({ organisation: { etat: "administration" } })

    expect(detail("Organisation")).toHaveTextContent("Administration de la plateforme")
    expect(screen.queryByRole("status")).toBeNull()
  })
})

// La marque de l'organisation de la ressource (E09-S02, AC14) ; le thème de la racine est posé par la page.
describe("Consentement: the brand of the organisation (E09-S02, AC14)", () => {
  const MARQUE = { theme: "foret" as const, logo: "https://acme.example/logo.png", nomAffiche: "Acme" }

  it.each([true, false])("should show its logo and display name above the title, its official name on the Organisation line (member: %s)", (membre) => {
    afficher({ organisation: { etat: "connue", nom: "Acme Énergies", membre, marque: MARQUE } })

    const enTete = document.querySelector("header")
    if (!enTete) throw new Error("no header")
    const nomAffiche = within(enTete).getByText("Acme")
    expect(nomAffiche.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const logo = enTete.querySelector('img[src="https://acme.example/logo.png"]')
    expect(logo).toHaveAttribute("alt", "")
    expect(logo).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(detail("Organisation")).toHaveTextContent("Acme Énergies")
  })

  it.each<DemandeDeConsentement["organisation"]>([{ etat: "inconnue", hote: "delta.example.test" }, { etat: "indeterminee" }])(
    "should show no organisation header for %j",
    (organisation) => {
      afficher({ organisation })

      expect(document.querySelector("header")?.textContent).toBe("Claude demande l'accès à votre comptehttps://claude.ai/")
    },
  )
})

describe("Consentement: a decision that failed (AC17)", () => {
  it("should show the decision error in an alert under the buttons", () => {
    afficher({}, "decision")

    const alerte = screen.getByRole("alert")
    expect(alerte).toHaveTextContent("La décision n'a pas abouti. Rechargez la page, puis réessayez.")
    const autoriser = screen.getByRole("button", { name: "Autoriser" })
    expect(autoriser.compareDocumentPosition(alerte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("Consentement: a decision in progress (AC19)", () => {
  it("should disable both buttons and mark the chosen one busy: one decision only", async () => {
    let repondre: () => void = () => {}
    decider.mockReturnValue(new Promise<void>((resolve) => (repondre = resolve)))
    afficher()

    fireEvent.click(screen.getByRole("button", { name: "Autoriser" }))

    const autoriser = await screen.findByRole("button", { name: "Autoriser", busy: true })
    const refuser = screen.getByRole("button", { name: "Refuser" })
    expect(autoriser).toBeDisabled()
    expect(refuser).toBeDisabled()
    expect(refuser).toHaveAttribute("aria-busy", "false")
    fireEvent.click(refuser)
    expect(decider).toHaveBeenCalledTimes(1)
    const envoye = decider.mock.calls[0][0]
    expect(envoye.get("decision")).toBe("approve")
    expect(envoye.get("authorization_id")).toBe(ID)

    await act(async () => repondre())
  })
})

describe("Consentement: states, focus, client boundary (AC21)", () => {
  it("should export a loading state announced as busy", () => {
    render(<ConsentementChargement />)

    const chargement = screen.getByRole("status")
    expect(chargement).toHaveAttribute("aria-busy", "true")
    expect(chargement).toHaveTextContent("Chargement de la demande d'autorisation…")
  })

  // L'anneau de focus est celui du design system (`--focus-ring`, encre), le même que sur les îlots
  // d'authentification, mesuré dans le navigateur (`ecrans-d-authentification.spec.ts`) : ici, chaque
  // geste est un élément natif atteint au clavier.
  it("should give the keyboard every gesture, native buttons and link in the tab order", () => {
    afficher()

    for (const element of [...screen.getAllByRole("button"), screen.getByRole("link")]) {
      expect(["BUTTON", "A"]).toContain(element.tagName)
      expect(element).not.toHaveAttribute("tabindex")
    }
  })

  it("should take no prop in the client file (portage-ecrans.md § 2)", () => {
    expect(BoutonsDeDecision.length).toBe(0)
  })
})
