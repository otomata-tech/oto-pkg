// @vitest-environment node
import type { ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { TreeNode } from "@otomata_tech/oto_platform/schemas"
import { ContexteDeLHote, EcranDeNoeud } from "@otomata_tech/oto_platform/ui"
import { bloc, vueDuNoeud } from "../../helpers/noeud"

// L'écran d'un nœud servi en flux, comme la page de l'hôte le sert (M64, régression du lot b d'E05-S11) : les liens
// sortants arrivent après la page, et seul le titre d'une page citée les attend (AC-26, AC-27). Un repli qui
// recopiait le document (ou le texte au repos d'un bloc de l'éditeur) le servait deux fois, ancres comprises : une
// recherche stricte y trouvait deux éléments. Environnement `node` : le rendu serveur seul, sans le moteur de
// rendu du navigateur des autres suites, qui partagerait les contextes de l'écran.

function LienDeTest({ children, ...props }: { href: string; className?: string; children: ReactNode }) {
  return <a {...props}>{children}</a>
}

const noeud = (path: string, title: string): TreeNode => ({ path, kind: "page", title, status: "published", children: [] })

describe("EcranDeNoeud, servi en flux pendant la lecture des liens (M64)", () => {
  // La phrase se sert une fois rendue ; dans l'éditeur, une fois de plus en valeur de son champ.
  it.each([
    ["the read document", 1, 1],
    ["the editor at rest", 2, 2],
  ] as const)("should stream the text of %s once while the links are read: only a link title waits", async (_, level, attendues) => {
    const phrase = "attendre la réponse du client."
    let servir: (lu: { data: Record<string, unknown> }) => void = () => {}
    const liens = new Promise<{ data: Record<string, unknown> }>((resolve) => (servir = resolve))
    const flux = await renderToReadableStream(
      <ContexteDeLHote.Provider value={{ Lien: "a", chemin: "", naviguer: () => {} }}>
        <EcranDeNoeud
          chemin="ventes/modele_relance"
          noeud={{ data: vueDuNoeud({ blocks: [bloc("21000000-0000-4000-8000-000000000021", "paragraph", `Relancer selon [[ventes/grille]] et [[ventes/ancien]], puis ${phrase}`)], level }) }}
          arbre={{ data: { tree: [noeud("ventes", "Ventes"), noeud("ventes/grille", "Grille tarifaire")], truncated: false } }}
          equipes={{ data: [{ slug: "ventes", name: "Ventes" }] }}
          handle={null}
          nomOrganisation="Démo"
          versionPubliee={false}
          Lien={LienDeTest}
          hrefDuChemin={(chemin) => `/n/${chemin}`}
          prefixeDesPages="/n/"
          liens={liens}
        />
      </ContexteDeLHote.Provider>,
    )
    // L'enveloppe est prête avant les liens : son repli est servi, puis le segment lu à leur arrivée.
    servir({ data: { links_out: [{ path: "ventes/ancien", status: "moved", title: "Nouveau", moved_to: "conseil/nouveau" }], links_out_total: 1, links_in: [], links_in_total: 0 } })
    const html = await new Response(flux).text()
    expect(html.split(phrase).length - 1).toBe(attendues)
    // Le titre lu arrive quand même, dans la phrase (le lien de l'encart « Cite » porte son nom dans un `<span>`) :
    // la page déplacée, sous son nouveau titre, à sa nouvelle place.
    expect(html).toMatch(/<a [^>]*href="\/n\/conseil\/nouveau"[^>]*>Nouveau<\/a>/)
  })
})

// E11-S05 (AC-e4) : « Sous-pages », connu avec le nœud, se rend hors du `<Suspense>` des liens, une seule fois dans le
// flux ; à la place de « Cité dans » et « Cite », « Lecture des liens… » jusqu'à leur arrivée.
describe("EcranDeNoeud, the encarts streamed while the links are read (E11-S05, AC-e4)", () => {
  it("should stream « Sous-pages » once, outside the boundary of the links, and « Lecture des liens… » in their place", async () => {
    let servir: (lu: { data: Record<string, unknown> }) => void = () => {}
    const liens = new Promise<{ data: Record<string, unknown> }>((resolve) => (servir = resolve))
    const enfant = { path: "ventes/modele_relance/cas_unique_de_relance", title: "Cas unique de relance", summary: "Un cas.", kind: "page" as const, status: "published" as const }
    const flux = await renderToReadableStream(
      <ContexteDeLHote.Provider value={{ Lien: "a", chemin: "", naviguer: () => {} }}>
        <EcranDeNoeud
          chemin="ventes/modele_relance"
          noeud={{ data: vueDuNoeud({ children: [enfant], childrenTotal: 1 }) }}
          arbre={{ data: { tree: [noeud("ventes", "Ventes")], truncated: false } }}
          equipes={{ data: [{ slug: "ventes", name: "Ventes" }] }}
          handle={null}
          nomOrganisation="Démo"
          versionPubliee={false}
          Lien={LienDeTest}
          hrefDuChemin={(chemin) => `/n/${chemin}`}
          prefixeDesPages="/n/"
          liens={liens}
        />
      </ContexteDeLHote.Provider>,
    )
    servir({ data: { links_out: [], links_out_total: 0, links_in: [{ path: "conseil/guide", title: "Guide du conseil" }], links_in_total: 1 } })
    const html = await new Response(flux).text()
    expect(html.split("Cas unique de relance").length - 1).toBe(1)
    expect(html).toContain("Lecture des liens…")
    expect(html).toContain("Guide du conseil")
  })
})
