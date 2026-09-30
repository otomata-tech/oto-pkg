#!/usr/bin/env node
/**
 * platform-staff — l'équipe plateforme du projet Supabase (E08-S02, AC26, N21).
 *
 * Ce que ça empêche : `platform_staff` ne s'écrit par aucune porte du paquet (architecture § 4 :
 * « outillage (clé service) ») ; sans ce script, personne n'est dans l'équipe plateforme et le MCP
 * admin n'a aucun utilisateur possible. Outillage du dépôt : `platform_staff` par la connexion
 * d'administration, les comptes par l'API d'administration d'Auth, à la clé secrète (E01-S10,
 * AC-f4) ; jamais importé par le paquet ni par l'hôte (`tests/unit/cle-service-hors-paquet.test.ts`).
 *
 * Usage : `pnpm platform:staff add <email>`, `remove <email>`, `list`. Le compte est cherché par
 * l'API admin de Supabase (`auth.admin.listUsers`), email comparé sans casse ; il se crée d'abord par
 * une invitation ou par l'outillage. Retirer un membre coupe son MCP admin dès sa requête suivante ;
 * ses accès plateforme restent, datés, et cessent de compter (`member_orgs()`, `is_org_admin()`).
 * `list` lit l'email copié dans la ligne, sans appel à Auth (M23).
 * Variables (`ADMIN_VARIABLES`) : environnement du processus, puis `.env.local`, puis `.env`
 * (`util.parseEnv`, comme `vitest.config.ts`) ; aucune valeur n'est imprimée.
 *
 * Mode OIDC (`PLATFORM_OIDC_ISSUER` posée, E01-S11, HN-E01S11-6, fiche D77 A) : aucun compte Supabase.
 * `add` crée la ligne par son email, sous un identifiant tiré ici, que la base relie au sujet de
 * l'émetteur à sa première connexion (`identity_for_caller`, email vérifié) ; `remove` retire la ligne
 * de cet email. Seule la connexion d'administration est exigée.
 * `add <email> --user <identifiant>` (M35, fiche D93 A) : la ligne reprend l'identifiant interne qu'une
 * personne retirée après sa première connexion garde dans `identities` (son sujet y reste lié) ; un
 * identifiant qu'`identities` ne lie à aucun sujet de cet émetteur est refusé, rien n'est écrit.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { accountCopy } from './lib/account-copy.mjs'
import { ADMIN_VARIABLES, adminSql, envFileTexts, jsonRows, maskValues, messageOf, missingVariables, OIDC_VARIABLE, oidcMode, resolveVariables, serviceKeyClient, UUID } from './lib/env.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 1000
const USAGE = 'Usage : pnpm platform:staff add <email> [--user <identifiant>] | remove <email> | list\n  --user (mode OIDC) : reprend l\'identifiant interne d\'une personne retirée puis rajoutée'
/** La seule variable du mode OIDC : `platform_staff` par la connexion d'administration. */
const ADMIN_DATABASE_VARIABLE = 'PLATFORM_ADMIN_DATABASE_URL'

/**
 * Le compte Supabase de cet email, sans casse, ou `null` : par pages, jusqu'à une page courte.
 * @param {import('@supabase/supabase-js').SupabaseClient<any, any>} admin  clé secrète
 * @param {string} email
 */
async function findUser(admin, email) {
  const wanted = email.trim().toLowerCase()
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE })
    if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`)
    const found = data.users.find((user) => (user.email ?? '').toLowerCase() === wanted)
    if (found) return found
    if (data.users.length < PAGE) return null
  }
}

/**
 * @param {{ sql: import('postgres').Sql, admin: import('@supabase/supabase-js').SupabaseClient<any, any> }} db
 *   `platform_staff` par la connexion d'administration ; le compte par l'API d'administration d'Auth
 * @returns {Promise<number>} code de sortie
 */
async function add({ sql, admin }, email, print) {
  const user = await findUser(admin, email)
  if (!user) {
    print(`Aucun compte pour ${email} : il se crée d'abord par une invitation ou par l'outillage.`)
    return 1
  }
  // L'annuaire de l'équipe plateforme (`staff_directory`) lit l'email et le nom dans la ligne : sans
  // clé vers `auth.users`, la base ne les lit plus dans le compte (E01-S09, AC15).
  const copy = accountCopy(user)
  try {
    await sql`insert into platform.platform_staff (user_id, added_by, email, name) values (${user.id}, null, ${copy.email}, ${copy.name})`
  } catch (error) {
    if (error?.code !== '23505') throw new Error(`Ajout impossible : ${messageOf(error)}`)
    print(`${email} est déjà dans l'équipe plateforme.`)
    return 0
  }
  print(`${email} ajouté à l'équipe plateforme.`)
  return 0
}

