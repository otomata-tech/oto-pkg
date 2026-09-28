import type { AnchorHTMLAttributes } from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usageQuerySchema, type UsagePeriod, type UsageQuery, type UsageSummary } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeLHote, EcranUsage, EcranUsageChargement, type EcranUsageProps } from "@otomata_tech/oto_platform/ui"
import { libellesDesChoix } from "../../helpers/liste-de-choix"

// L'écran « Usage des assistants » (E08-S09 : AC2 à AC6, AC8, AC15), porté sur le design system d'oto-frontend
// (E05-S09 partie d2 : `suivi-de-lentreprise.tsx`, `fenetre-du-suivi.tsx`, `adoption-des-membres.tsx`), sur des
// données en mémoire rendues comme la page de l'hôte les passe ; la navigation de l'hôte est un espion ; les
// heures sont lues à Paris (UTC+2 en septembre).

const naviguer = vi.fn()

beforeEach(() => naviguer.mockReset())
afterEach(cleanup)

const VENTES = "0e8e5a3c-7f10-4a5b-8d3b-2b1c4d5e6f70"
const ECHEC = "Une erreur est survenue. Réessayez."

const USAGE: UsageSummary = {
  periode: 7,
  team: { id: VENTES, name: "Ventes" },
  truncated: false,
  coveredFrom: null,
  totals: { conversations: 1234, people: 3, calls: 8, errors: 1 },
  procedures: [
    { path: "ventes/qualifier_prospects", title: "Qualifier les prospects", served: 3, conversations: 2, people: 2, lastServedAt: "2026-09-23T12:02:07.000Z" },
  ],
  functions: [
    { name: "table.write", calls: 4, errors: 1, lastError: { message: "invalid_arguments: Unknown column « statut ».", at: "2026-09-23T12:03:40.000Z" } },
    { name: "table.schema", calls: 2, errors: 0, lastError: null },
  ],
  unmatched: {
    count: 2,
    items: [{ ctx: "DEMO-0004", at: "2026-09-23T13:00:00.000Z", person: null, phrase: "Prépare le planning des tournées de la semaine", host: null }],
  },
}
const VIDE: UsageSummary = { ...USAGE, team: null, totals: { conversations: 0, people: 0, calls: 0, errors: 0 }, procedures: [], functions: [], unmatched: { count: 0, items: [] } }
const EQUIPES = [{ id: VENTES, name: "Ventes" }]

function LienDeTest({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props}>{children}</a>
}

function hrefDeFenetre(filtres: UsageQuery) {
  return (periode: UsagePeriod) => (filtres.equipe ? `/admin/usage?periode=${periode}&equipe=${filtres.equipe}` : `/admin/usage?periode=${periode}`)
}

function rendre(resultat: EcranUsageProps["resultat"], adresse: Record<string, string> = { periode: "7", equipe: VENTES }) {
  const filtres = usageQuerySchema.parse(adresse)
  return render(
    <ContexteDeLHote.Provider value={{ Lien: LienDeTest, chemin: "/admin/usage", naviguer }}>
      <EcranUsage
        resultat={resultat}
        filtres={filtres}
        Lien={LienDeTest}
        hrefDuNoeud={(chemin) => `/n/${chemin}`}
        hrefDeConversation={(code, periode) => `/journal?conversation=${code}&periode=${periode}`}
        hrefDeFenetre={hrefDeFenetre(filtres)}
        actionDuFiltre="/admin/usage"
      />
    </ContexteDeLHote.Provider>,
  )
}

const donnees = (usage: UsageSummary): EcranUsageProps["resultat"] => ({ data: { usage, equipes: EQUIPES } })
const ilot = (nom: string) => screen.getByRole("region", { name: nom })
// `Intl` sépare les milliers et le « % » par une espace insécable (fine ou non selon ICU) : comparée en espace.
const texte = (valeur: string | null | undefined) => valeur?.replace(/\s/gu, " ")
const cellules = (ligne: HTMLElement) => within(ligne).getAllByRole("cell").map((cellule) => texte(cellule.textContent))

