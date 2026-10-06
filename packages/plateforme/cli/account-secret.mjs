/**
 * accounts secret — pose le secret d'un compte réel de connecteur (`connecteurs-et-comptes.md`, H85), par l'outillage
 * de l'hôte : aucune route HTTP ni aucun outil MCP ne reçoit un secret. Le secret se lit sur l'entrée standard, jamais
 * en argument (il finirait dans l'historique du shell et la liste des processus) ; il est chiffré ici par le format du
 * coffre (`vault.mjs`, clé `PLATFORM_VAULT_KEY`, données associées = l'id du compte), puis écrit dans
 * `accounts.secret_ciphertext` par une connexion d'administration. Rien du secret, du chiffré, de la clé ni du mot de
 * passe de l'URL n'est jamais écrit. La connexion passe en TLS sauf `sslmode` écrit dans l'URL (`ssl-option.mjs`).
 */
import postgres from 'postgres'
import { mask, urlPassword } from './masking.mjs'
import { sslOption } from './ssl-option.mjs'
import { parseVaultKey, sealSecret, VAULT_KEY_VARIABLE, VaultError } from './vault.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tout ce qui arrive sur l'entrée standard, en texte. */
export async function readStdin(stream = process.stdin) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Ce que la commande demande au client postgres.js : une requête par gabarit, et la fermeture.
 * @typedef {((strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<any[]>)
 *   & { end: (options?: { timeout?: number }) => Promise<void> }} SecretClient
 */

/**
 * Pose le secret. `connect` : le client postgres.js (remplacé par les tests). Rend le code de sortie : 0 posé ; 1 clé
 * absente ou mal écrite, secret vide, compte inconnu ou simulé, base injoignable ou écriture refusée (message sur
 * `printError`).
 * @param {{ dbUrl: string, account: string, env: Record<string, string | undefined>,
 *   readSecret: () => Promise<string>, print: (line: string) => void, printError: (line: string) => void,
 *   connect?: (url: string, options: object) => SecretClient }} options
 */
export async function setAccountSecretCommand({ dbUrl, account, env, readSecret, print, printError, connect = postgres }) {
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
  const secret = (await readSecret()).trim()
  const secrets = [secret, urlPassword(dbUrl), env[VAULT_KEY_VARIABLE]?.trim()]
  if (!secret) {
    printError('accounts secret : aucun secret sur l\'entrée standard')
    return 1
  }
  const sql = connect(dbUrl, { max: 1, ...sslOption(dbUrl), connection: { application_name: 'oto-platform accounts secret' } })
  try {
    const [row] = await sql`select label, connector, mode from platform.accounts where id = ${account}`
    if (!row) {
      printError(`accounts secret : compte inconnu ${account}`)
      return 1
    }
    if (row.mode === 'simule') {
      printError(`accounts secret : le compte « ${row.label} » (${row.connector}) est simulé, il n'a pas de secret`)
      return 1
    }
    const ciphertext = sealSecret(key, account, secret)
    await sql`update platform.accounts set secret_ciphertext = ${ciphertext} where id = ${account}`
    print(`accounts secret : secret posé pour le compte « ${row.label} » (${row.connector}).`)
    return 0
  } catch (error) {
    printError(mask(`accounts secret : ${error?.message ?? error}`, secrets))
    return 1
  } finally {
    // Le secret est écrit ou refusé avant : une connexion mal fermée ne change pas le code rendu.
    await sql.end({ timeout: 5 }).catch((error) => printError(mask(`accounts secret : connexion mal fermée : ${error?.message ?? error}`, secrets)))
  }
}
