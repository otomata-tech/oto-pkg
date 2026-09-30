import { readFileSync } from "fs"
import path from "path"
import ts from "typescript"
import { describe, it, expect } from "vitest"
import pkg from "@otomata_tech/oto_platform/package.json"

// Les faces `ui`, `server`, `api` et `schemas` sont importées par leur nom dans d'autres tests ; la
// face `mcp` ne l'est qu'ici (M11).
describe("@otomata_tech/oto_platform faces", () => {
  it("should declare an export for each of the five faces", () => {
    const keys = Object.keys(pkg.exports)
    for (const face of ["ui", "mcp", "api", "server", "migrations"]) {
      expect(keys.some((key) => key === `./${face}` || key.startsWith(`./${face}/`))).toBe(true)
    }
  })

  // `optimizePackageImports` de l'hôte ne réécrit un import du barrel `/ui` vers le module de l'export que si le barrel
  // ne fait que réexporter : une seule déclaration locale, et chaque page qui l'importe côté serveur recharge le code
  // client de toute la face (`performance-patterns.md § Bundle Size`).
  it("should keep the ui barrel a pure re-export file", () => {
    const fichier = path.resolve(__dirname, "../../packages/plateforme/ui/index.ts")
    const source = ts.createSourceFile(fichier, readFileSync(fichier, "utf8"), ts.ScriptTarget.Latest)
    const autres = source.statements.filter((instruction) => !ts.isExportDeclaration(instruction) || instruction.moduleSpecifier === undefined)
    expect(autres.map((instruction) => instruction.getText(source))).toEqual([])
  })

  // Le premier import de la face transpile tout `mcp/` et `server/` : 6 s au calme, plus de 20 s quand
  // plusieurs agents vérifient en même temps (délai dépassé constaté quatre fois le 2026-09-25).
  it("should resolve the mcp face", { timeout: 60_000 }, async () => {
    await expect(import("@otomata_tech/oto_platform/mcp")).resolves.toBeDefined()
  })
})
