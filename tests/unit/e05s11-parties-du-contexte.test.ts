// La découpe du texte servi en ses parties (E05-S11, AC-11, AC-13 ; HN-E05S11-8, HN-E05S11-9), confrontée au
// moteur même de `context` (`renderContext`, `server/context/engine.ts`) : `ui/` réécrit sa règle de séparation
// sans l'importer, ce test tient les deux ensemble sur un texte entier, coupé, remplacé, omis, et reculé (une
// ligne finale plus longue que sa réserve). Les ancres des parties sont celles de l'encart d'un Contexte.
// E05-S12 (lot C, AC-4, AC-7, AC-8) : la tête d'une partie de Contexte, lue par `head`, est celle que rendent
// les parties du serveur (`contextParts`), entière, puis ramenée par le recul du texte.
import { describe, expect, it } from "vitest"
import { contextParts, type PartFacts } from "../../packages/plateforme/server/context/blocks/contexts"
import { renderContext, type ContextBlock } from "../../packages/plateforme/server/context/engine"
import type { Identity } from "../../packages/plateforme/server/identity"
import { ancreDeLaPartie, cheminDuContexte, morceauxDuContexte, partiesDuContexte } from "../../packages/plateforme/ui/contexte/parties-du-contexte"

const lignes = (prefixe: string, nombre: number) => Array.from({ length: nombre }, (_, rang) => `${prefixe} ligne ${rang}`).join("\n")

/** Chaque partie incluse, lue dans le texte, est ce que le moteur a inclus du bloc ; le reste est l'avis. */
function confronter(blocs: ContextBlock[], budget: number) {
  const { text, report } = renderContext(blocs, budget, "demo")
  const { parties, reste } = partiesDuContexte({ text, blocks: report })
  const inclus = parties.filter((partie) => partie.chars > 0)
  // Recomposé, le texte est celui du moteur, à l'octet.
  expect(inclus.map((partie) => partie.texte).join("\n\n") + (reste ? `\n\n${reste}` : "")).toBe(text)
  return { parties, reste, report }
}

const LEA: Identity = {
  org: { id: "org-1", slug: "demo", name: "Démo", prefix: "demo", brand: {}, domains: null },
  user: { id: "user-lea", email: "lea@example.test", name: "Léa Martin" },
  member: { role: "member", profile: { name: "Léa Martin", handle: "lea" } },
  teams: [{ id: "team-ventes", slug: "ventes", name: "Ventes", role: "member" }],
  isStaff: false,
  viaGrant: false,
  hasOpenGrant: false,
}

const FAITS: PartFacts = {
  everyone: "Organisation: Démo.",
  private: "You: Léa Martin (lea), member of Démo.",
  teams: ["Team Ventes."],
  teamConnectors: [["Connectors (the team that runs each call unless the procedure's place says otherwise):", "mail: team Ventes (write)"]],
  connectors: [],
}

const TETES = {
  toutLeMonde: `## Context: everyone (contexte)\n${FAITS.everyone}`,
  prive: `## Context: you only (private/lea/contexte)\n${FAITS.private}`,
  ventes: ["## Context: team Ventes (ventes/contexte)", FAITS.teams[0], ...FAITS.teamConnectors[0]].join("\n"),
}

