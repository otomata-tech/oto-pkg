// @vitest-environment node
import { execFileSync } from "child_process"
import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

// AC8 (E09-S02, fiche D24) : rien de la cellule dans le paquet. L'appel à Vercel et le domaine de base
// vivent dans l'hôte (`src/lib/cellule/`) ; le paquet n'expose que le point de création. Même recherche
// que `rg -n -i "vercel|CELL_BASE_DOMAIN" packages/plateforme` : les fichiers suivis ou non ignorés par
// git, tous types confondus (code, notes de version, README), sur le modèle de
// `tests/unit/cle-service-hors-paquet.test.ts`.

const root = path.resolve(__dirname, "../..")
const FORBIDDEN = /vercel|cell_base_domain/i

/** Les fichiers du paquet que `rg` lirait : suivis, ou nouveaux et non ignorés. */
function packageFiles(): string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "packages/plateforme"], {
    cwd: root,
    encoding: "utf8",
  })
  return [...new Set(listed.split("\0").filter(Boolean))].filter((file) => fs.existsSync(path.join(root, file)))
}

describe("the cell kept out of the package (E09-S02, AC8)", () => {
  it("should find neither Vercel nor CELL_BASE_DOMAIN in any file of the package", () => {
    const files = packageFiles()
    expect(files).toContain("packages/plateforme/server/admin/orgs.ts")
    const found = files.flatMap((file) =>
      fs
        .readFileSync(path.join(root, file), "utf8")
        .split(/\r?\n/)
        .flatMap((line, index) => (FORBIDDEN.test(line) ? [`${file}:${index + 1}`] : [])),
    )
    expect(found).toEqual([])
  })
})
