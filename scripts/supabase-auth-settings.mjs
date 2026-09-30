#!/usr/bin/env node
/**
 * supabase-auth-settings — reproduit nos réglages d'Auth sur un projet Supabase, par l'API de gestion
 * (tâche M17 ; ADR-005 § 4 : réglages d'Auth reproductibles, jamais
 * seulement par le tableau de bord).
 *
 * Ce que ça empêche : des réglages posés à la main, projet par projet, que rien ne relit, et un projet
 * d'hôte où l'invitation, le consentement des assistants ou les emails échouent faute de l'un d'eux.
 *
 * Usage : `pnpm auth:settings --to <ref> --site-url <url> [--redirect <motif>]… [--from <ref>] [--apply]`.
 * Valeurs voulues : celles du projet `--from` (le nôtre), sinon celles de `MANAGED` ; l'adresse du site
 * et les adresses de retour viennent des seuls paramètres, jamais d'un autre projet. Sans `--apply`,
 * rien n'est écrit : chaque réglage géré, valeur actuelle de la cible et valeur voulue. Avec, un seul
 * envoi des réglages gérés qui changent, puis une relecture. Le jeton de gestion
 * (`SUPABASE_ACCESS_TOKEN`, environnement ou `.env.local`) n'est jamais affiché ni écrit ; hors des
 * réglages gérés, rien n'est affiché ni envoyé : ni secret, ni identifiant de fournisseur, ni limite de
 * débit. Outillage lancé à la main, hors du paquet.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { envFileTexts, maskValues, messageOf, missingVariables, resolveVariables } from './lib/env.mjs'
import { readOptions } from './lib/org-transfer-args.mjs'

/** @typedef {(url: string, init?: RequestInit) => Promise<Response>} FetchLike */
/** @typedef {{ log: (line: string) => void, error: (line: string) => void }} Output */
/** @typedef {{ to: string, from: string | null, siteUrl: string, redirects: string[], apply: boolean }} Options */
/**
 * Une ligne du plan : `wanted` absente, le réglage reste tel quel pour la raison `note`.
 * @typedef {{ key: string, current: unknown, wanted?: unknown, source?: string, note?: string }} Row
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api.supabase.com/v1/projects'
const TOKEN = 'SUPABASE_ACCESS_TOKEN'
const TOKEN_STEPS =
  "Créer un jeton d'accès personnel sur supabase.com (Account → Access Tokens), le poser dans " +
  `${TOKEN} (environnement, ou .env.local, jamais commité), puis relancer.`
const USAGE = 'Usage : pnpm auth:settings --to <ref> --site-url <url> [--redirect <motif>]… [--from <ref>] [--apply]'

const HOOK_URI = 'pg-functions://postgres/platform/hook_before_user_created'
const HOOK_FUNCTION = /create (?:or replace )?function platform\.hook_before_user_created\(/i
// Modèles d'E02-S01 (action JB 3, N1) : le lien porte `token_hash` jusqu'à `/auth/confirm` (fiche
// D11). Les modèles par défaut de Supabase n'y mènent pas : l'invitation serait cassée.
const LINK = '{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email'
const CONFIRMATION = `<p>Vous êtes invité·e à rejoindre votre organisation.</p><p><a href="${LINK}">Rejoindre</a></p><p>Ce lien ne sert qu'une fois. Si vous n'attendiez pas cette invitation, ignorez ce message.</p>`
const MAGIC_LINK = `<p>Voici votre lien pour ouvrir votre session. Si une invitation vous attend, vous rejoindrez l'organisation en vous connectant.</p><p><a href="${LINK}">Ouvrir ma session</a></p><p>Ce lien ne sert qu'une fois. S'il a expiré, demandez-en un autre depuis la page de connexion. Si vous n'avez rien demandé, ignorez ce message.</p>`
const SMTP_SOURCE = 'E02-S01 (action JB 5), hors mot de passe'

/**
 * Réglages copiés du projet `--from`, sinon posés à `value` ; sans `value` (SMTP), copiés de `--from`
 * seulement : nos comptes d'envoi ne s'écrivent pas dans le dépôt. Liste fermée. Jamais ici : les
 * limites de débit (`rate_limit_*`, `smtp_max_frequency` : celles de notre projet sont relevées pour
 * les tests, `status.md`), les secrets (mot de passe SMTP, secrets des fournisseurs et du hook), les
 * identifiants des fournisseurs.
 * @type {{ key: string, value?: unknown, source: string }[]}
 */
