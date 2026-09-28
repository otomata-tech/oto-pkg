#!/usr/bin/env node
/**
 * db-types — régénère `packages/plateforme/server/database.ts` depuis le schéma `platform` du
 * projet Supabase (E01-S02).
 *
 * Ce que ça empêche : un `db:types` qui ne tourne que sous un shell POSIX (`"$VAR"`, `>`), et des
 * types écrits sans l'en-tête « généré ». `SUPABASE_PROJECT_ID` et `SUPABASE_ACCESS_TOKEN` sont
 * lus dans l'environnement, sinon dans `.env.local` ; aucune valeur n'est jamais affichée.
 *
 * Usage : `pnpm db:types` ; `--dry-run` affiche la commande, ref masqué, sans rien lancer.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'packages/plateforme/server/database.ts')
const REQUIRED = ['SUPABASE_PROJECT_ID', 'SUPABASE_ACCESS_TOKEN']

export const HEADER = '// Généré par `pnpm db:types` (schéma platform) — ne pas modifier à la main.\n'

/**
 * Variables requises : `processEnv` l'emporte, `.env.local` complète. `missing` = noms seulement.
 * @returns {{ values: Record<string, string>, missing: string[] }}
 */
export function resolveCredentials(processEnv, envFileText) {
  const fromFile = envFileText ? parseEnv(envFileText) : {}
  /** @type {Record<string, string>} */
  const values = {}
  const missing = []
  for (const key of REQUIRED) {
    const value = processEnv[key] || fromFile[key]
    if (value) values[key] = value
    else missing.push(key)
  }
  return { values, missing }
}

/**
 * Commande `supabase gen types`, en une seule chaîne passée au shell (`npx` est un .cmd sous
 * Windows, qui ne se lance qu'à travers un shell). Un tableau d'arguments avec `shell: true`
 * n'est pas échappé par Node (DEP0190) : la chaîne est faite de constantes et du ref, validé
 * avant d'y entrer (un ref Supabase = 20 minuscules).
 */
export class ProjectRefError extends Error {
  name = 'ProjectRefError'
}

export function buildCommand(projectId) {
  if (!/^[a-z]{20}$/.test(projectId)) throw new ProjectRefError('SUPABASE_PROJECT_ID invalide (attendu : 20 lettres minuscules)')
  return `npx supabase gen types typescript --project-id ${projectId} --schema platform`
}

export function withHeader(output) {
  return HEADER + output
}

function main(argv) {
  const envFile = join(ROOT, '.env.local')
  const envFileText = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
  const { values, missing } = resolveCredentials(process.env, envFileText)
  if (missing.length) {
    console.error(`db:types — variable(s) manquante(s) dans l'environnement et .env.local : ${missing.join(', ')}`)
    return 1
  }

  let command
  try {
    command = buildCommand(values.SUPABASE_PROJECT_ID)
  } catch (error) {
    console.error(`db:types — ${error.message}`)
    return 1
  }

  if (argv.includes('--dry-run')) {
    const shown = command.replace(values.SUPABASE_PROJECT_ID, '<ref masqué>')
    console.log(shown)
    return 0
  }

  let output
  try {
    output = execSync(command, {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: values.SUPABASE_ACCESS_TOKEN },
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch (error) {
    // Le message d'execSync recopie la ligne de commande, donc le ref : on n'en garde que le code.
    console.error(`db:types — échec de supabase gen types (code ${error.status ?? 'inconnu'})`)
    return 1
  }

  const content = withHeader(output)
  writeFileSync(OUTPUT, content)
  console.log(`types générés : ${content.split('\n').length} lignes`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
