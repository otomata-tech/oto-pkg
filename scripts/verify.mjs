#!/usr/bin/env node
/**
 * verify — les checks de `pnpm verify`, par étapes.
 *
 *   node scripts/verify.mjs check:framework,type-check,lint test
 *
 * Chaque argument est une étape, chaque nom un script de package.json lancé par `pnpm run`. Les
 * checks d'une étape tournent en même temps ; l'étape suivante ne part que s'ils ont tous réussi.
 * Code de sortie 1 au premier échec, et la dernière ligne nomme les checks en échec.
 *
 * Le reçu n'est pas écrit ici : package.json enchaîne `verify-receipt.mjs write` derrière ce
 * script, donc seulement sur un code de sortie nul. Les étapes restent écrites dans package.json,
 * où `check:framework` contrôle que `verify` nomme les quatre checks avant le reçu.
 *
 * Pourquoi : lancés l'un après l'autre, check:framework, type-check et lint coûtaient la somme de
 * leurs durées avant même les tests (M12). Aucun ne lit ce qu'un autre produit.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// La racine du SCRIPT, comme `verify-receipt.mjs` : les checks portent sur ce dépôt quel que soit le cwd.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const secondes = (ms) => `${(ms / 1000).toFixed(1)} s`

/**
 * Lance `pnpm run <check>`. Seul dans son étape, il écrit en direct. À plusieurs, chacun garde sa
 * sortie (stdout et stderr, dans l'ordre d'arrivée) et l'affiche d'un bloc à sa fin : les lignes
 * de trois checks simultanés ne se mêlent pas.
 */
function lancer(check, direct) {
  return new Promise((resolve) => {
    const debut = Date.now()
    const morceaux = []
    const fin = (code) =>
      resolve({ check, ok: code === 0, sortie: Buffer.concat(morceaux).toString(), duree: Date.now() - debut })
    // `shell` : sous Windows, pnpm est un script `.cmd`, que Node ne lance pas sans shell. Une seule
    // chaîne, sans tableau d'arguments : Node 24 déprécie les arguments passés avec `shell` (DEP0190).
    const enfant = spawn(`pnpm run ${check}`, {
      cwd: ROOT,
      shell: true,
      stdio: direct ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    })
    if (!direct) {
      enfant.stdout.on('data', (morceau) => morceaux.push(morceau))
      enfant.stderr.on('data', (morceau) => morceaux.push(morceau))
    }
    // Un lancement impossible compte comme un échec, avec sa raison dans la sortie du check.
    enfant.on('error', (error) => {
      morceaux.push(Buffer.from(`${error.message}\n`))
      fin(1)
    })
    enfant.on('close', fin)
  })
}

/** Lance une étape et rend les checks en échec, dans l'ordre où l'étape les nomme. */
async function etape(checks) {
  const direct = checks.length === 1
  console.log(direct ? `\n── ${checks[0]}` : `\n→  ${checks.join(', ')} : en même temps, chaque sortie à la fin de son check`)
  const resultats = await Promise.all(
    checks.map((check) =>
      lancer(check, direct).then((r) => {
        const statut = `── ${r.check} : ${r.ok ? 'OK' : 'ÉCHEC'} (${secondes(r.duree)})`
        const sortie = r.sortie && !r.sortie.endsWith('\n') ? `${r.sortie}\n` : r.sortie
        // Un seul `write` par check : son bloc ne peut pas être coupé par celui d'un autre.
        process.stdout.write(direct ? `${statut}\n` : `\n${statut}\n${sortie}`)
        return r
      })
    )
  )
  return resultats.filter((r) => !r.ok).map((r) => r.check)
}

const etapes = process.argv
  .slice(2)
  .map((argument) => argument.split(',').map((check) => check.trim()).filter(Boolean))
  .filter((checks) => checks.length)

// Sans étape, le script sortait 0 sans rien lancer, et package.json écrivait le reçu derrière.
if (!etapes.length) {
  console.error('usage : node scripts/verify.mjs <check>[,<check>…] [<check>[,<check>…] …]')
  process.exit(2)
}

const debut = Date.now()
for (const [i, checks] of etapes.entries()) {
  const echecs = await etape(checks)
  if (echecs.length) {
    const nonLances = etapes.slice(i + 1).flat()
    console.log(`\n✖  verify : échec de ${echecs.join(', ')}${nonLances.length ? ` ; non lancé : ${nonLances.join(', ')}` : ''}.`)
    // `exitCode` plutôt que `exit()` : la sortie déjà écrite dans un pipe part en entier.
    process.exitCode = 1
    break
  }
}
if (!process.exitCode) console.log(`\n✔  verify : ${etapes.flat().join(', ')} passés (${secondes(Date.now() - debut)}).`)
