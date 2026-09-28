// La page publique d'un lien de partage, `/p/<jeton>` et `/p/<jeton>/<chemin>` (E05-S10, AC-d2 à AC-d6 ;
// ADR-013) : lue hors session par `readPublicNode` (simulé ici ; ses cas sur base réelle sont dans
// `e05s10e-partage-public.test.ts`), rendue en lecture seule au thème de l'organisation de l'adresse, les liens
// hors de portée en texte, le 404 indistinct, jamais indexée.
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PublicNodeView, PublicTable } from "@otomata_tech/oto_platform/schemas"
import { PlatformError, readPublicNode } from "@otomata_tech/oto_platform/server"
import LienPublicIntrouvable from "@/app/p/[jeton]/[[...chemin]]/not-found"
import PagePubliqueDuLien, { generateMetadata } from "@/app/p/[jeton]/[[...chemin]]/page"
import { marqueDeLAdresse } from "@/lib/plateforme/marque-de-l-adresse"

vi.mock("next/headers", () => ({ headers: vi.fn() }))

// notFound() lève NEXT_NOT_FOUND dans Next : le mock lève aussi, le rendu s'arrête comme en production.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

vi.mock("@/lib/plateforme/marque-de-l-adresse", () => ({ marqueDeLAdresse: vi.fn() }))

vi.mock("@otomata_tech/oto_platform/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/server")>()),
  readPublicNode: vi.fn(),
}))

const JETON = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"
const HOTE = "demo.oto.test"

const VUE: PublicNodeView = {
  root: { path: "ventes/tarifs", title: "Tarifs 2026" },
  includeChildren: true,
  node: { path: "ventes/tarifs", title: "Tarifs 2026", summary: "Les prix publics de l'année.", kind: "page", revision: 3, meta: {}, updatedAt: "2026-09-27T08:00:00.000Z" },
  blocks: [
    { id: "b1", type: "heading", position: 1, key: "prix", text: "Prix", data: { level: 1 } },
    { id: "b2", type: "paragraph", position: 2, key: null, text: "Voir [[ventes/tarifs/remises|les remises]] et [[ventes/marges|nos marges]].", data: {} },
  ],
  table: null,
  children: [{ path: "ventes/tarifs/remises", title: "Remises", kind: "page" }],
  links: [{ path: "ventes/tarifs/remises", to: "ventes/tarifs/remises" }],
}