/**
 * @param {{ sql: import('postgres').Sql, admin: import('@supabase/supabase-js').SupabaseClient<any, any> }} db
 * @returns {Promise<number>} code de sortie
 */
async function remove({ sql, admin }, email, print) {
  const user = await findUser(admin, email)
  if (!user) {
    print(`Aucun compte pour ${email}.`)
    return 1
  }
  let removed
  try {
    removed = await sql`delete from platform.platform_staff where user_id = ${user.id} returning user_id`
  } catch (error) {
    throw new Error(`Retrait impossible : ${messageOf(error)}`)
  }
  print(removed.length > 0 ? `${email} retiré de l'équipe plateforme.` : `${email} n'est pas dans l'équipe plateforme.`)
  return 0
}

/**
 * Mode OIDC : la ligne de cet email, sans compte Supabase, sous un identifiant neuf ; rien quand une
 * ligne porte déjà l'email (sans casse : la colonne est en minuscules).
 * @param {{ sql: import('postgres').Sql }} db  `platform_staff` par la connexion d'administration
 * @returns {Promise<number>} code de sortie
 */
async function addByEmail({ sql }, email, print) {
  const wanted = email.trim().toLowerCase()
  let added
  try {
    added = await sql`insert into platform.platform_staff (user_id, added_by, email, name)
                        select gen_random_uuid(), null, ${wanted}, null
                         where not exists (select 1 from platform.platform_staff where email = ${wanted})
                        returning user_id`
  } catch (error) {
    throw new Error(`Ajout impossible : ${messageOf(error)}`)
  }
  print(added.length > 0 ? `${email} ajouté à l'équipe plateforme.` : `${email} est déjà dans l'équipe plateforme.`)
  return 0
}

/**
 * Mode OIDC, `--user` : la ligne de cet email sous l'identifiant que `identities` lie déjà à un sujet de
 * cet émetteur (une personne retirée après sa première connexion, M35). Refus quand `identities` ne le
 * connaît pas, ou quand l'email est déjà dans l'équipe sous un autre identifiant ; rien n'est écrit.
 * @param {{ sql: import('postgres').Sql }} db  `identities` et `platform_staff` par la connexion d'administration
 * @param {{ email: string, userId: string, issuer: string }} wanted
 * @returns {Promise<number>} code de sortie
 */
async function addWithUser({ sql }, { email, userId, issuer }, print) {
  const wanted = email.trim().toLowerCase()
  let added
  try {
    const known = UUID.test(userId) && (await sql`select 1 from platform.identities where issuer = ${issuer} and user_id = ${userId} limit 1`).length > 0
    if (!known) {
      print(`Identifiant inconnu : ${userId} n'est lié à aucune personne de cet émetteur dans platform.identities. Sans --user, add pose un identifiant neuf.`)
      return 1
    }
    added = await sql`insert into platform.platform_staff (user_id, added_by, email, name)
                        select ${userId}, null, ${wanted}, null
                         where not exists (select 1 from platform.platform_staff where email = ${wanted})
                        returning user_id`
    if (added.length > 0) {
      print(`${email} ajouté à l'équipe plateforme sous ${userId}.`)
      return 0
    }
    const same = await sql`select 1 from platform.platform_staff where user_id = ${userId}`
    if (same.length > 0) {
      print(`${userId} est déjà dans l'équipe plateforme.`)
      return 0
    }
  } catch (error) {
    throw new Error(`Ajout impossible : ${messageOf(error)}`)
  }
  print(`${email} est déjà dans l'équipe plateforme sous un autre identifiant : pnpm platform:staff remove ${email}, puis add --user.`)
  return 1
}

