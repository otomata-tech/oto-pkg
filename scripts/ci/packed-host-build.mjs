// Build comme un hôte : le paquet empaqueté (`pnpm pack`), installé depuis son `.tgz` dans une copie de
// l'application de référence hors du dépôt, puis `next build`. Le `build` du workspace lit le paquet
// par un lien vers ses sources ; un hôte le lit dans `node_modules`, où son bundler applique
// `"sideEffects": false` et peut charger en premier n'importe quel module d'une face : seul ce passage
// voit ce que voit l'hôte (cycle d'imports lu au chargement, fichier absent de `files`).
// Usage : `node scripts/ci/packed-host-build.mjs` depuis la racine ; code de sortie de l'étape en échec.
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "../..")
const PACKAGE = "@otomata_tech/oto_platform"
// Ce qu'un hôte écrit pour monter le paquet : `src/` et la configuration racine de l'application.
const HOST_FILES = [
  "src",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "next.config.ts",
  "next-env.d.ts",
  "tsconfig.json",
  "postcss.config.js",
  "tailwind.config.ts",
  "components.json",
]

// `shell` : sous Windows, pnpm est un script `.cmd`, que Node ne lance pas sans shell ; une seule chaîne
// (Node 24 déprécie les arguments passés avec `shell`, DEP0190).
function run(command, cwd) {
  console.log(`\n> ${command}  (${cwd})`)
  const { status } = spawnSync(command, { cwd, stdio: "inherit", shell: true })
  if (status !== 0) throw new Error(`« ${command} » a échoué (code ${status}).`)
}

const work = mkdtempSync(path.join(tmpdir(), "oto-packed-host-"))
try {
  run(`pnpm pack --pack-destination "${work}"`, path.join(ROOT, "packages/plateforme"))
  const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"))
  if (!tarball) throw new Error("pnpm pack n'a produit aucune archive.")

  // Fichiers suivis et nouveaux non ignorés : ni `.env.local`, ni `.next/`, ni `node_modules/`. `-z` :
  // chemins bruts, sans les guillemets et échappements que git pose sur un nom accentué ; un fichier
  // suivi mais supprimé de la copie de travail n'est pas copié, comme chez un hôte qui l'a retiré.
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...HOST_FILES], {
    cwd: ROOT,
    encoding: "utf8",
  })
  const host = path.join(work, "host")
  for (const file of new Set(listed.split("\0").filter(Boolean))) {
    if (!existsSync(path.join(ROOT, file))) continue
    mkdirSync(path.dirname(path.join(host, file)), { recursive: true })
    cpSync(path.join(ROOT, file), path.join(host, file))
  }

  // L'application de référence lit les classes des écrans dans les sources du workspace ; un hôte les
  // lit dans le paquet installé (README du paquet) : sans cette réécriture, Tailwind lirait un dossier
  // absent de la copie et ne générerait pas les classes des écrans.
  const cssPath = path.join(host, "src/app/globals.css")
  const WORKSPACE_SOURCE = '@source "../../packages/plateforme/ui";'
  const css = readFileSync(cssPath, "utf8")
  if (!css.includes(WORKSPACE_SOURCE)) throw new Error(`${WORKSPACE_SOURCE} absent de src/app/globals.css : réécriture impossible.`)
  writeFileSync(cssPath, css.replace(WORKSPACE_SOURCE, `@source "../../node_modules/${PACKAGE}/ui";`))

  const manifestPath = path.join(host, "package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  manifest.dependencies[PACKAGE] = `file:../${tarball}`
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  // Le verrou du dépôt garde les versions de ses dépendances ; seule l'entrée du paquet change.
  run("pnpm install --no-frozen-lockfile", host)
  run("pnpm exec next build", host)
  console.log(`\npacked-host-build: ${tarball} se construit chez un hôte.`)
} catch (error) {
  console.error(`\npacked-host-build: ${error.message}`)
  process.exitCode = 1
} finally {
  // `maxRetries` : sous Windows, un processus de `next build` qui se termine tient encore un fichier.
  rmSync(work, { recursive: true, force: true, maxRetries: 5 })
}