describe("partiesDuContexte (AC-13, parity with renderContext)", () => {
  it("should cut the served text by the report: full, replaced, cut and omitted parts, then the budget notice", () => {
    const blocs: ContextBlock[] = [
      { name: "code", text: "ctx: XXXX-XXXX" },
      { name: "procedure", text: lignes("procédure", 400), fallback: "Read it with demo_read." },
      { name: "contexte", text: lignes("tout le monde", 200), path: "contexte" },
      { name: "news", text: lignes("nouveau", 5) },
      // Deux blocs omis : un bloc vide n'avance pas la découpe (garde `bloc.chars > 0`) ; sans elle, le second
      // décalerait l'avis de deux caractères.
      { name: "procedures", text: lignes("procédures", 5) },
    ]
    const { parties, reste } = confronter(blocs, 4_000)
    expect(parties.map((partie) => [partie.name, partie.status])).toEqual([
      ["code", "full"],
      ["procedure", "replaced"],
      ["contexte", "cut"],
      ["news", "omitted"],
      ["procedures", "omitted"],
    ])
    expect(parties[1].texte).toBe("Read it with demo_read.")
    // Une partie de Contexte coupée par le plafond finit par son pointeur (E11-S03, AC-b4).
    const pointeur = '\nThis context is cut: everything served together exceeds 4,000 characters. Read the rest: demo_read {"path": "contexte"}.'
    expect(parties[2].texte.endsWith(pointeur)).toBe(true)
    expect(blocs[2].text.startsWith(parties[2].texte.slice(0, -pointeur.length))).toBe(true)
    expect(parties[3].texte).toBe("")
    expect(parties[4].texte).toBe("")
    expect(reste).toBe("[Context budget reached. Omitted: contexte (cut), news, procedures. Use demo_find or demo_read for more.]")
  })

  it("should follow the engine when the notice is longer than its reserve and the text recedes", () => {
    // Le seul bloc coupé porte un nom plus long que la réserve de la ligne finale : l'avis la dépasse, le texte
    // recule d'autant (`recededReport`), sous les 1 260 caractères qu'il occupait.
    const blocs: ContextBlock[] = [
      { name: "code", text: "ctx: XXXX-XXXX" },
      { name: "x".repeat(400), text: lignes("organisation", 60) },
    ]
    const { report, parties, reste } = confronter(blocs, 1_500)
    expect(report[1].status).toBe("cut")
    expect("ctx: XXXX-XXXX\n\n".length + report[1].chars).toBeLessThanOrEqual(1_500 - `\n\n${reste}`.length)
    expect(parties[1].texte.length).toBe(report[1].chars)
  })

  it("should give a text without notice no remainder, and every part in order", () => {
    const { parties, reste } = confronter([{ name: "code", text: "ctx: XXXX-XXXX" }, { name: "news", text: "## What's new\nTarifs" }], 20_000)
    expect(parties.map((partie) => partie.texte)).toEqual(["ctx: XXXX-XXXX", "## What's new\nTarifs"])
    expect(reste).toBe("")
  })
})

