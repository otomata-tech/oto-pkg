import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NodeView } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeRafraichissement } from "@otomata_tech/oto_platform/ui"
import { CorpsDuNoeud } from "../../../packages/plateforme/ui/noeud/corps-du-noeud"
import { EditeurDeBlocs } from "../../../packages/plateforme/ui/noeud/editeur/editeur-de-blocs"
import { FileDOperations } from "../../../packages/plateforme/ui/noeud/editeur/file-d-operations"
import { ResumeModifiable, TitreModifiable } from "../../../packages/plateforme/ui/noeud/en-tete-modifiable"
import { PAGE, simulerLAPI, vueDuNoeud } from "../../helpers/noeud"

// Le titre et le résumé écrits en place (E05-S02, AC16 ; E05-S10, AC-a1, AC-a10), sous la file d'écriture de
// l'écran : `fetch` simulé pour `POST /api/platform/nodes`, relecture espionnée ; une relecture se joue en
// rerendant avec la lecture relue. Les champs sont montés comme l'en-tête les pose : le titre dans le `<h1>`,
// le résumé à la place du résumé lu, avec l'éditeur de la page sous la même file.

const CHARGE = "2026-09-24T09:00:00.000000+00:00"
const rafraichir = vi.fn()
let api: ReturnType<typeof simulerLAPI>

type Lecture = { titre?: string; resume?: string; tampon?: string | null; aide?: string }

function entete({ titre = "Modèle de relance", resume = "Relancer un devis resté sans réponse.", tampon = CHARGE, aide }: Lecture) {
  return (
    <ContexteDeRafraichissement.Provider value={rafraichir}>
      <FileDOperations chemin="ventes/modele_relance" revisionPubliee={4} tampon={tampon}>
        <h1>
          <TitreModifiable titre={titre} revisionServie={4} tamponServi={tampon} />
        </h1>
        <ResumeModifiable resume={resume} revisionServie={4} tamponServi={tampon} aideDuResume={aide} />
        <EditeurDeBlocs blocs={PAGE} revisionServie={4} prefixeDesPages="/n/" />
      </FileDOperations>
      <button type="button">Ailleurs</button>
    </ContexteDeRafraichissement.Provider>
  )
}

function monter(lecture: Lecture = {}) {
  const rendu = render(entete(lecture))
  return { relire: (relue: Lecture) => rendu.rerender(entete({ ...lecture, ...relue })) }
}

const champTitre = () => screen.getByRole("textbox", { name: "Titre" })
const champResume = () => screen.getByRole("textbox", { name: "Résumé" })

/** Un texte tapé dans un champ de l'en-tête, puis le focus ailleurs : il part. */
function ecrire(champ: HTMLElement, texte: string) {
  act(() => champ.focus())
  fireEvent.change(champ, { target: { value: texte } })
  act(() => screen.getByRole("button", { name: "Ailleurs" }).focus())
}

