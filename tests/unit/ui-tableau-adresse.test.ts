// @vitest-environment node
// Les réglages de la grille dans l'adresse (E07-S03, AC4, AC6 ; H95, HN-E07S03-4) : `reglagesDepuisLAdresse`
// et `adresseDesReglages`, fonctions pures, sur l'en-tête de la fixture d'E07-S01.
import { describe, expect, it } from "vitest"
import type { TableHeader } from "@otomata_tech/oto_platform/schemas"
import { adresseDesReglages, reglagesDepuisLAdresse } from "@otomata_tech/oto_platform/ui"
import { PROSPECTS_HEADER } from "../factories/table-fixture"

// L'en-tête de la fixture est écrit en objet littéral : ses types de colonne y sont des chaînes.
const ENTETE = PROSPECTS_HEADER as TableHeader

describe("reglagesDepuisLAdresse, sort (AC4 ; E11-S07, AC-b4)", () => {
  it("should read sort as ascending, -sort as descending, and ignore an unknown column with the notice", () => {
    expect(reglagesDepuisLAdresse({ sort: "montant_estime" }, ENTETE)).toMatchObject({ tri: { colonne: "montant_estime", sens: "asc" }, ignores: false })
    expect(reglagesDepuisLAdresse({ sort: "-montant_estime" }, ENTETE)).toMatchObject({ tri: { colonne: "montant_estime", sens: "desc" }, ignores: false })
    expect(reglagesDepuisLAdresse({ sort: "couleur" }, ENTETE)).toMatchObject({ tri: null, ignores: true })
  })
})

describe("reglagesDepuisLAdresse, filtres (AC6)", () => {
  it("should translate the six operations into the H95 grammar", () => {
    const table: [string, Record<string, Record<string, unknown>>][] = [
      ["ville:contains:Valbrune", { ville: { contains: "Valbrune" } }],
      ["statut:eq:à revoir", { statut: { eq: "à revoir" } }],
      ["actif:eq:false", { actif: { eq: false } }],
      ["montant_estime:gte:10000", { montant_estime: { gte: 10000 } }],
      ["dernier_contact:lte:2026-06-30", { dernier_contact: { lte: "2026-06-30" } }],
      ["email:empty:", { email: { empty: true } }],
      ["contact:not_empty", { contact: { not_empty: true } }],
    ]
    for (const [f, filtre] of table) expect(reglagesDepuisLAdresse({ f }, ENTETE), f).toMatchObject({ filtre, ignores: false })
  })

  it("should ignore a clause in the former French grammar with the notice, and a former French sort without it (E11-S07, AC-b4)", () => {
    for (const f of ["ville:contient:Valbrune", "actif:egal:oui", "email:vide:", "montant_estime:min:10000"]) {
      expect(reglagesDepuisLAdresse({ f }, ENTETE), f).toMatchObject({ clauses: [], filtre: undefined, ignores: true })
    }
    expect(reglagesDepuisLAdresse({ tri: "montant_estime" }, ENTETE)).toMatchObject({ tri: null, ignores: false })
  })

  it("should keep a value holding « : », give a Paris time its offset, and merge the bounds of one column", () => {
    const lus = reglagesDepuisLAdresse({ f: ["notes:contains:rappel : octobre", "relance_le:gte:2026-09-30T10:00", "montant_estime:lte:50000", "montant_estime:gte:5000"] }, ENTETE)
    expect(lus.filtre).toEqual({
      notes: { contains: "rappel : octobre" },
      relance_le: { gte: "2026-09-30T10:00:00+02:00" },
      montant_estime: { lte: 50000, gte: 5000 },
    })
    expect(lus.ignores).toBe(false)
    // L'heure de Paris d'un jour de changement d'heure prend le décalage de l'instant saisi, pas celui de
    // la même heure lue en UTC ; une date que le service accepte (année 50) ne l'est pas moins ici.
    const bords = reglagesDepuisLAdresse({ f: ["relance_le:gte:2026-03-29T01:30", "relance_le:lte:2026-10-25T01:30", "dernier_contact:lte:0050-01-01"] }, ENTETE)
    expect([bords.filtre, bords.ignores]).toEqual([{ relance_le: { gte: "2026-03-29T01:30:00+01:00", lte: "2026-10-25T01:30:00+02:00" }, dernier_contact: { lte: "0050-01-01" } }, false])
  })

  it("should ignore an unreadable clause with the notice: unknown column, operation or option, a value of the wrong type", () => {
    const illisibles = ["couleur:contains:bleu", "ville:gte:3", "statut:eq:gagné", "montant_estime:gte:beaucoup", "dernier_contact:gte:2026-02-30", "ville:contains: "]
    for (const f of illisibles) expect(reglagesDepuisLAdresse({ f }, ENTETE), f).toMatchObject({ clauses: [], filtre: undefined, ignores: true })
  })

  it("should keep 30 clauses at most, and one per column and operation, and say it", () => {
    const textes = ["entreprise", "contact", "ville", "notes", "email"].flatMap((colonne) => [`${colonne}:contains:a`, `${colonne}:empty:`, `${colonne}:not_empty:`])
    const bornes = [
      ["montant_estime", "1", "2"],
      ["dernier_contact", "2026-01-01", "2026-12-31"],
      ["relance_le", "2026-01-01T08:00", "2026-12-31T18:00"],
    ].flatMap(([colonne, min, max]) => [`${colonne}:gte:${min}`, `${colonne}:lte:${max}`, `${colonne}:empty:`, `${colonne}:not_empty:`])
    const f = [...textes, ...bornes, "actif:eq:true", "actif:empty:", "actif:not_empty:", "statut:eq:à traiter"]
    expect(f).toHaveLength(31)
    const lus = reglagesDepuisLAdresse({ f }, ENTETE)
    expect([lus.clauses.length, lus.clauses.some((clause) => clause.colonne === "statut"), lus.ignores]).toEqual([30, false, true])

    const double = reglagesDepuisLAdresse({ f: ["ville:contains:a", "ville:contains:b"] }, ENTETE)
    expect([double.clauses, double.ignores]).toEqual([[{ colonne: "ville", operation: "contains", valeur: "a" }], true])
  })

  it("should replace the clauses of a column by the fields of its « Filtrer » form, and ask for the rewrite", () => {
    const lus = reglagesDepuisLAdresse({ f: ["ville:contains:Coudray", "contact:not_empty:"], column: "ville", contains: " Valbrune ", presence: "not_empty" }, ENTETE)
    expect(lus.clauses).toEqual([
      { colonne: "contact", operation: "not_empty", valeur: "" },
      { colonne: "ville", operation: "contains", valeur: "Valbrune" },
      { colonne: "ville", operation: "not_empty", valeur: "" },
    ])
    expect(lus).toMatchObject({ aReecrire: true, ignores: false })
  })

  it("should write the settings back into the same address, and read them again unchanged", () => {
    const parametres = { q: "valbrune", sort: "-montant_estime", f: ["ville:contains:Valbrune", "statut:eq:à revoir"], n: "60" }
    const lus = reglagesDepuisLAdresse(parametres, ENTETE)
    const adresse = adresseDesReglages(lus)
    expect(adresse).toBe("q=valbrune&sort=-montant_estime&f=ville%3Acontains%3AValbrune&f=statut%3Aeq%3A%C3%A0+revoir&n=60")
    const relue = new URLSearchParams(adresse)
    expect(reglagesDepuisLAdresse({ q: relue.get("q") ?? undefined, sort: relue.get("sort") ?? undefined, f: relue.getAll("f"), n: relue.get("n") ?? undefined }, ENTETE)).toEqual(lus)
    expect(adresseDesReglages({ q: null, tri: null, clauses: [], n: 20 })).toBe("")
  })
})

