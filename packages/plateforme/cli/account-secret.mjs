/**
 * accounts secret — pose le secret et les réglages d'un compte réel de connecteur (`connecteurs-et-comptes.md` § Comptes
 * à plusieurs champs et réglages), par l'outillage de l'hôte ; l'écran Connecteurs fait de même pour un administrateur.
 * Les champs du secret se lisent sur l'entrée standard, en objet JSON (`{"api_id": "…", "api_token": "…"}`), jamais
 * en argument (ils finiraient dans l'historique du shell et la liste des processus) ; les réglages, non secrets, en
 * `--setting nom=valeur`. La saisie fusionne avec ce qui est posé : un champ absent est gardé, `null` ou vide l'efface
 * (un secret à l'ancien format, d'un seul champ sans nom, est remplacé par les champs donnés). Chiffré ici par le format
 * du coffre (`vault.mjs`, clé `PLATFORM_VAULT_KEY`), écrit dans `accounts` par une connexion d'administration, le jeton
 * d'un échange effacé. La commande ne connaît pas la déclaration de l'application : elle contrôle la forme des noms et
 * des valeurs, l'appel refuse ensuite un champ manquant ou un réglage invalide. Rien du secret, du chiffré, de la clé
 * ni du mot de passe de l'URL n'est jamais écrit. TLS sauf `sslmode` écrit dans l'URL (`ssl-option.mjs`).
 */
import postgres from 'postgres'
import { mask, urlPassword } from './masking.mjs'
import { sslOption } from './ssl-option.mjs'
import { mergeCredential, openCredential, parseVaultKey, sealCredential, VAULT_KEY_VARIABLE, VaultError } from './vault.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAME = /^[a-z][a-z0-9_]{0,39}$/

/** Tout ce qui arrive sur l'entrée standard, en texte. */
export async function readStdin(stream = process.stdin) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Les champs lus sur l'entrée standard : un objet JSON de chaînes (ou `null` pour effacer) ; vide, aucun champ.
 * @param {string} text
 * @returns {Record<string, string | null> | string} les champs, ou le problème
 */
function fieldsOf(text) {
  if (!text.trim()) return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return "l'entrée standard doit être un objet JSON de champs, {\"nom\": \"valeur\"}"
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return "l'entrée standard doit être un objet JSON de champs"
  for (const [name, value] of Object.entries(parsed)) {
    if (!NAME.test(name)) return `champ « ${name.slice(0, 40)} » : lettres minuscules, chiffres et _`
    if (value !== null && typeof value !== 'string') return `champ « ${name} » : une chaîne, ou null pour l'effacer`
  }
  return Object.fromEntries(Object.entries(parsed).map(([name, value]) => [name, typeof value === 'string' ? value.trim() : null]))
}

/**
 * Les réglages de `--setting nom=valeur` ; `nom=` efface le réglage.
 * @param {string[]} pairs
 * @returns {Record<string, string | null> | string}
 */
function settingsOf(pairs) {
  const settings = {}
  for (const pair of pairs) {
    const at = pair.indexOf('=')
    const name = at === -1 ? pair : pair.slice(0, at)
    if (at === -1 || !NAME.test(name)) return `--setting attend nom=valeur, le nom en lettres minuscules, chiffres et _ (« ${pair.slice(0, 40)} »)`
    const value = pair.slice(at + 1).trim()
    settings[name] = value === '' ? null : value
  }
  return settings
}

/**
 * Ce que la commande demande au client postgres.js : une requête par gabarit, la fermeture, et `json`.
 * @typedef {((strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<any[]>)
 *   & { end: (options?: { timeout?: number }) => Promise<void>, json: (value: unknown) => unknown }} SecretClient
 */

