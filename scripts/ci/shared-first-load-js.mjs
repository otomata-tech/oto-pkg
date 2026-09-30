// Le JavaScript chargé par toutes les pages d'un build Next (« First Load JS shared by all ») : les fichiers présents
// dans chaque entrée de `.next/app-build-manifest.json`, en octets compressés (gzip, niveau 9), comme `next build` le
// calcule (`computeFromManifest`). Un module client tiré par un fichier du segment racine (layout, `opengraph-image`)
// entre dans toutes les pages, `/login` et le 404 compris : `performance-patterns.md § Bundle Size`.
// Et le JavaScript d'une route entière : la colonne « First Load JS » de `next build` ne compte que l'entrée de la page,
// jamais ses layouts, où un import serveur du barrel `/ui` met le code client de toute la face (éditeur, zod).
// Usage : `node scripts/ci/shared-first-load-js.mjs [<dossier .next>]` après `pnpm build` ; code 1 au-delà d'un budget.
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"

/** Le budget, en kB (1 kB = 1000 octets, l'unité de `next build`) : 104 kB en 1.1.6, la marge pour Next et React. */
export const SHARED_JS_BUDGET_KB = 120

/**
 * Les budgets d'une route entière (page, layouts et `loading` de ses segments), en kB. `/login` : 151 kB en 1.1.7
 * (le formulaire et son zod ; 337 kB en 1.1.6) ; `/admin`, qui redirige, pèse la coque du tableau de bord (219 kB en
 * 1.1.7, 322 kB en 1.1.6). Les clés sont celles de `app-build-manifest.json` pour l'application de référence.
 */
export const ROUTE_BUDGETS_KB = { "/(auth)/login/page": 170, "/(dashboard)/admin/page": 240 }

function manifest(nextDir) {
  return JSON.parse(readFileSync(path.join(nextDir, "app-build-manifest.json"), "utf8")).pages
}

function gzipped(nextDir, files) {
  return files.reduce((total, file) => total + gzipSync(readFileSync(path.join(nextDir, file)), { level: 9 }).length, 0)
}

/** Les fichiers communs à toutes les entrées d'app et leur poids compressé total, en octets. */
export function sharedFirstLoadJs(nextDir) {
  const entries = Object.values(manifest(nextDir))
  const files = [...new Set(entries.flat())].filter((file) => entries.every((list) => list.includes(file)))
  return { files, bytes: gzipped(nextDir, files) }
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

/**
 * Le JS que charge une route (`/(auth)/login/page`) : les fichiers `.js` de son entrée et des `layout` et `loading` de
 * chaque segment au-dessus d'elle, comptés une fois ; le CSS n'entre pas.
 */
export function routeFirstLoadJs(nextDir, page) {
  const pages = manifest(nextDir)
  if (!pages[page]) throw new Error(`${page} absente de app-build-manifest.json.`)
  const segments = page.split("/").slice(1, -1)
  const entries = [page]
  for (let depth = 0; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth).map((segment) => `/${segment}`).join("")
    for (const special of ["layout", "loading"]) if (pages[`${prefix}/${special}`]) entries.push(`${prefix}/${special}`)
  }
  const files = [...new Set(entries.flatMap((entry) => pages[entry]))].filter((file) => file.endsWith(".js"))
  return { entries, files, bytes: gzipped(nextDir, files) }
}

/**
 * Lève si une route dépasse son budget ; rend le poids de chacune, en kB.
 * @param {string} nextDir
 * @param {Record<string, number>} [budgets]
 */
export function assertRouteBudgets(nextDir, budgets = ROUTE_BUDGETS_KB) {
  const weights = {}
  for (const [page, budgetKb] of Object.entries(budgets)) {
    const kb = routeFirstLoadJs(nextDir, page).bytes / 1000
    if (kb > budgetKb) {
      throw new Error(
        `JS de la route ${page} (page et layouts) : ${kb.toFixed(1)} kB, budget ${budgetKb} kB. Un import serveur du ` +
          "barrel `@otomata_tech/oto_platform/ui` sans `optimizePackageImports` y met le code client de toute la face : " +
          "performance-patterns.md § Bundle Size.",
      )
    }
    weights[page] = kb
  }
  return weights
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const nextDir = path.resolve(process.argv[2] ?? ".next")
  try {
    const kb = assertSharedJsBudget(nextDir)
    console.log(`shared-first-load-js: ${kb.toFixed(1)} kB (budget ${SHARED_JS_BUDGET_KB} kB).`)
    for (const [page, routeKb] of Object.entries(assertRouteBudgets(nextDir))) {
      console.log(`shared-first-load-js: ${page} ${routeKb.toFixed(1)} kB (budget ${ROUTE_BUDGETS_KB[page]} kB).`)
    }
  } catch (error) {
    console.error(`shared-first-load-js: ${error.message}`)
    process.exitCode = 1
  }
}
