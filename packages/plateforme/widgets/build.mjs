#!/usr/bin/env node
/**
 * Construit le bundle du widget routeur (story widgets-dans-la-conversation) : un HTML en un fichier (Vite,
 * `vite-plugin-singlefile`, JS, CSS et polices inlinés, aucune requête externe), servi en mémoire par le serveur
 * (`mcp/widget-meta.ts`), sans lecture de fichier à l'exécution.
 *
 * Deux usages :
 * - le bundle du paquet, sans vue de l'ERP, dans `mcp/widgets/generated.ts` (non suivi par git) : ce script lancé
 *   seul, avant `type-check` (s'il manque, ce qui sert aussi `verify`), `build`, le job `bare-postgres` et `npm pack`
 *   (`prepack` du paquet), qui le livre ; `--if-missing` ne reconstruit pas un module déjà présent ;
 * - le bundle d'un hôte, vues du paquet et vues de l'ERP, par `buildHostBundle` (`oto-platform widgets build`).
 *
 * Vite, ses plugins, Tailwind et `ext-apps` se chargent à la demande : un hôte sans vue de l'ERP ne les installe pas.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PACKAGE_TARGET = join(ROOT, '..', 'mcp', 'widgets', 'generated.ts')
const STYLES = join(ROOT, 'styles.css')
const VIEWS_MODULE = 'virtual:oto-erp-views'
// La barre oblique inverse, composée : le module généré n'écrit que de l'ASCII (CLAUDE.md, modifications documentaires).
const SLASH = String.fromCharCode(92)

/** Ce qu'un hôte installe pour construire ses vues (dépendances paires facultatives du paquet). */
const BUILD_PACKAGES = ['vite', '@vitejs/plugin-react', 'vite-plugin-singlefile', '@tailwindcss/postcss', 'tailwindcss', '@modelcontextprotocol/ext-apps']

/** Le littéral JS d'un texte, en ASCII seul : tout code UTF-16 au-delà de `~` s'écrit par son échappement. */
function asciiLiteral(text) {
  const json = JSON.stringify(text)
  let out = ''
  for (let i = 0; i < json.length; i += 1) {
    const unit = json.charCodeAt(i)
    out += unit > 126 ? `${SLASH}u${unit.toString(16).padStart(4, '0')}` : json[i]
  }
  return out
}

/** Les outils de build, chargés à la demande ; absents, l'erreur nomme les paquets à installer. */
async function buildTools() {
  try {
    const [{ build }, { default: react }, { viteSingleFile }, { default: tailwind }] = await Promise.all([
      import('vite'),
      import('@vitejs/plugin-react'),
      import('vite-plugin-singlefile'),
      import('@tailwindcss/postcss'),
    ])
    // Le SDK du pont n'est lu que par Vite, dans le bundle : sa résolution se vérifie ici, avec les autres.
    import.meta.resolve('@modelcontextprotocol/ext-apps/app-with-deps')
    return { build, react, viteSingleFile, tailwind }
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    throw new Error(`outils de build absents : installer en devDependencies ${BUILD_PACKAGES.join(', ')}`)
  }
}

/**
 * Les vues de l'ERP (`virtual:oto-erp-views`, nom → fichier absolu) et les dossiers que Tailwind lit en plus pour leurs
 * classes, ajoutés à la feuille du widget.
 */
function erpViewsPlugin(views, sources) {
  return {
    name: 'oto-erp-views',
    enforce: 'pre',
    resolveId: (id) => (id === VIEWS_MODULE ? `\0${VIEWS_MODULE}` : null),
    load(id) {
      if (id === `\0${VIEWS_MODULE}`) {
        const entries = Object.entries(views)
        const imports = entries.map(([, file], index) => `import V${index} from ${JSON.stringify(file)}`)
        const map = entries.map(([name], index) => `${JSON.stringify(name)}: V${index}`).join(', ')
        return `${imports.join('\n')}\nexport default { ${map} }\n`
      }
      // Barres obliques : sous Windows, Tailwind ne lit pas un `@source` au séparateur du système, et les classes des
      // vues de l'hôte manqueraient au bundle.
      // L'identifiant d'un module porte des barres obliques sur tout système : le chemin du fichier s'y compare ainsi.
      if (id.split(sep).join('/') === STYLES.split(sep).join('/') && sources.length > 0) {
        return `${readFileSync(STYLES, 'utf8')}\n${sources.map((source) => `@source ${JSON.stringify(source.split(sep).join('/'))};`).join('\n')}\n`
      }
      return null
    },
  }
}

/** Le HTML du bundle : vues du paquet, et `views` de l'ERP (nom → fichier `.tsx` absolu). */
async function buildWidgetHtml({ views = {}, sources = [] } = {}) {
  const { build, react, viteSingleFile, tailwind } = await buildTools()
  const output = await build({
    root: ROOT,
    configFile: false,
    logLevel: 'warn',
    plugins: [erpViewsPlugin(views, sources), react(), viteSingleFile()],
    resolve: {
      // Mermaid hors du bundle : son chargement échoue, le diagramme reste en texte (`mermaid-absent.ts`).
      alias: [{ find: /^mermaid$/, replacement: join(ROOT, 'mermaid-absent.ts') }],
      // Les vues de l'hôte et celles du paquet partagent le même React.
      dedupe: ['react', 'react-dom'],
    },
    css: { postcss: { plugins: [tailwind()] } },
    build: { write: false, reportCompressedSize: false, chunkSizeWarningLimit: 4096 },
  })
  const outputs = (Array.isArray(output) ? output : [output]).flatMap((one) => one.output ?? [])
  const page = outputs.find((one) => one.fileName === 'index.html')
  if (!page || typeof page.source !== 'string') throw new Error('index.html absent de la sortie de Vite')
  return page.source
}

const kb = (bytes) => `${Math.round(bytes / 1024)} Ko`
const sizes = (html) => `${kb(Buffer.byteLength(html))} (gzip ${kb(gzipSync(html).length)})`

/** Le bundle d'un hôte (`oto-platform widgets build`) : `views` nom → fichier, écrit dans `out` (`WIDGET_BUNDLE`). */
export async function buildHostBundle({ views, out }) {
  const html = await buildWidgetHtml({ views, sources: [...new Set(Object.values(views).map((file) => dirname(file)))] })
  const target = resolve(out)
  mkdirSync(dirname(target), { recursive: true })
  const header = '// Généré par oto-platform widgets build : ne pas modifier ; à passer à registerWidgetViews avant registerFunctions.\n'
  writeFileSync(target, `${header}export const WIDGET_BUNDLE = { html: ${asciiLiteral(html)}, views: ${JSON.stringify(Object.keys(views))} }\n`)
  return { target, sizes: sizes(html) }
}

async function buildPackageBundle() {
  if (process.argv.includes('--if-missing') && existsSync(PACKAGE_TARGET)) return
  const html = await buildWidgetHtml()
  mkdirSync(dirname(PACKAGE_TARGET), { recursive: true })
  const header = '// Généré par packages/plateforme/widgets/build.mjs : ne pas modifier, ne pas commiter.\n'
  writeFileSync(PACKAGE_TARGET, `${header}export const VIEW_HTML = ${asciiLiteral(html)}\n`)
  console.log(`widgets : ${sizes(html)} dans mcp/widgets/generated.ts`)
}

// Lancé seul (`node widgets/build.mjs`) : le bundle du paquet ; importé par la CLI, rien ne court.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await buildPackageBundle()
  } catch (error) {
    console.error(`widgets : build en échec : ${error?.message ?? error}`)
    process.exitCode = 1
  }
}