export const MANAGED = [
  { key: 'disable_signup', value: false, source: 'fiche D1 B : inscription ouverte, filtrée par le hook' },
  { key: 'hook_before_user_created_enabled', value: true, source: 'fiche D1 B, E02-S01, H11' },
  { key: 'hook_before_user_created_uri', value: HOOK_URI, source: 'E02-S01 (action JB 2), H11' },
  { key: 'mailer_autoconfirm', value: false, source: '« Confirm email » gardé : H12, E02-S01 N41, HN-E01S09-3' },
  {
    key: 'mailer_allow_unverified_email_sign_ins',
    value: false,
    source: "« Allow unverified email sign in » coupé : HN-E01S09-3, accept_invitations se fie au claim email d'une session",
  },
  { key: 'mailer_otp_exp', value: 86400, source: "E02-S01 (action JB 4) : lien d'invitation valable 24 h" },
  { key: 'mailer_subjects_confirmation', value: 'Votre invitation', source: 'E02-S01 (action JB 3)' },
  { key: 'mailer_templates_confirmation_content', value: CONFIRMATION, source: 'E02-S01 (action JB 3, N1)' },
  { key: 'mailer_subjects_magic_link', value: 'Votre lien de connexion', source: 'E02-S01 (action JB 3)' },
  { key: 'mailer_templates_magic_link_content', value: MAGIC_LINK, source: 'E02-S01 (action JB 3, N1)' },
  { key: 'jwt_exp', value: 3600, source: 'fiche D3 A' },
  { key: 'oauth_server_enabled', value: true, source: 'E02-S02 (action JB 1), ADR-004' },
  { key: 'oauth_server_allow_dynamic_registration', value: true, source: "E02-S02 (action JB 1) : les hosts s'enregistrent seuls" },
  { key: 'oauth_server_authorization_path', value: '/oauth/consent', source: 'E02-S02 (action JB 1), H16' },
  { key: 'smtp_host', source: SMTP_SOURCE },
  { key: 'smtp_port', source: SMTP_SOURCE },
  { key: 'smtp_user', source: SMTP_SOURCE },
  { key: 'smtp_admin_email', source: SMTP_SOURCE },
  { key: 'smtp_sender_name', source: SMTP_SOURCE },
]

// Fournisseurs (E09-S03) : activés seulement quand la cible porte leur identifiant et leur secret, posés
// à la main ; sinon le bouton de connexion mènerait à une page d'erreur. Jamais éteints, jamais lus
// d'un autre projet : leurs identifiants sont propres à chaque projet (adresse de rappel).
const PROVIDERS = [
  { key: 'external_google_enabled', name: 'Google', id: 'external_google_client_id', secret: 'external_google_secret' },
  { key: 'external_azure_enabled', name: 'Microsoft (Azure)', id: 'external_azure_client_id', secret: 'external_azure_secret' },
]

const REF = /^[a-z]{20}$/
const SITE_URL = /^https?:\/\/[^\s,*]+$/
const REDIRECT = /^https?:\/\/[^\s,]+$/
// Une valeur lue d'un projet ne commande pas le terminal : contrôle, format, usage privé, séparateurs.
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/gu
const SHOWN_CHARS = 60
const HINTS = new Map([
  [401, `jeton refusé. ${TOKEN_STEPS}`],
  [403, "le compte du jeton n'a pas accès à ce projet"],
  [404, 'projet introuvable : vérifier la référence (Settings → General)'],
])
const OPTIONS = {
  to: { type: 'string' },
  from: { type: 'string' },
  'site-url': { type: 'string' },
  redirect: { type: 'string', multiple: true },
  apply: { type: 'boolean' },
}

/**
 * Motif attrape-tout des adresses de retour, refusé en paramètre et signalé sur la cible (E02-S01 N2 :
 * `**`, `https://**`, `https://*\/**`) : un hôte sans lettre ni chiffre, ou un joker suivi d'une seule
 * étiquette (`*.com`), hors `localhost`. Un domaine partagé (`*.vercel.app`) passe : le plan le montre.
 * @param {string} pattern
 */
export function catchAll(pattern) {
  const host = pattern.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0].replace(/:[\d*]*$/, '')
  return !/[a-z0-9]/i.test(host) || (/^\*+\.[^.]+$/.test(host) && !host.endsWith('.localhost'))
}

/**
 * `--to <ref> --site-url <url> [--redirect <motif>]… [--from <ref>] [--apply]` ; toute autre forme lève
 * l'usage ou la raison du refus, avant toute requête.
 * @param {string[]} argv
 * @returns {Options}
 */
