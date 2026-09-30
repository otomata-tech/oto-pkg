// @vitest-environment node
import fs from "fs"
import os from "os"
import path from "path"
import { gzipSync } from "zlib"
import { afterAll, describe, expect, it } from "vitest"
import { assertRouteBudgets, assertSharedJsBudget, routeFirstLoadJs, sharedFirstLoadJs } from "../../scripts/ci/shared-first-load-js.mjs"

// Le budget du JS chargé par toutes les pages (`performance-patterns.md § Bundle Size`), lu par le job
// `packed-host-build` : un test de fumée sur un `.next` réduit à son manifeste.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-js-"))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe("shared-first-load-js", () => {
  it("should sum the gzipped files present in every app entry and throw above the budget", () => {
    const commun = "x".repeat(5_000) + Math.random().toString(36).repeat(2_000)
    fs.mkdirSync(path.join(dir, "static"))
    fs.writeFileSync(path.join(dir, "static/commun.js"), commun)
    fs.writeFileSync(path.join(dir, "static/seul.js"), "y".repeat(50_000))
    const pages = { "/layout": ["static/commun.js", "static/seul.js"], "/admin/page": ["static/commun.js"] }
    fs.writeFileSync(path.join(dir, "app-build-manifest.json"), JSON.stringify({ pages }))

    const octets = gzipSync(commun, { level: 9 }).length
    expect(sharedFirstLoadJs(dir)).toEqual({ files: ["static/commun.js"], bytes: octets })
    expect(assertSharedJsBudget(dir, 1_000)).toBe(octets / 1000)
    expect(() => assertSharedJsBudget(dir, (octets - 1) / 1000)).toThrow(/static\/commun\.js.*performance-patterns\.md § Bundle Size/)
  })

  // Le JS d'une route entière : la page, les `layout` et `loading` de ses segments, jamais un segment voisin ni le CSS.
  it("should sum a route's page, its ancestor layouts and loading once, and throw above its budget", () => {
    const route = path.join(dir, "route")
    fs.mkdirSync(path.join(route, "static"), { recursive: true })
    const poids: Record<string, number> = {}
    for (const nom of ["commun", "racine", "groupe", "chargement", "page", "voisin", "feuille"]) {
      const contenu = `${nom}:` + Math.random().toString(36).repeat(500)
      fs.writeFileSync(path.join(route, `static/${nom}.js`), contenu)
      poids[nom] = gzipSync(contenu, { level: 9 }).length
    }
    fs.writeFileSync(path.join(route, "static/style.css"), "a{}")
    const pages = {
      "/layout": ["static/commun.js", "static/racine.js", "static/style.css"],
      "/(auth)/layout": ["static/commun.js", "static/groupe.js"],
      "/(auth)/login/loading": ["static/commun.js", "static/chargement.js"],
      "/(auth)/login/page": ["static/commun.js", "static/page.js"],
      "/(dashboard)/layout": ["static/commun.js", "static/voisin.js"],
      "/not-found": ["static/commun.js", "static/feuille.js"],
    }
    fs.writeFileSync(path.join(route, "app-build-manifest.json"), JSON.stringify({ pages }))

    const attendu = poids.commun + poids.racine + poids.groupe + poids.chargement + poids.page
    const lu = routeFirstLoadJs(route, "/(auth)/login/page")
    expect(lu.bytes).toBe(attendu)
    expect(lu.files.sort()).toEqual(["static/chargement.js", "static/commun.js", "static/groupe.js", "static/page.js", "static/racine.js"])
    expect(assertRouteBudgets(route, { "/(auth)/login/page": attendu / 1000 })).toEqual({ "/(auth)/login/page": attendu / 1000 })
    expect(() => assertRouteBudgets(route, { "/(auth)/login/page": (attendu - 1) / 1000 })).toThrow(/\/\(auth\)\/login\/page.*optimizePackageImports.*§ Bundle Size/)
    expect(() => routeFirstLoadJs(route, "/absente/page")).toThrow(/absente/)
  })
})
