import { describe, expect, it } from "vitest"
import { linksIn } from "../../packages/plateforme/schemas/link-syntax"
import { citationAuCurseur, lienVers } from "../../packages/plateforme/ui/noeud/editeur/citer"
import { segmentsEnLigne } from "../../packages/plateforme/ui/noeud/en-ligne"

// Les liens d'un bloc (E05-S10) : une adresse collée devient un lien, coupée au milieu à l'écran (AC-a8 ; E11-S15, AC-b10) ;
// « @ » lit la citation que le curseur termine et insère le lien `[[chemin|titre]]` que la publication extrait (AC-a9).

describe("adresse web dans un bloc (AC-a8)", () => {
  it("should read a pasted address as a web link outside code and internal links, without its closing punctuation", () => {
    const longue = "https://docs.exemple.fr/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit?usp=sharing"
    expect(segmentsEnLigne(`Voir ${longue}. Et [[ventes/tarifs]], puis \`https://code.exemple\`.`)).toEqual([
      { genre: "texte", texte: "Voir " },
      { genre: "web", adresse: longue, libelle: "https://docs.exemple.fr/…tUvWxYz/edit" },
      { genre: "texte", texte: ". Et " },
      { genre: "lien", chemin: "ventes/tarifs", reference: null, libelle: "" },
      { genre: "texte", texte: ", puis " },
      { genre: "code", texte: "https://code.exemple" },
      { genre: "texte", texte: "." },
    ])
    // Un souligné dans une adresse n'ouvre pas d'italique.
    expect(segmentsEnLigne("a https://x.fr/_b_ c").map((segment) => segment.genre)).toEqual(["texte", "web", "texte"])
  })

})

describe("« @ » dans un bloc (AC-a9)", () => {
  it("should read the citation the caret ends, after a blank or at the start, and nothing in an address or after a blank", () => {
    expect(citationAuCurseur("@tar", 4)).toEqual({ debut: 0, requete: "tar" })
    expect(citationAuCurseur("Voir @tarifs", 12)).toEqual({ debut: 5, requete: "tarifs" })
    expect(citationAuCurseur("Voir @", 6)).toEqual({ debut: 5, requete: "" })
    expect(citationAuCurseur("jean@exemple", 12)).toBeNull()
    expect(citationAuCurseur("@tarifs puis", 12)).toBeNull()
    expect(citationAuCurseur("Voir @tarifs et", 12)).toEqual({ debut: 5, requete: "tarifs" })
  })

  it("should insert a link by path with the title as its label, that the publication extracts", () => {
    // Un `]` du titre fermerait le lien : il devient un blanc.
    const lien = lienVers({ path: "ventes/grille_tarifaire", title: "Grille [tarifaire]" })
    expect(lien).toBe("[[ventes/grille_tarifaire|Grille [tarifaire]]")
    expect(linksIn(`Voir ${lien}.`).map((trouve) => trouve.link)).toEqual([{ path: "ventes/grille_tarifaire", key: null, label: "Grille [tarifaire" }])
    expect(segmentsEnLigne(lien)).toEqual([{ genre: "lien", chemin: "ventes/grille_tarifaire", reference: null, libelle: "Grille [tarifaire" }])
  })
})
