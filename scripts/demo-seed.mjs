#!/usr/bin/env node
/**
 * demo-seed — sème l'organisation « Démo » dans le projet Supabase (E01-S05).
 *
 * Ce que ça empêche : des contrôles visuels, des smoke tests et des essais sans organisation où se
 * connecter. Outillage du dépôt : jamais importé par le paquet ni par l'hôte (architecture § 4,
 * ADR-006 § 3), ce que garde `tests/unit/cle-service-hors-paquet.test.ts`. `platform` se lit et
 * s'écrit par la connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`), jamais par le Data API
 * (E01-S10, AC-f4) ; la clé secrète ne sert plus qu'à l'API d'administration d'Auth : le compte E2E,
 * et elle est éprouvée avant la première écriture (`prepareOrg`).
 *
 * Les données viennent des sections `scripts/demo/NN-<nom>.mjs`, chargées dans l'ordre du
 * préfixe : chaque story qui ajoute un type de donnée ajoute son fichier (contrat : `DemoSection`,
 * `DemoContext`). Chaque section est idempotente par clés naturelles : le script se rejoue.
 *
 * Usage : `pnpm demo:seed` ; `--reset` supprime l'organisation (cascade) avant de la resemer ;
 * `--slug <slug>` sème « Démo <slug> » au lieu de `demo`. Variables : environnement du processus,
 * puis `.env.local`, puis `.env` ; aucune valeur n'est imprimée.
 *
 * Le script crée l'organisation si elle manque, et n'agit sur une organisation existante que si elle
 * est de démonstration (`guardOrg`) : marquée `settings.demo` par la section `identite` qui l'a
 * créée (la Démo semée avant la marque la reçoit au passage suivant). Toute autre organisation est
 * refusée avant la première écriture, code 1 : `--reset` ne supprime jamais celle d'un client.
 */
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { maybeOne, must } from './demo/publication.mjs'
import { adminSql, codeOf, envFileTexts, maskValues, messageOf, missingVariables, resolveVariables, serviceKeyClient } from './lib/env.mjs'


/**
 * Contrat d'une section (E02-S01, E01-S04, E01-S06 et E06-S01 le suivent) : le module
 * `scripts/demo/NN-<nom>.mjs` exporte `section = { name, async run(ctx) }`.
 * @typedef {{ name: string, run: (ctx: DemoContext) => Promise<void> }} DemoSection
 */

/**
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`) : tout `platform`
 * @property {import('@supabase/supabase-js').GoTrueAdminApi} auth  API d'administration d'Auth, à la clé secrète : les comptes
 * @property {{ supabaseUrl: string, anonKey: string, siteUrl: string | undefined,
 *              e2eEmail: string, e2ePassword: string }} env
 * @property {{ slug: string, name: string, prefix: string, isDemo: boolean }} spec
 * @property {{ id: string } | null} org  posé par `identite`
 * @property {{ id: string, email: string, name?: string | null } | null} e2eUser  posé par `identite`
 * @property {Record<string, string>} teams  slug → id, posé par `identite`
 * @property {(line: string) => void} report  une ligne du résumé (jamais une valeur secrète)
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SECTIONS_DIR = join(ROOT, 'scripts/demo')

const DEMO_SLUG = 'demo'
const DEMO_NAME = 'Démo'
// Le slug sert aussi de préfixe des outils MCP : même règle que `orgs.prefix` (E01-S02).
const SLUG_PATTERN = /^[a-z][a-z0-9]{1,11}$/
const SECTION_FILE = /^\d{2}-[a-z]+\.mjs$/
const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'PLATFORM_ADMIN_DATABASE_URL',
  'E2E_USER_EMAIL',
  'E2E_USER_PASSWORD',
]
const OPTIONAL_ENV = ['NEXT_PUBLIC_SITE_URL']

export const INVALID_SLUG = 'Slug invalide : 2 à 12 minuscules ou chiffres, commençant par une lettre.'
export const OPTIONS = 'Options : --reset, --slug <slug>'

/**
 * @param {string[]} argv
 * @returns {{ reset: boolean, slug: string }}
 */
export function parseArgs(argv) {
  const options = { reset: false, slug: DEMO_SLUG }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--reset') {
      options.reset = true
    } else if (arg === '--slug') {
      options.slug = argv[i + 1] ?? ''
      i += 1
    } else {
      throw new Error(`Option inconnue : ${arg}. ${OPTIONS}`)
    }
  }
  if (!SLUG_PATTERN.test(options.slug)) throw new Error(INVALID_SLUG)
  return options
}

