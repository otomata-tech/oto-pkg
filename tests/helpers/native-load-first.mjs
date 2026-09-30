// Charge chaque module `.ts` d'un dossier EN PREMIER, dans un graphe de modules neuf, par le chargeur
// ESM natif de Node (types retirés, Node 22.18 et suivants) ; écrit sur la sortie un objet JSON
// `{ "<fichier>": "<erreur>" }` des modules qui ne se chargent pas.
// Pourquoi hors de Vitest : son exécuteur rend `undefined` pour une liaison lue à travers un cycle
// d'imports, là où ESM natif et les bundlers lèvent `Cannot access … before initialization`.
// Un graphe neuf par module : la requête `?first=<n>` de l'entrée se propage à ses imports relatifs.
import { existsSync, readdirSync } from "node:fs"
import { registerHooks } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const TYPESCRIPT = "module-typescript"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const parent = new URL(context.parentURL)
      const base = new URL(specifier, parent).href.replace(/\?.*$/, "")
      for (const suffix of ["", ".ts", "/index.ts"]) {
        const candidate = new URL(base + suffix)
        const file = fileURLToPath(candidate)
        if (file.endsWith(".ts") && existsSync(file)) {
          candidate.search = parent.search
          return { url: candidate.href, format: TYPESCRIPT, shortCircuit: true }
        }
      }
    }
    const resolved = nextResolve(specifier, context)
    return /\.ts(\?|$)/.test(resolved.url) ? { ...resolved, format: TYPESCRIPT } : resolved
  },
})

const directory = path.resolve(process.argv[2])
const failures = {}
let first = 0
for (const name of readdirSync(directory).filter((file) => file.endsWith(".ts") && !file.includes(".test."))) {
  const url = pathToFileURL(path.join(directory, name))
  url.search = `?first=${first++}`
  try {
    await import(url.href)
  } catch (error) {
    failures[name] = `${error?.constructor?.name ?? "Error"}: ${String(error?.message ?? error).split("\n")[0]}`
  }
}
process.stdout.write(JSON.stringify(failures))
