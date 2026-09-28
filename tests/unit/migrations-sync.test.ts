// @vitest-environment node
// Copie de l'hôte : chaque migration du paquet a son double identique dans `supabase/migrations/`.
// `scripts/sync-migrations.mjs` délègue à la CLI du paquet, prouvée par `cli-migrations.test.ts` (M11).
import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

const root = path.resolve(__dirname, "../..")
const packageDir = path.join(root, "packages/plateforme/migrations")
const hostDir = path.join(root, "supabase/migrations")

describe("sync-migrations", () => {
  it("should have an identical host copy of every package migration", () => {
    const files = fs.readdirSync(packageDir).filter((f) => f.endsWith(".sql"))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const copy = path.join(hostDir, file)
      expect(fs.existsSync(copy), `${file} missing from supabase/migrations`).toBe(true)
      expect(fs.readFileSync(copy).equals(fs.readFileSync(path.join(packageDir, file))), `${file} differs`).toBe(true)
    }
  })
})