function parseArgs(argv) {
  const values = readOptions(argv, OPTIONS, USAGE)
  if (!values.to) throw new Error(`Option requise : --to <ref>. ${USAGE}`)
  if (!values['site-url']) throw new Error(`Option requise : --site-url <url>. ${USAGE}`)
  for (const ref of values.from === undefined ? [values.to] : [values.to, values.from]) {
    if (!REF.test(ref)) throw new Error(`Référence de projet invalide : « ${ref} » (20 lettres minuscules, Settings → General).`)
  }
  const siteUrl = values['site-url']
  if (!SITE_URL.test(siteUrl)) throw new Error(`--site-url invalide : « ${siteUrl} » (http:// ou https://, sans joker, virgule ni espace).`)
  const redirects = [...new Set(values.redirect ?? [])]
  const refused = redirects.find((pattern) => !REDIRECT.test(pattern) || catchAll(pattern))
  if (refused !== undefined) {
    throw new Error(`--redirect refusé : « ${refused} » (http:// ou https://, sans virgule ni espace, jamais un motif attrape-tout : E02-S01 N2).`)
  }
  return { to: values.to, from: values.from ?? null, siteUrl, redirects, apply: values.apply ?? false }
}

/** Les motifs d'une liste `uri_allow_list` (séparés par des virgules). */
const patternsOf = (list) => (typeof list === 'string' ? list.split(',').map((pattern) => pattern.trim()).filter(Boolean) : [])
/** Une ligne du plan qui change la cible. */
const changes = (row) => 'wanted' in row && row.wanted !== row.current
/** Identifiant et secret du fournisseur posés sur la cible (présence seulement : jamais affichés). */
const credentialsOn = (target, provider) => Boolean(target[provider.id]) && Boolean(target[provider.secret])

/**
 * Adresses de retour : les motifs de `--redirect` absents de la cible s'ajoutent à sa liste ; rien n'est
 * retiré (le projet d'un hôte sert aussi son application) et rien ne vient d'un autre projet.
 * @returns {Row}
 */
function redirectsRow(current, redirects) {
  const present = patternsOf(current)
  const added = redirects.filter((pattern) => !present.includes(pattern))
  if (redirects.length === 0) return { key: 'uri_allow_list', current, note: 'aucun --redirect' }
  if (added.length === 0) return { key: 'uri_allow_list', current, wanted: current }
  const wanted = [...present, ...added].join(',')
  return { key: 'uri_allow_list', current, wanted, source: `--redirect, ajoute ${added.join(', ')} ; rien n'est retiré (E02-S01 N2)` }
}

/**
 * Plan : chaque réglage géré, sa valeur sur la cible et la valeur voulue ; `patch` ne porte que les
 * réglages qui changent. Une valeur nulle de la source ne se copie pas.
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown> | null} source
 * @param {Options} options
 * @returns {{ rows: Row[], patch: Record<string, unknown> }}
 */
function planSettings(target, source, options) {
  /** @type {Row[]} */
  const rows = MANAGED.map(({ key, value, source: why }) => {
    const wanted = source ? source[key] : value
    if (wanted === undefined || wanted === null) {
      return { key, current: target[key], note: source ? 'sans valeur dans le projet de référence' : 'copié de --from seulement' }
    }
    return { key, current: target[key], wanted, source: why }
  })
  rows.push({ key: 'site_url', current: target.site_url, wanted: options.siteUrl, source: '--site-url (H16 : page de consentement ; E02-S01 N2)' })
  rows.push(redirectsRow(target.uri_allow_list, options.redirects))
  for (const provider of PROVIDERS) {
    rows.push(
      credentialsOn(target, provider)
        ? { key: provider.key, current: target[provider.key], wanted: true, source: 'E09-S03' }
        : { key: provider.key, current: target[provider.key], note: 'identifiant ou secret absent de la cible' },
    )
  }
  return { rows, patch: Object.fromEntries(rows.filter(changes).map((row) => [row.key, row.wanted])) }
}

/** Une valeur lisible sur une ligne : JSON, caractères de commande remplacés, coupée au-delà de 60. */
function shown(value) {
  if (value === undefined) return '(absente)'
  const text = JSON.stringify(value).replace(UNPRINTABLE, '?')
  const chars = Array.from(text)
  return chars.length <= SHOWN_CHARS ? text : `${chars.slice(0, SHOWN_CHARS).join('')}… (${String(value).length} caractères)`
}

