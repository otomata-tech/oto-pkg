#!/usr/bin/env node
/**
 * check-migrations — `pnpm check:migrations` : `oto-platform migrations check` de la CLI du paquet
 * (ADR-006, FR-INST-04), lancé aussi par la CI.
 *
 * Usage : `pnpm check:migrations` (toutes les migrations du paquet) ou
 * `node scripts/check-migrations.mjs --file <chemin>` (un fichier seul, pour les fixtures).
 * Sortie : `fichier:ligne règle` par erreur, code 1 s'il y en a une.
 */
import { run } from '../packages/plateforme/cli/index.mjs'

process.exitCode = await run(['migrations', 'check', ...process.argv.slice(2)])
