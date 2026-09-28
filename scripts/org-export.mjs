#!/usr/bin/env node
/**
 * org-export — écrit une organisation dans un fichier JSON (E09-S04, H112, AC1 à AC5).
 *
 * Ce que ça empêche : passer un client de la cellule partagée au projet Supabase de son ERP, ou
 * dupliquer une organisation, sans rien perdre ni rien republier. Chaque table porte `org_id` (ou
 * suit son parent) : un fichier par organisation suffit, que `scripts/org-import.mjs` recopie.
 *
 * Usage : `pnpm org:export --org <slug> --out <fichier>.org-export.json [--with-journal] [--force]
 * [--env <fichier>]`. Outillage (ADR-006 § 3) : `platform` par la connexion d'administration, jamais
 * par la clé secrète sur le Data API ; les personnes par l'API d'administration d'Auth (E01-S10,
 * AC-f4). Il ne fait que lire, dans une transaction en lecture seule (un seul instantané : un bloc n'y
 * désigne jamais un nœud absent du fichier), table par table, les colonnes de la carte seulement
 * (jamais `select *` : ni colonne générée, ni `secret_ciphertext`), filtrées par organisation ;
 * `platform_staff` n'est jamais lue ; le journal, sur option. Aucune valeur de variable n'est imprimée.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { adminSql, codeOf, identifiers, jsonRows, maskValues, messageOf, serviceKeyClient } from './lib/env.mjs'
import { parseExportArgs, readOrFail, readVariables } from './lib/org-transfer-args.mjs'
import { collectPeople, countRows, FORMAT, orgRowsSql, TABLES, VERSION } from './lib/org-transfer.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PERSONAL_DATA = 'Ce fichier contient des données personnelles : ne le commitez pas.'

/**
 * Les lignes d'une table de la carte (`orgRowsSql`), dans l'ordre de sa clé primaire, même absente des
 * colonnes exportées (`id` du journal), telles que PostgREST les rendait (`jsonRows`).
 * @param {import('postgres').Sql} sql
 * @param {import('./lib/org-transfer.mjs').TableSpec} spec
 * @param {string} orgId
 */
function readTable(sql, spec, orgId) {
  const table = sql(`platform.${spec.name}`)
  const from = sql`from ${table} where ${orgRowsSql(sql, spec, orgId)} order by ${identifiers(sql, spec.key)}`
  return readOrFail(jsonRows(sql, identifiers(sql, spec.columns), from), `de ${spec.name}`)
}

/**
 * Email de chaque personne citée, en minuscules ; null pour un compte supprimé depuis (un
 * `provenance.by` peut le citer) : il sera absent de toute cible.
 */
async function readPeople(admin, ids) {
  const people = []
  for (const id of ids) {
    const { data, error } = await admin.auth.admin.getUserById(id)
    if (error && error.status !== 404) throw new Error(`Lecture des personnes impossible (${codeOf(error)}).`)
    people.push({ id, email: data?.user?.email?.toLowerCase() ?? null })
  }
  return people
}

/**
 * Le fichier d'export de l'organisation `slug` (AC1 à AC4) : chaque table de la carte, dans son ordre,
 * le groupe journal sur option (AC2), lus dans un seul instantané ; puis les personnes citées.
 * @param {{ sql: import('postgres').Sql, admin: import('@supabase/supabase-js').SupabaseClient<any, any> }} db
 *   `platform` par la connexion d'administration ; les personnes par l'API d'administration d'Auth
 * @param {{ slug: string, withJournal: boolean, url: string }} options
 */
async function exportOrg({ sql, admin }, { slug, withJournal, url }) {
  const { org, tables } = await sql.begin('isolation level repeatable read read only', async (tx) => {
    const [found] = await readOrFail(tx`select id, slug, prefix, name from platform.orgs where slug = ${slug}`, "de l'organisation")
    if (!found) throw new Error(`Organisation inconnue : ${slug}.`)
    /** @type {Record<string, Record<string, unknown>[]>} */
    const read = {}
    for (const spec of TABLES) {
      if (spec.journal && !withJournal) continue
      read[spec.name] = await readTable(tx, spec, found.id)
    }
    return { org: found, tables: read }
  })
  const people = await readPeople(admin, collectPeople(tables))
  return { format: FORMAT, version: VERSION, exported_at: new Date().toISOString(), source: { host: new URL(url).host, org }, people, tables }
}

async function main(argv) {
  let options
  let values
  try {
    options = parseExportArgs(argv)
    if (existsSync(options.out) && !options.force) {
      throw new Error(`Le fichier ${options.out} existe déjà : relancez avec --force pour le remplacer.`)
    }
    values = readVariables(options.env, process.env, ROOT)
  } catch (error) {
    console.error(messageOf(error))
    return 1
  }
  const hidden = Object.values(values)
  let sql
  try {
    sql = adminSql(values)
    const url = values.NEXT_PUBLIC_SUPABASE_URL
    const doc = await exportOrg({ sql, admin: serviceKeyClient(values) }, { slug: options.org, withJournal: options.withJournal, url })
    // `wx` : un fichier apparu depuis le contrôle n'est pas écrasé sans --force.
    writeFileSync(options.out, `${JSON.stringify(doc, null, 2)}\n`, { flag: options.force ? 'w' : 'wx' })
    const { rows, tables } = countRows(doc.tables)
    console.log(`Organisation ${options.org} exportée dans ${options.out}.`)
    console.log(`${rows} lignes dans ${tables} tables, ${doc.people.length} personnes.`)
    console.log(PERSONAL_DATA)
    return 0
  } catch (error) {
    console.error(maskValues(messageOf(error), hidden))
    return 1
  } finally {
    await sql?.end()
  }
}

// Pas de process.exit : sous Windows, il arrête Node sur une assertion libuv quand une connexion HTTP
// se ferme encore (constaté au banc, `mcp-test/scripts/oauth-admin.mjs`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
