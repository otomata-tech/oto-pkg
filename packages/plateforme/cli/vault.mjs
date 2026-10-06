/**
 * Coffre des secrets de comptes de connecteurs : le format du chiffré, écrit une fois et lu par le serveur du
 * paquet (`server/connectors/vault.ts`) comme par la commande `oto-platform accounts secret` (`account-secret.mjs`).
 * Sans ce module partagé, deux formats divergeraient et un secret posé par la commande ne s'ouvrirait plus au
 * serveur.
 *
 * AES-256-GCM (`node:crypto`), clé de 32 octets de l'environnement de l'hôte (`PLATFORM_VAULT_KEY`, en base64),
 * vecteur tiré à chaque chiffrement ; données associées = l'identifiant du compte, de sorte qu'un chiffré recopié
 * sur un autre compte ne s'ouvre pas. Le chiffré porte sa version : `v1:<vecteur>:<étiquette>:<chiffré>`, chaque
 * partie en base64url. Aucun message d'erreur ne cite le secret, le chiffré ni la clé.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** La variable de l'hôte qui porte la clé. */
export const VAULT_KEY_VARIABLE = 'PLATFORM_VAULT_KEY'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

/** Refus du coffre : `missing` et `invalid` (la clé), `unreadable` (le chiffré). */
export class VaultError extends Error {
  /**
   * @param {'missing' | 'invalid' | 'unreadable'} reason
   * @param {string} message
   */
  constructor(reason, message) {
    super(message)
    this.name = 'VaultError'
    this.reason = reason
  }
}

/**
 * La clé du coffre : 32 octets écrits en base64 (`openssl rand -base64 32`). Lue à l'usage, jamais au démarrage :
 * un hôte sans connecteur réel n'a pas à la poser.
 * @param {string | undefined} value
 * @returns {Buffer}
 */
export function parseVaultKey(value) {
  const text = value?.trim()
  if (!text) throw new VaultError('missing', `${VAULT_KEY_VARIABLE} manquante dans l'environnement du serveur de l'hôte`)
  const key = Buffer.from(text, 'base64')
  if (key.length !== KEY_BYTES || key.toString('base64') !== text) {
    throw new VaultError('invalid', `${VAULT_KEY_VARIABLE} n'est pas une clé de 32 octets en base64 (openssl rand -base64 32)`)
  }
  return key
}

/**
 * Chiffre le secret d'un compte.
 * @param {Buffer} key
 * @param {string} accountId
 * @param {string} secret
 * @returns {string}
 */
export function sealSecret(key, accountId, secret) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(Buffer.from(accountId, 'utf8'))
  const sealed = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), sealed.toString('base64url')].join(':')
}

/**
 * Déchiffre le secret d'un compte ; un chiffré d'une autre version, d'un autre compte ou d'une autre clé est refusé
 * (`unreadable`).
 * @param {Buffer} key
 * @param {string} accountId
 * @param {string} ciphertext
 * @returns {string}
 */
export function openSecret(key, accountId, ciphertext) {
  const unreadable = () => new VaultError('unreadable', `secret du compte ${accountId} illisible : autre clé, autre compte ou format inconnu`)
  const [version, iv, tag, sealed, ...rest] = ciphertext.split(':')
  if (version !== VERSION || rest.length > 0 || !iv || !tag || sealed === undefined) throw unreadable()
  const ivBytes = Buffer.from(iv, 'base64url')
  const tagBytes = Buffer.from(tag, 'base64url')
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw unreadable()
  try {
    const decipher = createDecipheriv(ALGORITHM, key, ivBytes, { authTagLength: TAG_BYTES })
    decipher.setAAD(Buffer.from(accountId, 'utf8'))
    decipher.setAuthTag(tagBytes)
    return Buffer.concat([decipher.update(Buffer.from(sealed, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw unreadable()
  }
}
