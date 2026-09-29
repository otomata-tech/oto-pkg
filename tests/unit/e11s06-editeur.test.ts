import { describe, expect, it } from "vitest"
import { liensDuTexte, type CiblesDesLiens } from "../../packages/plateforme/ui/noeud/en-ligne"
import { avecLeLien, sansLeLien, type LienVoulu } from "../../packages/plateforme/ui/noeud/editeur/lien-du-bloc"

// Le panneau « Lien » de l'éditeur (E11-S06, lot b), en fonctions pures : les liens d'un texte et leurs bornes, lus
// comme l'écran les rend ; le lien réécrit par « Appliquer », seul, relu avant d'être écrit (AC-b4, AC-b5) ; le lien
// retiré (AC-b6). La linéarité de la lecture est prouvée sur `segmentsEnLigne` (`ui-en-ligne.test.ts`), que
// `liensDuTexte` parcourt une fois. Les repères des listes (lot a) se lisent dans l'éditeur rendu :
// `tests/integration/components/e11s06-editeur.test.tsx`, et `numerosDeGouttiere` dans `ui-editeur-blocs-de-page.test.ts`.

/** Le lien de rang `rang` d'un texte, tel que le panneau l'ouvre dans un bloc qui n'est pas une liste. */
function ouvert(texte: string, rang = 0) {
  const lu = liensDuTexte(texte)[rang]
  return { lu, source: texte.slice(lu.debut, lu.fin), parLigne: false }
}

const page = (libelle: string, chemin: string | null = "ventes/grille", reference: string | null = null): LienVoulu => ({ vers: "page", chemin, reference, libelle })
const web = (adresse: string, libelle = ""): LienVoulu => ({ vers: "web", adresse, libelle })

describe("liensDuTexte", () => {
  it("should give each link its bounds in the source and its written form, a link in bold included", () => {
    const texte = "a [[a/b]] b [[a/b#k|L]] c [t](https://x.fr) d https://y.fr e <https://z.fr> f **[[g/h]]**"
    expect(liensDuTexte(texte).map(({ debut, fin, forme }) => [texte.slice(debut, fin), forme])).toEqual([
      ["[[a/b]]", "page"],
      ["[[a/b#k|L]]", "page"],
      ["[t](https://x.fr)", "web-libelle"],
      ["https://y.fr", "web-nu"],
      ["<https://z.fr>", "web-nu"],
      ["[[g/h]]", "page"],
    ])
    expect(liensDuTexte(texte)[1].lien).toEqual({ genre: "lien", chemin: "a/b", reference: "k", libelle: "L" })
  })

  it("should read no link in a code span nor behind an escaped bracket", () => {
    expect(liensDuTexte("`[[a/b]]` puis \\[[a/b]] puis `https://x.fr`")).toEqual([])
  })
})

