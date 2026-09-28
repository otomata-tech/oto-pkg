// @vitest-environment node
// Règles pures des gestes du rail (E05-S10, partie e) : le segment tiré d'un titre (AC-b12), le titre d'une
// copie (AC-b10), l'ordre des frères (AC-b9). Sans base : fonctions pures du paquet. Le segment lit un texte
// du client (un titre de 200 caractères au plus) : un texte hostile de cette taille passe en moins de 250 ms
// (`security-patterns.md § Validation des inputs`).
import { describe, expect, it } from "vitest"
import { copyTitle } from "../../packages/plateforme/server/nodes/duplicate"
import { childPath, slugOf, titleSegment } from "../../packages/plateforme/server/nodes/segments"
import { compareSiblings } from "../../packages/plateforme/server/nodes/view"

describe("titleSegment", () => {
  it("should turn a title into a path segment, sans_titre without letter nor digit", () => {
    expect(["Tarifs 2026", "Œuvres d'Été — bilan", "  __Déjà__vu__  ", "???", "Sans titre"].map(titleSegment)).toEqual([
      "tarifs_2026",
      "oeuvres_d_ete_bilan",
      "deja_vu",
      "sans_titre",
      "sans_titre",
    ])
  })

  it("should cut a long title to 60 characters without a trailing underscore", () => {
    expect(titleSegment(`${"a".repeat(59)} b`)).toBe("a".repeat(59))
    expect(slugOf("ab cd", 3)).toBe("ab")
  })

  it("should read a hostile title of the largest size in less than 250 ms", () => {
    for (const hostile of ["_ ".repeat(100), "é".repeat(200), `${"a_".repeat(99)}\u2028`, "\u0301".repeat(200)]) {
      const started = performance.now()
      titleSegment(hostile)
      expect(performance.now() - started).toBeLessThan(250)
    }
  })

  it("should put a segment under the root without prefix", () => {
    expect([childPath("guide", "x"), childPath("ventes", "x")]).toEqual(["x", "ventes/x"])
  })
})

describe("copyTitle", () => {
  it("should add « (copie) » and keep the title within 200 characters", () => {
    expect(copyTitle("Tarifs")).toBe("Tarifs (copie)")
    const long = copyTitle("t".repeat(200))
    expect([long.length, long.endsWith(" (copie)")]).toEqual([200, true])
  })
})

describe("compareSiblings", () => {
  it("should order by position, nodes without one last, then by path", () => {
    const siblings = [
      { path: "v/b", position: null },
      { path: "v/z", position: 2048 },
      { path: "v/a", position: null },
      { path: "v/y", position: 1024 },
      { path: "v/x", position: 1024 },
    ]
    expect([...siblings].sort(compareSiblings).map((sibling) => sibling.path)).toEqual(["v/x", "v/y", "v/z", "v/a", "v/b"])
  })
})
