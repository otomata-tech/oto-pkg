/**
 * migrations sync — copie les migrations du paquet dans celles de l'hôte (ADR-006).
 *
 * Ce que ça empêche : que l'hôte applique autre chose que ce que le paquet livre. Le paquet fait
 * foi ; une copie qui diverge est signalée et rien n'est écrit, elle n'est jamais écrasée en
 * silence (l'écart peut être une modification locale à comprendre).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Noms des migrations `.sql` d'un dossier, dans l'ordre d'application (horodatage en tête). */
export function sqlFiles(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
}

/** `{ from, to }` : dossiers source et hôte, relatifs au répertoire courant ou absolus. */
export function syncMigrations(dirs) {
  const from = resolve(dirs.from)
  const to = resolve(dirs.to)
  if (!existsSync(from)) {
    console.error(`migrations:sync — dossier introuvable : ${from}`)
    return 1
  }
  const files = sqlFiles(from)

  const plan = files.map((file) => {
    const target = join(to, file)
    if (!existsSync(target)) return { file, state: 'copy' }
    const same = readFileSync(join(from, file)).equals(readFileSync(target))
    return { file, state: same ? 'same' : 'diverged' }
  })

  const diverged = plan.filter((p) => p.state === 'diverged')
  if (diverged.length) {
    for (const { file } of diverged) console.error(`migrations:sync — ${file} diffère de la copie de l'hôte, non écrasé`)
    console.error('migrations:sync — aucun fichier écrit : le paquet fait foi, résoudre l\'écart à la main')
    return 1
  }

  mkdirSync(to, { recursive: true })
  for (const { file, state } of plan) {
    if (state === 'copy') copyFileSync(join(from, file), join(to, file))
    console.log(`${state === 'copy' ? 'copié  ' : 'à jour '} ${file}`)
  }
  return 0
}
