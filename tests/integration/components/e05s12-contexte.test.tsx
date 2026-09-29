// Les écrans du Contexte après E05-S12, lot C (D109, retours 1, 2 et 4) : la vue « Contexte » de l'accueil et
// l'encart d'un Contexte nomment une partie par Contexte, servie ou non (AC-6) ; dans une partie, la tête servie
// se lit toujours, l'éditeur dessous quand la personne peut écrire le Contexte, même non servi (AC-7) ; ancres et
// « (ce contexte) » par le nom de la partie (AC-8). E11-S10 (lot f, lot g) : la tête servie n'est plus montrée, ni
// « Modifier dans Profil », ni « Règles Oto », dans la vue comme dans l'encart. Le rapport est celui du moteur
// (`head`, lot A) ; les parties servies nommées et leurs ancres sont aussi relues par
// `e05s11-contexte-servi.test.tsx` et `contexte.test.tsx`.
import type { ReactNode } from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { NodeView } from "@otomata_tech/oto_platform/schemas"
import { AnnexesDuContexte } from "@otomata_tech/oto_platform/ui"
import { ContexteServi, type DonneesDuContexteServi } from "../../../packages/plateforme/ui/contexte/contexte-servi"
import { nomDuBloc } from "../../../packages/plateforme/ui/contexte/libelles"
import { bloc, vueDuNoeud } from "../../helpers/noeud"

function LienDeTest({ children, ...props }: { href: string; className?: string; "aria-current"?: "page"; children: ReactNode }) {
  return <a {...props}>{children}</a>
}

const ECHEC = "Une erreur est survenue. Réessayez."

const TETES = {
  toutLeMonde: "## Context: everyone (contexte)\nOrganisation: Démo. Domains: demo.fr.",
  prive: "## Context: you only (private/lea/contexte)\nYou: Léa Martin (lea), member of Démo. Teams: Ventes (default), Conseil. Reply in French unless the user writes in another language.",
  ventes: "## Context: team Ventes (ventes/contexte)\nTeam Ventes, your default team. Lead: Claire Morel.\nConnectors (the team that runs each call unless the procedure's place says otherwise):\n- mail: team Ventes (write)",
  conseil: "## Context: team Conseil (conseil/contexte)\nTeam Conseil.",
}

const PARTIES = {
  code: "ctx: XXXX-XXXX\nPass this ctx to every other tool.\n## How this workspace works\n- Six tools.\n## This request\nNo request given.",
  toutLeMonde: `${TETES.toutLeMonde}\nNous vendons des logiciels.`,
  // Le Privé n'est pas servi (jamais publié) : sa tête seule.
  prive: TETES.prive,
  ventes: `${TETES.ventes}\nTutoie les clients.`,
  // Conseil n'est pas servi non plus, et la personne ne peut pas l'écrire.
  conseil: TETES.conseil,
  contenus: "## Recent content\n- ventes/tarifs — Tarifs",
}

const TEXTE = [PARTIES.code, PARTIES.toutLeMonde, PARTIES.prive, PARTIES.ventes, PARTIES.conseil, PARTIES.contenus].join("\n\n")

/** Le rapport du moteur : `name` = chemin d'une partie de Contexte, `path` seulement quand son corps est servi. */
const APERCU = {
  data: {
    text: TEXTE,
    budget: 20_000,
    blocks: [
      { name: "code", chars: PARTIES.code.length, status: "full", path: null, head: 0 },
      { name: "contexte", chars: PARTIES.toutLeMonde.length, status: "full", path: "contexte", head: TETES.toutLeMonde.length },
      { name: "private/lea/contexte", chars: PARTIES.prive.length, status: "full", path: null, head: TETES.prive.length },
      { name: "ventes/contexte", chars: PARTIES.ventes.length, status: "full", path: "ventes/contexte", head: TETES.ventes.length },
      { name: "conseil/contexte", chars: PARTIES.conseil.length, status: "full", path: null, head: TETES.conseil.length },
      { name: "recent content", chars: PARTIES.contenus.length, status: "full", path: null, head: 0 },
    ],
  },
}