describe("EcranUsage states (AC15)", () => {
  it("should render the loading state as a busy status", () => {
    render(<EcranUsageChargement />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
    expect(screen.getByText("Chargement de l'usage…")).toHaveClass("oto-sr-only")
  })

  it("should say a failed read once, with « Réessayer » to the same address, the heading still readable", () => {
    rendre({ error: ECHEC })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Usage des assistants")
    expect(screen.getByRole("alert")).toHaveTextContent(ECHEC)
    expect(screen.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", `/admin/usage?periode=7&equipe=${VENTES}`)
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByRole("radiogroup")).toBeNull()
  })
})

describe("EcranUsage window and team (AC2)", () => {
  it("should offer the three windows as a segmented choice, the active one checked, each opening its address by the host", () => {
    rendre(donnees(USAGE))
    expect(screen.getByText("Sur les 7 derniers jours · équipe Ventes")).toBeInTheDocument()
    const fenetres = within(screen.getByRole("radiogroup", { name: "La période observée" })).getAllByRole("radio")
    expect(fenetres.map((fenetre) => [fenetre.textContent, fenetre.getAttribute("aria-checked")])).toEqual([
      ["7 jours", "true"],
      ["30 jours", "false"],
      ["90 jours", "false"],
    ])
    fireEvent.click(fenetres[2])
    expect(naviguer).toHaveBeenCalledWith(`/admin/usage?periode=90&equipe=${VENTES}`)
  })

  it("should be reached once by Tab and moved by the arrows, like a radio group (E05-S09, AC-x3)", () => {
    rendre(donnees(USAGE))
    const fenetres = within(screen.getByRole("radiogroup", { name: "La période observée" })).getAllByRole("radio")
    expect(fenetres.map((fenetre) => fenetre.tabIndex)).toEqual([0, -1, -1])
    fenetres[0].focus()
    fireEvent.keyDown(fenetres[0], { key: "ArrowRight" })
    expect(naviguer).toHaveBeenCalledWith(`/admin/usage?periode=30&equipe=${VENTES}`)
    expect(fenetres[1]).toHaveFocus()
  })

  it("should filter by team with a GET form keeping the window, without JavaScript", () => {
    rendre(donnees(USAGE))
    const formulaire = screen.getByRole("form", { name: "Filtrer par équipe" })
    expect(formulaire).toHaveAttribute("method", "get")
    expect(formulaire).toHaveAttribute("action", "/admin/usage")
    const equipe = within(formulaire).getByRole("combobox", { name: "Équipe" })
    expect(equipe).toHaveValue(VENTES)
    expect(equipe).toHaveTextContent("Ventes")
    expect(libellesDesChoix(equipe)).toEqual(["Toutes les équipes", "Ventes"])
    expect(formulaire.querySelector('input[type="hidden"][name="equipe"]')).toHaveValue(VENTES)
    expect(formulaire.querySelector('input[type="hidden"][name="periode"]')).toHaveValue("7")
    expect(within(formulaire).getByRole("button", { name: "Filtrer" })).toHaveAttribute("type", "submit")
  })

  it("should show « Toutes les équipes » and no team in the heading when the service ignored the team", () => {
    rendre(donnees(VIDE), { periode: "7", equipe: "0b6f1f0e-1c1a-4a8e-9a51-0d7c1a2b3c02" })
    expect(screen.getByText("Sur les 7 derniers jours")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Équipe" })).toHaveValue("")
  })
})

describe("EcranUsage islands (AC3 to AC6, AC8)", () => {
  it("should show the four read-only key figures, the error rate as a French percentage", () => {
    rendre(donnees(USAGE))
    const chiffres = within(ilot("Chiffres clés"))
    const tuiles = ["Conversations", "Personnes actives", "Appels", "Taux d'erreur"].map((libelle) => [libelle, texte(chiffres.getByText(libelle).previousElementSibling?.textContent)])
    expect(tuiles).toEqual([
      ["Conversations", "1 234"],
      ["Personnes actives", "3"],
      ["Appels", "8"],
      ["Taux d'erreur", "12,5 %"],
    ])
    expect(chiffres.queryByRole("link")).toBeNull()
    expect(chiffres.queryByRole("button")).toBeNull()
  })

  it("should list the served procedures linked to their page, the functions by errors, and the conversations without a procedure linked to the journal", () => {
    rendre(donnees(USAGE))
    const [procedure] = within(ilot("Procédures les plus servies")).getAllByRole("row").slice(1)
    expect(cellules(procedure)).toEqual(["Qualifier les prospectsventes/qualifier_prospects", "3", "2", "2", "23 septembre 2026 à 14:02"])
    expect(within(procedure).getByRole("link", { name: "Qualifier les prospects" })).toHaveAttribute("href", "/n/ventes/qualifier_prospects")

    const fonctions = within(ilot("Erreurs par fonction"))
    expect(fonctions.getAllByRole("columnheader").map((entete) => [entete.textContent, entete.getAttribute("scope")])).toEqual(
      ["Fonction", "Appels", "Erreurs", "Taux", "Dernière erreur"].map((nom) => [nom, "col"]),
    )
    const [ecriture, schema] = fonctions.getAllByRole("row").slice(1)
    expect(cellules(ecriture)).toEqual(["table.write", "4", "1", "25 %", "invalid_arguments: Unknown column « statut ».23 septembre 2026 à 14:03"])
    expect(cellules(schema)).toEqual(["table.schema", "2", "0", "0 %", "—"])

    const sansProcedure = within(ilot("Conversations sans procédure"))
    expect(sansProcedure.getByText("2 conversations sans procédure trouvée")).toBeInTheDocument()
    expect(sansProcedure.getByText("Ces demandes n'ont trouvé ni procédure ni appel : elles nourrissent le titre et le résumé des procédures.")).toBeInTheDocument()
    const [demande] = sansProcedure.getAllByRole("row").slice(1)
    expect(cellules(demande)).toEqual(["23 septembre 2026 à 15:00", "Personne retirée", "Prépare le planning des tournées de la semaine (conversation DEMO-0004)", "—"])
    expect(within(demande).getByRole("link")).toHaveAttribute("href", "/journal?conversation=DEMO-0004&periode=7")
  })

  it("should say each empty island, and « — » for an error rate without calls", () => {
    rendre(donnees(VIDE))
    expect(within(ilot("Chiffres clés")).getByText("Taux d'erreur").previousElementSibling).toHaveTextContent("—")
    expect(within(ilot("Procédures les plus servies")).getByText("Aucune procédure servie sur cette période. Essayez une période plus large.")).toBeInTheDocument()
    expect(within(ilot("Erreurs par fonction")).getByText("Aucun appel de fonction sur cette période.")).toBeInTheDocument()
    expect(within(ilot("Conversations sans procédure")).getByText("Toutes les demandes de la période ont trouvé une procédure ou mené à un appel.")).toBeInTheDocument()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("should say the 20,000-call bound as information, with the date the period is covered from (AC8)", () => {
    rendre(donnees({ ...USAGE, truncated: true, coveredFrom: "2026-09-20T08:30:00.000Z" }))
    expect(screen.getByRole("status")).toHaveTextContent(
      "Calculé sur les 20 000 appels les plus récents : la période n'est couverte qu'à partir du 20 septembre 2026 à 10:30. Les appels plus anciens ne sont pas comptés.",
    )
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