/**
 * @param {string} slug
 * @returns {{ slug: string, name: string, prefix: string, isDemo: boolean }}
 */
export function orgSpec(slug) {
  const isDemo = slug === DEMO_SLUG
  return { slug, name: isDemo ? DEMO_NAME : `${DEMO_NAME} ${slug}`, prefix: slug, isDemo }
}

/**
 * Variables du script : l'environnement du processus l'emporte, puis `fileTexts` dans l'ordre
 * (`.env.local`, puis `.env`). Comme `vitest.config.ts`, une variable présente, même vide, masque
 * les sources suivantes ; vide, elle manque. `missing` : noms seulement.
 * @param {Record<string, string | undefined>} processEnv
 * @param {string[]} fileTexts
 * @returns {{ values: Record<string, string>, missing: string[] }}
 */
export function resolveEnv(processEnv, fileTexts) {
  return resolveVariables(processEnv, fileTexts, REQUIRED_ENV, OPTIONAL_ENV)
}

/**
 * Fichiers de section (`NN-<nom>.mjs`), dans l'ordre du préfixe.
 * @param {string[]} fileNames
 * @returns {string[]}
 */
export function sectionFiles(fileNames) {
  return fileNames.filter((name) => SECTION_FILE.test(name)).sort()
}

/**
 * Charge et valide toutes les sections de `dir` avant d'en lancer aucune : un fichier illisible ou
 * sans export `section = { name, run }` arrête tout, en le nommant.
 * @param {string} dir
 * @returns {Promise<DemoSection[]>}
 */
export async function loadSections(dir) {
  const sections = []
  for (const file of sectionFiles(readdirSync(dir))) {
    let loaded
    try {
      loaded = await import(pathToFileURL(join(dir, file)).href)
    } catch (error) {
      throw new Error(`Section illisible : ${file} (${messageOf(error)})`)
    }
    const section = loaded.section
    if (typeof section?.name !== 'string' || section.name === '' || typeof section.run !== 'function') {
      throw new Error(`Section invalide : ${file} doit exporter section = { name, run }.`)
    }
    sections.push(section)
  }
  return sections
}

/**
 * Lance les sections dans l'ordre, un en-tête par section ; la première qui lève arrête tout, en
 * la nommant.
 * @template T
 * @param {{ name: string, run: (ctx: T) => Promise<void> }[]} sections
 * @param {T} ctx
 * @param {(line: string) => void} print
 * @returns {Promise<void>}
 */
export async function runSections(sections, ctx, print) {
  for (const section of sections) {
    print(`[${section.name}]`)
    try {
      await section.run(ctx)
    } catch (error) {
      throw new Error(`Section ${section.name} en échec : ${messageOf(error)}`)
    }
  }
}

/**
 * Garde, avant toute écriture (`--reset` compris) : une organisation existante n'est semée ou
 * réinitialisée que si elle est de démonstration, marquée `settings.demo` par la section `identite`
 * qui l'a créée. La Démo semée avant la marque (`demo`, nommée « Démo… ») la reçoit ici ; toute
 * autre organisation est refusée, nommée, sans rien écrire.
 * @param {import('postgres').Sql} sql  connexion d'administration
 * @param {{ slug: string, isDemo: boolean }} spec
 * @param {(line: string) => void} print
 * @returns {Promise<string | null>}  l'id de l'organisation acceptée, `null` si elle n'existe pas
 */
export async function guardOrg(sql, spec, print) {
  const org = await maybeOne(
    sql`select id, name, settings from platform.orgs where slug = ${spec.slug}`,
    `Lecture de l'organisation ${spec.slug} impossible`,
  )
  if (!org) return null
  if (org.settings?.demo === true) return org.id
  if (!spec.isDemo || !org.name.startsWith(DEMO_NAME)) {
    throw new Error(
      `Refusé : l'organisation ${spec.slug} (« ${org.name} ») n'est pas une organisation de ` +
        `démonstration (sans marque settings.demo) ; rien n'est écrit ni supprimé.`,
    )
  }
  await must(
    sql`update platform.orgs set settings = ${{ ...org.settings, demo: true }} where id = ${org.id}`,
    `Marque de l'organisation ${spec.slug} impossible`,
  )
  print('[garde]')
  print(`  organisation ${spec.slug} : marque de démonstration posée`)
  return org.id
}

