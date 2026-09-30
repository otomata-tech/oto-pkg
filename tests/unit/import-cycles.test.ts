// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

// Un cycle d'imports casse l'hôte dès qu'un module du cycle lit au chargement une valeur d'un autre :
// son bundler peut ouvrir le graphe par n'importe quel module d'une face (`"sideEffects": false`), et la
// valeur n'est pas encore initialisée. Aucun cycle, même inoffensif aujourd'hui : il le devient à la
// première constante lue au niveau du module (`coding-standards.md § Imports`). `ui/` et `server/` en
// portent encore des cycles et restent hors de la garde (M92, `.method/sprint/status.md`).
const PACKAGE = path.resolve(__dirname, "../../packages/plateforme")
const GUARDED_FACES = ["schemas", "api", "mcp"]

// Imports évalués : `import … from`, `export … from`, `import "…"`. `import type`, `export type` et un
// import dont tous les noms sont `type` ne s'évaluent pas ; `import()` est différé.
const CLAUSE = String.raw`(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+)`
const STATIC_IMPORT = new RegExp(
  String.raw`^[ \t]*(?:import|export)\s+(type\s+)?(${CLAUSE})\s*from\s*["']([^"']+)["']|^[ \t]*import\s*["']([^"']+)["']`,
  "gm",
)

function evaluatedSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  for (const [, typeOnly, clause, from, bare] of source.matchAll(STATIC_IMPORT)) {
    if (bare) {
      specifiers.push(bare)
      continue
    }
    const names = /^\{([^}]*)\}$/.exec(clause.trim())?.[1].split(",").filter((name) => name.trim()) ?? []
    const allTypes = names.length > 0 && names.every((name) => /^\s*type\s/.test(name))
    if (!typeOnly && !allTypes) specifiers.push(from)
  }
  return specifiers
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null
  const base = path.resolve(path.dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [full] : []
  })
}

/** Un cycle par arc retour d'un parcours en profondeur : aucun si et seulement si le graphe n'en a pas. */
function cyclesOf(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = []
  const done = new Set<string>()
  const stack: string[] = []
  const visit = (node: string) => {
    const open = stack.indexOf(node)
    if (open !== -1) {
      cycles.push([...stack.slice(open), node])
      return
    }
    if (done.has(node)) return
    stack.push(node)
    for (const target of graph.get(node) ?? []) visit(target)
    stack.pop()
    done.add(node)
  }
  for (const node of [...graph.keys()].sort()) visit(node)
  return cycles
}

/** Cycles d'imports évalués entre les fichiers de `directory`, chacun rendu `a.ts → b.ts → a.ts`. */
function importCycles(directory: string): string[] {
  const graph = new Map<string, string[]>()
  for (const file of sourceFiles(directory)) {
    const targets = evaluatedSpecifiers(readFileSync(file, "utf8"))
      .map((specifier) => resolveRelative(file, specifier))
      .filter((target): target is string => target !== null && target.startsWith(directory))
    graph.set(file, [...new Set(targets)])
  }
  return cyclesOf(graph).map((cycle) => cycle.map((file) => path.relative(directory, file).replaceAll("\\", "/")).join(" → "))
}

describe("package import cycles", () => {
  it.each(GUARDED_FACES)("should find no evaluated import cycle between the modules of %s/", (face) => {
    expect(importCycles(path.join(PACKAGE, face))).toEqual([])
  })

  it("should count evaluated imports and skip type-only ones", () => {
    const source = [
      `import { a } from "./a"`,
      `import type { B } from "./b"`,
      `import {\n  type C,\n  type D,\n} from "./c"`,
      `export const e = 1`,
      `export { f, type G } from "./f"`,
      `export type { H } from "./h"`,
      `import "./i"`,
      `import * as z from "zod/v4"`,
    ].join("\n")
    expect(evaluatedSpecifiers(source)).toEqual(["./a", "./f", "./i", "zod/v4"])
  })

  it("should name a cycle and pass an acyclic graph", () => {
    const graph = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
      ["d", ["a"]],
    ])
    expect(cyclesOf(graph)).toEqual([["a", "b", "c", "a"]])
    expect(cyclesOf(new Map([["a", ["b"]], ["b", []], ["c", ["a", "b"]]]))).toEqual([])
  })
})
