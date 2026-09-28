/**
 * oto-platform — la ligne de commande du paquet, pour l'application hôte qui l'installe : copie
 * et contrôle des migrations du schéma `platform` (ADR-006), préparation d'une base (ADR-012 § 1).
 *
 * `run(argv)` rend le code de sortie : 0 succès, 1 copie ou migration refusée, préparation en échec,
 * 2 usage incorrect. Appelée par `bin.mjs` (le `bin` du paquet) et par les scripts `migrations:sync`
 * et `check:migrations` du dépôt.
 */
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { checkMigrations } from './migrations-check.mjs'
import { sqlFiles, syncMigrations } from './migrations-sync.mjs'

// Les migrations embarquées, voisines de cli/ dans le paquet installé.
const PACKAGE_MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url))

const USAGE = `Usage : oto-platform migrations <sync|check> [options]
        oto-platform db prepare --db-url <url>

  migrations sync [--from <dossier>] [--to <dossier>]
    Copie les migrations du paquet dans celles de l'application hôte. Une copie qui diffère
    n'est jamais écrasée : rien n'est écrit et le code de sortie vaut 1.
    --from  migrations à copier (défaut : celles du paquet)
    --to    migrations de l'hôte (défaut : supabase/migrations du répertoire courant)

  migrations check [--file <fichier.sql>]
    Contrôle que le SQL ne touche que le schéma platform et ne fait qu'ajouter, que toute
    fonction créée dans platform retire l'exécution à public dans le même fichier
    (revoke execute … from public ; fonctions de déclencheur exceptées), et qu'il reste portable :
    aucune clé vers auth.users, aucune lecture de auth.users (fonction, vue, requête, bloc) hors
    des trois fonctions propres à Supabase, aucune extension hors de pg_trgm, unaccent et ltree.
    --file  un fichier seul (défaut : les migrations du paquet)

  db prepare --db-url <url>
    Prépare une base avant les migrations, une fois ; un second passage ne change rien. Sur un
    Postgres sans Supabase : rôles anon et authenticated, schéma auth (uid, jwt, role), schéma
    extensions avec pg_trgm, unaccent et ltree. Partout : le rôle platform_app (connexion du
    serveur, membre d'anon et d'authenticated), son mot de passe lu dans PLATFORM_APP_PASSWORD.
    --db-url  URL de connexion d'un rôle d'administration de la base ; TLS exigé, sauf sslmode
              écrit dans l'URL (?sslmode=disable pour un Postgres local sans TLS)

  -h, --help  cette aide

Codes de sortie : 0 succès, 1 copie, migration ou préparation refusée, 2 usage incorrect.`

const OPTIONS = {
  from: { type: 'string' },
  to: { type: 'string' },
  file: { type: 'string' },
  'db-url': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
}
// Options de chaque sous-commande : celle d'une autre y est une option inconnue.
const COMMANDS = {
  migrations: { sync: ['from', 'to'], check: ['file'] },
  db: { prepare: ['db-url'] },
}

/** Usage incorrect : le problème nommé sur stderr, puis l'usage, code 2. */
class UsageError extends Error {}

/** Nomme l'option en cause d'une erreur de `parseArgs`, dont le message est en anglais. */
function usageErrorOf(error) {
  if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    const option = error.message.match(/'(-[^'\s]*)'/)?.[1]
    return new UsageError(option ? `option inconnue « ${option} »` : 'option inconnue')
  }
  if (error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
    const option = error.message.match(/--[\w-]+/)?.[0]
    if (!option) return new UsageError('option sans valeur')
    const takesNoValue = OPTIONS[option.slice(2)]?.type === 'boolean'
    return new UsageError(takesNoValue ? `l'option « ${option} » ne prend pas de valeur` : `l'option « ${option} » attend une valeur`)
  }
  return error
}

function parse(argv) {
  let parsed
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: true })
  } catch (error) {
    throw usageErrorOf(error)
  }
  const { values, positionals } = parsed
  if (values.help) return { help: true }
  const [command, subcommand, extra] = positionals
  if (!command) throw new UsageError('commande manquante')
  if (!Object.hasOwn(COMMANDS, command)) throw new UsageError(`commande inconnue « ${command} »`)
  const subcommands = COMMANDS[command]
  const names = Object.keys(subcommands).join(' ou ')
  if (!subcommand) throw new UsageError(`sous-commande manquante après « ${command} » (${names})`)
  if (!Object.hasOwn(subcommands, subcommand)) throw new UsageError(`sous-commande inconnue « ${subcommand} »`)
  if (extra !== undefined) throw new UsageError(`argument en trop « ${extra} »`)
  for (const [name, value] of Object.entries(values)) {
    if (!subcommands[subcommand].includes(name)) throw new UsageError(`option « --${name} » inconnue de « ${command} ${subcommand} »`)
    if (value === '') throw new UsageError(`l'option « --${name} » attend une valeur`)
  }
  if (command === 'db' && !values['db-url']) throw new UsageError("« db prepare » attend --db-url <url>")
  return { command, subcommand, ...values }
}

export async function run(argv) {
  let options
  try {
    options = parse(argv)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    console.error(`oto-platform : ${error.message}\n\n${USAGE}`)
    return 2
  }
  if (options.help) {
    console.log(USAGE)
    return 0
  }
  if (options.command === 'db') {
    // Chargé à la demande : le pilote Postgres ne sert qu'ici, pas à la copie ni au contrôle.
    const { prepareDatabase } = await import('./db-prepare.mjs')
    return prepareDatabase({
      dbUrl: options['db-url'],
      password: process.env.PLATFORM_APP_PASSWORD,
      print: (line) => console.log(line),
      printError: (line) => console.error(line),
    })
  }
  if (options.subcommand === 'sync') {
    return syncMigrations({ from: options.from ?? PACKAGE_MIGRATIONS, to: options.to ?? 'supabase/migrations' })
  }
  const files = options.file ? [options.file] : sqlFiles(PACKAGE_MIGRATIONS).map((file) => join(PACKAGE_MIGRATIONS, file))
  return checkMigrations({ files })
}
