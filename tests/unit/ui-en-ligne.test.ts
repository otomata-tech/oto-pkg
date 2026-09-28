import { describe, expect, it } from "vitest"
import { estUnTableau, libelleDUneAdresse, segmentsEnLigne, titreDuLien } from "../../packages/plateforme/ui/noeud/en-ligne"
import { TEMPS_LINEAIRE_MS } from "../helpers/temps-lineaire"

// Le texte en ligne d'un bloc (E05-S02, AC5) et le tableau markdown d'un paragraphe (AC4). Les liens et
// le code se lisent par `schemas/link-syntax.ts`, comme la publication les lit (M15) : le test de parité
// avec `extractLinks` (HN-E05S02-26) est retiré, les deux lecteurs n'en faisant plus qu'un. E05-S11 (retour 11,
// fiche D107) : un lien se lit par son titre, une adresse par le texte de son lien ou, nue, par son domaine.

describe("segmentsEnLigne (AC5)", () => {
  it.each<[string, ReturnType<typeof segmentsEnLigne>]>([
    ["**gras** et *italique*", [{ genre: "gras", contenu: [{ genre: "texte", texte: "gras" }] }, { genre: "texte", texte: " et " }, { genre: "italique", contenu: [{ genre: "texte", texte: "italique" }] }]],
    ["_souligné_ puis `code **brut**`", [{ genre: "italique", contenu: [{ genre: "texte", texte: "souligné" }] }, { genre: "texte", texte: " puis " }, { genre: "code", texte: "code **brut**" }]],
    ["**Voir [[ventes/grille]]**", [{ genre: "gras", contenu: [{ genre: "texte", texte: "Voir " }, { genre: "lien", chemin: "ventes/grille", reference: null, libelle: "" }] }]],
    ["Bonjour {{first_name}}, 2 * 3 * 4", [{ genre: "texte", texte: "Bonjour {{first_name}}, 2 * 3 * 4" }]],
    ["Voir [[ventes/grille]].", [{ genre: "texte", texte: "Voir " }, { genre: "lien", chemin: "ventes/grille", reference: null, libelle: "" }, { genre: "texte", texte: "." }]],
    ["[[ventes/grille|la grille]]", [{ genre: "lien", chemin: "ventes/grille", reference: null, libelle: "la grille" }]],
    ["[[ventes/grille#tarifs]]", [{ genre: "lien", chemin: "ventes/grille", reference: "tarifs", libelle: "" }]],
    ["[[ventes/grille#tarifs|les tarifs]]", [{ genre: "lien", chemin: "ventes/grille", reference: "tarifs", libelle: "les tarifs" }]],
    // Ni HTML ni lien interne mal formé : le texte reste tel quel ; un lien markdown vers le web se lit par son texte (E05-S11).
    ["[[Ventes/Grille]] et [le site](https://exemple.test) <b>gras</b>", [{ genre: "texte", texte: "[[Ventes/Grille]] et " }, { genre: "web", adresse: "https://exemple.test", libelle: "le site" }, { genre: "texte", texte: " <b>gras</b>" }]],
    // Un lien markdown dans du code reste du code ; une adresse nue se lit par son domaine.
    ["`[a](https://a.fr)` puis https://www.b.fr/c", [{ genre: "code", texte: "[a](https://a.fr)" }, { genre: "texte", texte: " puis " }, { genre: "web", adresse: "https://www.b.fr/c", libelle: "b.fr" }]],
    // Une suite d'accents graves n'est fermée que par la suivante de même longueur, comme la publication la lit (N70, M15).
    ["``a`[[ventes/grille]]`", [{ genre: "texte", texte: "``a" }, { genre: "code", texte: "[[ventes/grille]]" }]],
  ])("should read %j", (texte, attendus) => {
    expect(segmentsEnLigne(texte)).toEqual(attendus)
  })

  it("should read long runs of backticks or brackets in linear time, where the service's expressions take seconds", () => {
    const debut = performance.now()
    expect(segmentsEnLigne("`".repeat(100_000))).toEqual([{ genre: "texte", texte: "`".repeat(100_000) }])
    expect(segmentsEnLigne("[".repeat(100_000))).toEqual([{ genre: "texte", texte: "[".repeat(100_000) }])
    expect(performance.now() - debut).toBeLessThan(TEMPS_LINEAIRE_MS)
  })

  // Les adresses web (E05-S10, AC-a8) à la borne d'un paragraphe (`blocks.text`, 100 000 caractères) : chaque
  // texte hostile en temps linéaire (`security-patterns.md § Validation des inputs`, revue 1 d'E05-S10).
  const BORNE = 100_000
  const jusquALaBorne = (motif: string) => motif.repeat(Math.floor(BORNE / motif.length))
  it.each<[string, string, (segments: ReturnType<typeof segmentsEnLigne>) => void]>([
    ["dots inside the address", `https://x.fr/${".".repeat(BORNE - 14)}a`, (segments) => expect(segments).toEqual([expect.objectContaining({ genre: "web", adresse: `https://x.fr/${".".repeat(BORNE - 14)}a` })])],
    ["closing punctuation to the end", `https://x.fr/${").".repeat(Math.floor((BORNE - 13) / 2))}`, (segments) => expect(segments[0]).toEqual({ genre: "web", adresse: "https://x.fr/", libelle: "x.fr" })],
    ["one schema after another", jusquALaBorne("https://"), (segments) => expect(segments).toHaveLength(1)],
    ["schemas that never open", jusquALaBorne("http:/"), (segments) => expect(segments).toEqual([{ genre: "texte", texte: jusquALaBorne("http:/") }])],
    ["addresses between code spans", jusquALaBorne("`a` https://a.fr "), (segments) => expect(segments.filter((segment) => segment.genre === "web")).toHaveLength(Math.floor(BORNE / 17))],
    ["addresses between marks", jusquALaBorne("*https://a.fr* _"), (segments) => expect(segments.length).toBeGreaterThan(1)],
    // Les liens markdown (E05-S11) : chaque classe exclut ce qui la ferme, et chaque adresse nue se range parmi eux en un parcours.
    ["markdown links that never close", jusquALaBorne("[a](https://a.fr "), (segments) => expect(segments.filter((segment) => segment.genre === "web")).toHaveLength(Math.floor(BORNE / 17))],
    ["markdown links one after another", jusquALaBorne("[a](https://a.fr)"), (segments) => expect(segments.every((segment) => segment.genre === "web" && segment.libelle === "a")).toBe(true)],
    ["brackets without a closing one", jusquALaBorne("[a"), (segments) => expect(segments).toEqual([{ genre: "texte", texte: jusquALaBorne("[a") }])],
  ])("should read %s in linear time", (_cas, texte, attendu) => {
    const debut = performance.now()
    const segments = segmentsEnLigne(texte)
    expect(performance.now() - debut).toBeLessThan(TEMPS_LINEAIRE_MS)
    attendu(segments)
  })
})

