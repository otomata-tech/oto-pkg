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

  // Le premier import de la face transpile tout `mcp/` et `server/` : 6 s au calme, plus de 20 s quand
  // plusieurs agents vérifient en même temps (délai dépassé constaté quatre fois le 2026-09-25).
  it("should resolve the mcp face", { timeout: 60_000 }, async () => {
    await expect(import("@otomata_tech/oto_platform/mcp")).resolves.toBeDefined()
  })
})