const EQUIPES = [
  { slug: "ventes", name: "Ventes" },
  { slug: "conseil", name: "Conseil" },
]

/** Le Contexte Privé jamais publié, en brouillon, que Léa écrit (niveau 2). */
const PRIVE_EN_BROUILLON: NodeView = vueDuNoeud({
  id: "n-prive",
  path: "private/lea/contexte",
  kind: "context",
  status: "draft",
  revision: 0,
  level: 2,
  owner: { kind: "user", userName: "Léa Martin" },
  blocks: [],
  draft: {
    baseRevision: 0,
    savedAt: "2026-09-28T09:00:00.000Z",
    draftStamp: "2026-09-28T09:00:00.000000+00:00",
    blocks: [bloc("c3000000-0000-4000-8000-000000000003", "paragraph", "Signature : Léa.")],
    title: null,
    summary: null,
    kind: null,
    meta: null,
  },
})

/** Ce que la page lit : Tout le monde en lecture, Ventes en gestion, le Privé non servi en écriture, Conseil illisible. */
const CONTEXTES: DonneesDuContexteServi["contextes"] = {
  contexte: { data: vueDuNoeud({ id: "n-contexte", path: "contexte", kind: "context", level: 1, blocks: [] }) },
  "private/lea/contexte": { data: PRIVE_EN_BROUILLON },
  "ventes/contexte": {
    data: vueDuNoeud({ id: "n-ventes", path: "ventes/contexte", kind: "context", level: 3, blocks: [bloc("b2000000-0000-4000-8000-000000000002", "paragraph", "Tutoie les clients.")] }),
  },
  "conseil/contexte": { error: ECHEC },
}

function monterLaVue(donnees: Partial<DonneesDuContexteServi> = {}) {
  render(
    <ContexteServi
      donnees={{ apercu: APERCU, contextes: CONTEXTES, equipes: EQUIPES, ...donnees }}
      Lien={LienDeTest}
      prefixeDesPages="/n/"
      ici="/context"
    />,
  )
}

function monterLEncart(cheminCourant: string) {
  render(
    <AnnexesDuContexte
      cheminCourant={cheminCourant}
      handle="lea"
      apercu={APERCU}
      equipes={EQUIPES}
      hrefDuContexteServi="/context"
      ici={`/n/${cheminCourant}`}
      Lien={LienDeTest}
    />,
  )
}

const partie = (nom: string) => within(screen.getByRole("region", { name: nom }))
const textesServis = (nom: string) => partie(nom).queryAllByText(/./, { selector: "pre" }).map((texte) => texte.textContent)

afterEach(cleanup)

describe("une partie par Contexte (AC-6)", () => {
  it("should name every part in the view and in the insert, a Contexte not served by its name, and none after the old blocks", () => {
    monterLaVue()
    // Sans « Règles Oto » (E11-S10, AC-f4, AC-g2) ; « Nouveautés » dans la vue même quand rien n'en est servi (AC-f5).
    const noms = ["Contexte : Tout le monde", "Contexte : Privé", "Contexte : équipe Ventes", "Contexte : équipe Conseil", "Contenus récents"]
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-labelledby") && document.getElementById(region.getAttribute("aria-labelledby") ?? "")?.textContent)).toEqual([
      ...noms.slice(0, 4),
      "Nouveautés",
      "Contenus récents",
    ])
    for (const ancien of ["Vous", "Organisation", "Vos équipes", "Connecteurs", "Code de la conversation", "Documents récents"]) {
      expect(screen.queryByRole("region", { name: ancien })).toBeNull()
    }
    // Le Privé d'une personne sans `handle` s'appelle `private` (AC-3) : c'est toujours sa partie Privé.
    expect(nomDuBloc({ name: "private" }, EQUIPES)).toBe("Contexte : Privé")
    cleanup()
    monterLEncart("ventes/contexte")
    const lignes = within(screen.getByRole("list", { name: "Ordre de lecture" })).getAllByRole("link")
    // E05-S13 (AC-13) : le nom seul, sans taille ni état.
    expect(lignes.map((ligne) => ligne.textContent?.replace(/ \(ce contexte\)$/, ""))).toEqual(noms)
  })
})