/** Les lignes du plan, dans l'ordre de `MANAGED`. */
function planLines(rows) {
  return rows.map((row) => {
    if (!('wanted' in row)) return `  laissé      ${row.key} : ${shown(row.current)} (${row.note})`
    if (!changes(row)) return `  déjà réglé  ${row.key} : ${shown(row.current)}`
    return `  à changer   ${row.key} : ${shown(row.current)} → ${shown(row.wanted)} (${row.source})`
  })
}

/**
 * Ce qui reste à poser à la main : jamais copié (mot de passe SMTP, identifiants et secrets des
 * fournisseurs, secret d'un hook HTTP), et les motifs attrape-tout de la cible, que le script ne retire
 * pas.
 * @param {Row[]} rows
 * @param {Record<string, unknown>} target
 * @param {Options} options
 */
function manualSteps(rows, target, options) {
  const steps = []
  if (options.from && (rows.some((row) => row.key.startsWith('smtp_') && changes(row)) || !target.smtp_pass)) {
    steps.push("Mot de passe SMTP du compte d'envoi (jamais copié) : Authentication → Emails → SMTP Settings.")
  }
  if (!options.from && !target.smtp_host) {
    steps.push('SMTP : hôte, port, utilisateur, expéditeur et mot de passe (sans --from, le script ne les pose pas).')
  }
  for (const provider of PROVIDERS.filter((candidate) => !credentialsOn(target, candidate))) {
    steps.push(
      `${provider.name} : identifiant client et secret (Authentication → Providers ; adresse de rappel ` +
        `https://${options.to}.supabase.co/auth/v1/callback), puis relancer le script pour l'activer.`,
    )
  }
  const hook = rows.find((row) => row.key === 'hook_before_user_created_uri')
  if (String(hook?.wanted ?? hook?.current ?? '').startsWith('http')) steps.push("Secret du hook d'inscription (hook HTTP) : Authentication → Hooks.")
  for (const pattern of patternsOf(target.uri_allow_list).filter(catchAll)) {
    steps.push(`Retirer des adresses de retour le motif attrape-tout ${shown(pattern)} (E02-S01 N2).`)
  }
  return steps
}

/**
 * Versions des migrations du paquet qui créent `platform.hook_before_user_created`, lues dans `dir` :
 * `20260924110000` aujourd'hui, la ligne de base d'E01-S09 quand elle remplace la chaîne.
 * @param {string} dir
 * @returns {string[]}
 */
export function hookMigrations(dir) {
  return readdirSync(dir)
    .filter((file) => /^\d{14}_.+\.sql$/.test(file) && HOOK_FUNCTION.test(readFileSync(join(dir, file), 'utf8')))
    .map((file) => file.slice(0, 14))
}

/**
 * Appels de l'API de gestion au jeton de la personne qui lance le script ; une réponse refusée devient
 * un message qui nomme le verbe, le chemin et le statut, jamais le corps de la réponse (il peut porter
 * la configuration, secrets compris).
 * @param {FetchLike} fetchImpl
 * @param {string} token
 */
