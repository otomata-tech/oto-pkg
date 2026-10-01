#!/usr/bin/env node
/**
 * db:local — prépare la base de test locale du checkout (M62, `scripts/lib/test-db-local.mjs`).
 *
 * Usage : `pnpm db:local` crée le cluster Postgres du poste s'il manque, le démarre s'il est arrêté
 * (après un redémarrage), puis crée la base du checkout, la prépare et lui applique les migrations de
 * `supabase/migrations/`. `--reset` recrée la base (une migration pas encore fusionnée, réécrite après
 * son application). Les tests la lisent avec `PLATFORM_TEST_DB=local` (`.env.local` ou environnement).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureServer, localDatabaseName, LOCAL_PORT, prepareLocalDatabase } from './lib/test-db-local.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const print = (line) => console.log(line)

try {
  ensureServer(print)
  await prepareLocalDatabase(ROOT, { reset: process.argv.includes('--reset'), print })
  console.log(`db:local : base ${localDatabaseName(ROOT)} prête sur 127.0.0.1:${LOCAL_PORT} ; PLATFORM_TEST_DB=local pour y lancer les tests.`)
} catch (error) {
  console.error(`db:local : ${error?.message ?? error}`)
  process.exitCode = 1
}
