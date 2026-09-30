import { describe, expect, it } from "vitest"
import { aDuBalisage, segmentsEnLigne, texteLu, type Segment } from "../../packages/plateforme/ui/noeud/en-ligne"
import { TEMPS_LINEAIRE_MS } from "../helpers/temps-lineaire"

// Les marques en ligne d'E10-S04 (AC-c1) : barré, échappements, `<br>`, une marque dans une marque d'un autre
// caractère sur deux niveaux, `<https://…>` ; tout autre HTML reste du texte, que React échappe ; `texteLu`
// les retire. Les segments se lisent par une écriture compacte (`vu`) : le découpage du texte en segments
// voisins n'est pas le sujet.

/** Les segments en une ligne : `<s>`, `<b>`, `<i>`, `<code>`, `<web adresse|libellé>`, `<br>`, le texte tel quel. */
function vu(segments: readonly Segment[]): string {
  return segments
    .map((segment) => {
      if (segment.genre === "barre") return `<s>${vu(segment.contenu)}</s>`
      if (segment.genre === "gras") return `<b>${vu(segment.contenu)}</b>`
      if (segment.genre === "italique") return `<i>${vu(segment.contenu)}</i>`
      if (segment.genre === "saut") return "<br>"
      if (segment.genre === "code") return `<code>${segment.texte}</code>`
      if (segment.genre === "web") return `<web ${segment.adresse}|${segment.libelle}>`
      if (segment.genre === "lien") return `<lien ${segment.chemin}>`
      return segment.texte
    })
    .join("")
}

describe("segmentsEnLigne — marks of E10-S04 (AC-c1)", () => {
  it.each([
    ["~~barré~~ et ~~ pas~~", "<s>barré</s> et ~~ pas~~"],
    ["\\*pas italique\\* \\_ \\| \\` \\[ \\~ \\< \\\\*a*", "*pas italique* _ | ` [ ~ < \\<i>a</i>"],
    ["`\\*` reste \\*", "<code>\\*</code> reste *"],
    ["un<br>deux<br/>trois<br />quatre<BR>", "un<br>deux<br>trois<br>quatre<br>"],
    ["**gras _italique_**", "<b>gras <i>italique</i></b>"],
    ["_italique **gras**_", "<i>italique <b>gras</b></i>"],
    ["~~barré **gras**~~", "<s>barré <b>gras</b></s>"],
    ["**a _b ~~c~~_**", "<b>a <i>b ~~c~~</i></b>"],
    ["<https://www.exemple.test/a> et \\<https://b.test>", "<web https://www.exemple.test/a|https://www.exemple.test/a> et <<web https://b.test|https://b.test>>"],
    ["<u>souligné</u> <script>alert(1)</script>", "<u>souligné</u> <script>alert(1)</script>"],
    ["| a \\| b |", "| a | b |"],
    ["\\[[ventes/devis]] et [[ventes/suivi]]", "[[ventes/devis]] et <lien ventes/suivi>"],
  ])("should read %j", (texte, attendu) => {
    expect(vu(segmentsEnLigne(texte))).toBe(attendu)
  })

  it("should keep other HTML as text, never as an element (HTML escaped)", () => {
    const segments = segmentsEnLigne("<img src=x onerror=alert(1)> <details>")
    expect(segments).toEqual([{ genre: "texte", texte: "<img src=x onerror=alert(1)> <details>" }])
  })

  it("should read the marks out of texteLu, a line break as a space", () => {
    expect(texteLu("~~vieux~~ **prix _net_**<br>\\*total\\* <https://www.exemple.test>")).toBe("vieux prix net *total* https://www.exemple.test")
  })

  it("should read hostile texts in linear time", () => {
    const borne = 100_000
    const jusquA = (motif: string) => motif.repeat(Math.floor(borne / motif.length))
    for (const texte of [jusquA("~~"), jusquA("~"), jusquA("**_"), jusquA("_**"), jusquA("\\"), jusquA("\\*"), jusquA("<br"), jusquA("<https://a"), jusquA("~~a **b _c")]) {
      const debut = performance.now()
      segmentsEnLigne(texte)
      expect(performance.now() - debut, texte.slice(0, 12)).toBeLessThan(TEMPS_LINEAIRE_MS)
    }
  })
})

// E11-S15 (AC-b6) : l'éditeur rend au repos tout texte dont le rendu diffère de sa source, marqué sans lien compris.
describe("aDuBalisage (E11-S15, AC-b6)", () => {
  it.each([
    ["Un **gras** ici", true],
    ["**tout**", true],
    ["*un* et _deux_", true],
    ["du `code`", true],
    ["~~barré~~", true],
    ["Voir [[ventes/tarifs]]", true],
    ["a\\*b", true],
    ["un<br>deux", true],
    ["Texte simple, 2 * 3 * 4", false],
    ["modele_relance et {{first_name}}", false],
    ["<b>gras en HTML</b>", false],
    ["", false],
  ])("should say whether %j reads otherwise than its source", (texte, attendu) => {
    expect(aDuBalisage(texte)).toBe(attendu)
  })

  it("should read hostile texts in linear time", () => {
    const borne = 100_000
    const jusquA = (motif: string) => motif.repeat(Math.floor(borne / motif.length))
    for (const texte of [jusquA("**"), jusquA("*a"), jusquA("_ "), jusquA("`"), jusquA("~~a **b _c")]) {
      const debut = performance.now()
      aDuBalisage(texte)
      expect(performance.now() - debut, texte.slice(0, 12)).toBeLessThan(TEMPS_LINEAIRE_MS)
    }
  })
})
