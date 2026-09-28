/**
 * env — variables et clients des scripts d'outillage : `pnpm demo:seed` (E01-S05),
 * `pnpm org:export` et `pnpm org:import` (E09-S04), `pnpm oauth:clients` (E02-S04),
 * `pnpm platform:staff`, `pnpm test:cleanup` ; et ce qu'un script imprime d'une erreur : son message,
 * le code d'une erreur de la base ou d'Auth, les valeurs secrètes masquées (M15b-1 : lus par plusieurs
 * scripts, ils vivaient dans le script Démo et dans la carte de l'export-import).
 *
 * Deux accès (E01-S10, AC-f4) : `platform` par la connexion d'administration
 * (`PLATFORM_ADMIN_DATABASE_URL`, `adminSql`), jamais par la clé secrète sur le Data API ; les comptes
 * Supabase par l'API d'administration d'Auth, à la clé secrète (`serviceKeyClient`).
 *
 * Ce que ça empêche : trois scripts qui relisent chacun `.env.local` et `.env`, nomment chacun les
 * variables manquantes et construisent chacun leur client (décision du pilote du 2026-09-24, à la
 * troisième occurrence). Outillage seulement, jamais importé par le paquet ni par l'hôte
 * (`tests/unit/cle-service-hors-paquet.test.ts`) ; aucune valeur n'est imprimée ici.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { sslOption } from '../../packages/plateforme/cli/ssl-option.mjs'

/** Les deux variables d'un client à la clé de service. */
export const SERVICE_KEY_VARIABLES = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']

/**
 * Les trois variables d'un script qui atteint `platform` (E01-S10, AC-f4) : les comptes par l'API
 * d'administration d'Auth, `platform` par la connexion d'administration.
 */
export const ADMIN_VARIABLES = [...SERVICE_KEY_VARIABLES, 'PLATFORM_ADMIN_DATABASE_URL']

/**
 * Textes de `.env.local` puis `.env` de `root`, dans cet ordre ; vide pour un fichier absent.
 * @param {string} root
 * @returns {string[]}
 */
export function envFileTexts(root) {
  return ['.env.local', '.env'].map((name) => {
    const file = join(root, name)
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  })
}

/**
 * Variables d'un script : l'environnement du processus l'emporte, puis `fileTexts` dans l'ordre
 * (`.env.local`, puis `.env`). Comme `vitest.config.ts`, une variable présente, même vide, masque
 * les sources suivantes ; vide, elle manque. `missing` : noms seulement, dans l'ordre de `required`.
 * @param {Record<string, string | undefined>} processEnv
 * @param {string[]} fileTexts
 * @param {string[]} required
 * @param {string[]} [optional]
 * @returns {{ values: Record<string, string>, missing: string[] }}
 */
export function resolveVariables(processEnv, fileTexts, required, optional = []) {
  const sources = [processEnv, ...fileTexts.map((text) => parseEnv(text))]
  /** @type {Record<string, string>} */
  const values = {}
  const missing = []
  for (const key of [...required, ...optional]) {
    const value = sources.map((source) => source[key]).find((candidate) => candidate !== undefined)
    if (value) values[key] = value
    else if (required.includes(key)) missing.push(key)
  }
  return { values, missing }
}

/**
 * « Variables manquantes : <noms> », jamais une valeur.
 * @param {string[]} missing
 * @returns {string}
 */
export function missingVariables(missing) {
  return `Variables manquantes : ${missing.join(', ')}`
}

/**
 * Remplace chaque valeur non vide de `values` par `<masqué>`. Dernier rempart d'AC5 d'E01-S05 : ce
 * qu'un script imprime ou lève (message d'erreur de Supabase compris) passe par ce masque.
 * @param {string} text
 * @param {string[]} values
 * @returns {string}
 */
export function maskValues(text, values) {
  return values.reduce((masked, value) => (value ? masked.replaceAll(value, '<masqué>') : masked), text)
}

