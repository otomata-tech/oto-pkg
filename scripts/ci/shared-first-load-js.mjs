// Le JavaScript chargé par toutes les pages d'un build Next (« First Load JS shared by all ») : les fichiers présents
// dans chaque entrée de `.next/app-build-manifest.json`, en octets compressés (gzip, niveau 9), comme `next build` le
// calcule (`computeFromManifest`). Un module client tiré par un fichier du segment racine (layout, `opengraph-image`)
// entre dans toutes les pages, `/login` et le 404 compris : `performance-patterns.md § Bundle Size`.
// Usage : `node scripts/ci/shared-first-load-js.mjs [<dossier .next>]` après `pnpm build` ; code 1 au-delà du budget.
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"

/** Le budget, en kB (1 kB = 1000 octets, l'unité de `next build`) : 104 kB en 1.1.6, la marge pour Next et React. */
export const SHARED_JS_BUDGET_KB = 120

/** Les fichiers communs à toutes les entrées d'app et leur poids compressé total, en octets. */
export function sharedFirstLoadJs(nextDir) {
  const { pages } = JSON.parse(readFileSync(path.join(nextDir, "app-build-manifest.json"), "utf8"))
  const entries = Object.values(pages)
  const files = [...new Set(entries.flat())].filter((file) => entries.every((list) => list.includes(file)))
  const bytes = files.reduce((total, file) => total + gzipSync(readFileSync(path.join(nextDir, file)), { level: 9 }).length, 0)
  return { files, bytes }
}

/** Lève si le JS partagé dépasse le budget ; rend le poids en kB. */
export function assertSharedJsBudget(nextDir, budgetKb = SHARED_JS_BUDGET_KB) {
  const { files, bytes } = sharedFirstLoadJs(nextDir)
  const kb = bytes / 1000
  if (kb > budgetKb) {
    throw new Error(
      `JS partagé par toutes les pages : ${kb.toFixed(1)} kB, budget ${budgetKb} kB (${files.join(", ")}). ` +
        "Un fichier du segment racine tire du code client : performance-patterns.md § Bundle Size.",
    )
  }
  return kb
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const kb = assertSharedJsBudget(path.resolve(process.argv[2] ?? ".next"))
    console.log(`shared-first-load-js: ${kb.toFixed(1)} kB (budget ${SHARED_JS_BUDGET_KB} kB).`)
  } catch (error) {
    console.error(`shared-first-load-js: ${error.message}`)
    process.exitCode = 1
  }
}