describe("reglagesDepuisLAdresse, hostile addresses (security-patterns.md § Validation des inputs)", () => {
  it("should read each hostile address of the largest size a client sends in under 250 ms", () => {
    // Une adresse tient en 16 000 caractères : chaque valeur hostile en prend autant, les champs d'un
    // formulaire « Filtrer » compris, qu'aucune borne ne coupe avant l'analyse.
    const taille = 16_000
    const chiffres = "9".repeat(taille)
    const cas: [string, Record<string, string | string[]>][] = [
      ["digits in the f bounds of a date and a datetime", { f: [`dernier_contact:min:${chiffres}`, `relance_le:max:${chiffres}`] }],
      ["digits in the min and max fields of a date", { column: "dernier_contact", min: chiffres, max: `2026-01-01${chiffres}` }],
      ["digits in the min and max fields of a datetime", { column: "relance_le", min: chiffres, max: `2026-01-01T${chiffres}` }],
      ["30 f entries of 300 « : »", { f: Array.from({ length: 30 }, () => ":".repeat(300)) }],
      ["a search of spaces", { q: " ".repeat(taille) }],
      ["a very long « contains » field", { column: "ville", contains: `${"a :".repeat(taille / 3)}`, presence: " ".repeat(taille) }],
      ["a very long sort and form column", { sort: `-${"a".repeat(taille)}`, column: "a".repeat(taille), n: chiffres }],
    ]
    for (const [nom, parametres] of cas) {
      const debut = performance.now()
      reglagesDepuisLAdresse(parametres, ENTETE)
      expect(performance.now() - debut, nom).toBeLessThan(250)
    }
  })
})
