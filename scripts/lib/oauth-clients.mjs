/**
 * oauth-clients — ménage des clients OAuth des assistants (E02-S04, H17, HN-E02S04-4 et 5) :
 * arguments, candidats à la purge, table texte, lecture de l'activité, suppression et déroulé des deux
 * commandes. Partagé par `pnpm oauth:clients` et ses tests : sans ce module, le test de fumée
 * n'éprouverait ni la lecture ni la suppression qu'emploie le script.
 *
 * Repris du banc (`mcp-test/scripts/lib/oauth-admin.mjs`) : table texte alignée (en-tête, trait,
 * colonnes), aucune valeur de secret lue. Retiré : les révocations par personne et le schéma
 * `oauth_test` (→ `platform.oauth_clients_activity()`, E01-S06, fiche D10).
 *
 * L'activité se lit par la connexion d'administration, la suppression passe par l'API
 * d'administration d'Auth (E01-S10, AC-f4).
 */
import { codeOf, jsonRows } from './env.mjs'

/**
 * Une ligne de `platform.oauth_clients_activity()` : aucune colonne de secret ni de hachage.
 * @typedef {{ client_id: string, client_name: string | null, client_type: string,
 *   registration_type: string, created_at: string, sessions: number, last_activity: string | null }} ClientRow
 */

/** @typedef {{ command: 'list' } | { command: 'purge', olderThanDays: number, yes: boolean }} Options */

export const USAGE = 'Usage : pnpm oauth:clients list | purge --older-than <jours> [--yes]'
export const MISSING_FUNCTION =
  'La fonction platform.oauth_clients_activity est absente : voir E02-S04, Migrations prévues.'
/** Raison d'un client que `purgeCandidates` n'aurait pas retenu : refusé avant toute requête. */
export const NOT_A_CANDIDATE = 'manuel, actif ou récent : refusé avant la requête'

const DAY_MS = 24 * 60 * 60 * 1000
/** SQLSTATE d'une fonction introuvable : la migration d'E01-S06 manque au projet. */
const UNDEFINED_FUNCTION = '42883'
// Un nom vient de quiconque appelle l'enregistrement dynamique, ouvert et sans authentification : ses
// caractères de contrôle (séquences d'échappement, saut de ligne) et de format (bidi) cacheraient ou
// falsifieraient des lignes du terminal, ou écriraient dans le presse-papiers (OSC 52).
const UNPRINTABLE = /[\p{Cc}\p{Cf}]/gu
// Des `Map` : une valeur nommée `toString` ne doit pas trouver de libellé dans le prototype d'un objet.
const TYPES = new Map([
  ['public', 'public'],
  ['confidential', 'confidentiel'],
])
const REGISTRATIONS = new Map([
  ['dynamic', 'dynamique'],
  ['manual', 'manuel'],
])
const DATE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })

const usageError = (reason) => new Error(`${reason} ${USAGE}`)

/**
 * `list`, ou `purge --older-than <jours> [--yes]` (AC17) ; toute autre forme lève l'usage, avant tout
 * appel réseau.
 * @param {string[]} argv
 * @returns {Options}
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv
  if (command === 'list') {
    if (rest.length > 0) throw usageError(`Argument inattendu : ${rest[0]}.`)
    return { command }
  }
  if (command !== 'purge') throw usageError(command === undefined ? 'Commande manquante.' : `Commande inconnue : ${command}.`)
  let olderThan
  let yes = false
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--yes') yes = true
    else if (rest[i] === '--older-than') {
      olderThan = rest[i + 1]
      if (olderThan === undefined) throw usageError('Valeur manquante pour --older-than <jours>.')
      i += 1
    } else throw usageError(`Argument inattendu : ${rest[i]}.`)
  }
  if (olderThan === undefined) throw usageError('Option requise : --older-than <jours>.')
  const days = /^\d+$/.test(olderThan) ? Number(olderThan) : Number.NaN
  if (!Number.isSafeInteger(days) || days < 1) {
    throw usageError(`--older-than attend un nombre entier de jours, 1 au moins (reçu : « ${olderThan} »).`)
  }
  return { command, olderThanDays: days, yes }
}

/**
 * Les clients à supprimer (AC16) : enregistrés dynamiquement, créés et sans activité de session depuis
 * `olderThanDays` jours au moins, jour exact compris. Un client enregistré à la main, créé ou actif
 * dans la période, reste : son connecteur casserait au rafraîchissement suivant.
 * @param {ClientRow[]} rows
 * @param {{ olderThanDays: number, now: number }} options
 * @returns {ClientRow[]}
 */
export function purgeCandidates(rows, { olderThanDays, now }) {
  const cutoff = now - olderThanDays * DAY_MS
  const before = (iso) => Date.parse(iso) <= cutoff
  return rows.filter(
    (row) => row.registration_type === 'dynamic' && before(row.created_at) && (row.last_activity === null || before(row.last_activity)),
  )
}

/** Colonnes de la table (AC13) : [intitulé, valeur de la ligne]. */
const COLUMNS = [
  ['identifiant', (row) => row.client_id.slice(0, 8)],
  ['nom', (row) => row.client_name?.replace(UNPRINTABLE, '?') ?? '(sans nom)'],
  ['type', (row) => TYPES.get(row.client_type) ?? row.client_type],
  ['enregistrement', (row) => REGISTRATIONS.get(row.registration_type) ?? row.registration_type],
  ['créé le', (row) => DATE.format(new Date(row.created_at))],
  ['sessions', (row) => String(row.sessions)],
  ['dernière activité', (row) => (row.sessions > 0 && row.last_activity ? DATE.format(new Date(row.last_activity)) : 'jamais')],
]

