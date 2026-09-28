#!/usr/bin/env node
/**
 * test-cleanup — ménage des données de test laissées par des passages interrompus (M11).
 *
 * Ce que ça empêche : les organisations `t<hex>`, les comptes `test-<hex>@example.invalid` et les
 * personnes sans compte de l'équipe plateforme (fixtures portables d'E01-S10 t1-0) qu'un passage
 * interrompu (arrêt de la machine, délai dépassé) n'a pas supprimés s'accumulent dans le projet
 * Supabase que partagent les agents. Outillage du dépôt : `platform` par la connexion
 * d'administration, les comptes par l'API d'administration d'Auth, à la clé secrète (E01-S10,
 * AC-f4) ; jamais importé par le paquet ni par l'hôte (`tests/unit/cle-service-hors-paquet.test.ts`).
 *
 * Usage : `pnpm test:cleanup` compte ce qui serait supprimé ; `--delete` le supprime : les personnes
 * sans compte de l'équipe plateforme d'abord, oubliées de `platform` (`forget_user`, E01-S09) tant que
 * sont là les organisations qui les datent ; puis les organisations (leurs lignes suivent les cascades
 * du schéma, rien n'est supprimé à la main) ; puis les comptes, chacun oublié de `platform` avant.
 * Seules les données de plus de deux heures sont visées : d'autres agents testent en ce moment. Une
 * organisation n'est reconnue qu'à la marque que lui pose `createFixtures`
 * (`tests/helpers/plateforme.ts`) : slug et préfixe égaux, `t` puis 8 chiffres hexadécimaux ; un
 * compte ou une personne sans compte, à son adresse `test-<hex>@example.invalid`. L'âge d'une personne
 * sans compte se lit par les organisations qu'elle sert (`staleStaff`), jamais par `added_at`. Les
 * étapes de suppression revérifient la marque avant chaque requête (`security-patterns.md § Outillage
 * à clé service`), l'âge avant la requête d'une organisation ou d'un compte, et la requête d'une
 * organisation ou d'une personne sans compte exige encore l'une et l'autre. La sortie ne donne que
 * des nombres et les raisons d'un échec : jamais une adresse, un identifiant ni une clé.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ADMIN_VARIABLES, adminSql, envFileTexts, jsonRows, maskValues, messageOf, missingVariables, resolveVariables, serviceKeyClient } from './lib/env.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_AGE_MS = 2 * 3600 * 1000
const TEST_ORG = /^t[0-9a-f]{8}$/
const TEST_EMAIL = /^test-[0-9a-f]+@example\.invalid$/
const PAGE = 1000

/** Raison d'un refus des étapes de suppression : une ligne que la sélection n'aurait pas retenue. */
export const NOT_STALE_TEST_DATA = 'sans la marque des tests ou créée il y a moins de 2 h, refusée avant la requête'

/** Raison d'un refus de la requête qui oublie une personne sans compte : elle ne répond plus à `staleStaff`. */
export const STAFF_IN_USE = "introuvable, ou d'un passage de moins de 2 h, au moment de l'oubli"

const createdBefore = (row, cutoff) => Date.parse(row.created_at) < cutoff
const isStaleTestOrg = (org, cutoff) => TEST_ORG.test(org.slug) && org.prefix === org.slug && createdBefore(org, cutoff)
const isStaleTestUser = (user, cutoff) => TEST_EMAIL.test(user.email ?? '') && createdBefore(user, cutoff)

/** Organisations au slug `t…` créées avant `cutoffIso`, telles que PostgREST les rendait (`jsonRows`). */
async function listOrgs(sql, cutoffIso) {
  try {
    return await jsonRows(sql, sql`id, slug, prefix, created_at`, sql`from platform.orgs where slug like 't%' and created_at < ${cutoffIso} order by id`)
  } catch (error) {
    throw new Error(`Lecture des organisations impossible : ${messageOf(error)}`)
  }
}

/**
 * `from … where …` des membres de l'équipe plateforme (`s`) dont le passage de test est fini. Leur âge
 * ne se lit pas par `added_at`, que la base admin des fixtures date au 1er septembre, mais par les
 * organisations que la personne sert, en membre (`members`) ou par un accès plateforme
 * (`platform_grants`) : aucune n'a moins de 2 h, et l'une porte la marque des tests ; ou elle n'en sert
 * aucune, et aucune organisation marquée n'a moins de 2 h : aucun passage n'est en cours, puisqu'un test
 * qui pose une personne sans compte crée aussi une organisation marquée
 * (`testing-strategy.md § Anti-patterns`). Fragment complété par `listStaff` (l'adresse des tests) et
 * par `forgetStaff` (la personne visée), jamais exécuté seul.
 * @param {import('postgres').Sql} sql
 * @param {string} cutoffIso  il y a deux heures
 * @returns {import('postgres').PendingQuery<any>}
 */
