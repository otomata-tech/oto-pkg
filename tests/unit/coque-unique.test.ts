// @vitest-environment node
// Tout ce que l'arbre porte est une page (E05-S09, AC-a5 ; portage-ecrans.md § 0) : aucune page de liste
// par genre sous `src/app/`, une procédure s'ouvre à l'adresse de son nœud, dans le rail
// (`tests/integration/components/rail-application.test.tsx`).
import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

const app = path.resolve(__dirname, "../../src/app")

function dossiers(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? [path.join(dir, entree.name), ...dossiers(path.join(dir, entree.name))] : []))
}

describe("one coque, every node a page (AC-a5)", () => {
  it("should serve no procedures route under src/app", () => {
    const routes = dossiers(app).map((dossier) => path.relative(app, dossier).split(path.sep).join("/"))
    expect(routes).toContain("(dashboard)/n/[...chemin]")
    expect(routes.filter((route) => route.split("/").includes("procedures"))).toEqual([])
  })
})
