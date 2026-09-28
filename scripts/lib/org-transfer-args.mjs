/**
 * org-transfer-args — arguments, variables et lectures de `pnpm org:export` et `pnpm org:import`
 * (E09-S04, AC5, AC11, AC13), partagés par les deux scripts ; à part de `org-transfer.mjs` pour le
 * plafond de lignes d'ESLint. Outillage seulement (ADR-006 § 3) : `platform` par la connexion
 * d'administration, les personnes par l'API d'administration d'Auth (E01-S10, AC-f4).
 */
import { existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { ADMIN_VARIABLES, codeOf, envFileTexts, missingVariables, resolveVariables } from './env.mjs'

const EXPORT_SUFFIX = '.org-export.json'
// Options de `parseArgs` (node:util), comme la CLI du paquet (`packages/plateforme/cli/index.mjs`).
const EXPORT_OPTIONS = {
  org: { type: 'string' },
  out: { type: 'string' },
  'with-journal': { type: 'boolean' },
  force: { type: 'boolean' },
  env: { type: 'string' },
}
const IMPORT_OPTIONS = {
  in: { type: 'string' },
  slug: { type: 'string' },
  prefix: { type: 'string' },
  name: { type: 'string' },
  'auteur-par-defaut': { type: 'string' },
  domain: { type: 'string', multiple: true },
  env: { type: 'string' },
}
const EXPORT_USAGE =
  'Usage : pnpm org:export --org <slug> --out <fichier>.org-export.json [--with-journal] [--force] [--env <fichier>]'
const IMPORT_USAGE =
  'Usage : pnpm org:import --in <fichier> --slug <slug> --prefix <préfixe> [--name <nom>] ' +
  '[--auteur-par-defaut <email>] [--domain <hôte>]… [--env <fichier>]'
const INVALID_SLUG = 'Slug invalide : 2 à 40 minuscules, chiffres ou tirets, sans tiret au bord.'
export const INVALID_PREFIX = 'Préfixe invalide : 2 à 12 minuscules ou chiffres, commençant par une lettre.'

// `create_org` (E01-S04) pour le slug ; `orgs.prefix` (E01-S02) ; `org_domains.host` (E02-S01).
const SLUG = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/
const PREFIX = /^[a-z][a-z0-9]{1,11}$/
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/
const EMAIL = /^[^@\s]+@[^@\s]+$/

/**
 * Variables de l'outillage (`ADMIN_VARIABLES` : URL et clé secrète du projet, connexion
 * d'administration) : sans `--env`, le processus, puis `.env.local`, puis `.env` ; avec `--env`, ce
 * fichier seul, qui l'emporte sur le processus (projet d'un ERP). `missing` : noms seulement, jamais
 * une valeur.
 * @param {Record<string, string | undefined>} processEnv
 * @param {string[]} fileTexts
 * @param {boolean} fromEnvFile
 * @returns {{ values: Record<string, string>, missing: string[] }}
 */
export function transferEnv(processEnv, fileTexts, fromEnvFile) {
  return resolveVariables(fromEnvFile ? {} : processEnv, fileTexts, ADMIN_VARIABLES)
}

/**
 * Lit les variables : le fichier de `--env` (absent : erreur), sinon le processus puis `.env.local` et
 * `.env` de `root` ; lève « Variables manquantes : <noms> » (AC5), jamais une valeur.
 * @param {string | null} envFile
 * @param {Record<string, string | undefined>} processEnv
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function readVariables(envFile, processEnv, root) {
  let resolved
  if (envFile) {
    if (!existsSync(envFile)) throw new Error(`Fichier de variables illisible : ${envFile}.`)
    resolved = transferEnv(processEnv, [readFileSync(envFile, 'utf8')], true)
  } else {
    resolved = transferEnv(processEnv, envFileTexts(root), false)
  }
  if (resolved.missing.length > 0) throw new Error(missingVariables(resolved.missing))
  return resolved.values
}

/**
 * Une lecture de la connexion d'administration ; son échec lève « Lecture <quoi> impossible
 * (<code>). », jamais le message de la base (`codeOf`), comme l'export-import le disait d'une erreur
 * de PostgREST.
 * @template T
 * @param {PromiseLike<T>} query
 * @param {string} what  « de l'organisation », « des adresses »…
 * @returns {Promise<T>}
 */
export async function readOrFail(query, what) {
  try {
    return await query
  } catch (error) {
    throw new Error(`Lecture ${what} impossible (${codeOf(error)}).`)
  }
}

/**
 * Les options de `argv` (`parseArgs` strict, sans argument positionnel) ; ses erreurs, en anglais,
 * deviennent un message qui nomme l'option ou l'argument en cause, suivi de l'usage (comme
 * `usageErrorOf` de la CLI du paquet).
 */
export function readOptions(argv, options, usage) {
  try {
    return parseArgs({ args: argv, options, strict: true }).values
  } catch (error) {
    const quoted = error.message.match(/'([^']*)'/)?.[1] ?? ''
    const option = quoted.split(' ')[0]
    if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') throw new Error(`Option inconnue : ${option}. ${usage}`)
    if (error.code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL') throw new Error(`Argument inattendu : ${quoted}. ${usage}`)
    if (error.code !== 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') throw error
    const problem = options[option.slice(2)]?.type === 'boolean' ? `L'option ${option} ne prend pas de valeur` : `Valeur manquante pour ${option}`
    throw new Error(`${problem}. ${usage}`)
  }
}

/**
 * `--org <slug> --out <fichier>.org-export.json [--with-journal] [--force] [--env <fichier>]` (AC1,
 * AC2, AC5) ; le suffixe est celui que `.gitignore` écarte (ADR-010 § 4).
 * @param {string[]} argv
 * @returns {{ org: string, out: string, env: string | null, withJournal: boolean, force: boolean }}
 */
export function parseExportArgs(argv) {
  const values = readOptions(argv, EXPORT_OPTIONS, EXPORT_USAGE)
  const options = {
    org: values.org ?? '',
    out: values.out ?? '',
    env: values.env ?? null,
    withJournal: values['with-journal'] ?? false,
    force: values.force ?? false,
  }
  if (!options.org) throw new Error(`Option requise : --org <slug>. ${EXPORT_USAGE}`)
  if (!options.out) throw new Error(`Option requise : --out <fichier>. ${EXPORT_USAGE}`)
  if (!options.out.endsWith(EXPORT_SUFFIX)) throw new Error(`Le fichier doit se terminer par ${EXPORT_SUFFIX} (ignoré par git).`)
  return options
}

/** Un `--domain` : minuscules, sans port, au motif de `org_domains.host`. */
function domainArg(value) {
  const host = value.trim().toLowerCase()
  if (host.includes(':') || host.length > 253 || !HOST.test(host)) {
    throw new Error(`Adresse invalide : ${value} (nom d'hôte en minuscules, sans port).`)
  }
  return host
}

/**
 * `--in <fichier> --slug <slug> --prefix <préfixe> [--name <nom>] [--auteur-par-defaut <email>]
 * [--domain <hôte>]… [--env <fichier>]` (AC6, AC10, AC11, AC13).
 * @param {string[]} argv
 * @returns {{ in: string, slug: string, prefix: string, name: string | null, defaultAuthor: string | null,
 *   domains: string[], env: string | null }}
 */
export function parseImportArgs(argv) {
  const values = readOptions(argv, IMPORT_OPTIONS, IMPORT_USAGE)
  for (const [key, option] of [['in', '--in <fichier>'], ['slug', '--slug <slug>'], ['prefix', '--prefix <préfixe>']]) {
    if (!values[key]) throw new Error(`Option requise : ${option}. ${IMPORT_USAGE}`)
  }
  if (!SLUG.test(values.slug)) throw new Error(INVALID_SLUG)
  if (!PREFIX.test(values.prefix)) throw new Error(INVALID_PREFIX)
  const name = values.name?.trim() ?? null
  if (name !== null && (name.length < 1 || name.length > 80)) throw new Error('Nom invalide : 1 à 80 caractères.')
  const defaultAuthor = values['auteur-par-defaut']?.trim().toLowerCase() ?? null
  if (defaultAuthor !== null && !EMAIL.test(defaultAuthor)) throw new Error(`Email invalide pour --auteur-par-defaut : ${defaultAuthor}.`)
  const domains = [...new Set((values.domain ?? []).map(domainArg))]
  return { in: values.in, slug: values.slug, prefix: values.prefix, name, defaultAuthor, domains, env: values.env ?? null }
}
