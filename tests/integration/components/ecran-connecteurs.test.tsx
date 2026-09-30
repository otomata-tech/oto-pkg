import type { AnchorHTMLAttributes } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AccountView, OrgConnector } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeRafraichissement, EcranConnecteurs, EcranConnecteursChargement, type DonneesDesConnecteurs } from "@otomata_tech/oto_platform/ui"
import { choisirDansLaListe } from "../../helpers/liste-de-choix"

// L'écran « Connecteurs » du tableau de bord (E08-S03 : AC4 à AC7, AC12), sur le design system d'oto-frontend
// (E05-S09 partie d2) : `fetch` simulé pour l'API, relecture fournie par un contexte de test.

const VENTES = "0e8e5a3c-7f10-4a5b-8d3b-2b1c4d5e6f70"
const COMPTE = "6b2f3c1d-4e5a-4b6c-8d7e-9f0a1b2c3d4e"

const MAIL_ACTIF: OrgConnector = {
  connector: "mail",
  state: "active",
  activatedAt: "2026-09-24T10:00:00.000Z",
  activatedBy: { userId: "user-claire", name: "Claire Morel" },
  functions: [
    { name: "mail.create_draft", class: "write" },
    { name: "mail.send_draft", class: "sensitive" },
  ],
}
const MAIL_INACTIF: OrgConnector = { ...MAIL_ACTIF, state: "inactive", activatedAt: null, activatedBy: null }

const MAIL_VENTES: AccountView = { id: COMPTE, label: "Mail Ventes", connector: "mail", owner: { kind: "team", teamName: "Ventes" }, mode: "simule", status: "active" }

const DONNEES: DonneesDesConnecteurs = {
  connectors: [MAIL_ACTIF],
  impacts: { mail: { functions: ["mail.create_draft", "mail.send_draft"], procedures: ["ventes/qualifier_prospects"], accounts: 1 } },
  accounts: [MAIL_VENTES, { ...MAIL_VENTES, id: "7c3a4d2e-5f6b-4c7d-9e8f-0a1b2c3d4e5f", label: "Mail Ancien", owner: { kind: "org" }, status: "disabled" }],
  options: { teams: [{ id: VENTES, name: "Ventes" }] },
}

const fetchMock = vi.fn<typeof fetch>()
const rafraichir = vi.fn()

function reponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function Lien({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props}>{children}</a>
}

function rendre(donnees: Partial<DonneesDesConnecteurs> | { error: string } = {}) {
  const resultat = "error" in donnees ? donnees : { data: { ...DONNEES, ...donnees } }
  return render(
    <ContexteDeRafraichissement.Provider value={rafraichir}>
      <EcranConnecteurs resultat={resultat} Lien={Lien} ici="/admin/connectors" />
    </ContexteDeRafraichissement.Provider>,
  )
}

const envoi = () => {
  const [url, init] = fetchMock.mock.calls[0]
  return { url, methode: init?.method, corps: init?.body === undefined ? undefined : JSON.parse(String(init.body)) }
}