function staleStaff(sql, cutoffIso) {
  return sql`
    from platform.platform_staff s
    cross join lateral (
      select count(*) filter (where o.created_at >= ${cutoffIso}) as recent,
             count(*) filter (where o.slug ~ ${TEST_ORG.source} and o.prefix = o.slug) as marked,
             count(*) as total
        from platform.orgs o
       where o.id in (select m.org_id from platform.members m where m.user_id = s.user_id
                      union
                      select g.org_id from platform.platform_grants g where g.user_id = s.user_id)) served
   where served.recent = 0
     and (served.marked > 0
          or (served.total = 0
              and not exists (select 1 from platform.orgs o
                               where o.slug ~ ${TEST_ORG.source} and o.prefix = o.slug and o.created_at >= ${cutoffIso})))`
}

/**
 * Les membres de l'équipe plateforme à l'adresse des tests dont le passage est fini (`staleStaff`),
 * comptes compris : `staleTestData` retire ceux qui ont un compte, qu'oublie l'étape des comptes.
 */
async function listStaff(sql, cutoffIso) {
  try {
    return await sql`select s.user_id, s.email ${staleStaff(sql, cutoffIso)} and s.email ~ ${TEST_EMAIL.source} order by s.user_id`
  } catch (error) {
    throw new Error(`Lecture de l'équipe plateforme impossible : ${messageOf(error)}`)
  }
}

/**
 * Tous les comptes, par pages, jusqu'à la première vide : `nextPage` de supabase-js ne lit que le
 * premier chiffre du numéro de page (`GoTrueAdminApi.listUsers`), faux à partir de la page 10.
 */
