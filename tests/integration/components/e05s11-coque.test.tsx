// E05-S11 (lot e) : la coque sans tiret cadratin (AC-18 : les tables de libellés de `ui/coque/`, et le rail
// rendu), la procédure au glyphe `Play` partout où la table nature → glyphe sert (AC-35 : rail, palette,
// création, navigateur d'arbre ; « Contenus liés », l'accueil et le fil lisent la table du rail, `GLYPHES`).
// Les menus (AC-31 à AC-34, AC-6, AC-e21, AC-e22) : `rail-application.test.tsx`.
import type { AnchorHTMLAttributes, ReactNode } from "react"
import { Play } from "@phosphor-icons/react/dist/ssr/Play"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { TreeNode } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeLHote, ContexteDeRafraichissement, CoquilleOto, NavigateurDArbre, RailApplication, type RailApplicationProps } from "@otomata_tech/oto_platform/ui"
import * as LIBELLES_DE_LA_COQUE from "../../../packages/plateforme/ui/coque/libelles"
import { simulerLesDialogues } from "../../helpers/dialogue"

const noeud = (path: string, kind: TreeNode["kind"], title: string, children: TreeNode[] = []): TreeNode => ({ path, kind, title, status: "published", children })

const ARBRE: TreeNode[] = [
  noeud("guide", "page", "Guide de Démo", [
    noeud("contexte", "context", "Contexte de l'organisation"),
    noeud("private", "page", "Espaces personnels", [noeud("private/claire", "page", "Claire", [noeud("private/claire/contexte", "context", "Contexte")])]),
    noeud("ventes", "page", "Ventes", [noeud("ventes/contexte", "context", "Contexte"), noeud("ventes/qualifier", "procedure", "Qualifier un prospect")]),
  ]),
]

const PROPS: RailApplicationProps = {
  entreprise: { nom: "Démo", logo: null },
  arbre: { data: { tree: ARBRE, truncated: false } },
  equipes: { data: [{ slug: "ventes", name: "Ventes" }] },
  handle: "claire",
  compte: "Claire Morel",
  administre: true,
  adresses: { pages: "/n/", accueil: "/", journal: "/journal", equipes: "/equipes", usage: "/admin/usage", organisation: "/admin/organisation", connecteurs: "/admin/connecteurs", corbeille: "/corbeille", profil: "/profil" },
}

function Lien({ href, children, ...reste }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return (
    <a href={href} {...reste}>
      {children}
    </a>
  )
}

function monterLeRail() {
  render(
    <CoquilleOto pleinePage>
      <ContexteDeRafraichissement.Provider value={vi.fn()}>
        <ContexteDeLHote.Provider value={{ Lien, chemin: "/n/ventes/qualifier", naviguer: vi.fn(), deconnecter: vi.fn() }}>
          <RailApplication {...PROPS} />
        </ContexteDeLHote.Provider>
      </ContexteDeRafraichissement.Provider>
    </CoquilleOto>,
  )
  return screen.getByRole("navigation", { hidden: true })
}

/** Tous les textes d'une table de libellés : chaînes, objets imbriqués, et fonctions appelées sur des valeurs d'exemple. */
function textesDe(valeur: unknown): string[] {
  if (typeof valeur === "string") return [valeur]
  if (typeof valeur === "function") return textesDe(valeur("Exemple", 2))
  if (valeur !== null && typeof valeur === "object") return Object.values(valeur).flatMap(textesDe)
  return []
}

/** Le tracé du glyphe dans un élément : celui de son premier `<path>`. */
const traceDans = (element: Element) => element.querySelector("svg path")?.getAttribute("d")

let TRACE_DU_PLAY: string | null | undefined

beforeAll(() => {
  simulerLesDialogues()
  const { container, unmount } = render(<Play />)
  TRACE_DU_PLAY = traceDans(container)
  unmount()
})

afterEach(cleanup)

describe("the coque without an em dash (E05-S11, AC-18)", () => {
  it("should carry no « — » in any label table of the coque, nor in the text and names of the rendered rail", () => {
    const textes = Object.values(LIBELLES_DE_LA_COQUE).flatMap(textesDe)
    expect(textes.length).toBeGreaterThan(40)
    expect(textes.filter((texte) => texte.includes("—"))).toEqual([])

    const rail = monterLeRail()
    expect(within(rail).getByRole("link", { name: "Contexte · Ventes" })).toBeInTheDocument()
    expect(rail.textContent).not.toContain("—")
    const noms = [...rail.querySelectorAll("[aria-label]")].map((element) => element.getAttribute("aria-label") ?? "")
    expect(noms.filter((nom) => nom.includes("—"))).toEqual([])
  })
})

describe("the procedure glyph (E05-S11, AC-35)", () => {
  it("should draw a procedure with Play in the rail, the palette, the creation menu and the tree browser", () => {
    expect(TRACE_DU_PLAY).toBeTruthy()
    const rail = monterLeRail()

    expect(traceDans(within(rail).getByRole("link", { name: "Qualifier un prospect" }))).toBe(TRACE_DU_PLAY)

    fireEvent.click(within(rail).getByRole("button", { name: "Créer dans Ventes" }))
    expect(traceDans(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Une procédure" }))).toBe(TRACE_DU_PLAY)
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })

    fireEvent.click(within(rail).getByRole("searchbox", { name: "Rechercher" }))
    const procedures = within(screen.getByRole("group", { name: "Procédures" }))
    expect(traceDans(procedures.getByRole("option", { name: "Qualifier un prospect" }))).toBe(TRACE_DU_PLAY)
    cleanup()

    render(<NavigateurDArbre resultat={{ data: [{ chemin: "ventes/qualifier", titre: "Qualifier un prospect", nature: "procedure" }] }} hrefDuNoeud={(n) => `/n/${n.chemin}`} Lien={Lien} />)
    expect(traceDans(screen.getByRole("link", { name: "Qualifier un prospect" }))).toBe(TRACE_DU_PLAY)
  })
})
