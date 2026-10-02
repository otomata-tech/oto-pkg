/**
 * `oto-platform widgets build --views <dossier> --out <fichier>` (story widgets-dans-la-conversation) : le bundle du
 * widget d'un hôte, vues du paquet et vues de l'ERP, écrit dans un module que l'hôte passe à `registerWidgetViews`.
 * Une vue est un fichier `.tsx` du dossier, dont le nom (sans `.tsx`) est celui que déclare `defineErpFunction`.
 *
 * Rend le code de sortie : 0 succès, 1 dossier sans vue, nom de vue invalide, outils absents ou build en échec.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// La forme de `schemas/views.ts` (`VIEW_NAME_PATTERN`) : un script `.mjs` n'importe pas le TypeScript du paquet ;
// `tests/unit/cli-widgets.test.ts` confronte les deux.
export const VIEW_NAME = /^[a-z][a-z0-9_]{0,63}$/

/** Les vues du dossier, nom → fichier absolu ; ou le problème qui arrête la commande. */
function viewsOf(directory) {
  const root = resolve(directory)
  if (!existsSync(root) || !statSync(root).isDirectory()) return { problem: `dossier de vues introuvable : ${directory}` }
  const files = readdirSync(root).filter((file) => file.endsWith('.tsx')).sort()
  if (files.length === 0) return { problem: `aucune vue (fichier .tsx) dans ${directory}` }
  const views = {}
  for (const file of files) {
    const name = file.slice(0, -'.tsx'.length)
    if (!VIEW_NAME.test(name)) return { problem: `nom de vue invalide : ${file} (lettres minuscules ASCII, chiffres et _, 64 caractères au plus)` }
    views[name] = join(root, file)
  }
  return { views }
}

export async function buildWidgets({ views: directory, out, print, printError }) {
  const found = viewsOf(directory)
  if (found.problem) {
    printError(`oto-platform widgets build : ${found.problem}`)
    return 1
  }
  try {
    // Chargé à la demande : Vite et ses plugins ne servent qu'ici, à un hôte qui déclare des vues.
    const { buildHostBundle } = await import('../widgets/build.mjs')
    const { target, sizes } = await buildHostBundle({ views: found.views, out })
    print(`oto-platform widgets build : ${Object.keys(found.views).join(', ')} ; ${sizes} dans ${target}`)
    return 0
  } catch (error) {
    printError(`oto-platform widgets build : ${error?.message ?? error}`)
    return 1
  }
}
