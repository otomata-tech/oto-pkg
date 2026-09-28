#!/usr/bin/env node
/**
 * supabase-data-api — retire `platform` des schémas que le Data API d'un projet Supabase expose, par
 * l'API de gestion (E01-S10 partie f2, fiche D80, AC-f1).
 *
 * Ce que ça empêche : depuis E01-S10, le paquet lit `platform` par sa propre connexion
 * (`PLATFORM_DATABASE_URL`), sous l'appelant vérifié, et ses services décident chaque droit. Laissé
 * exposé, le schéma reste lisible et modifiable par PostgREST sous le seul jeton d'une personne, que
 * seule la RLS d'isolation borne (E01-S08, D28) : le trou que le port de base referme.
 *
 * Usage : `pnpm data-api:close --to <ref> [--apply]`. Sans `--apply`, rien n'est écrit : les schémas
 * exposés de la cible et ceux voulus. Avec, un seul envoi (`db_schema` sans `platform`), une relecture,
 * puis le contrôle d'AC-f1 : `/rest/v1/nodes` sous `Accept-Profile: platform` est refusé (schéma non
 * exposé, `PGRST106`). Rien d'autre du Data API ne change (`max_rows`, chemin de recherche). Le jeton de
 * gestion (`SUPABASE_ACCESS_TOKEN`, environnement ou `.env.local`) et la clé publique lue pour le
 * contrôle ne sont jamais affichés. Outillage lancé à la main, hors du paquet ; à lancer seulement une
 * fois l'application de l'hôte passée à une version du paquet qui contient f2 : avant, elle lit encore
 * `platform` par PostgREST et casserait.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { envFileTexts, maskValues, messageOf, missingVariables, resolveVariables } from './lib/env.mjs'
import { readOptions } from './lib/org-transfer-args.mjs'

/** @typedef {(url: string, init?: RequestInit) => Promise<Response>} FetchLike */
/** @typedef {{ log: (line: string) => void, error: (line: string) => void }} Output */
/** @typedef {{ to: string, apply: boolean }} Options */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api.supabase.com/v1/projects'
const TOKEN = 'SUPABASE_ACCESS_TOKEN'
const TOKEN_STEPS =
  "Créer un jeton d'accès personnel sur supabase.com (Account → Access Tokens), le poser dans " +
  `${TOKEN} (environnement, ou .env.local, jamais commité), puis relancer.`
const USAGE = 'Usage : pnpm data-api:close --to <ref> [--apply]'
const SCHEMA = 'platform'
const REF = /^[a-z]{20}$/
const HINTS = new Map([
  [401, `jeton refusé. ${TOKEN_STEPS}`],
  [403, "le compte du jeton n'a pas accès à ce projet"],
  [404, 'projet introuvable : vérifier la référence (Settings → General)'],
])
/** Le refus de PostgREST pour un schéma hors de sa liste : « The schema must be one of the following ». */
const NOT_EXPOSED = 'PGRST106'
/** PostgREST relit sa configuration après l'envoi : le contrôle réessaie, `PROBE_TRIES` fois au plus. */
const PROBE_TRIES = 20
const PROBE_WAIT_MS = 3000

/**
 * `--to <ref> [--apply]` ; toute autre forme lève l'usage ou la raison du refus, avant toute requête.
 * @param {string[]} argv
 * @returns {Options}
 */
function parseArgs(argv) {
  const values = readOptions(argv, { to: { type: 'string' }, apply: { type: 'boolean' } }, USAGE)
  if (!values.to) throw new Error(`Option requise : --to <ref>. ${USAGE}`)
  if (!REF.test(values.to)) throw new Error(`Référence de projet invalide : « ${values.to} » (20 lettres minuscules, Settings → General).`)
  return { to: values.to, apply: values.apply ?? false }
}

/** Les schémas d'un `db_schema` (séparés par des virgules). */
function schemasOf(dbSchema) {
  return typeof dbSchema === 'string' ? dbSchema.split(',').map((schema) => schema.trim()).filter(Boolean) : []
}

/**
 * Appels de l'API de gestion au jeton de la personne qui lance le script ; une réponse refusée devient
 * un message qui nomme le verbe, le chemin et le statut, jamais le corps (il peut porter un secret).
 * @param {FetchLike} fetchImpl
 * @param {string} token
 */
