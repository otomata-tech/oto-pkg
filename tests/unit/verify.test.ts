// @vitest-environment node
import { spawnSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * `pnpm verify` lance check:framework, type-check et lint en même temps, puis test, et n'écrit le
 * reçu du gate de commit que si les quatre passent (M12). Testé sur un dépôt jetable : ses quatre
 * checks sont factices, son script `verify` est celui de ce dépôt, recopié tel quel.
 */

const root = path.resolve(__dirname, "../..")
const verify: string = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts.verify
const CHECKS = ["check:framework", "type-check", "lint", "test"]

let dir: string

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-"))
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Dépôt git jetable : chaque check écrit son nom, et échoue si `VERIFY_ECHEC` le nomme. */
function repo() {
  const at = fs.mkdtempSync(path.join(dir, "repo-"))
  fs.mkdirSync(path.join(at, "scripts"))
  for (const script of ["verify.mjs", "verify-receipt.mjs"]) {
    fs.copyFileSync(path.join(root, "scripts", script), path.join(at, "scripts", script))
  }
  fs.writeFileSync(
    path.join(at, "check.mjs"),
    "console.log(`sortie de ${process.argv[2]}`)\nprocess.exit(process.env.VERIFY_ECHEC === process.argv[2] ? 1 : 0)\n",
  )
  const scripts = Object.fromEntries(CHECKS.map((check) => [check, `node check.mjs ${check}`]))
  fs.writeFileSync(path.join(at, "package.json"), JSON.stringify({ name: "verify-jetable", private: true, scripts: { ...scripts, verify } }))
  spawnSync("git", ["init", "--quiet", at])
  return at
}

/** `pnpm run verify` dans le dépôt jetable ; le reçu, hors du dépôt (seams de `verify-receipt.mjs`). */
function pnpmVerify(at: string, echec = "") {
  const receipt = `${at}-receipt.json`
  const env = { ...process.env, VERIFY_RECEIPT_ROOT: at, VERIFY_RECEIPT_PATH: receipt, VERIFY_ECHEC: echec }
  // `shell` : sous Windows, pnpm est un script `.cmd`, que Node ne lance pas sans shell.
  const result = spawnSync("pnpm run verify", { cwd: at, env, shell: true, encoding: "utf8" })
  return { status: result.status, stdout: result.stdout, output: result.stdout + result.stderr, receipt }
}

// Cinq lancements de pnpm et de node par test, plus git pour l'empreinte : de 0,5 à 1,5 s mesurés
// le 2026-09-24 ; 30 s, comme `check-framework.test.ts`, sur la machine partagée où le délai de 5 s
// par défaut a sauté (M03).
describe("pnpm verify on a throwaway repository", { timeout: 30_000 }, () => {
  it("should write the receipt declaring the four checks when they all pass", () => {
    const result = pnpmVerify(repo())
    expect(result.status, result.output).toBe(0)
    // test tourne seul dans la dernière étape, par un autre chemin (sortie en direct) : une étape
    // qui se dirait réussie sans rien lancer écrirait le reçu sans les tests (revue de M12).
    expect(result.stdout).toContain("sortie de test")
    expect(JSON.parse(fs.readFileSync(result.receipt, "utf8")).checks).toEqual(CHECKS)
  })

  it("should exit non-zero without a receipt nor the tests, naming the failed check, when a check fails", () => {
    const result = pnpmVerify(repo(), "lint")
    expect(result.status, result.output).not.toBe(0)
    expect(fs.existsSync(result.receipt)).toBe(false)
    // Les trois checks de la première étape ont tourné et leur sortie est affichée ; test, jamais lancé.
    for (const check of ["check:framework", "type-check", "lint"]) expect(result.stdout).toContain(`sortie de ${check}`)
    expect(result.stdout).not.toContain("sortie de test")
    expect(result.stdout).toContain("échec de lint ; non lancé : test.")
  })

  it("should exit non-zero without a receipt when the tests fail", () => {
    const result = pnpmVerify(repo(), "test")
    expect(result.status, result.output).not.toBe(0)
    expect(fs.existsSync(result.receipt)).toBe(false)
  })
})
