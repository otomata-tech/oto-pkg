// @vitest-environment node
// `pnpm db:types` (outillage) : un test de fumée sans secret imprimé, et le refus d'une référence de
// projet qui injecterait une commande (M11 : un script d'outillage, un test de fumée).
import { execFileSync } from "child_process"
import path from "path"
import { describe, expect, it } from "vitest"
import { buildCommand, ProjectRefError } from "../../scripts/db-types.mjs"

const script = path.resolve(__dirname, "../../scripts/db-types.mjs")

describe("db-types buildCommand", () => {
  it("should reject a ref that is not 20 lowercase letters without echoing it", () => {
    for (const bad of ["abc & echo pwned", "abcdefghijklmnopqrs", "ABCDEFGHIJKLMNOPQRST", "abcdefghijklmnopqrs1"]) {
      expect(() => buildCommand(bad)).toThrow(ProjectRefError)
      expect(() => buildCommand(bad)).not.toThrow(bad)
    }
  })
})

describe("db-types --dry-run", () => {
  it("should print the command with the project ref masked", () => {
    const stdout = execFileSync(process.execPath, [script, "--dry-run"], {
      encoding: "utf8",
      env: { ...process.env, SUPABASE_PROJECT_ID: "secretrefsecretrefab", SUPABASE_ACCESS_TOKEN: "secrettoken" },
    })
    expect(stdout).toContain("--schema platform")
    expect(stdout).toContain("<ref masqué>")
    expect(stdout).not.toContain("secretrefsecretrefab")
    expect(stdout).not.toContain("secrettoken")
  })
})