const params = (chemin?: string[]) => ({ params: Promise.resolve({ jeton: JETON, ...(chemin ? { chemin } : {}) }) })

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(new Headers({ host: HOTE }))
  vi.mocked(marqueDeLAdresse).mockResolvedValue({ theme: "ardoise", logo: null, nomAffiche: "Démo" })
  vi.mocked(readPublicNode).mockResolvedValue(VUE)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("/p/<jeton> public page (AC-d2, AC-d3, AC-d4)", () => {
  it("should show the published content read-only, in the organisation's theme, read by the token and the address alone", async () => {
    const { container } = render(await PagePubliqueDuLien(params()))

    expect(readPublicNode).toHaveBeenCalledWith(HOTE, JETON, null)
    expect(container.querySelector(".oto")).toHaveAttribute("data-oto-theme", "ardoise")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tarifs 2026")
    expect(screen.getByText("Les prix publics de l'année.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Prix" })).toBeInTheDocument()
    // Lecture seule : aucun champ, aucun bouton d'écriture.
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("should open the sub-contents by the same token, and write a link outside the share as plain text", async () => {
    render(await PagePubliqueDuLien(params()))

    const dessous = within(screen.getByRole("navigation", { name: "Dessous" }))
    expect(dessous.getByRole("link", { name: "Remises" })).toHaveAttribute("href", `/p/${JETON}/ventes/tarifs/remises`)
    const paragraphe = screen.getByText(/^Voir/)
    expect(within(paragraphe).getByRole("link", { name: "les remises" })).toHaveAttribute("href", `/p/${JETON}/ventes/tarifs/remises`)
    expect(within(paragraphe).queryByRole("link", { name: "nos marges" })).toBeNull()
    expect(within(paragraphe).getByText("nos marges").closest("a")).toBeNull()
  })

  it("should read a sub-content by its path, with a way back to the shared content", async () => {
    vi.mocked(readPublicNode).mockResolvedValue({ ...VUE, node: { ...VUE.node, path: "ventes/tarifs/remises", title: "Remises" }, blocks: [], children: [], links: [] })
    render(await PagePubliqueDuLien(params(["ventes", "tarifs", "remises"])))

    expect(readPublicNode).toHaveBeenCalledWith(HOTE, JETON, "ventes/tarifs/remises")
    expect(screen.getByRole("link", { name: "Retour à Tarifs 2026" })).toHaveAttribute("href", `/p/${JETON}`)
    expect(screen.getByText("Cette page n'a pas encore de contenu.")).toBeInTheDocument()
  })
})

describe("/p/<jeton> refusals (AC-d5)", () => {
  it("should answer the same 404 for any link the service does not serve, saying nothing of which", async () => {
    vi.mocked(readPublicNode).mockRejectedValue(new PlatformError("not_found", "Not found."))
    await expect(PagePubliqueDuLien(params(["ventes", "secret"]))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledTimes(1)

    render(await LienPublicIntrouvable())
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page introuvable")
    expect(screen.getByText("Ce lien n'existe pas ou n'est plus actif.")).toBeInTheDocument()
    expect(await generateMetadata(params(["ventes", "secret"]))).toEqual({ title: "Page introuvable", robots: { index: false, follow: false } })
  })

  it("should title a breakdown by its sentence, not as a missing page", async () => {
    vi.mocked(readPublicNode).mockRejectedValue(new Error("connection refused 10.0.0.1"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await generateMetadata(params())).toEqual({ title: "Cette page n'a pas pu être chargée", robots: { index: false, follow: false } })
  })

  it("should say a breakdown of the reading, without its technical message", async () => {
    vi.mocked(readPublicNode).mockRejectedValue(new Error("connection refused 10.0.0.1"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(await PagePubliqueDuLien(params()))

    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(screen.getByRole("alert")).not.toHaveTextContent("10.0.0.1")
  })
})

describe("/p/<jeton> indexing (AC-d6)", () => {
  it("should title and describe the page by its content and keep it out of any index", async () => {
    expect(await generateMetadata(params())).toEqual({ title: "Tarifs 2026", description: "Les prix publics de l'année.", robots: { index: false, follow: false } })
  })
})

// Les lignes d'un tableau (fiche D103) : `table` que le service sert (E01-S12 partie c), rendu en grille en lecture
// seule, sans tri, filtre ni geste.
describe("/p/<jeton> table rows (D103)", () => {
  const HOSTILE = '<img src=x onerror="alert(1)">'
  const TABLE: PublicTable = {
    columns: [
      { name: "ref", type: "text" },
      { name: "nom", type: "text" },
      { name: "montant", type: "number" },
      { name: "actif", type: "bool" },
      { name: "site", type: "url" },
    ],
    rows: [
      { key: "a-01", cells: { ref: null, nom: "Atelier Nord", montant: 1200, actif: true, site: "https://nord.example" } },
      { key: "a-02", cells: { ref: null, nom: HOSTILE, montant: null, actif: false, site: "javascript:alert(1)" } },
    ],
    truncated: false,
  }
  const TABLEAU: PublicNodeView = {
    ...VUE,
    node: { ...VUE.node, title: "Clients", summary: "", kind: "table", meta: { key: "ref", columns: [] } },
    blocks: [{ id: "r1", type: "row", position: 1, key: "a-01", text: "", data: { nom: "brut" } }],
    children: [],
    links: [],
    table: TABLE,
  }

  it("should show the columns and the rows, each value in the format of its type, read-only", async () => {
    vi.mocked(readPublicNode).mockResolvedValue(TABLEAU)
    render(await PagePubliqueDuLien(params()))

    const grille = screen.getByRole("table", { name: "Lignes de Clients" })
    expect(within(grille).getAllByRole("columnheader").map((entete) => entete.textContent)).toEqual(["ref", "nom", "montant", "actif", "site"])
    const [premiere, seconde] = within(grille).getAllByRole("row").slice(1)
    expect(within(premiere).getByRole("rowheader")).toHaveTextContent("a-01")
    expect(within(premiere).getAllByRole("cell").map((cellule) => cellule.textContent)).toEqual(["Atelier Nord", "1\u202f200", "Oui", "https://nord.example"])
    expect(within(premiere).getByRole("link", { name: "https://nord.example" })).toHaveAttribute("href", "https://nord.example")
    expect(within(seconde).getAllByRole("cell").map((cellule) => cellule.textContent)).toEqual([HOSTILE, "\u2014", "Non", "javascript:alert(1)"])
    // Les lignes ne passent plus par les blocs, et la phrase qui les disait absentes est partie.
    expect(screen.queryByText("brut")).toBeNull()
    expect(screen.queryByText(/ne s'affichent pas/)).toBeNull()
    expect(screen.queryByText(/500 premières lignes/)).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("should render a hostile text value as text, never as markup or a link", async () => {
    vi.mocked(readPublicNode).mockResolvedValue(TABLEAU)
    const { container } = render(await PagePubliqueDuLien(params()))

    expect(screen.getByText(HOSTILE)).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByRole("link", { name: "javascript:alert(1)" })).toBeNull()
  })

  it("should say when only the first 500 rows are shown", async () => {
    vi.mocked(readPublicNode).mockResolvedValue({ ...TABLEAU, table: { ...TABLE, truncated: true } })
    render(await PagePubliqueDuLien(params()))

    expect(screen.getByText("Les 500 premières lignes, dans l'ordre de leur clé.")).toBeInTheDocument()
  })

  it("should render no grid for a content that is not a table", async () => {
    vi.mocked(readPublicNode).mockResolvedValue({ ...VUE, table: null })
    render(await PagePubliqueDuLien(params()))

    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.getByText(/^Voir/)).toBeInTheDocument()
  })
})
