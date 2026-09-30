/**
 * org-transfer-files — les octets des fichiers joints dans l'export-import d'une organisation (E10-S02, AC-e4 ;
 * ADR-016 § 8, HN-E10S02-4) : le JSON porte les lignes `files` (`TABLES`), les objets vont dans le dossier
 * `<fichier>.files/`, à côté de lui, un fichier par identifiant de la source ; l'import les envoie au stockage de la
 * cible sous `<nouvel org_id>/<nouvel id>`. Le stockage se lit dans les cinq variables `PLATFORM_STORAGE_*`, et se
 * parle en S3 signé par `aws4fetch`, comme l'adaptateur du paquet (`server/files/s3.ts`, adresses en chemin), sans le
 * reprendre : un script `.mjs` n'importe pas le TypeScript du paquet. Sans les cinq variables, l'export et l'import
 * d'une organisation (ou d'un document) qui porte des fichiers `ready` échouent avant toute écriture, par un message
 * qui les nomme (`requireTransferStore`) ; sans fichier, le transfert passe sans elles (HN-E10S02-87).
 *
 * Outillage du dépôt (ADR-006 § 3) : jamais importé par le paquet ni par l'hôte. Aucune adresse signée ni valeur de
 * variable n'est imprimée.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AwsClient } from 'aws4fetch'
import { UUID } from './env.mjs'

/** Les cinq variables du stockage (ADR-016 § 2), recopiées de `server/files/store.ts` : un script n'importe pas le paquet. */
export const STORAGE_VARIABLES = [
  'PLATFORM_STORAGE_ENDPOINT',
  'PLATFORM_STORAGE_BUCKET',
  'PLATFORM_STORAGE_REGION',
  'PLATFORM_STORAGE_ACCESS_KEY_ID',
  'PLATFORM_STORAGE_SECRET_ACCESS_KEY',
]

/** Délai d'un objet : 50 Mo au plus (`FILE_MAX_BYTES`). */
const OBJECT_TIMEOUT_MS = 120_000

/** Un envoi de plus sur une réponse 5xx ou 429 (`aws4fetch` en rejoue dix par défaut). */
const RETRIES = 1

/**
 * Le stockage d'un objet : ses octets, ou null quand il est absent.
 * @typedef {{ get(key: string): Promise<Uint8Array | null>, put(key: string, bytes: Uint8Array, mime: string): Promise<void> }} TransferStore
 */

/** Le dossier des octets d'un fichier d'export : `<fichier>.files`. */
export function filesDir(file) {
  return `${file}.files`
}

/** L'octet d'un fichier exporté : `<fichier>.files/<id>`, l'identifiant de la source. */
export function exportedObject(file, id) {
  return join(filesDir(file), id)
}

/** La clé d'un objet, celle du paquet (`objectKey`) : `<org_id>/<id>`, jamais le nom d'origine. */
export function objectKey(orgId, fileId) {
  return `${orgId}/${fileId}`
}

/**
 * Le stockage des variables lues (`readVariables`), ou null sans l'une des cinq.
 * @param {Record<string, string | undefined>} values
 * @returns {TransferStore | null}
 */
export function transferStore(values) {
  const [endpoint, bucket, region, accessKeyId, secretAccessKey] = STORAGE_VARIABLES.map((name) => values[name]?.trim() ?? '')
  if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) return null
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region, retries: RETRIES })
  let base = endpoint
  while (base.endsWith('/')) base = base.slice(0, -1)
  const url = (key) => `${base}/${encodeURIComponent(bucket)}/${key}`
  const call = (key, init) => client.fetch(url(key), { ...init, signal: AbortSignal.timeout(OBJECT_TIMEOUT_MS) })
  return {
    async get(key) {
      const answer = await call(key, { method: 'GET' })
      // Un objet absent : 404, ou 403 quand les clés ne listent pas le bucket (comme le paquet, HN-E10S02-32).
      if (answer.status === 404 || answer.status === 403) {
        await answer.body?.cancel()
        return null
      }
      if (!answer.ok) throw new Error(`Stockage : la lecture de ${key} a répondu HTTP ${answer.status}.`)
      return new Uint8Array(await answer.arrayBuffer())
    },
    async put(key, bytes, mime) {
      const answer = await call(key, { method: 'PUT', body: bytes, headers: { 'content-type': mime } })
      await answer.body?.cancel()
      if (!answer.ok) throw new Error(`Stockage : l'envoi de ${key} a répondu HTTP ${answer.status}.`)
    },
  }
}

