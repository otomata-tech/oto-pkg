// @vitest-environment node
import path from "path"
import { ESLint } from "eslint"
import { describe, it, expect } from "vitest"

const root = path.resolve(__dirname, "../..")
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, "eslint.config.mjs") })

// Le fichier n'existe pas sur le disque : lintText applique la config de son chemin (les blocs
// `files: ["packages/plateforme/ui/**"]`) et résout `../server` depuis ui/, comme un vrai fichier.
const fixturePath = path.join(root, "packages/plateforme/ui/boundary-fixture.tsx")
// Même principe pour schemas/ (le bloc `files: ["packages/plateforme/schemas/**/*.ts"]`) ; une seule
// instance ESLint, donc un seul chargement de la config Next pour les deux frontières (M11).
const schemasFixturePath = path.join(root, "packages/plateforme/schemas/boundary-fixture.ts")
const BOUNDARY_RULES = ["import/no-restricted-paths", "no-restricted-imports"]

async function boundaryErrors(code: string, filePath = fixturePath) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.severity === 2 && BOUNDARY_RULES.includes(m.ruleId ?? ""))
}

async function ruleIds(code: string, filePath = fixturePath) {
  return (await boundaryErrors(code, filePath)).map((m) => m.ruleId)
}

// Le premier lintText charge toute la config Next (~4 s en local) : au ras des 5 s par défaut.
describe("ui/ boundary (eslint.config.mjs)", { timeout: 30_000 }, () => {
  it("should reject a relative import of server/, migrations/, api/ or mcp/", async () => {
    for (const target of ["../server", "../migrations/README.md", "../api/index", "../mcp/index"]) {
      expect(await ruleIds(`import "${target}"\n`), target).toContain("import/no-restricted-paths")
    }
  })

  it("should reject a Supabase client or a Postgres driver import", async () => {
    for (const target of ["@supabase/ssr", "pg"]) {
      expect(await ruleIds(`import "${target}"\n`), target).toContain("no-restricted-imports")
    }
  })

  it("should reject the server face through the package name", async () => {
    expect(await ruleIds(`import "@otomata_tech/oto_platform/server"\n`)).toContain("no-restricted-imports")
  })

  it("should reject a host application import through the @/ alias", async () => {
    expect(await ruleIds(`import "@/lib/utils/cn"\n`)).toContain("no-restricted-imports")
  })

  it("should reject the Next router, the Next link component and TanStack Router (navigation comes from the host, ADR-008)", async () => {
    for (const target of ["next/navigation", "next/link", "@tanstack/react-router"]) {
      expect(await ruleIds(`import "${target}"\n`), target).toContain("no-restricted-imports")
    }
  })

  it("should reject lucide-react and the Phosphor barrel, but accept a per-icon import and a type import", async () => {
    expect(await ruleIds(`import "lucide-react"\n`)).toContain("no-restricted-imports")
    expect(await ruleIds(`import { Path } from "@phosphor-icons/react"\n`)).toContain("no-restricted-imports")
    expect(await ruleIds(`import { Path } from "@phosphor-icons/react/ssr"\n`)).toContain("no-restricted-imports")
    const ok = `import type { Icon } from "@phosphor-icons/react"\nimport { Path } from "@phosphor-icons/react/dist/ssr/Path"\nexport const a: Icon = Path\n`
    expect(await boundaryErrors(ok)).toEqual([])
  })

  it("should reject lucide-react in the host app, but not in Shadcn internals", async () => {
    const lint = async (filePath: string) => {
      const [result] = await eslint.lintText(`import { X } from "lucide-react"\nexport const a = X\n`, { filePath })
      return result.messages.filter((m) => m.ruleId === "no-restricted-imports")
    }
    expect(await lint(path.join(root, "src/components/icon-fixture.tsx"))).not.toEqual([])
    expect(await lint(path.join(root, "src/components/ui/icon-fixture.tsx"))).toEqual([])
  })

  it("should accept a ui/ file that talks to api/ over HTTP", async () => {
    const code = `export async function loadVersion() {\n  return fetch("/api/platform/version")\n}\n`
    expect(await boundaryErrors(code)).toEqual([])
  })
})

// Repris de `schemas-boundary.test.ts` (M11) : du Zod pur, sans autre face, client de base ni Next.
describe("schemas/ boundary (eslint.config.mjs)", { timeout: 30_000 }, () => {
  it("should reject a relative import of ../server", async () => {
    expect(await ruleIds(`import "../server"\n`, schemasFixturePath)).toContain("import/no-restricted-paths")
  })

  it.each(["@supabase/supabase-js", "@otomata_tech/oto_platform/server"])("should reject an import of %s", async (target) => {
    expect(await ruleIds(`import "${target}"\n`, schemasFixturePath)).toContain("no-restricted-imports")
  })

  it("should accept a pure Zod schema", async () => {
    const code = `import * as z from "zod/v4"\nexport const s = z.object({ email: z.email() })\n`
    expect(await boundaryErrors(code, schemasFixturePath)).toEqual([])
  })
})

// E01-S10 f2, AC-f3 : server/, api/ et mcp/ parlent à la base par `db.tx` ; `@supabase/*` n'entre que dans
// l'implémentation Supabase du port (ADR-012 § 1), server/oauth.ts et server/invitations.ts.
describe("server/, api/ and mcp/ boundary (eslint.config.mjs)", { timeout: 30_000 }, () => {
  const faceFixture = (face: string) => path.join(root, `packages/plateforme/${face}/boundary-fixture.ts`)
  const code = `import { createClient } from "@supabase/supabase-js"\nexport const c = createClient\n`

  it("should reject @supabase/* in server/, api/ and mcp/, and accept it in server/oauth.ts and server/invitations.ts only", async () => {
    for (const face of ["server", "server/admin", "api", "mcp"]) {
      expect(await ruleIds(code, faceFixture(face)), face).toContain("no-restricted-imports")
    }
    for (const port of ["server/oauth.ts", "server/invitations.ts"]) {
      expect(await boundaryErrors(code, path.join(root, `packages/plateforme/${port}`)), port).toEqual([])
    }
  })
})
