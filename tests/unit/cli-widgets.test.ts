// @vitest-environment node
// `oto-platform widgets build` (story widgets-dans-la-conversation, lot 2) : usage, dossier de vues refusé, et un
// passage de fumée qui construit pour de vrai le bundle d'un hôte avec une vue de l'ERP.
import { spawnSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { VIEW_NAME } from "../../packages/plateforme/cli/widgets.mjs"
import { VIEW_NAME_PATTERN } from "../../packages/plateforme/schemas/views"

const root = path.resolve(__dirname, "../..")
const bin = path.join(root, "packages/plateforme/cli/bin.mjs")
// Un build Vite réel, React et Tailwind compris : une dizaine de secondes sur un poste, davantage en CI.
const BUILD_TIMEOUT = 120_000

let dir: string

function cli(args: string[]) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: "utf8" })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** Un dossier de vues jetable, `files` nom → contenu. */
function viewsDir(files: Record<string, string>) {
  const views = fs.mkdtempSync(path.join(dir, "vues-"))
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(views, name), content)
  return views
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "oto-widgets-"))
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("oto-platform widgets build", () => {
  it("should ask for --views and --out with the usage and code 2", () => {
    const result = cli(["widgets", "build", "--views", "src/widgets"])
    expect(result.status).toBe(2)
    expect(result.stderr.startsWith("oto-platform : « widgets build » attend --views <dossier> et --out <fichier>")).toBe(true)
    expect(result.stderr).toContain("Usage : oto-platform")
  })

  it("should refuse a missing folder, a folder without view and an invalid view name, with code 1 and nothing written", () => {
    const out = path.join(dir, "refus.generated.ts")
    const cases = [
      [path.join(dir, "absent"), `dossier de vues introuvable : ${path.join(dir, "absent")}`],
      [viewsDir({ "lisez-moi.md": "" }), "aucune vue (fichier .tsx) dans"],
      [viewsDir({ "Devis.tsx": "export default () => null" }), "nom de vue invalide : Devis.tsx"],
    ] as const
    for (const [views, message] of cases) {
      const result = cli(["widgets", "build", "--views", views, "--out", out])
      expect([result.status, result.stderr.includes(message)], message).toEqual([1, true])
    }
    expect(fs.existsSync(out)).toBe(false)
  })

  it("should read view names in the form of schemas/views.ts", () => {
    expect(VIEW_NAME.source).toBe(VIEW_NAME_PATTERN.source)
  })

  it("should build one bundle with the package views and the host's, its classes generated, in a WIDGET_BUNDLE module", { timeout: BUILD_TIMEOUT }, () => {
    const views = viewsDir({ "devis.tsx": 'export default function Devis() { return <p className="tracking-[0.37em]">Devis témoin</p> }\n' })
    const out = path.join(dir, "widgets.generated.ts")
    const result = cli(["widgets", "build", "--views", views, "--out", out])
    expect([result.status, result.stderr]).toEqual([0, ""])
    const generated = fs.readFileSync(out, "utf8")
    const literal = /^export const WIDGET_BUNDLE = \{ html: (".*"), views: (\[.*\]) \}$/m.exec(generated)
    expect(literal).not.toBeNull()
    const html: string = JSON.parse(literal?.[1] ?? '""')
    expect(JSON.parse(literal?.[2] ?? "[]")).toEqual(["devis"])
    expect(html.startsWith("<!doctype html>")).toBe(true)
    expect(html).toContain("Devis témoin")
    expect(html).toContain(".tracking-\\[0\\.37em\\]")
  })
})