export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Le code d'une erreur Supabase, jamais son message (`supabase-patterns.md § Error Handling`) ; sur la
 * connexion d'administration, le SQLSTATE, ou le code d'une panne (`CONNECTION_CLOSED`…) ; sans
 * code, le statut HTTP : celui du résultat pour PostgREST (une réponse sans corps JSON, 413 ou 502 à
 * 504 de la passerelle, rend `{ message }` seul), celui de l'erreur pour Auth ; 0 : le réseau.
 * @param {{ code?: string, status?: number, message?: string } | null | undefined} error
 * @param {number} [status]
 */
export function codeOf(error, status = error?.status) {
  return error?.code || (status ? `HTTP ${status}` : 'réseau')
}

/**
 * Client supabase-js à la clé de service, sans session ni rafraîchissement de jeton. Les scripts n'en
 * lisent que l'API d'administration d'Auth (`auth.admin`) : les comptes ; `platform` passe par
 * `adminSql`, jamais par le Data API (E01-S10, AC-f4).
 * @param {Record<string, string>} values
 */
export function serviceKeyClient(values) {
  return createClient(values.NEXT_PUBLIC_SUPABASE_URL, values.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * La connexion d'administration de l'outillage à la base (`PLATFORM_ADMIN_DATABASE_URL`, E01-S10,
 * AC-f4), seule fabrique des scripts : une connexion, en TLS sauf `sslmode` écrit dans l'URL
 * (`sslOption`, comme `db prepare` et la connexion d'administration des tests). Requêtes préparées
 * gardées : la variable vise la connexion directe (rôle `postgres`, `.env.example`) ou le pooler de
 * session, qui les gardent ; seul le pooler en mode transaction exigerait `prepare: false`, celui de
 * `PLATFORM_DATABASE_URL` (`server/sql.ts`, HN-E01S10-3). Elle ne s'ouvre qu'à la première requête ;
 * le script la ferme (`end()`) avant de rendre la main. Jamais importée par le paquet ni par l'hôte.
 * @param {Record<string, string>} values
 * @returns {import('postgres').Sql}
 */
export function adminSql(values) {
  const url = values.PLATFORM_ADMIN_DATABASE_URL
  return postgres(url, { max: 1, ...sslOption(url), onnotice: () => {}, connection: { application_name: 'oto-platform outillage' } })
}

/**
 * Les lignes de `from` (`from … [where …] [order by …]`) telles que PostgREST les rendait : chacune
 * réduite à `columns` et passée par `to_json`, dates en texte ISO, `bigint` en nombre, `jsonb` en
 * objet. postgres.js rend sinon une date en `Date` et un `bigint` en chaîne : le fichier d'export, la
 * date de `platform:staff list` et la table d'`oauth:clients` changeraient. L'objet se construit dans
 * la requête qui porte l'`order by` : les lignes viennent dans son ordre, même sur une colonne hors de
 * `columns` (l'`id` du journal, que l'export ne recopie pas), ce qu'une sous-requête ordonnée ne
 * garantit pas à la requête qui la lit.
 * @param {import('postgres').Sql} sql
 * @param {import('postgres').PendingQuery<any>} columns  les colonnes d'une ligne (`a, b`, `identifiers`)
 * @param {import('postgres').PendingQuery<any>} from  la suite de la requête ; `columns` et `from` sont
 *   des fragments `sql\`…\``, jamais exécutés seuls
 * @returns {Promise<Record<string, any>[]>}
 */
export async function jsonRows(sql, columns, from) {
  const rows = await sql`select (select to_json(r) from (select ${columns}) r) as row ${from}`
  return rows.map(({ row }) => row)
}

/**
 * `"a", "b"` : des noms de colonne d'une liste fermée (la carte de l'export-import), chacun par
 * `sql(nom)`. `sql(tableau)` prend sa forme du dernier mot SQL qui le précède (`select`, `in`,
 * `values`…) : après `order by` ou dans un `insert … select`, elle dépendrait du reste de la requête,
 * jusqu'à rendre des valeurs au lieu de noms.
 * @param {import('postgres').Sql} sql
 * @param {readonly string[]} names  un nom au moins
 * @returns {import('postgres').PendingQuery<any>}
 */
export function identifiers(sql, names) {
  return names.slice(1).reduce((list, name) => sql`${list}, ${sql(name)}`, sql`${sql(names[0])}`)
}