beforeEach(() => {
  api = simulerLAPI()
  rafraichir.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("titre et résumé en place (AC-a1 ; AC16 d'E05-S02)", () => {
  it("should mount the title in the h1 and the summary as fields without a click, check the bounds before sending, then send each after the saved block on the stamp it returned", async () => {
    monter({ aide: "Le routage lit le titre et le résumé." })
    expect(screen.queryByRole("button", { name: "Modifier le titre et le résumé" })).toBeNull()
    expect(champTitre()).toHaveValue("Modèle de relance")
    expect(champTitre().closest("h1")).not.toBeNull()
    expect(champResume()).toHaveValue("Relancer un devis resté sans réponse.")
    expect(champResume()).toHaveAccessibleDescription("Le routage lit le titre et le résumé.")

    // Un bloc enregistré d'abord (Échap l'envoie, E05-S08) : le tampon avance (M02).
    const texte = screen.getByRole("textbox", { name: "Modifier ce texte — Objet de la relance" })
    fireEvent.change(texte, { target: { value: "Objet revu" } })
    fireEvent.keyDown(texte, { key: "Escape" })
    await waitFor(() => expect(api.envoyes).toHaveLength(1))

    ecrire(champTitre(), "  ")
    expect(await screen.findByText("Le titre compte de 1 à 200 caractères.")).toHaveAttribute("role", "alert")
    expect(champTitre()).toHaveAccessibleDescription("Le titre compte de 1 à 200 caractères.")
    expect(api.envoyes).toHaveLength(1)

    ecrire(champTitre(), "Relance d'un devis")
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes[1]).toEqual({ path: "ventes/modele_relance", base_revision: 4, draft_stamp: "2026-09-24T10:00:01.000000+00:00", publish: false, title: "Relance d'un devis" })
    expect(screen.queryByText("Le titre compte de 1 à 200 caractères.")).toBeNull()
    // Entrée enregistre le résumé sans quitter le champ, et n'y écrit pas de saut de ligne.
    act(() => champResume().focus())
    fireEvent.change(champResume(), { target: { value: "Relancer au bout\nde sept jours." } })
    fireEvent.keyDown(champResume(), { key: "Enter" })
    await waitFor(() => expect(api.envoyes).toHaveLength(3))
    expect(api.envoyes[2]).toMatchObject({ summary: "Relancer au bout de sept jours." })
    expect(document.activeElement).toBe(champResume())
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(2))
    // Une valeur inchangée qu'on quitte n'envoie rien.
    act(() => screen.getByRole("button", { name: "Ailleurs" }).focus())
    expect(api.envoyes).toHaveLength(3)
  })

  it("should reread on stale_revision: a title changed elsewhere keeps the typed value readable and takes the saved one; a moved stamp alone sends it again, on the reread stamp", async () => {
    const { relire } = monter()
    api.refuser("stale_revision", 409)
    ecrire(champTitre(), "Titre de Léa")
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    expect(api.envoyes[0]).toMatchObject({ draft_stamp: CHARGE, title: "Titre de Léa" })
    expect(screen.queryByRole("alert")).toBeNull()

    relire({ titre: "Titre de Claire", tampon: "2026-09-24T10:30:00.000000+00:00" })
    expect(await screen.findByText("Le titre ou le résumé a changé pendant que vous écriviez.")).toHaveAttribute("role", "alert")
    expect(screen.getByText(/^Votre titre, non enregistré : Titre de Léa/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copier mon texte" })).toBeInTheDocument()
    expect(champTitre()).toHaveValue("Titre de Claire")

    api.refuser("stale_revision", 409)
    ecrire(champTitre(), "Titre commun")
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(2))
    relire({ titre: "Titre de Claire", tampon: "2026-09-24T10:45:00.000000+00:00" })
    await waitFor(() => expect(api.envoyes).toHaveLength(3))
    expect(api.envoyes[2]).toMatchObject({ draft_stamp: "2026-09-24T10:45:00.000000+00:00", title: "Titre commun" })
    expect(champTitre()).toHaveValue("Titre commun")
  })
})

function LienDeTest({ children, ...props }: { href: string; className?: string; children: ReactNode }) {
  return <a {...props}>{children}</a>
}

describe("en-tête d'un tableau (AC-a10)", () => {
  it("should publish a table's header written in place 3 s after the last keystroke, a table having no block editor", async () => {
    const tableau: NodeView = vueDuNoeud({ kind: "table", blocks: [], level: 3, title: "Suivi des prospects" })
    render(
      <ContexteDeRafraichissement.Provider value={rafraichir}>
        <FileDOperations chemin="ventes/modele_relance" revisionPubliee={4} tampon={null}>
          <TitreModifiable titre="Suivi des prospects" revisionServie={4} tamponServi={null} />
          <CorpsDuNoeud vue={tableau} niveauDEcriture={3} titre="Suivi des prospects" versionPubliee={false} Lien={LienDeTest} hrefDuChemin={(chemin) => `/n/${chemin}`} prefixeDesPages="/n/" />
        </FileDOperations>
      </ContexteDeRafraichissement.Provider>,
    )
    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull()
    vi.useFakeTimers()
    act(() => champTitre().focus())
    fireEvent.change(champTitre(), { target: { value: "Suivi des prospects 2026" } })
    await act(() => vi.advanceTimersByTimeAsync(1_200))
    expect(api.envoyes).toEqual([{ path: "ventes/modele_relance", base_revision: 4, publish: false, title: "Suivi des prospects 2026" }])
    await act(() => vi.advanceTimersByTimeAsync(1_799))
    expect(api.envoyes).toHaveLength(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(api.envoyes[1]).toEqual({ path: "ventes/modele_relance", base_revision: 4, draft_stamp: "2026-09-24T10:00:01.000000+00:00", publish: true })
    // Le brouillon de la personne, publié seul, n'a pas de bandeau.
    expect(screen.queryByText(/^Brouillon non publié/)).toBeNull()
  })

  it("should send a title typed less than 1 200 ms ago, then publish, when the host navigates away (AC-a6)", async () => {
    const tableau: NodeView = vueDuNoeud({ kind: "table", blocks: [], level: 3, title: "Suivi des prospects" })
    // L'en-tête avant la publication, comme à l'écran : React le démonte, et le nettoie, avant elle.
    const { unmount } = render(
      <ContexteDeRafraichissement.Provider value={rafraichir}>
        <FileDOperations chemin="ventes/modele_relance" revisionPubliee={4} tampon={null}>
          <TitreModifiable titre="Suivi des prospects" revisionServie={4} tamponServi={null} />
          <CorpsDuNoeud vue={tableau} niveauDEcriture={3} titre="Suivi des prospects" versionPubliee={false} Lien={LienDeTest} hrefDuChemin={(chemin) => `/n/${chemin}`} prefixeDesPages="/n/" />
        </FileDOperations>
      </ContexteDeRafraichissement.Provider>,
    )
    act(() => champTitre().focus())
    fireEvent.change(champTitre(), { target: { value: "Suivi des prospects 2026" } })
    unmount()
    await waitFor(() => expect(api.envoyes).toHaveLength(2))
    expect(api.envoyes).toEqual([
      { path: "ventes/modele_relance", base_revision: 4, publish: false, title: "Suivi des prospects 2026" },
      { path: "ventes/modele_relance", base_revision: 4, draft_stamp: "2026-09-24T10:00:01.000000+00:00", publish: true },
    ])
  })
})

describe("refus de l'en-tête d'un tableau à la publication (E11-S02, AC-g1)", () => {
  /** Un tableau au niveau écriture : la publication seule y part aussi (AC-c2). */
  function monterLeTableau() {
    const tableau: NodeView = vueDuNoeud({ kind: "table", blocks: [], level: 2, title: "Suivi des prospects" })
    render(
      <ContexteDeRafraichissement.Provider value={rafraichir}>
        <FileDOperations chemin="ventes/modele_relance" revisionPubliee={4} tampon={null}>
          <TitreModifiable titre="Suivi des prospects" revisionServie={4} tamponServi={null} />
          <CorpsDuNoeud vue={tableau} niveauDEcriture={2} titre="Suivi des prospects" versionPubliee={false} Lien={LienDeTest} hrefDuChemin={(chemin) => `/n/${chemin}`} prefixeDesPages="/n/" />
        </FileDOperations>
      </ContexteDeRafraichissement.Provider>,
    )
  }

  /** Une frappe dans le titre, enregistrée ; `refus` joue la réponse de la publication qui suit, 3 s après. */
  async function taperPuisPublier(texte: string, refus?: () => void) {
    act(() => champTitre().focus())
    fireEvent.change(champTitre(), { target: { value: texte } })
    await act(() => vi.advanceTimersByTimeAsync(1_200))
    refus?.()
    await act(() => vi.advanceTimersByTimeAsync(1_800))
  }

  const phrase = "Ce changement d'en-tête est refusé : demandez à votre assistant d'abandonner le brouillon."

  it("should say the refusal of a header in an alert without Réessayer, keep Réessayer for another conflict, and clear it once a publication passes", async () => {
    monterLeTableau()
    vi.useFakeTimers()
    await taperPuisPublier("Suivi 2026", () => api.refuser("conflict", 409, { reason: "header_refused" }))
    expect(api.envoyes.at(-1)).toMatchObject({ publish: true })
    expect(screen.getByRole("alert")).toHaveTextContent(phrase)

    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull()
    expect(screen.queryByText(/^Brouillon non publié/)).toBeNull()

    // Un conflit sans cette raison garde son message et « Réessayer ».
    await taperPuisPublier("Suivi 2027", () => api.refuser("conflict", 409))
    expect(screen.queryByText(phrase)).toBeNull()
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument()

    // Une publication qui passe retire le refus.
    await taperPuisPublier("Suivi 2028")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull()
  })
})
