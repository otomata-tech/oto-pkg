#!/usr/bin/env node
/**
 * Construit le bundle du widget routeur (story widgets-dans-la-conversation) : un HTML en un fichier (Vite,
 * `vite-plugin-singlefile`, JS, CSS et polices inlinés, aucune requête externe), écrit dans
 * `mcp/widgets/generated.ts` que le serveur sert en mémoire (`mcp/widget-meta.ts`), sans lecture de fichier à
 * l'exécution. Le module généré n'est pas suivi par git : ce script tourne avant `type-check` (s'il manque, ce qui
 * sert aussi `verify`), `build`, le job `bare-postgres` et `npm pack` (`prepack` du paquet), qui le livre.
 *
 * Usage : `node packages/plateforme/widgets/build.mjs [--if-missing]` ; `--if-missing` ne reconstruit pas un
 * module déjà présent (type-check d'un clone neuf). Code de sortie 1 si le build échoue.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = dirname(fileURLToPath(import.meta.url))
const TARGET = join(ROOT, '..', 'mcp', 'widgets', 'generated.ts')
// La barre oblique inverse, composée : le module généré n'écrit que de l'ASCII (CLAUDE.md, modifications documentaires).
const SLASH = String.fromCharCode(92)

/** Le littéral JS du HTML, en ASCII seul : tout code UTF-16 au-delà de `~` s'écrit par son échappement. */
function asciiLiteral(text) {
  const json = JSON.stringify(text)
  let out = ''
  for (let i = 0; i < json.length; i += 1) {
    const unit = json.charCodeAt(i)
    out += unit > 126 ? `${SLASH}u${unit.toString(16).padStart(4, '0')}` : json[i]
  }
  return out
}

async function bundle() {
  // Chargés à la demande : `--if-missing` sur un module présent ne charge pas Vite.
  const [{ build }, { default: react }, { viteSingleFile }, { default: tailwind }] = await Promise.all([
    import('vite'),
    import('@vitejs/plugin-react'),
    import('vite-plugin-singlefile'),
    import('@tailwindcss/postcss'),
  ])
  const output = await build({
    root: ROOT,
    configFile: false,
    logLevel: 'warn',
    plugins: [react(), viteSingleFile()],
    // Mermaid hors du bundle : son chargement échoue, le diagramme reste en texte (`mermaid-absent.ts`).
    resolve: { alias: [{ find: /^mermaid$/, replacement: join(ROOT, 'mermaid-absent.ts') }] },
    css: { postcss: { plugins: [tailwind()] } },
    build: { write: false, reportCompressedSize: false, chunkSizeWarningLimit: 4096 },
  })
  const outputs = (Array.isArray(output) ? output : [output]).flatMap((one) => one.output ?? [])
  const page = outputs.find((one) => one.fileName === 'index.html')
  if (!page || typeof page.source !== 'string') throw new Error('index.html absent de la sortie de Vite')
  return page.source
}

try {
  if (process.argv.includes('--if-missing') && existsSync(TARGET)) process.exit(0)
  const html = await bundle()
  mkdirSync(dirname(TARGET), { recursive: true })
  const header = '// Généré par packages/plateforme/widgets/build.mjs : ne pas modifier, ne pas commiter.\n'
  writeFileSync(TARGET, `${header}export const VIEW_HTML = ${asciiLiteral(html)}\n`)
  const kb = (bytes) => `${Math.round(bytes / 1024)} Ko`
  console.log(`widgets : ${kb(Buffer.byteLength(html))} (gzip ${kb(gzipSync(html).length)}) dans mcp/widgets/generated.ts`)
} catch (error) {
  console.error(`widgets : build en échec : ${error?.message ?? error}`)
  process.exitCode = 1
}
