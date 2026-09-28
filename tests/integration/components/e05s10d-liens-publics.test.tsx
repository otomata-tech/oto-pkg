import type { AnchorHTMLAttributes } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OrgShareView, OrgView } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeLHote, ContexteDeRafraichissement, EcranOrganisation } from "@otomata_tech/oto_platform/ui"

// « Liens publics » de l'écran « Organisation » (E05-S10, AC-d7 ; ADR-013 § 2) : les liens actifs de
// l'organisation, lus par l'hôte (`listShares`, simulé ici par sa promesse), et « Désactiver » par
// `DELETE /api/plateforme/shares/<id>` (`fetch` simulé), confirmé en place, puis la page relue.

const DEMO: OrgView = {
  name: "Démo",
  slug: "demo",
  prefix: "demo",
  tools: [],
  hosts: [],
  domains: "",
  routing: { threshold: null, gap: null },
  contact: null,
}

const TARIFS: OrgShareView = { id: "9a8b7c6d-5e4f-4a3b-8c2d-000000000001", path: "ventes/tarifs", title: "Tarifs 2026", includeChildren: true, createdAt: "2026-09-27T08:00:00.000Z", createdByName: "Léa Martin" }
// Un contenu d'un espace privé que l'administrateur ne lit pas : son espace, sans titre (D44, décidé par le service).
const PRIVE: OrgShareView = { id: "9a8b7c6d-5e4f-4a3b-8c2d-000000000002", path: "private/marc", title: null, includeChildren: false, createdAt: "2026-09-26T08:00:00.000Z", createdByName: null }

const fetchMock = vi.fn<typeof fetch>()
const rafraichir = vi.fn()

function Lien({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props}>{children}</a>
}

async function monter(lecture: Promise<{ data: OrgShareView[] } | { error: string }>) {
  await act(async () => {
    render(
      <ContexteDeLHote.Provider value={{ Lien, chemin: "/admin/organisation", naviguer: vi.fn() }}>
        <ContexteDeRafraichissement.Provider value={rafraichir}>
          <EcranOrganisation resultat={{ data: DEMO }} Lien={Lien} ici="/admin/organisation" hrefGuide="/n/contexte" liensPublics={{ lecture, prefixeDesPages: "/n/" }} />
        </ContexteDeRafraichissement.Provider>
      </ContexteDeLHote.Provider>,
    )
  })
  return within(screen.getByRole("region", { name: "Liens publics" }))
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

describe("EcranOrganisation, public links (AC-d7)", () => {
  it("should list the active links of the organisation: content, author, date", async () => {
    const liens = await monter(Promise.resolve({ data: [TARIFS, PRIVE] }))

    const lignes = within(liens.getByRole("table", { name: "Liens publics actifs, le plus récent d'abord" })).getAllByRole("row").slice(1)
    expect(lignes.map((ligne) => within(ligne).getAllByRole("cell").slice(0, 3).map((cellule) => cellule.textContent))).toEqual([
      ["Tarifs 2026", "Léa Martin", "27 septembre 2026"],
      ["private/marc (espace privé)", "Personne partie", "26 septembre 2026"],
    ])
    expect(within(lignes[0]).getByRole("link", { name: "Tarifs 2026" })).toHaveAttribute("href", "/n/ventes/tarifs")
    expect(within(lignes[1]).queryByRole("link")).toBeNull()
  })

  it("should disable a link after a confirmation, then re-read the page", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id: TARIFS.id, path: TARIFS.path } }), { status: 200, headers: { "content-type": "application/json" } }))
    const liens = await monter(Promise.resolve({ data: [TARIFS] }))

    fireEvent.click(liens.getByRole("button", { name: "Désactiver le lien de Tarifs 2026" }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(liens.getByRole("button", { name: "Désactiver le lien" }))
    await waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/plateforme/shares/${TARIFS.id}`)
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE")
  })

  it("should say an organisation without public link, and a failed reading with « Réessayer »", async () => {
    const vide = await monter(Promise.resolve({ data: [] }))
    expect(vide.getByText("Aucun lien public actif.")).toBeInTheDocument()
    cleanup()

    const echec = await monter(Promise.resolve({ error: "Une erreur est survenue. Réessayez." }))
    expect(echec.getByRole("alert")).toHaveTextContent("Une erreur est survenue. Réessayez.")
    expect(echec.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/admin/organisation")
  })
})