/** « PLATFORM_STORAGE_ENDPOINT, …, PLATFORM_STORAGE_SECRET_ACCESS_KEY » : les noms, jamais une valeur. */
const NAMED = STORAGE_VARIABLES.join(', ')

/**
 * La garde d'AC-e4 : des fichiers à transférer sans stockage configuré lèvent, par un message qui nomme les cinq
 * variables, avant toute écriture ; sans fichier, rien n'est exigé. Rend le stockage.
 * @param {TransferStore | null} store
 * @param {number} count  les fichiers `ready` de l'organisation ou du document
 * @param {'exporter' | 'importer'} verb
 * @returns {TransferStore | null}
 */
export function requireTransferStore(store, count, verb) {
  if (count > 0 && !store) {
    throw new Error(`Stockage non configuré : ${count} fichiers joints à ${verb}. Posez ${NAMED}, puis relancez. Rien n'a été écrit.`)
  }
  return store
}

/**
 * L'export des objets (AC-e4), après `requireTransferStore` : chaque fichier exporté lu dans le stockage de la source,
 * écrit dans `<fichier>.files/<id>`, un à la fois. Le dossier se crée seul, comme le JSON en `wx` : un dossier déjà là
 * n'est remplacé qu'avec `force`, qui le vide d'abord (aucun objet d'un export précédent n'y reste). Un objet absent
 * du stockage est nommé, jamais une erreur ; une panne du stockage lève. Rend les lignes du résumé.
 * @param {TransferStore | null} store
 * @param {{ orgId: string, files: { id: string }[], file: string, force?: boolean }} request
 * @returns {Promise<string[]>}
 */
export async function exportObjects(store, { orgId, files, file, force = false }) {
  if (force) rmSync(filesDir(file), { recursive: true, force: true })
  if (files.length === 0) return []
  if (!store) throw new Error(`Stockage non configuré (${NAMED}).`)
  try {
    mkdirSync(filesDir(file))
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    throw new Error(`Le dossier ${filesDir(file)} existe déjà : relancez avec --force pour le remplacer.`)
  }
  const missing = []
  for (const row of files) {
    const bytes = await store.get(objectKey(orgId, row.id))
    if (bytes) writeFileSync(exportedObject(file, row.id), bytes)
    else missing.push(row.id)
  }
  const lines = [`Fichiers joints : ${files.length - missing.length} objets écrits dans ${filesDir(file)}.`]
  if (missing.length > 0) lines.push(`Objets absents du stockage (${missing.length}), fichiers exportés sans octets : ${missing.join(', ')}`)
  return lines
}

/**
 * L'import des objets (AC-e4), après `requireTransferStore` et le commit des lignes : chaque objet de
 * `<fichier>.files/<ancien id>` envoyé au stockage de la cible sous `<nouvel org_id>/<nouvel id>`, au type de sa ligne,
 * un à la fois. Un ancien identifiant qui n'est pas un uuid est refusé avant de bâtir le chemin (le fichier vient
 * d'ailleurs : `../` sortirait du dossier) ; un objet absent du dossier est nommé ; un refus ou un envoi en échec
 * aussi, et `failed` les compte. Rend les lignes du résumé.
 * @param {TransferStore | null} store
 * @param {{ orgId: string, files: { from: string, to: string, mime: string }[], file: string }} request
 * @returns {Promise<{ lines: string[], failed: number }>}
 */
export async function importObjects(store, { orgId, files, file }) {
  if (files.length === 0) return { lines: [], failed: 0 }
  if (!store) throw new Error(`Stockage non configuré (${NAMED}).`)
  const missing = []
  const failed = []
  for (const { from, to, mime } of files) {
    if (typeof from !== 'string' || !UUID.test(from)) {
      failed.push(`${String(from)} (identifiant invalide : un uuid est attendu)`)
      continue
    }
    const path = exportedObject(file, from)
    if (!existsSync(path)) {
      missing.push(from)
      continue
    }
    try {
      await store.put(objectKey(orgId, to), readFileSync(path), mime)
    } catch (error) {
      failed.push(`${from} (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  const lines = [`Fichiers joints : ${files.length - missing.length - failed.length} objets envoyés au stockage.`]
  if (missing.length > 0) lines.push(`Objets absents de ${filesDir(file)} (${missing.length}), fichiers importés sans octets : ${missing.join(', ')}`)
  if (failed.length > 0) lines.push(`Envois en échec (${failed.length}), fichiers importés sans octets : ${failed.join(', ')}`)
  return { lines, failed: failed.length }
}
