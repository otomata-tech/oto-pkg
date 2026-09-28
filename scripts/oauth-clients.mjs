#!/usr/bin/env node
/**
 * oauth-clients — liste les clients OAuth des assistants et supprime ceux qui ne servent plus
 * (E02-S04, H17, AC13 à AC17).
 *
 * Ce que ça empêche : `auth.oauth_clients` qui grossit sans fin, sans qu'on sache quels clients
 * servent encore. Les hosts ne purgent jamais les leurs : un client par connecteur, par organisation
 * et par poste Claude Code (`mcp-patterns.md § 6`).
 *
 * Usage : `pnpm oauth:clients list` ; `pnpm oauth:clients purge --older-than <jours> [--yes]`. Sans
 * `--yes`, la purge montre ses candidats et sort en 1 ; avec, elle les supprime par
 * `auth.admin.oauth.deleteClient`. L'activité vient de `platform.oauth_clients_activity()` (E01-S06,
 * fiche D10), que seul l'outillage exécute, lue par la connexion d'administration (E01-S10, AC-f4).
 * Outillage lancé à la main par JB, hors du paquet ; aucune valeur de variable, aucun secret ni
 * hachage de client n'est lu ou imprimé.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ADMIN_VARIABLES, adminSql, envFileTexts, maskValues, messageOf, missingVariables, resolveVariables, serviceKeyClient } from './lib/env.mjs'
import { parseArgs, runCommand } from './lib/oauth-clients.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function main(argv) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(messageOf(error))
    return 1
  }
  const { values, missing } = resolveVariables(process.env, envFileTexts(ROOT), ADMIN_VARIABLES)
  if (missing.length > 0) {
    console.error(missingVariables(missing))
    return 1
  }
  let sql
  try {
    sql = adminSql(values)
    return await runCommand({ sql, admin: serviceKeyClient(values) }, options, { log: console.log, error: console.error })
  } catch (error) {
    console.error(maskValues(messageOf(error), Object.values(values)))
    return 1
  } finally {
    await sql?.end()
  }
}

// Pas de process.exit : sous Windows, il arrête Node sur une assertion libuv quand une connexion HTTP
// se ferme encore (constaté au banc, `mcp-test/scripts/oauth-admin.mjs` l. 126-128).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
