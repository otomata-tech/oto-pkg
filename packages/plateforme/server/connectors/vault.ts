// Coffre du paquet (`connecteurs-et-comptes.md`, H85 ; NFR-ADMIN-01) : le secret d'un compte réel, chiffré par le
// serveur de l'hôte avant d'être écrit, déchiffré pour le seul appel au tiers. Le format vit dans `cli/vault.mjs`,
// partagé avec la commande `oto-platform accounts secret` ; ce module lit la clé de l'hôte à l'usage (jamais au
// démarrage : un hôte sans connecteur réel ne la pose pas) et traduit les refus du coffre en erreurs du paquet. Pas de
// Supabase Vault : le paquet reste portable sur un Postgres nu (ADR-012).
import { openSecret, parseVaultKey, sealSecret, VAULT_KEY_VARIABLE, VaultError } from "../../cli/vault.mjs"
import { PlatformError } from "../errors"
import { PlatformConfigError } from "../sql"

type Env = Record<string, string | undefined>

/** La clé de l'hôte ; absente ou mal écrite, `PlatformConfigError` qui nomme la variable (la porte la journalise). */
function vaultKey(env: Env): Buffer {
  try {
    return parseVaultKey(env[VAULT_KEY_VARIABLE])
  } catch (error) {
    if (error instanceof VaultError) throw new PlatformConfigError(error.message)
    throw error
  }
}

/** Le chiffré du secret de `accountId`, à écrire dans `accounts.secret_ciphertext`. */
export function encryptSecret(accountId: string, secret: string, env: Env = process.env): string {
  return sealSecret(vaultKey(env), accountId, secret)
}

/**
 * Le secret de `accountId`. Un chiffré illisible (clé changée, chiffré d'un autre compte) est une panne de l'hôte :
 * sa cause part au log serveur, sans le chiffré, et l'appel échoue en `internal`.
 */
export function decryptSecret(accountId: string, ciphertext: string, env: Env = process.env): string {
  const key = vaultKey(env)
  try {
    return openSecret(key, accountId, ciphertext)
  } catch (error) {
    if (!(error instanceof VaultError)) throw error
    console.error(`[platform] vault: secret of account ${accountId} unreadable (another key, another account or an unknown format)`)
    throw new PlatformError("internal", "Internal error.")
  }
}