describe("titreDuLien (E05-S11, AC-27)", () => {
  it("should name a cited page by its written label, else the title the screen knows, else the last segment of its path, never the whole path", () => {
    const cibles = { "ventes/grille": { titre: "Grille tarifaire", chemin: "ventes/grille" }, "ventes/perdue": null }
    expect(titreDuLien({ chemin: "ventes/grille", libelle: "les tarifs" }, cibles)).toBe("les tarifs")
    expect(titreDuLien({ chemin: "ventes/grille", libelle: "" }, cibles)).toBe("Grille tarifaire")
    expect(titreDuLien({ chemin: "ventes/perdue", libelle: "" }, cibles)).toBe("perdue")
    expect(titreDuLien({ chemin: "ventes/inconnue", libelle: "" })).toBe("inconnue")
    // Un chemin qui porte le nom d'une propriété d'objet ne lit pas le prototype.
    expect(titreDuLien({ chemin: "constructor", libelle: "" }, cibles)).toBe("constructor")
  })
})

describe("libelleDUneAdresse (E05-S11, fiche D107)", () => {
  it.each([
    ["https://exemple.fr/devis", "exemple.fr"],
    ["https://www.exemple.fr/", "exemple.fr"],
    ["http://docs.exemple.fr/document/d/1AbC/edit?usp=sharing", "docs.exemple.fr"],
    // Une adresse à mot de passe se construit à l'exécution (testing-strategy.md § Anti-patterns : check:public).
    [`https://${["alice", "secret"].join(":")}@exemple.fr/`, "exemple.fr"],
  ])("should show %s by its domain alone", (adresse, libelle) => {
    expect(libelleDUneAdresse(adresse)).toBe(libelle)
  })
})

describe("estUnTableau (AC4)", () => {
  it("should see a markdown table in two lines or more that all start with |, never in one line", () => {
    expect(estUnTableau("| a | b |\n|---|---|\n| 1 | 2 |")).toBe(true)
    expect(estUnTableau("| a | b |")).toBe(false)
    expect(estUnTableau("| a | b |\nune phrase")).toBe(false)
  })
})