async function listUsers(admin) {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE })
    if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`)
    if (data.users.length === 0) return users
    users.push(...data.users)
  }
}

function countReason(outcome, reason) {
  outcome.reasons.set(reason, (outcome.reasons.get(reason) ?? 0) + 1)
}

/**
 * Une organisation à la fois : un refus (cascade manquante) n'empêche pas les suivantes. Une
 * organisation sans la marque des tests ou trop récente est refusée avant sa requête ; la requête
 * exige encore slug = préfixe et l'âge, pour une organisation changée depuis sa lecture.
 * @param {import('postgres').Sql} sql  connexion d'administration
 * @param {{ id: string, slug: string, prefix: string, created_at: string }[]} orgs
 * @param {number} now  horodatage, en millisecondes
 * @returns {Promise<{ deleted: number, reasons: Map<string, number> }>}
 */
export async function deleteOrgs(sql, orgs, now) {
  const cutoff = now - TEST_AGE_MS
  const cutoffIso = new Date(cutoff).toISOString()
  const outcome = { deleted: 0, reasons: new Map() }
  for (const org of orgs) {
    if (!isStaleTestOrg(org, cutoff)) {
      countReason(outcome, NOT_STALE_TEST_DATA)
      continue
    }
    let deleted
    try {
      deleted = await sql`delete from platform.orgs
                           where id = ${org.id} and slug = ${org.slug} and prefix = ${org.slug} and created_at < ${cutoffIso}
                       returning id`
    } catch (error) {
      countReason(outcome, `${error.code} ${error.message}`)
      continue
    }
    if (deleted.length === 0) countReason(outcome, 'introuvable au moment de la suppression')
    else outcome.deleted += 1
  }
  return outcome
}

/**
 * Un compte à la fois ; un compte sans l'adresse des tests ou trop récent est refusé avant sa
 * requête (la suppression d'un compte Auth ne prend pas d'autre condition que son id). La personne
 * est d'abord oubliée de `platform` (`forget_user`) : depuis E01-S09, aucune clé vers `auth.users` ne
 * le fait plus à la suppression du compte.
 * @param {{ sql: import('postgres').Sql, admin: import('@supabase/supabase-js').SupabaseClient<any, any> }} db
 *   `forget_user` par la connexion d'administration ; le compte par l'API d'administration d'Auth
 * @param {{ id: string, email?: string, created_at: string }[]} users
 * @param {number} now  horodatage, en millisecondes
 * @returns {Promise<{ deleted: number, reasons: Map<string, number> }>}
 */
export async function deleteUsers({ sql, admin }, users, now) {
  const cutoff = now - TEST_AGE_MS
  const outcome = { deleted: 0, reasons: new Map() }
  for (const user of users) {
    if (!isStaleTestUser(user, cutoff)) {
      countReason(outcome, NOT_STALE_TEST_DATA)
      continue
    }
    try {
      await sql`select platform.forget_user(${user.id})`
    } catch (error) {
      countReason(outcome, `${error.code} ${error.message}`)
      continue
    }
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) countReason(outcome, error.message)
    else outcome.deleted += 1
  }
  return outcome
}

/**
 * Une personne sans compte de l'équipe plateforme à la fois, oubliée de `platform` (`forget_user`) : un
 * refus (nœud d'un autre propriétaire rangé sous les siens, 23503) n'empêche pas les suivantes. Une
 * personne sans l'adresse des tests est refusée avant sa requête ; la requête exige encore l'adresse et
 * l'âge du passage (`staleStaff`), lus au moment même : elle part avant les organisations qui la datent.
 * @param {import('postgres').Sql} sql  connexion d'administration
 * @param {{ user_id: string, email: string | null }[]} persons
 * @param {number} now  horodatage, en millisecondes
 * @returns {Promise<{ deleted: number, reasons: Map<string, number> }>}
 */
export async function forgetStaff(sql, persons, now) {
  const cutoffIso = new Date(now - TEST_AGE_MS).toISOString()
  const outcome = { deleted: 0, reasons: new Map() }
  for (const person of persons) {
    if (!TEST_EMAIL.test(person.email ?? '')) {
      countReason(outcome, NOT_STALE_TEST_DATA)
      continue
    }
    let forgotten
    try {
      forgotten = await sql`select platform.forget_user(s.user_id)
                              ${staleStaff(sql, cutoffIso)} and s.user_id = ${person.user_id} and s.email = ${person.email}`
    } catch (error) {
      countReason(outcome, `${error.code} ${error.message}`)
      continue
    }
    if (forgotten.length === 0) countReason(outcome, STAFF_IN_USE)
    else outcome.deleted += 1
  }
  return outcome
}

/**
 * Ce que `--delete` supprimerait à `now` : les organisations et les comptes des tests de plus de 2 h, et
 * les membres de l'équipe plateforme à l'adresse des tests, sans compte, dont le passage est fini
 * (`staleStaff`) ; ceux qui ont un compte partent avec lui quand il a plus de 2 h (`deleteUsers`).
 * @param {{ sql: import('postgres').Sql, admin: import('@supabase/supabase-js').SupabaseClient<any, any> }} db
 *   `platform` par la connexion d'administration ; les comptes par l'API d'administration d'Auth
 * @param {number} now  horodatage, en millisecondes
 * @returns {Promise<{ orgs: { id: string, slug: string, prefix: string, created_at: string }[], users: import('@supabase/supabase-js').User[], persons: { user_id: string, email: string | null }[] }>}
 */
export async function staleTestData({ sql, admin }, now) {
  const cutoff = now - TEST_AGE_MS
  const cutoffIso = new Date(cutoff).toISOString()
  const orgs = (await listOrgs(sql, cutoffIso)).filter((org) => isStaleTestOrg(org, cutoff))
  // L'équipe plateforme avant les comptes : une personne qui a déjà son compte quand sa ligne est lue
  // paraît dans la liste des comptes, lue ensuite. Un compte créé plus tard (`personDb` des fixtures,
  // au premier appel) laisse la personne sans compte à cette lecture : les organisations de son
  // passage, récentes, la gardent.
  const staff = await listStaff(sql, cutoffIso)
  const accounts = await listUsers(admin)
  const accountIds = new Set(accounts.map((user) => user.id))
  return {
    orgs,
    users: accounts.filter((user) => isStaleTestUser(user, cutoff)),
    persons: staff.filter((person) => !accountIds.has(person.user_id)),
  }
}

async function main(argv) {
  const unknown = argv.find((arg) => arg !== '--delete')
  if (unknown !== undefined) {
    console.error(`Option inconnue : ${unknown}. Options : --delete`)
    return 1
  }
  const { values, missing } = resolveVariables(process.env, envFileTexts(ROOT), ADMIN_VARIABLES)
  if (missing.length > 0) {
    console.error(`${missingVariables(missing)} (voir .env.example)`)
    return 1
  }

  const hidden = Object.values(values)
  const print = (line) => console.log(maskValues(line, hidden))
  let sql
  try {
    sql = adminSql(values)
    const admin = serviceKeyClient(values)
    const now = Date.now()
    const { orgs, users, persons } = await staleTestData({ sql, admin }, now)
    print(
      `Données de test créées il y a plus de 2 h : ${orgs.length} organisation(s) t<hex>, ` +
        `${users.length} compte(s) test-<hex>@example.invalid, ${persons.length} personne(s) sans compte de l'équipe plateforme.`,
    )
    if (!argv.includes('--delete')) {
      print("Rien n'est supprimé sans --delete.")
      return 0
    }
    const staffOutcome = await forgetStaff(sql, persons, now)
    const orgOutcome = await deleteOrgs(sql, orgs, now)
    const userOutcome = await deleteUsers({ sql, admin }, users, now)
    print(
      `Supprimé : ${orgOutcome.deleted} organisation(s), ${userOutcome.deleted} compte(s) ; ` +
        `oublié : ${staffOutcome.deleted} personne(s) sans compte.`,
    )
    for (const [reason, count] of orgOutcome.reasons) print(`Non supprimé : ${count} organisation(s) — ${reason}`)
    for (const [reason, count] of userOutcome.reasons) print(`Non supprimé : ${count} compte(s) — ${reason}`)
    for (const [reason, count] of staffOutcome.reasons) print(`Non oublié : ${count} personne(s) sans compte — ${reason}`)
    return orgOutcome.reasons.size + userOutcome.reasons.size + staffOutcome.reasons.size === 0 ? 0 : 1
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