function managementApi(fetchImpl, token) {
  async function call(method, ref, path, body) {
    const where = `${method} ${path} du projet ${ref}`
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
 * Le projet de référence rend chaque réglage copié ; sinon l'API a changé et le script est à revoir.
 * @param {Record<string, unknown>} source
 * @param {string} ref
 */
function checkedSource(source, ref) {
  const missing = MANAGED.filter(({ key }) => !(key in source)).map(({ key }) => key)
  if (missing.length > 0) throw new Error(`Le projet ${ref} ne rend pas ${missing.join(', ')} : l'API de gestion a changé, revoir MANAGED.`)
  return source
}

/**
 * La fonction du hook voulu existe-t-elle sur la cible ? Oui quand l'historique de ses migrations
 * (`supabase_migrations`, tenu par la CLI Supabase partout, HN-E01S09-2) porte une migration du paquet
 * qui la crée ; sinon toute inscription échouerait, et `--apply` n'envoie rien. Hook non voulu : rien
 * à vérifier.
 * @param {{ api: ReturnType<typeof managementApi>, migrationsDir: string }} context
 * @param {Row[]} rows
 * @param {Options} options
 * @param {Output} out
 */
async function hookReady(context, rows, options, out) {
  const enabled = rows.find((row) => row.key === 'hook_before_user_created_enabled')
  if (('wanted' in enabled ? enabled.wanted : enabled.current) !== true) return true
  const versions = hookMigrations(context.migrationsDir)
  const applied = await context.api.get(options.to, 'database/migrations')
  const found = Array.isArray(applied) ? versions.find((version) => applied.some((row) => row?.version === version)) : undefined
  if (found !== undefined) {
    out.log(`Hook d'inscription : la migration ${found} du paquet, qui crée sa fonction, est appliquée sur ${options.to}.`)
    return true
  }
  out.log(
    `Hook d'inscription : aucune migration du paquet qui crée sa fonction (${versions.join(', ')}) n'est appliquée sur ` +
      `${options.to} ; appliquer d'abord les migrations, sinon toute inscription échouerait.`,
  )
  return false
}

/**
 * Sans `--apply`, dit ce qui changerait ; avec, un seul envoi des réglages qui changent, puis une
 * relecture qui les confirme. Refuse avant tout envoi si le hook voulu n'a pas sa fonction.
 * @param {{ api: ReturnType<typeof managementApi>, patch: Record<string, unknown>, hookOk: boolean }} write
 * @param {Options} options
 * @param {Output} out
 */
async function writeChanges({ api, patch, hookOk }, options, out) {
  const keys = Object.keys(patch)
  if (keys.length === 0) {
    out.log('Rien à changer.')
    return 0
  }
  if (!options.apply) {
    out.log(`${keys.length} réglage(s) à changer. Relancez avec --apply pour les écrire.`)
    return 0
  }
  if (!hookOk) {
    out.error("Rien n'est écrit : appliquer d'abord les migrations du paquet sur la cible (hook d'inscription).")
    return 1
  }
  await api.patch(options.to, 'config/auth', patch)
  const after = await api.get(options.to, 'config/auth')
  const drift = keys.filter((key) => after[key] !== patch[key])
  if (drift.length > 0) {
    out.error(`Relu : ${drift.join(', ')} diffère de la valeur envoyée.`)
    return 1
  }
  out.log(`${keys.length} réglage(s) écrit(s), relu(s) et confirmé(s).`)
  return 0
}

/**
 * Lit la référence et la cible, montre le plan, écrit avec `--apply`, puis liste ce qui reste à poser à
 * la main ; rend le code de sortie.
 * @param {{ fetch: FetchLike, token: string, migrationsDir: string }} deps
 * @param {Options} options
 * @param {Output} out
 * @returns {Promise<number>}
 */
async function runSettings(deps, options, out) {
  const api = managementApi(deps.fetch, deps.token)
  const source = options.from ? checkedSource(await api.get(options.from, 'config/auth'), options.from) : null
  const target = await api.get(options.to, 'config/auth')
  const plan = planSettings(target, source, options)
  const origin = options.from ? `celles du projet ${options.from}` : 'celles du script'
  out.log(`Réglages d'Auth gérés du projet ${options.to} (valeurs voulues : ${origin}) :`)
  for (const line of planLines(plan.rows)) out.log(line)
  const hookOk = await hookReady({ api, migrationsDir: deps.migrationsDir }, plan.rows, options, out)
  const code = await writeChanges({ api, patch: plan.patch, hookOk }, options, out)
  const steps = manualSteps(plan.rows, target, options)
  if (steps.length > 0) out.log(['À poser à la main :', ...steps.map((step) => `  - ${step}`)].join('\n'))
  return code
}

/**
 * Le script entier, ses dépendances passées : arguments, jeton (environnement, puis `.env.local` et
 * `.env`), réglage. Un argument invalide ou un jeton absent sort en 1 avant toute requête ; aucun
 * message ne porte le jeton.
 * @param {string[]} argv
 * @param {{ env: Record<string, string | undefined>, fileTexts: string[], fetch: FetchLike,
 *   migrationsDir: string, out: Output }} deps
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
  const token = values[TOKEN]
  try {
    return await runSettings({ fetch: deps.fetch, token, migrationsDir: deps.migrationsDir }, options, deps.out)
  } catch (error) {
    deps.out.error(maskValues(messageOf(error), [token]))
    return 1
  }
}

// Pas de process.exit : sous Windows, il arrête Node sur une assertion libuv quand une connexion HTTP
// se ferme encore (`scripts/oauth-clients.mjs`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deps = {
    env: process.env,
    fileTexts: envFileTexts(ROOT),
    fetch: globalThis.fetch,
    migrationsDir: join(ROOT, 'packages/plateforme/migrations'),
    out: { log: console.log, error: console.error },
  }
  runCli(process.argv.slice(2), deps).then((code) => {
    process.exitCode = code
  })
}
