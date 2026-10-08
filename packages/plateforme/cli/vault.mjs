/**
 * Coffre des comptes de connecteurs : le format du chiffré, écrit une fois et lu par le serveur du paquet
 * (`server/connectors/vault.ts`) comme par la commande `oto-platform accounts secret` (`account-secret.mjs`). Sans ce
 * module partagé, deux formats divergeraient et un secret posé par la commande ne s'ouvrirait plus au serveur.
 *
 * AES-256-GCM (`node:crypto`), clé de 32 octets de l'environnement de l'hôte (`PLATFORM_VAULT_KEY`, en base64),
 * vecteur tiré à chaque chiffrement. Format v2, le seul écrit : `v2:<clé>:<vecteur>:<étiquette>:<chiffré>`, chaque
 * partie en base64url ; `<clé>` identifie la clé qui a chiffré (empreinte, jamais la clé), de sorte qu'une rotation de
 * `PLATFORM_VAULT_KEY` sache quels chiffrés reposer. Données associées = l'identifiant du compte et le nom de la colonne
 * (`secret_ciphertext`, `token_ciphertext`) : un chiffré recopié sur un autre compte ou dans une autre colonne ne
 * s'ouvre pas. Le format v1 (`v1:<vecteur>:<étiquette>:<chiffré>`, données associées = l'identifiant du compte, un
 * secret brut d'un seul champ) reste lisible dans `secret_ciphertext`. Aucun message d'erreur ne cite le secret, le
 * chiffré ni la clé.
 *
 * Le secret d'un compte est un objet de champs (`credential[]` de son connecteur), sérialisé en JSON avant d'être
 * chiffré ; une saisie fusionne avec l'objet en place (`mergeCredential`).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/** La variable de l'hôte qui porte la clé. */
export const VAULT_KEY_VARIABLE = 'PLATFORM_VAULT_KEY'

/** La colonne du secret d'un compte, la seule où un chiffré v1 se lit encore. */
export const SECRET_COLUMN = 'secret_ciphertext'
/** La colonne du jeton d'un échange (`oauth2_client_credentials`), chiffré à part du secret saisi. */
export const TOKEN_COLUMN = 'token_ciphertext'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
/** Octets de l'empreinte de la clé gardés dans le chiffré : de quoi distinguer deux clés, rien de quoi en tirer une. */
const KEY_ID_BYTES = 6

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
 * L'identifiant d'une clé, écrit dans chaque chiffré v2 : les premiers octets de son empreinte SHA-256.
 * @param {Buffer} key
 * @returns {string}
 */
export function vaultKeyId(key) {
  return createHash('sha256').update(key).digest().subarray(0, KEY_ID_BYTES).toString('base64url')
}

const aad = (accountId, column) => Buffer.from(`${accountId}/${column}`, 'utf8')

/**
 * Chiffre une valeur d'une colonne d'un compte, au format v2.
 * @param {Buffer} key
 * @param {string} accountId
 * @param {string} column
 * @param {string} text
 * @returns {string}
 */
export function seal(key, accountId, column, text) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(aad(accountId, column))
  const sealed = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return ['v2', vaultKeyId(key), iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), sealed.toString('base64url')].join(':')
}

/** AES-GCM ouvert, ou `null` : vecteur, étiquette ou données associées refusés. */
function decipher(key, [iv, tag, sealed], associated) {
  const ivBytes = Buffer.from(iv, 'base64url')
  const tagBytes = Buffer.from(tag, 'base64url')
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) return null
  try {
    const opened = createDecipheriv(ALGORITHM, key, ivBytes, { authTagLength: TAG_BYTES })
    opened.setAAD(associated)
    opened.setAuthTag(tagBytes)
    return Buffer.concat([opened.update(Buffer.from(sealed, 'base64url')), opened.final()]).toString('utf8')
  } catch {
    return null
  }
}

/**
 * Déchiffre une valeur d'une colonne d'un compte. Rend sa version : `v1` (un secret brut, `secret_ciphertext` seule)
 * ou `v2`. Refus (`unreadable`) : autre clé (nommée par son identifiant), autre compte, autre colonne, format inconnu.
 * @param {Buffer} key
 * @param {string} accountId
 * @param {string} column
 * @param {string} ciphertext
 * @returns {{ version: 'v1' | 'v2', text: string }}
 */
export function open(key, accountId, column, ciphertext) {
  const unreadable = (why = 'autre clé, autre compte, autre colonne ou format inconnu') =>
    new VaultError('unreadable', `${column} du compte ${accountId} illisible : ${why}`)
  const [version, ...parts] = ciphertext.split(':')
  if (version === 'v1' && column === SECRET_COLUMN && parts.length === 3) {
    const text = decipher(key, parts, Buffer.from(accountId, 'utf8'))
    if (text === null) throw unreadable()
    return { version: 'v1', text }
  }
  if (version !== 'v2' || parts.length !== 4) throw unreadable()
  const [keyId, ...sealedParts] = parts
  if (keyId !== vaultKeyId(key)) throw unreadable(`chiffré par une autre clé (${keyId})`)
  const text = decipher(key, sealedParts, aad(accountId, column))
  if (text === null) throw unreadable()
  return { version: 'v2', text }
}

/**
 * Chiffre le secret d'un compte, un objet de champs.
 * @param {Buffer} key
 * @param {string} accountId
 * @param {Record<string, string>} fields
 * @returns {string}
 */
export function sealCredential(key, accountId, fields) {
  return seal(key, accountId, SECRET_COLUMN, JSON.stringify(fields))
}

/**
 * Le secret d'un compte : ses champs (v2), ou le secret brut d'un seul champ posé avant les champs multiples (v1), que
 * le serveur range sous le champ que nomme l'authentification de son connecteur.
 * @param {Buffer} key
 * @param {string} accountId
 * @param {string} ciphertext
 * @returns {{ fields: Record<string, string> } | { single: string }}
 */
export function openCredential(key, accountId, ciphertext) {
  const { version, text } = open(key, accountId, SECRET_COLUMN, ciphertext)
  if (version === 'v1') return { single: text }
  let fields
  try {
    fields = JSON.parse(text)
  } catch {
    fields = null
  }
  const valid = fields !== null && typeof fields === 'object' && !Array.isArray(fields) && Object.values(fields).every((value) => typeof value === 'string')
  if (!valid) throw new VaultError('unreadable', `${SECRET_COLUMN} du compte ${accountId} illisible : pas un objet de champs`)
  return { fields }
}

/**
 * Fusionne une saisie dans les champs en place : un champ absent de la saisie est gardé, un champ à `null` ou vide
 * est effacé, les autres sont remplacés.
 * @param {Record<string, string>} previous
 * @param {Record<string, string | null>} changes
 * @returns {Record<string, string>}
 */
export function mergeCredential(previous, changes) {
  const merged = { ...previous }
  for (const [name, value] of Object.entries(changes)) {
    if (value === null || value === '') delete merged[name]
    else merged[name] = value
  }
  return merged
}
