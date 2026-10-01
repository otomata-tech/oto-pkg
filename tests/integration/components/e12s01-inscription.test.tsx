import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FormulaireDInscription } from "@otomata_tech/oto_platform/ui"
import { prefixePropose, slugPropose } from "../../../packages/plateforme/ui/inscription/formulaire-d-inscription"

// Le formulaire d'inscription (E12-S01, AC-12) : un seul champ, le nom, dont se déduisent l'adresse et le préfixe (leurs
// champs ne reviennent que sur un conflit ou un nom inexploitable) ; un premier envoi qui montre
// l'adresse sans rien créer, la confirmation, puis le départ vers l'adresse de la nouvelle organisation ; les refus dits
// en français, sauf le texte du contrôle d'abus de l'hôte, dit tel quel. `fetch` simulé pour l'API.

const fetchMock = vi.fn<typeof fetch>()
const assign = vi.fn()

function reponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

const corps = (rang: number) => JSON.parse(String(fetchMock.mock.calls[rang][1]?.body))

beforeEach(() => {
  fetchMock.mockReset()
  assign.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("location", { ...window.location, protocol: "https:", assign })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("slugPropose, prefixePropose", () => {
  it("should derive the address and the tool prefix from the name, as the schemas admit them", () => {
    expect(slugPropose("  Société Générale d'Études  ")).toBe("societe-generale-d-etudes")
    expect(prefixePropose("societe-generale-d-etudes")).toBe("societegener")
    expect(prefixePropose("3d-atelier")).toBe("datelier")
  })
})

describe("FormulaireDInscription (AC-12)", () => {
  it("should preview the address, then create the organisation and leave for its address", async () => {
    fetchMock
      .mockResolvedValueOnce(reponse(200, { data: { created: false, org: {}, addresses: { hosts: ["atelier.oto.test"], added: ["atelier.oto.test"] } } }))
      .mockResolvedValueOnce(reponse(201, { data: { created: true, org: {}, hosts: ["atelier.oto.test"], setup: [] } }))
    render(<FormulaireDInscription />)
    fireEvent.change(screen.getByLabelText("Nom de l'organisation"), { target: { value: "Atelier" } })
    // Un seul champ à l'écran : l'adresse et le préfixe se déduisent du nom, sans champ.
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(screen.queryByLabelText("Adresse")).toBeNull()
    expect(screen.queryByLabelText("Préfixe des outils")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    expect(await screen.findByText("Votre organisation sera servie à atelier.oto.test.")).toBeInTheDocument()
    expect(corps(0)).toEqual({ name: "Atelier", org: "atelier", prefix: "atelier", confirm: false })

    fireEvent.click(screen.getByRole("button", { name: "Créer l'organisation" }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://atelier.oto.test/"))
    expect(corps(1)).toMatchObject({ confirm: true })
  })

  it("should say a refusal in French, and the host's abuse check in its own words", async () => {
    fetchMock
      .mockResolvedValueOnce(reponse(403, { error: { code: "forbidden", message: "…", details: { reason: "email_required" } } }))
      .mockResolvedValueOnce(reponse(403, { error: { code: "forbidden", message: "…", details: { reason: "signup_refused", text: "Captcha invalide." } } }))
    render(<FormulaireDInscription />)
    fireEvent.change(screen.getByLabelText("Nom de l'organisation"), { target: { value: "Atelier" } })
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("L'inscription demande une adresse email vérifiée.")
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Captcha invalide."))
  })

  it("should ask the host's terms when it gives them, and send them accepted (P5)", async () => {
    fetchMock.mockResolvedValueOnce(reponse(200, { data: { created: false, org: {}, addresses: { hosts: ["atelier.oto.test"], added: ["atelier.oto.test"] } } }))
    render(<FormulaireDInscription conditions={{ libelle: "conditions générales", url: "https://oto.test/cgu" }} />)
    fireEvent.change(screen.getByLabelText("Nom de l'organisation"), { target: { value: "Atelier" } })
    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled()
    expect(screen.getByRole("link", { name: "conditions générales" })).toHaveAttribute("href", "https://oto.test/cgu")
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    await screen.findByText("Votre organisation sera servie à atelier.oto.test.")
    expect(corps(0)).toMatchObject({ accepted_terms: true, confirm: false })
  })

  it("should show no box and send no acceptance without the host's terms", () => {
    render(<FormulaireDInscription />)
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("should give back the address and prefix fields on a conflict, filled with the deduced values, and resend what is typed", async () => {
    fetchMock
      .mockResolvedValueOnce(reponse(409, { error: { code: "conflict", message: "Slug atelier is already taken. Pick another slug." } }))
      .mockResolvedValueOnce(reponse(200, { data: { created: false, org: {}, addresses: { hosts: ["atelier-nord.oto.test"], added: ["atelier-nord.oto.test"] } } }))
    render(<FormulaireDInscription />)
    fireEvent.change(screen.getByLabelText("Nom de l'organisation"), { target: { value: "Atelier" } })
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette adresse ou ce préfixe est déjà pris : choisissez-en un autre.")
    expect(screen.getByLabelText("Adresse")).toHaveValue("atelier")
    expect(screen.getByLabelText("Préfixe des outils")).toHaveValue("atelier")

    fireEvent.change(screen.getByLabelText("Adresse"), { target: { value: "atelier-nord" } })
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    await screen.findByText("Votre organisation sera servie à atelier-nord.oto.test.")
    // Le préfixe, non touché, suit l'adresse saisie : un préfixe pris se libère du même geste.
    expect(corps(1)).toEqual({ name: "Atelier", org: "atelier-nord", prefix: "ateliernord", confirm: false })
  })

  it("should not judge the name while it is typed, and say a one-letter name is too short when the field is left or Enter is pressed", () => {
    render(<FormulaireDInscription />)
    const nom = screen.getByLabelText("Nom de l'organisation")
    const TROP_COURT = "Le nom doit compter au moins 2 caractères."
    fireEvent.change(nom, { target: { value: "o" } })
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(screen.queryByText(TROP_COURT)).toBeNull()
    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled()

    fireEvent.keyDown(nom, { key: "Enter" })
    expect(screen.getByText(TROP_COURT)).toBeInTheDocument()
    expect(screen.getAllByRole("textbox")).toHaveLength(1)

    fireEvent.change(nom, { target: { value: "ot" } })
    expect(screen.queryByText(TROP_COURT)).toBeNull()
    fireEvent.blur(nom)
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled()
  })

  it.each([
    ["all digits", "2026"],
    ["non-Latin characters", "東京"],
  ])("should ask for the address and the prefix when nothing valid comes out of a name of %s", (_what, nom) => {
    render(<FormulaireDInscription />)
    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Nom de l'organisation"), { target: { value: nom } })
    // Le nom n'est jugé qu'à la sortie du champ.
    expect(screen.queryByLabelText("Adresse")).toBeNull()
    fireEvent.blur(screen.getByLabelText("Nom de l'organisation"))
    expect(screen.getByText("Ce nom ne donne pas d'adresse ou de préfixe valide : choisissez-les.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Adresse"), { target: { value: "atelier" } })
    fireEvent.change(screen.getByLabelText("Préfixe des outils"), { target: { value: "atelier" } })
    expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled()
  })
})