/**
 * Mode OIDC : retire les lignes de cet email.
 * @param {{ sql: import('postgres').Sql }} db  `platform_staff` par la connexion d'administration
 * @returns {Promise<number>} code de sortie
 */
async function removeByEmail({ sql }, email, print) {
  let removed
  try {
    removed = await sql`delete from platform.platform_staff where email = ${email.trim().toLowerCase()} returning user_id`
  } catch (error) {
    throw new Error(`Retrait impossible : ${messageOf(error)}`)
  }
  print(removed.length > 0 ? `${email} retiré de l'équipe plateforme.` : `${email} n'est pas dans l'équipe plateforme.`)
  return 0
}

/**
 * Une ligne par membre : l'email copié dans la ligne (E01-S09), sinon l'identifiant, et la date d'ajout
 * (celle que rendait PostgREST, `jsonRows`). Sans appel à Auth : une personne sans compte, comme en
 * posent les fixtures portables des tests (E01-S10 t1-0), ne l'arrête plus (M23).
 * @param {{ sql: import('postgres').Sql }} db  `platform_staff` par la connexion d'administration
 * @returns {Promise<number>} code de sortie
 */
async function list({ sql }, print) {
  let rows
  try {
    rows = await jsonRows(sql, sql`user_id, email, added_at`, sql`from platform.platform_staff order by added_at`)
  } catch (error) {
    throw new Error(`Lecture de l'équipe plateforme impossible : ${messageOf(error)}`)
  }
  if (rows.length === 0) print("L'équipe plateforme est vide.")
  for (const row of rows) print(`${row.email ?? row.user_id} · ajouté le ${String(row.added_at).slice(0, 10)}`)
  return 0
}

/**
 * La commande, son email et l'identifiant de `--user` (`add` seul, avant ou après l'email), ou `null`
 * quand la ligne ne suit pas l'usage.
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const [command, ...rest] = argv
  const at = rest.indexOf('--user')
  const userId = at === -1 ? undefined : rest[at + 1]
  const operands = at === -1 ? rest : rest.filter((_, index) => index !== at && index !== at + 1)
  const [email] = operands
  if (command === 'list') return rest.length === 0 ? { command } : null
  if (command !== 'add' && command !== 'remove') return null
  if (operands.length !== 1 || !email) return null
  if (at !== -1 && (command !== 'add' || !userId)) return null
  return { command, email, userId }
}

async function main(argv) {
  const args = parseArgs(argv)
  if (!args) {
    console.error(USAGE)
    return 1
  }
  const { command, email, userId } = args
  const texts = envFileTexts(ROOT)
  // L'émetteur de l'hôte : absent, Supabase Auth et ses comptes ; posé, aucun compte à chercher.
  const { oidc, issuer } = oidcMode(process.env, texts)
  if (userId && !oidc) {
    console.error(`--user ne sert qu'en mode OIDC (${OIDC_VARIABLE} posée) : sur Supabase Auth, l'identifiant est celui du compte de l'email.`)
    return 1
  }
  const { values, missing } = resolveVariables(process.env, texts, oidc ? [ADMIN_DATABASE_VARIABLE] : ADMIN_VARIABLES)
  if (missing.length > 0) {
    console.error(`${missingVariables(missing)} (voir .env.example)`)
    return 1
  }
  const hidden = Object.values(values)
  const print = (line) => console.log(maskValues(line, hidden))
  let sql
  try {
    sql = adminSql(values)
    if (command === 'list') return await list({ sql }, print)
    if (userId) return await addWithUser({ sql }, { email, userId, issuer }, print)
    if (oidc) return await (command === 'add' ? addByEmail : removeByEmail)({ sql }, email, print)
    const db = { sql, admin: serviceKeyClient(values) }
    if (command === 'add') return await add(db, email, print)
    return await remove(db, email, print)
  } catch (error) {
    console.error(maskValues(messageOf(error), hidden))
    return 1
  } finally {
    await sql?.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