beforeEach(() => {
  fetchMock.mockReset()
  rafraichir.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("EcranConnecteurs, connectors (AC4, AC5)", () => {
  it("should list each connector that can be activated, its functions and its state in text, under the count and the always-active sentence", () => {
    rendre()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Connecteurs")
    const ilot = within(screen.getByRole("region", { name: "Connecteurs" }))
    expect(ilot.getByText("1 connecteur activable")).toBeInTheDocument()
    expect(ilot.getByText("Les fonctions de tableau (table.*) et celles de l'application sont toujours actives : elles ne s'activent pas.")).toBeInTheDocument()
    expect(ilot.getByText("2 fonctions : mail.create_draft, mail.send_draft")).toBeInTheDocument()
    expect(ilot.getByText("Actif depuis le 24 septembre 2026 (Claire Morel)")).toBeInTheDocument()
  })

  it("should activate without a question, then have the page re-read", async () => {
    fetchMock.mockResolvedValue(reponse(200, { data: { connector: MAIL_ACTIF } }))
    rendre({ connectors: [MAIL_INACTIF], impacts: {} })

    expect(screen.getByText("Inactif")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Activer mail" }))

    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    expect(envoi()).toEqual({ url: "/api/platform/admin/connectors/mail/activation", methode: "POST", corps: {} })
    expect(screen.getByRole("heading", { level: 2, name: "Connecteurs" })).toHaveFocus()
  })

  it("should ask before deactivating, naming ten of the procedures and the accounts it touches; Escape keeps it, the confirmation sends DELETE", async () => {
    fetchMock.mockResolvedValue(reponse(200, { data: { connector: MAIL_INACTIF } }))
    // Onze procédures publiées le citent : la question en nomme dix, puis « , … » (AC5, N18).
    const onze = Array.from({ length: 11 }, (_, rang) => `ventes/p${String(rang + 1).padStart(2, "0")}`)
    rendre({ impacts: { mail: { functions: ["mail.create_draft", "mail.send_draft"], procedures: onze, accounts: 1 } } })

    fireEvent.click(screen.getByRole("button", { name: "Désactiver mail" }))
    const question =
      "Désactiver « mail » ? Ses fonctions cesseront aussitôt de répondre, pour tout le monde. 11 procédures publiées le citent dans leurs blocs d'appel : " +
      "ventes/p01, ventes/p02, ventes/p03, ventes/p04, ventes/p05, ventes/p06, ventes/p07, ventes/p08, ventes/p09, ventes/p10, …. Son compte est conservé."
    expect(screen.getByText(question)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Garder" })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole("group", { name: question }), { key: "Escape" })
    expect(screen.queryByText(question)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Désactiver mail" }))
    fireEvent.click(within(screen.getByRole("group", { name: question })).getByRole("button", { name: "Désactiver" }))
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    expect(envoi()).toMatchObject({ url: "/api/platform/admin/connectors/mail/activation", methode: "DELETE" })
    expect(screen.getByRole("heading", { level: 2, name: "Connecteurs" })).toHaveFocus()
  })

  it("should say no published procedure cites it, and count the accounts, when none does", () => {
    rendre({ impacts: { mail: { functions: [], procedures: [], accounts: 3 } } })
    fireEvent.click(screen.getByRole("button", { name: "Désactiver mail" }))
    expect(
      screen.getByText("Désactiver « mail » ? Ses fonctions cesseront aussitôt de répondre, pour tout le monde. Aucune procédure publiée ne le cite. Ses 3 comptes sont conservés."),
    ).toBeInTheDocument()
  })

  it("should say an empty catalog, in both islands (AC4, AC6)", () => {
    rendre({ connectors: [], impacts: {}, accounts: [] })
    expect(screen.getByText("Aucun connecteur à activer dans cette version de la plateforme.")).toBeInTheDocument()
    expect(screen.getByText("Aucun compte. Créez un compte simulé pour qu'une procédure puisse appeler un connecteur.")).toBeInTheDocument()
    expect(screen.getByText("Aucun connecteur ne demande de compte dans cette version de la plateforme.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Créer le compte" })).toBeNull()
  })
})

describe("EcranConnecteurs, simulated accounts (AC6, AC7)", () => {
  it("should list each account with its owner, mode and state, and disable an active one after the question", async () => {
    fetchMock.mockResolvedValue(reponse(200, { data: { account: { id: COMPTE, status: "disabled" } } }))
    rendre()

    const comptes = within(screen.getByRole("region", { name: "Comptes simulés" }))
    expect(comptes.getByText("Mail Ventes · mail · équipe Ventes · simulé · actif")).toBeInTheDocument()
    expect(comptes.getByText("Mail Ancien · mail · organisation · simulé · désactivé")).toBeInTheDocument()
    expect(comptes.queryByRole("button", { name: "Désactiver le compte Mail Ancien" })).toBeNull()

    fireEvent.click(comptes.getByRole("button", { name: "Désactiver le compte Mail Ventes" }))
    const question =
      "Désactiver le compte « Mail Ventes » ? Les appels qui le résolvent échoueront dès maintenant. Un compte désactivé ne se réactive pas : il faudra en créer un autre."
    fireEvent.click(within(comptes.getByRole("group", { name: question })).getByRole("button", { name: "Désactiver" }))

    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    expect(envoi()).toEqual({ url: `/api/platform/admin/accounts/${COMPTE}/disable`, methode: "POST", corps: {} })
    // Le geste part avec la relecture (un compte désactivé n'en a plus) : le focus l'attend au titre de la liste.
    expect(screen.getByRole("heading", { level: 2, name: "Comptes simulés" })).toHaveFocus()
  })

  it("should create an account for a team, then have the page re-read", async () => {
    fetchMock.mockResolvedValue(reponse(200, { data: { account: { label: "Mail Support" } } }))
    rendre()

    expect(screen.getByText(/^Mode : simulé\. Rien ne sort du serveur/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "Mail Support" } })
    fireEvent.click(screen.getByLabelText("Une équipe"))
    choisirDansLaListe(screen.getByLabelText("Équipe"), "Ventes")
    fireEvent.click(screen.getByRole("button", { name: "Créer le compte" }))

    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    expect(envoi()).toEqual({
      url: "/api/platform/admin/accounts",
      methode: "POST",
      corps: { connector: "mail", owner_kind: "team", team_id: VENTES, label: "Mail Support", mode: "simule" },
    })
    expect(screen.getByRole("status")).toHaveTextContent("Compte « Mail Support » créé.")
  })

  it("should create an account for the organisation, for a connector not active yet, and say a label already taken under the field", async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: { code: "conflict", message: "server text" } }))
    // Un compte se prépare avant l'activation (AC6, E04-S01) : le formulaire offre les connecteurs inactifs.
    rendre({ connectors: [MAIL_INACTIF], impacts: {} })

    expect(screen.getByLabelText("Connecteur")).toHaveValue("mail")
    fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "mail ventes" } })
    fireEvent.click(screen.getByRole("button", { name: "Créer le compte" }))

    expect(await screen.findByText("Un compte porte déjà ce libellé dans l'organisation.")).toBeInTheDocument()
    expect(screen.getByLabelText("Libellé")).toHaveAttribute("aria-invalid", "true")
    expect(envoi().corps).toEqual({ connector: "mail", owner_kind: "org", label: "mail ventes", mode: "simule" })
    expect(rafraichir).not.toHaveBeenCalled()
  })
})

describe("EcranConnecteurs, states (AC12)", () => {
  it("should render a busy status while loading", () => {
    render(<EcranConnecteursChargement />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status")).toHaveTextContent("Chargement des connecteurs…")
  })

  it("should say a failed read in an alert, with a way to retry", () => {
    rendre({ error: "Une erreur est survenue. Réessayez." })
    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(screen.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/admin/connectors")
  })
})