describe("avecLeLien (AC-b4, AC-b5)", () => {
  const texte = "Avant [[ventes/grille#k1|Grille]] après"

  it("should rewrite the page link alone, keeping the rest of the text byte for byte, the key given, the label trimmed or gone", () => {
    expect(avecLeLien(texte, ouvert(texte), page("  Tarifs ", "ventes/grille", "k1"))).toEqual({ texte: "Avant [[ventes/grille#k1|Tarifs]] après", curseur: 33 })
    expect(avecLeLien(texte, ouvert(texte), page("", "ventes/remises"))).toEqual({ texte: "Avant [[ventes/remises]] après", curseur: 24 })
  })

  it("should write a web address with its label, or bare without one", () => {
    const nue = "Voir https://a.fr ici"
    expect(avecLeLien(nue, ouvert(nue), web("https://b.fr/x", "Doc"))).toEqual({ texte: "Voir [Doc](https://b.fr/x) ici", curseur: 26 })
    expect(avecLeLien(texte, ouvert(texte), web("https://b.fr/x"))).toEqual({ texte: "Avant https://b.fr/x après", curseur: 20 })
  })

  it("should neutralise brackets and line breaks of the label, the rewritten text reading a single link", () => {
    const ecrit = avecLeLien(texte, ouvert(texte), page("a]](x[y\nz"))
    expect(ecrit).toEqual({ texte: "Avant [[ventes/grille|a  (x y z]] après", curseur: 33 })
    if ("refus" in ecrit) throw new Error("écrit attendu")
    expect(liensDuTexte(ecrit.texte)).toHaveLength(1)
  })

  it("should refuse a label over 200 characters, and take one of 200", () => {
    expect(avecLeLien(texte, ouvert(texte), page("é".repeat(201)))).toEqual({ refus: "libelleLong" })
    expect(avecLeLien(texte, ouvert(texte), page("é".repeat(200)))).not.toHaveProperty("refus")
  })

  it.each(["http://a.fr", "javascript:alert(1)", 'https://a.fr" onmouseover=alert(1)', "https://a b.fr", "https://a.fr.", "data:text/html,x"])("should never write the address %s", (adresse) => {
    expect(avecLeLien(texte, ouvert(texte), web(adresse, "Doc"))).toEqual({ refus: "adresse" })
  })

  it("should refuse a page destination with no page chosen, a link no longer in its place, and a link that would not read back", () => {
    expect(avecLeLien(texte, ouvert(texte), page("Grille", null))).toEqual({ refus: "page" })
    expect(avecLeLien(`${texte}!`.replace("Grille", "Grilles"), ouvert(texte), page("Grille"))).toEqual({ refus: "change" })
    // Un accent grave du libellé s'apparie avec celui du code qui suit : le lien ne se relirait plus.
    const avecCode = "[[ventes/grille|x]] puis `code`"
    expect(avecLeLien(avecCode, ouvert(avecCode), page("y`z"))).toEqual({ refus: "illisible" })
  })

  it("should read back the link of a list item in its line, as the copy renders it, where the whole text sees code", () => {
    // Un accent grave ouvert sur le premier élément se ferme sur le second : lu entier, le texte n'a pas de lien.
    const liste = "a `b\nVoir [[ventes/grille|Grille]] c`"
    expect(liensDuTexte(liste)).toEqual([])
    const depart = liste.indexOf("\n") + 1
    const lu = liensDuTexte(liste.slice(depart))[0]
    const dansLaLigne = { lu: { ...lu, debut: lu.debut + depart, fin: lu.fin + depart }, source: "[[ventes/grille|Grille]]" }
    expect(avecLeLien(liste, { ...dansLaLigne, parLigne: true }, page("Tarifs"))).toEqual({
      texte: "a `b\nVoir [[ventes/grille|Tarifs]] c`",
      curseur: "a `b\nVoir [[ventes/grille|Tarifs]]".length,
    })
    expect(avecLeLien(liste, { ...dansLaLigne, parLigne: false }, page("Tarifs"))).toEqual({ refus: "illisible" })
  })
})

describe("sansLeLien (AC-b6)", () => {
  it("should replace the link by the text it shows: its label, the known title of its page, or its last segment", () => {
    const libelle = "Voir [[prive/moi/taches|Mes tâches]] !"
    expect(sansLeLien(libelle, ouvert(libelle))).toEqual({ texte: "Voir Mes tâches !", curseur: 15 })
    const nu = "Voir [[prive/moi/taches]] !"
    const cibles: CiblesDesLiens = { "prive/moi/taches": { titre: "Tâches de la semaine", chemin: "prive/moi/taches" } }
    expect(sansLeLien(nu, ouvert(nu), cibles)).toEqual({ texte: "Voir Tâches de la semaine !", curseur: 25 })
    expect(sansLeLien(nu, ouvert(nu))).toEqual({ texte: "Voir taches !", curseur: 11 })
    const webLibelle = "Voir [la doc](https://x.fr) !"
    expect(sansLeLien(webLibelle, ouvert(webLibelle))).toEqual({ texte: "Voir la doc !", curseur: 11 })
  })
})