describe("partiesDuContexte, the head of a part (E05-S12, AC-4, AC-7)", () => {
  it("should read as head the header, facts and connectors the server's parts give, and the Contexte below as the rest", () => {
    const corps = new Map([
      ["contexte", { text: "Nous vendons des logiciels.", listsCut: false }],
      ["ventes/contexte", { text: "Tutoie les clients.", listsCut: false }],
    ])
    const { parties } = confronter([{ name: "code", text: "ctx: XXXX-XXXX" }, ...contextParts(LEA, FAITS, corps), { name: "news", text: "## What's new\nTarifs" }], 20_000)
    expect(parties.map((partie) => [partie.name, partie.tete, partie.suite])).toEqual([
      ["code", "", "ctx: XXXX-XXXX"],
      ["contexte", TETES.toutLeMonde, "Nous vendons des logiciels."],
      // Le Privé n'est pas servi (absent, brouillon, illisible) : sa tête seule.
      ["private/lea/contexte", TETES.prive, ""],
      ["ventes/contexte", TETES.ventes, "Tutoie les clients."],
      ["news", "", "## What's new\nTarifs"],
    ])
  })

  it("should keep only the part of the head the receded text still includes", () => {
    // Un nom plus long que la réserve de l'avis fait reculer le texte : la tête du Contexte coupé tient en partie.
    const blocs: ContextBlock[] = [
      { name: "code", text: "ctx: XXXX-XXXX" },
      { name: `${"x".repeat(400)}/contexte`, text: `${lignes("tête", 150)}\nCorps.`, head: lignes("tête", 150).length },
    ]
    const { report, parties } = confronter(blocs, 1_500)
    expect(report[1].head).toBe(report[1].chars)
    expect(parties[1].tete).toBe(parties[1].texte)
    expect(parties[1].suite).toBe("")
  })

  // E11-S03 (AC-b2, AC-b4, AC-b5) : les deux pointeurs du service, reconnus par leurs constantes, jamais montrés bruts.
  it("should read the pointer of stopped lists and the pointer of the cap as the end of the part", () => {
    const listes = contextParts(LEA, FAITS, new Map([["ventes/contexte", { text: "Tutoie les clients.", listsCut: true }]]))
    const arretees = confronter([{ name: "code", text: "ctx: XXXX-XXXX" }, ...listes], 35_000).parties.find((partie) => partie.name === "ventes/contexte")
    const longues = contextParts(LEA, FAITS, new Map([["contexte", { text: lignes("Règle", 400), listsCut: false }]]))
    const coupee = confronter([{ name: "code", text: "ctx: XXXX-XXXX" }, ...longues], 3_000).parties.find((partie) => partie.name === "contexte")
    expect(coupee?.status).toBe("cut")
    expect(coupee?.suite.split("\n").at(-1)).toBe('This context is cut: everything served together exceeds 3,000 characters. Read the rest: demo_read {"path": "contexte"}.')
    for (const partie of [arretees, coupee]) {
      const morceaux = morceauxDuContexte(partie?.suite ?? "")
      expect(morceaux.at(-1)).toEqual({ genre: "phrase", phrase: "suite" })
      expect(JSON.stringify(morceaux)).not.toContain("Read the rest")
    }
  })

  it("should read a report without head (before E05-S12) as a part without head", () => {
    const { parties } = partiesDuContexte({ text: "## Context: everyone (contexte)\nNous vendons.", blocks: [{ name: "contexte", chars: 45, status: "full", path: "contexte" }] })
    expect([parties[0].tete, parties[0].suite]).toEqual(["", "## Context: everyone (contexte)\nNous vendons."])
  })
})

describe("ancreDeLaPartie (AC-11, HN-E05S11-9 ; E05-S12, AC-8, HN-E05S12-10 ; E11-S07, AC-c1)", () => {
  it.each([
    [{ name: "news" }, "news"],
    [{ name: "procedures" }, "procedures"],
    [{ name: "recent content" }, "recent-content"],
    // Une partie de Contexte par son nom, servie ou non.
    [{ name: "contexte" }, "everyone-context"],
    [{ name: "private/lea/contexte" }, "private-context"],
    [{ name: "private" }, "private-context"],
    [{ name: "ventes/contexte" }, "context-ventes"],
    // Une équipe au slug `everyone` ne prend pas l'ancre de Tout le monde.
    [{ name: "everyone/contexte" }, "context-everyone"],
    // Le bloc `code`, que rien n'affiche plus (HN-E11S07-11), et les anciens blocs n'ont plus d'ancre propre ; un nom
    // inconnu, son rang.
    [{ name: "code" }, "part-5"],
    [{ name: "person" }, "part-5"],
    [{ name: "calendar" }, "part-5"],
  ])("should anchor %o at #%s", (bloc, ancre) => {
    expect(ancreDeLaPartie(bloc, 4)).toBe(ancre)
  })
})

describe("cheminDuContexte (E05-S12, AC-7)", () => {
  it.each([
    [{ name: "contexte" }, "contexte"],
    [{ name: "private/lea/contexte" }, "private/lea/contexte"],
    [{ name: "ventes/contexte" }, "ventes/contexte"],
    // Le Privé sans `handle` n'a pas de nœud ; les autres blocs ne sont pas des Contextes.
    [{ name: "private" }, null],
    [{ name: "code" }, null],
    [{ name: "recent content" }, null],
    [{ name: "ventes/contexte-bis" }, null],
  ])("should give %o the path %s", (bloc, chemin) => {
    expect(cheminDuContexte(bloc)).toBe(chemin)
  })
})