function managementApi(fetchImpl, token) {
  async function call(method, ref, path, body) {
    const where = `${method} ${path.split('?')[0]} du projet ${ref}`
    let response
    try {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }
      response = await fetchImpl(`${API}/${ref}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (error) {
      throw new Error(`API de gestion injoignable (${where}) : ${messageOf(error)}`)
    }
    if (!response.ok) throw new Error(`${where} : ${response.status}${HINTS.has(response.status) ? `, ${HINTS.get(response.status)}` : ''}.`)
    const data = await response.json().catch(() => undefined)
    if (data === null || typeof data !== 'object') throw new Error(`Réponse illisible (${where}).`)
    return data
  }
  return { get: (ref, path) => call('GET', ref, path), patch: (ref, path, body) => call('PATCH', ref, path, body) }
}

/**
 * La clé publique du projet (clé `anon`, ou clé publiable), lue par l'API de gestion : l'en-tête
 * `apikey` que la passerelle du Data API exige avant PostgREST. Jamais affichée.
 * @param {ReturnType<typeof managementApi>} api
 * @param {string} ref
 */
async function publicKey(api, ref) {
  const keys = await api.get(ref, 'api-keys?reveal=false')
  const found = Array.isArray(keys) ? keys.find((key) => key?.name === 'anon' || key?.type === 'publishable') : undefined
  if (typeof found?.api_key !== 'string' || !found.api_key) throw new Error(`Aucune clé publique lisible pour le projet ${ref} (GET api-keys).`)
  return found.api_key
}

/**
 * Le contrôle d'AC-f1 : `/rest/v1/nodes` sous `Accept-Profile: platform`, à la clé publique. Refusé
 * `PGRST106` : le schéma n'est plus exposé. Le refus précède tout rôle : un jeton de membre n'y change
 * rien. Réessaie le temps que PostgREST relise sa configuration.
 * @param {{ fetch: FetchLike, wait: (ms: number) => Promise<void> }} deps
 * @param {string} ref
 * @param {string} key
 * @returns {Promise<string | null>} `null` si refusé ; sinon ce que PostgREST a rendu
 */
async function stillServed(deps, ref, key) {
  let seen = ''
  for (let attempt = 1; attempt <= PROBE_TRIES; attempt += 1) {
    const response = await deps.fetch(`https://${ref}.supabase.co/rest/v1/nodes?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': SCHEMA },
    })
    const body = await response.json().catch(() => undefined)
    if (!response.ok && body?.code === NOT_EXPOSED) return null
    seen = `HTTP ${response.status}${typeof body?.code === 'string' ? ` ${body.code}` : ''}`
    if (attempt < PROBE_TRIES) await deps.wait(PROBE_WAIT_MS)
  }
  return seen
}

/**
 * Montre les schémas exposés et ceux voulus ; avec `--apply`, envoie, relit, puis contrôle que PostgREST
 * refuse `platform`. Rend le code de sortie.
 * @param {{ fetch: FetchLike, token: string, wait: (ms: number) => Promise<void> }} deps
 * @param {Options} options
 * @param {Output} out
 * @param {string[]} secrets les valeurs à masquer dans un message ; la clé publique s'y ajoute une fois lue
 * @returns {Promise<number>}
 */
async function closeDataApi(deps, options, out, secrets) {
  const api = managementApi(deps.fetch, deps.token)
  const current = schemasOf((await api.get(options.to, 'postgrest')).db_schema)
  const wanted = current.filter((schema) => schema !== SCHEMA)
  out.log(`Schémas exposés par le Data API du projet ${options.to} : ${current.join(', ') || '(aucun)'}`)
  if (wanted.length === current.length) out.log(`Déjà réglé : ${SCHEMA} n'est pas exposé.`)
  else out.log(`  à changer   db_schema : ${current.join(', ')} → ${wanted.join(', ')} (E01-S10 f2, fiche D80)`)
  if (!options.apply) {
    if (wanted.length !== current.length) out.log('Relancez avec --apply pour écrire le réglage ; le contrôle suit.')
    return 0
  }
  if (wanted.length !== current.length) {
    await api.patch(options.to, 'postgrest', { db_schema: wanted.join(', ') })
    const reread = schemasOf((await api.get(options.to, 'postgrest')).db_schema)
    if (reread.includes(SCHEMA)) {
      out.error(`Relu : ${SCHEMA} est encore dans db_schema (${reread.join(', ')}).`)
      return 1
    }
    out.log(`db_schema écrit et relu : ${reread.join(', ')}.`)
  }
  const key = await publicKey(api, options.to)
  secrets.push(key)
  const served = await stillServed(deps, options.to, key)
  if (served !== null) {
    out.error(`Contrôle : /rest/v1/nodes sous Accept-Profile: ${SCHEMA} n'est pas refusé (${served}) ; PostgREST sert encore le schéma.`)
    return 1
  }
  out.log(`Contrôle : /rest/v1/nodes sous Accept-Profile: ${SCHEMA} est refusé (${NOT_EXPOSED}, schéma non exposé).`)
  return 0
}

/**
 * Le script entier, ses dépendances passées : arguments, jeton (environnement, puis `.env.local` et
 * `.env`), réglage, contrôle. Un argument invalide ou un jeton absent sort en 1 avant toute requête ;
 * aucun message ne porte le jeton ni la clé publique.
 * @param {string[]} argv
 * @param {{ env: Record<string, string | undefined>, fileTexts: string[], fetch: FetchLike,
 *   wait?: (ms: number) => Promise<void>, out: Output }} deps
 * @returns {Promise<number>}
 */
export async function runCli(argv, deps) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    deps.out.error(messageOf(error))
    return 1
  }
  const { values, missing } = resolveVariables(deps.env, deps.fileTexts, [TOKEN])
  if (missing.length > 0) {
    deps.out.error(`${missingVariables(missing)}. ${TOKEN_STEPS}`)
    return 1
  }
  const secrets = [values[TOKEN]]
  const wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  try {
    return await closeDataApi({ fetch: deps.fetch, token: values[TOKEN], wait }, options, deps.out, secrets)
  } catch (error) {
    deps.out.error(maskValues(messageOf(error), secrets))
    return 1
  }
}

// Pas de process.exit : sous Windows, il arrête Node sur une assertion libuv quand une connexion HTTP
// se ferme encore (`scripts/oauth-clients.mjs`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deps = { env: process.env, fileTexts: envFileTexts(ROOT), fetch: globalThis.fetch, out: { log: console.log, error: console.error } }
  runCli(process.argv.slice(2), deps).then((code) => {
    process.exitCode = code
  })
}
