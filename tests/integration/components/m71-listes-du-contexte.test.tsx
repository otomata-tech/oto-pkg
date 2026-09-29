// M71 (bug signalé par JB, 2026-09-28) : dans la vue « Contexte » de l'accueil, une partie de Contexte que la
// personne peut écrire montre sa tête puis l'éditeur ; les listes d'index que `context` sert en plus des blocs du
// Contexte (« Pages, tables and procedures here: », « Linked pages: », `server/context/blocks/contexts.ts`) n'y
// étaient plus lues. Elles se lisent sous l'éditeur, chaque ligne menant à son contenu ; une partie en lecture
// garde son texte servi entier. Les textes servis sont écrits en toutes lettres : ce sont ceux du contrat. E05-S13
// (AC-15) : les listes se lisent en français (« Rangés sous ce contexte », « Pages citées »), chaque ligne par son
// titre, puis son résumé ; une partie en lecture garde son corps tel que servi, ses listes en français.
import type { ReactNode } from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ContexteServi, type DonneesDuContexteServi } from "../../../packages/plateforme/ui/contexte/contexte-servi"
import { bloc, vueDuNoeud } from "../../helpers/noeud"

function LienDeTest({ children, ...props }: { href: string; className?: string; children: ReactNode }) {
  return <a {...props}>{children}</a>
}

const TETE = "## Context: everyone (contexte)\nOrganisation: Démo. Domains: demo.fr."
const CORPS = "Nous vendons des logiciels."
const ENFANTS = ["Pages, tables and procedures here:", "- contexte/conseil — Conseil — Nos conseils aux clients.", "- contexte/tarifs — Tarifs 2026 — Les tarifs."]
const LIEES = ["Linked pages:", "- support/faq — FAQ support — Réponses types."]

/** Le rapport de l'aperçu pour la seule partie de Tout le monde, servie avec `suite` sous sa tête. */
function apercu(suite: string): DonneesDuContexteServi["apercu"] {
  const text = `${TETE}\n${suite}`
  return { data: { text, budget: 20_000, blocks: [{ name: "contexte", chars: text.length, status: "full", path: "contexte", head: TETE.length }] } }
}

/** Le Contexte de Tout le monde, lu au niveau donné : 1 en lecture, 3 en gestion (l'éditeur). */
function contextes(level: 1 | 3): DonneesDuContexteServi["contextes"] {
  return { contexte: { data: vueDuNoeud({ id: "n-contexte", path: "contexte", kind: "context", level, blocks: [bloc("b2000000-0000-4000-8000-000000000002", "paragraph", CORPS)] }) } }
}

function monterLaVue(suite: string, level: 1 | 3) {
  render(
    <ContexteServi
      donnees={{ apercu: apercu(suite), contextes: contextes(level), equipes: [], nomOrganisation: "Démo" }}
      Lien={LienDeTest}
      prefixeDesPages="/n/"
      ici="/context"
    />,
  )
}

const partie = () => within(screen.getByRole("region", { name: "Contexte : Tout le monde" }))

/** Chaque ligne d'une liste servie : son texte tel que servi, et l'adresse de son lien. */
function lignesDe(titre: string) {
  return within(partie().getByRole("list", { name: titre }))
    .getAllByRole("listitem")
    .map((ligne) => [ligne.textContent, within(ligne).getByRole("link").getAttribute("href")])
}

afterEach(cleanup)

describe("the index lists of a writable Contexte part (M71)", () => {
  it("should read its published children under the editor, each line a link to its content", () => {
    monterLaVue([CORPS, "", ...ENFANTS].join("\n"), 3)
    const champ = partie().getByRole("textbox", { name: `Modifier ce texte — ${CORPS}` })
    const liste = partie().getByRole("list", { name: "Rangés sous ce contexte" })
    expect(champ.compareDocumentPosition(liste)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    // Dans la carte de l'éditeur (AC-15).
    expect(liste.closest(".oto-island")).toBe(champ.closest(".oto-island"))
    expect(lignesDe("Rangés sous ce contexte")).toEqual([
      ["Conseil — Nos conseils aux clients.", "/n/contexte/conseil"],
      ["Tarifs 2026 — Les tarifs.", "/n/contexte/tarifs"],
    ])
    expect(partie().queryByText(/Pages, tables and procedures here/)).toBeNull()
    // Le corps du Contexte n'est pas répété : l'éditeur le porte.
    expect(partie().queryByText(CORPS, { selector: "pre" })).toBeNull()
  })

  it("should read its linked pages after its children, the cut pointer in French, and none when the lines belong to the body", () => {
    monterLaVue([CORPS, "", ...ENFANTS, ...LIEES, 'Rest of this context: demo_read {"path": "contexte"}.'].join("\n"), 3)
    expect(lignesDe("Pages citées")).toEqual([["FAQ support — Réponses types.", "/n/support/faq"]])
    expect(partie().getAllByRole("list").map((liste) => liste.getAttribute("aria-labelledby") && document.getElementById(liste.getAttribute("aria-labelledby") ?? "")?.textContent)).toEqual([
      "Rangés sous ce contexte",
      "Pages citées",
    ])
    expect(partie().queryByText(/^Rest of this context/)).toBeNull()
    expect(partie().getByText("La suite de ce contexte est lue à la demande.")).toBeInTheDocument()
    cleanup()
    // Sans les listes du service, des lignes du corps qui leur ressemblent n'en sont pas : leur titre ne suit pas
    // une ligne vide.
    monterLaVue([CORPS, ...LIEES].join("\n"), 3)
    expect(partie().queryByRole("list", { name: "Pages citées" })).toBeNull()
  })

  it("should read the body of a part it can only read as served, and its lists in French", () => {
    monterLaVue([CORPS, "", ...ENFANTS].join("\n"), 1)
    expect(partie().getByText(/^Nous vendons/, { selector: "pre" }).textContent).toBe(CORPS)
    expect(partie().queryByRole("textbox")).toBeNull()
    expect(lignesDe("Rangés sous ce contexte")).toEqual([
      ["Conseil — Nos conseils aux clients.", "/n/contexte/conseil"],
      ["Tarifs 2026 — Les tarifs.", "/n/contexte/tarifs"],
    ])
  })
})