/**
 * Pose le secret et les réglages. `connect` : le client postgres.js (remplacé par les tests). Rend le code de sortie :
 * 0 posé ; 1 clé absente ou mal écrite, saisie vide ou mal formée, compte inconnu ou simulé, compte changé pendant la
 * saisie, base injoignable ou écriture refusée (message sur `printError`).
 * @param {{ dbUrl: string, account: string, settings?: string[], env: Record<string, string | undefined>,
 *   readSecret: () => Promise<string>, print: (line: string) => void, printError: (line: string) => void,
 *   connect?: (url: string, options: object) => SecretClient }} options
 */
export async function setAccountSecretCommand({ dbUrl, account, settings: pairs = [], env, readSecret, print, printError, connect = postgres }) {
  if (!UUID.test(account)) {
    printError(`accounts secret : --account attend l'identifiant (uuid) du compte`)
    return 1
  }
  let key
  try {
    key = parseVaultKey(env[VAULT_KEY_VARIABLE])
  } catch (error) {
    if (!(error instanceof VaultError)) throw error
    printError(`accounts secret : ${error.message}`)
    return 1
  }
  const text = await readSecret()
  const fields = fieldsOf(text)
  const settings = settingsOf(pairs)
  const problem = [fields, settings].find((value) => typeof value === 'string')
  if (problem) {
    printError(`accounts secret : ${problem}`)
    return 1
  }
  const values = Object.values(fields).filter((value) => typeof value === 'string')
  const secrets = [...values, text.trim(), urlPassword(dbUrl), env[VAULT_KEY_VARIABLE]?.trim()]
  if (Object.keys(fields).length + Object.keys(settings).length === 0) {
    printError("accounts secret : rien à poser : un objet JSON de champs sur l'entrée standard, ou --setting nom=valeur")
    return 1
  }
  const sql = connect(dbUrl, { max: 1, ...sslOption(dbUrl), connection: { application_name: 'oto-platform accounts secret' } })
  try {
    const [row] = await sql`
      select label, connector, mode, secret_ciphertext, settings, to_json(secret_updated_at) #>> '{}' as secret_updated_at
        from platform.accounts where id = ${account}`
    if (!row) {
      printError(`accounts secret : compte inconnu ${account}`)
      return 1
    }
    if (row.mode === 'simule') {
      printError(`accounts secret : le compte « ${row.label} » (${row.connector}) est simulé, il n'a pas de secret`)
      return 1
    }
    const opened = row.secret_ciphertext ? openCredential(key, account, row.secret_ciphertext) : { fields: {} }
    // Un secret d'un seul champ sans nom (v1) : gardé si la saisie ne touche que les réglages, remplacé sinon.
    const keepsV1 = 'single' in opened && Object.keys(fields).length === 0
    const merged = 'fields' in opened ? mergeCredential(opened.fields, fields) : mergeCredential({}, fields)
    const ciphertext = keepsV1 ? row.secret_ciphertext : Object.keys(merged).length > 0 ? sealCredential(key, account, merged) : null
    const names = keepsV1 ? [] : Object.keys(merged).sort()
    const updated = await sql`
      update platform.accounts
         set secret_ciphertext = ${ciphertext}, secret_fields = ${names}::text[], settings = ${sql.json(mergeCredential(row.settings ?? {}, settings))},
             secret_updated_at = now(), token_ciphertext = null, token_expires_at = null
       where id = ${account} and secret_updated_at is not distinct from ${row.secret_updated_at}::text::timestamptz
       returning id`
    if (updated.length === 0) {
      printError(`accounts secret : le compte « ${row.label} » a changé pendant la saisie ; relancez la commande`)
      return 1
    }
    print(`accounts secret : secret et réglages posés pour le compte « ${row.label} » (${row.connector}) : champs ${names.join(', ') || 'aucun'}.`)
    return 0
  } catch (error) {
    printError(mask(`accounts secret : ${error?.message ?? error}`, secrets))
    return 1
  } finally {
    // Le secret est écrit ou refusé avant : une connexion mal fermée ne change pas le code rendu.
    await sql.end({ timeout: 5 }).catch((error) => printError(mask(`accounts secret : connexion mal fermée : ${error?.message ?? error}`, secrets)))
  }
}
