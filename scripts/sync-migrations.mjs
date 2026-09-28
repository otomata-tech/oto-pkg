#!/usr/bin/env node
/**
 * sync-migrations — `pnpm migrations:sync` : `oto-platform migrations sync` de la CLI du paquet
 * (ADR-006), avec les dossiers de ce dépôt quel que soit le répertoire courant.
 *
 * Usage : `pnpm migrations:sync` ; `--from <dir> --to <dir>` pour les fixtures de test.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { run } from '../packages/plateforme/cli/index.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const given = (name) => argv.some((arg) => arg === name || arg.startsWith(`${name}=`))
const from = given('--from') ? [] : ['--from', join(ROOT, 'packages/plateforme/migrations')]
const to = given('--to') ? [] : ['--to', join(ROOT, 'supabase/migrations')]

process.exitCode = await run(['migrations', 'sync', ...argv, ...from, ...to])