/**
 * `--reset` : l'organisation acceptée par `guardOrg` part d'un bloc, avec tout ce qui en dépend ;
 * les comptes Auth restent. La suppression vise son id et exige encore la marque, dans la requête
 * même : une organisation remplacée sous ce slug ou démarquée depuis la garde reste en place.
 * @param {import('postgres').Sql} sql  connexion d'administration
 * @param {string} slug
 * @param {string | null} orgId  rendu par `guardOrg`
 * @param {(line: string) => void} print
 * @returns {Promise<void>}
 */
export async function resetOrg(sql, slug, orgId, print) {
  if (orgId === null) {
    print('[reset]')
    print(`  aucune organisation ${slug} à supprimer`)
    return
  }
  const deleted = await must(
    sql`delete from platform.orgs where id = ${orgId} and settings ->> 'demo' = 'true' returning id`,
    `Réinitialisation impossible : suppression de l'organisation ${slug}`,
  )
  if (deleted.length === 0) {
    throw new Error(
      `Réinitialisation refusée : l'organisation ${slug} n'est plus celle que la garde a acceptée ` +
        `(supprimée, remplacée ou sans marque settings.demo depuis) ; rien n'est supprimé.`,
    )
  }
  print('[reset]')
  print(`  organisation ${slug} supprimée, avec tout ce qui en dépend`)
}

/**
 * Ce qui précède la première écriture, dans l'ordre : la clé secrète éprouvée sur l'API d'administration
 * d'Auth, où la section `identite` lit et crée le compte E2E ; la garde, qui peut déjà poser la marque ;
 * puis `--reset`. Une clé refusée, ou l'API injoignable (`codeOf` : « réseau », un 5xx), arrête tout
 * avant la garde : la Démo n'est ni marquée ni supprimée pour échouer ensuite, faute de compte (comme
 * avant E01-S10, quand la garde lisait à la clé).
 * @param {{ sql: import('postgres').Sql, auth: import('@supabase/supabase-js').GoTrueAdminApi }} access
 *   connexion d'administration ; API d'administration d'Auth
 * @param {{ slug: string, isDemo: boolean }} spec
 * @param {boolean} reset
 * @param {(line: string) => void} print
 * @returns {Promise<void>}
 */
export async function prepareOrg({ sql, auth }, spec, reset, print) {
  const { error } = await auth.listUsers({ page: 1, perPage: 1 })
  if (error) {
    throw new Error(`API d'administration d'Auth injoignable ou clé secrète refusée (${codeOf(error)}) : rien n'est écrit ni supprimé.`)
  }
  const orgId = await guardOrg(sql, spec, print)
  if (reset) await resetOrg(sql, spec.slug, orgId, print)
}

async function main(argv) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(messageOf(error))
    return 1
  }

  const { values, missing } = resolveEnv(process.env, envFileTexts(ROOT))
  if (missing.length > 0) {
    console.error(`${missingVariables(missing)} (voir .env.example)`)
    return 1
  }

  const hidden = Object.values(values)
  const print = (line) => console.log(maskValues(line, hidden))
  /** @type {import('postgres').Sql | undefined} */
  let sql
  try {
    const sections = await loadSections(SECTIONS_DIR)
    const spec = orgSpec(options.slug)
    // Dans le `try` : une URL illisible lève ici, et seul son message masqué est imprimé.
    sql = adminSql(values)
    const auth = serviceKeyClient(values).auth.admin
    print(`Organisation ${spec.slug} (« ${spec.name} »)`)
    await prepareOrg({ sql, auth }, spec, options.reset, print)
    /** @type {DemoContext} */
    const ctx = {
      sql,
      auth,
      env: {
        supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL,
        anonKey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        siteUrl: values.NEXT_PUBLIC_SITE_URL,
        e2eEmail: values.E2E_USER_EMAIL,
        e2ePassword: values.E2E_USER_PASSWORD,
      },
      spec,
      org: null,
      e2eUser: null,
      teams: {},
      report: (line) => print(`  ${line}`),
    }
    await runSections(sections, ctx, print)
    print(`Terminé : ${sections.length} section(s).`)
    return 0
  } catch (error) {
    console.error(maskValues(messageOf(error), hidden))
    return 1
  } finally {
    // Le code rendu est celui du semis ; une connexion mal fermée se dit sans le changer.
    await sql
      ?.end({ timeout: 5 })
      .catch((error) => console.error(maskValues(`Connexion d'administration mal fermée : ${messageOf(error)}`, hidden)))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