/** Milliseconde d'une date ; une date absente passe après toutes les autres. */
const time = (iso) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY)

/**
 * Table texte des clients (AC13) : en-tête, trait, une ligne par client, colonnes alignées ; triée
 * par dernière activité décroissante, puis par création décroissante. Seules les colonnes de `COLUMNS`
 * sont écrites.
 * @param {ClientRow[]} rows
 * @returns {string}
 */
export function formatClients(rows) {
  const sorted = [...rows].sort((a, b) => time(b.last_activity) - time(a.last_activity) || time(b.created_at) - time(a.created_at))
  const header = COLUMNS.map(([label]) => label)
  const body = sorted.map((row) => COLUMNS.map(([, cell]) => cell(row)))
  const widths = header.map((label, i) => Math.max(label.length, ...body.map((line) => line[i].length)))
  const render = (line) => line.map((value, i) => value.padEnd(widths[i])).join('  ').trimEnd()
  return [render(header), render(widths.map((width) => '-'.repeat(width))), ...body.map(render)].join('\n')
}

/**
 * Les clients non supprimés et l'activité de leurs sessions, par la fonction que seul l'outillage
 * exécute (aucune API d'administration ne donne l'usage d'un client, HN-E02S04-5), en une lecture
 * ordonnée par `client_id` : la connexion d'administration rend toutes les lignes, sans la coupe de
 * `max_rows` qui faisait lire PostgREST par pages (H17). Les colonnes d'un `ClientRow`, telles que
 * PostgREST les rendait (`jsonRows`) : aucune colonne de secret ni de hachage.
 * @param {import('postgres').Sql} sql  connexion d'administration
 * @returns {Promise<ClientRow[]>}
 */
export async function readClients(sql) {
  try {
    return await jsonRows(
      sql,
      sql`client_id, client_name, client_type, registration_type, created_at, sessions, last_activity`,
      sql`from platform.oauth_clients_activity() order by client_id`,
    )
  } catch (error) {
    if (error?.code === UNDEFINED_FUNCTION) throw new Error(MISSING_FUNCTION)
    throw new Error(`Lecture des clients OAuth impossible (${codeOf(error)}).`)
  }
}

/** Le code d'échec de la suppression d'un client, `null` quand elle a réussi. */
async function deleteClient(admin, id) {
  try {
    const { error } = await admin.auth.admin.oauth.deleteClient(id)
    return error ? codeOf(error) : null
  } catch (error) {
    // Hors d'une erreur d'Auth (réseau coupé), le SDK lève : l'échec se nomme comme les autres.
    return codeOf(error)
  }
}

/**
 * Supprime chaque client par l'API d'administration (suppression douce de Supabase Auth) ; un échec
 * n'arrête pas les suivants. Chaque client est revérifié avant sa requête, même retenu par
 * `purgeCandidates` : appelée sans lui, la suppression couperait un connecteur actif ou enregistré à
 * la main (`security-patterns.md § Outillage à clé service`).
 * @param {import('@supabase/supabase-js').SupabaseClient<any, any>} admin  clé de service
 * @param {ClientRow[]} rows
 * @param {{ olderThanDays: number, now: number }} options  les mêmes que `purgeCandidates`
 * @returns {Promise<{ deleted: string[], failed: { id: string, reason: string }[] }>}
 */
export async function deleteClients(admin, rows, options) {
  const deleted = []
  const failed = []
  for (const row of rows) {
    const id = row.client_id
    const reason = purgeCandidates([row], options).length === 0 ? NOT_A_CANDIDATE : await deleteClient(admin, id)
    if (reason === null) deleted.push(id)
    else failed.push({ id, reason })
  }
  return { deleted, failed }
}

/**
 * Déroule `list` ou `purge` (AC13 à AC15) et rend le code de sortie : sans `--yes`, la purge montre
 * ses candidats et sort en 1 ; avec, elle les supprime et sort en 1 si l'un d'eux reste.
 * @param {{ sql: import('postgres').Sql, admin: import('@supabase/supabase-js').SupabaseClient<any, any> }} db
 *   l'activité par la connexion d'administration ; la suppression par l'API d'administration d'Auth
 * @param {Options} options
 * @param {{ log: (line: string) => void, error: (line: string) => void }} out  sortie standard et d'erreur
 * @param {number} [now]  heure de référence de la purge
 * @returns {Promise<number>}
 */
export async function runCommand({ sql, admin }, options, out, now = Date.now()) {
  const rows = await readClients(sql)
  if (options.command === 'list') {
    out.log(rows.length > 0 ? formatClients(rows) : 'Aucun client enregistré.')
    return 0
  }
  const period = { olderThanDays: options.olderThanDays, now }
  const candidates = purgeCandidates(rows, period)
  if (candidates.length === 0) {
    out.log('Aucun client à supprimer.')
    return 0
  }
  out.log(formatClients(candidates))
  if (!options.yes) {
    out.log(`${candidates.length} client(s) seraient supprimés. Relancez avec --yes pour les supprimer.`)
    return 1
  }
  const { deleted, failed } = await deleteClients(admin, candidates, period)
  for (const { id, reason } of failed) out.error(`Suppression impossible : ${id} (${reason}).`)
  out.log(`${deleted.length} client(s) supprimé(s).`)
  return failed.length > 0 ? 1 : 0
}