describe("une partie, puis son Contexte (AC-7 ; E11-S10, AC-f1 à AC-f3)", () => {
  it("should hide the served head, then show the editor of a writable Contexte even not served, else the rest of the served text", () => {
    monterLaVue()
    // Ni faits ni connecteurs à l'écran : l'assistant les reçoit toujours (HN-E11S10-14).
    expect(document.body.textContent).not.toMatch(/Organisation: Démo|You: Léa|Team Ventes|Team Conseil|Connectors/)
    // Tout le monde, en lecture : la suite servie ; aucun champ.
    expect(textesServis("Contexte : Tout le monde")).toEqual(["Nous vendons des logiciels."])
    expect(partie("Contexte : Tout le monde").queryByRole("textbox")).toBeNull()
    // Ventes, en gestion : l'éditeur, le corps servi n'est pas répété.
    expect(textesServis("Contexte : équipe Ventes")).toEqual([])
    expect(partie("Contexte : équipe Ventes").getByRole("textbox", { name: "Modifier ce texte — Tutoie les clients." })).toBeInTheDocument()
    // Le Privé, jamais publié donc non servi, mais écrivable : son éditeur, sans lien vers Profil.
    expect(textesServis("Contexte : Privé")).toEqual([])
    expect(partie("Contexte : Privé").getByRole("textbox", { name: "Modifier ce texte — Signature : Léa." })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Modifier dans Profil" })).toBeNull()
    // Conseil, non servi et en échec de lecture pour la page : rien de servi, aucun champ, et l'échec se dit
    // (portage-ecrans.md § 4 ; un Contexte absent, `not_found`, la page ne le lit pas en erreur).
    expect(partie("Contexte : équipe Conseil").getByText("L'assistant ne reçoit rien de ce contexte pour l'instant.")).toBeInTheDocument()
    expect(partie("Contexte : équipe Conseil").queryByRole("textbox")).toBeNull()
    expect(partie("Contexte : équipe Conseil").getByRole("alert")).toHaveTextContent(ECHEC)
  })

  it("should say the failed read of a served Contexte under its served text", () => {
    monterLaVue({ contextes: { ...CONTEXTES, contexte: { error: ECHEC } } })
    expect(textesServis("Contexte : Tout le monde")).toEqual(["Nous vendons des logiciels."])
    expect(partie("Contexte : Tout le monde").getByRole("alert")).toHaveTextContent(ECHEC)
  })
})

describe("ancres et « (ce contexte) » par le nom de la partie (AC-8)", () => {
  it("should lead each line of the insert to its anchor, and mark the opened Contexte even when it is not published", () => {
    monterLEncart("private/lea/contexte")
    const liste = within(screen.getByRole("list", { name: "Ordre de lecture" }))
    expect(liste.getAllByRole("link").map((lien) => lien.getAttribute("href"))).toEqual(
      ["contexte-tout-le-monde", "contexte-prive", "contexte-ventes", "contexte-conseil", "contenus"].map((ancre) => `/context#${ancre}`),
    )
    const marquees = liste.getAllByRole("link").filter((lien) => lien.getAttribute("aria-current") === "page")
    expect(marquees.map((lien) => lien.textContent?.startsWith("Contexte : Privé (ce contexte)"))).toEqual([true])
    cleanup()
    monterLaVue()
    expect(screen.getAllByRole("region").map((region) => region.id)).toEqual(["contexte-tout-le-monde", "contexte-prive", "contexte-ventes", "contexte-conseil", "nouveautes", "contenus"])
  })
})

describe("sans « Règles Oto » (E11-S10, AC-f4, AC-g2)", () => {
  it("should render no part and no line for the code block, in the view as in the insert", () => {
    monterLaVue()
    expect(screen.queryByText("Règles Oto")).toBeNull()
    expect(document.body.textContent).not.toContain("How this workspace works")
    cleanup()
    monterLEncart("contexte")
    expect(screen.queryByText(/Règles Oto/)).toBeNull()
  })
})
