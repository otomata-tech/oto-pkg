/**
 * Section `domaines` du script Démo (E02-S01, contrat de sections d'E01-S05) : les adresses qui
 * désignent l'organisation dans `org_domains` (H10). La Démo reçoit `localhost`, `demo.localhost`
 * et l'hôte de `NEXT_PUBLIC_SITE_URL` s'il n'est pas `localhost` ; une organisation jetable
 * `t<hex>`, seulement `t<hex>.localhost`.
 *
 * Ce que ça empêche : qu'aucune adresse locale ne désigne la Démo (aucun écran ne se résoudrait
 * en local), ou qu'un second passage double un hôte. Rejouable par la clé naturelle `host` : un
 * hôte déjà posé ne change pas, un hôte rattaché à une autre organisation est laissé tel quel et
 * nommé dans le résumé.
 */
import { codeOf } from '../lib/env.mjs'

/**
 * Les champs du contexte d'E01-S05 que cette section lit.
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`)
 * @property {{ siteUrl: string | undefined }} env
 * @property {{ slug: string, isDemo: boolean }} spec
 * @property {{ id: string } | null} org  posé par la section `identite`
 * @property {(line: string) => void} report
 */

/**
 * Les hôtes d'une organisation du script.
 * @param {Pick<DemoContext, 'spec' | 'env'>} ctx
 * @returns {string[]}
 */
export function demoHosts({ spec, env }) {
  if (!spec.isDemo) return [`${spec.slug}.localhost`]
  const hosts = ['localhost', 'demo.localhost']
  const site = siteHost(env.siteUrl)
  if (site && !hosts.includes(site)) hosts.push(site)
  return hosts
}

/** @param {string | undefined} siteUrl */
function siteHost(siteUrl) {
  if (!siteUrl) return null
  try {
    return new URL(siteUrl).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * @param {DemoContext & { org: { id: string } }} ctx
 * @param {string} host
 */
async function attach(ctx, host) {
  const { sql } = ctx
  // `host` est la clé de `org_domains` : une ligne au plus.
  const [data] = await sql`select org_id from platform.org_domains where host = ${host}`.catch((error) => {
    throw new Error(`domaines : lecture de l'hôte ${host} impossible (${codeOf(error)})`)
  })
  if (data && data.org_id !== ctx.org.id) {
    ctx.report(`hôte ${host} déjà rattaché à une autre organisation : laissé tel quel`)
    return
  }
  if (data) {
    ctx.report(`hôte ${host} déjà rattaché`)
    return
  }
  await sql`insert into platform.org_domains ${sql({ host, org_id: ctx.org.id })}`.catch((error) => {
    throw new Error(`domaines : rattachement de l'hôte ${host} impossible (${codeOf(error)})`)
  })
  ctx.report(`hôte ${host} rattaché`)
}

/** @type {{ name: string, run: (ctx: DemoContext) => Promise<void> }} */
export const section = {
  name: 'domaines',
  async run(ctx) {
    const { org } = ctx
    if (!org) throw new Error('domaines : organisation absente (posée par la section identite)')
    for (const host of demoHosts(ctx)) await attach({ ...ctx, org }, host)
  },
}
