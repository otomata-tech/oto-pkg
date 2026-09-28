/**
 * Section `usage` de la Démo (E08-S09, AC14 ; contrat `DemoSection` d'E01-S05), jouée après la section
 * `journal` d'E05-S05 : une quatrième conversation fictive du compte E2E, `DEMO-0004`, dont la demande
 * ne trouve ni procédure ni appel, et trois retours fictifs sur les conversations `DEMO-` (un pris en
 * compte, un ouvert, un décliné avec sa résolution).
 *
 * Ce que ça empêche : un écran « Usage » sans conversation sans procédure à montrer, et un écran
 * « Retours » sans ticket à traiter. Rejouable : la ligne de `DEMO-0004` est supprimée puis réinsérée ;
 * un ticket est mis à jour s'il existe (même `ctx`, même type), sinon inséré : son numéro, posé par
 * `feedback_number` (E01-S06) à l'insertion, ne change pas d'un passage à l'autre. Les codes
 * `DEMO-0001` à `DEMO-0003` du journal appartiennent à la section `journal` : jamais écrits ici.
 * Données fictives seulement (ADR-010).
 */
import { maybeOne, must } from './publication.mjs'

/**
 * Les champs du contexte d'E01-S05 que cette section lit.
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`)
 * @property {{ prefix: string }} spec
 * @property {{ id: string } | null} org  posé par la section `identite`
 * @property {{ id: string, email: string } | null} e2eUser  posé par la section `identite`
 * @property {(line: string) => void} report
 */

const CODE = 'DEMO-0004'
const PHRASE = 'Prépare le planning des tournées de la semaine'
const HOST = 'claude-ai@0.1.0'
const USER_AGENT = 'Claude-User'
const MINUTE = 60_000

/** Les trois retours, chacun sur une conversation `DEMO-` : état voulu, texte, cible, résolution. */
const TICKETS = [
  {
    ctx: 'DEMO-0002',
    type: 'gap',
    state: 'acknowledged',
    text: "Il manque un moyen de compter les prospects d'une commune sans les lister un par un.",
    target: null,
    resolution: null,
  },
  {
    ctx: 'DEMO-0003',
    type: 'error',
    state: 'open',
    text: "L'écriture dans le tableau des prospects a été refusée sans dire quelle valeur posait problème.",
    target: 'table.write',
    resolution: null,
  },
  {
    ctx: CODE,
    type: 'gap',
    state: 'declined',
    text: 'Aucune procédure ne prépare le planning des tournées de la semaine.',
    target: null,
    resolution: 'Hors périmètre du pilote : pas de tournées chez Démo.',
  },
]

/** La ligne `context` de `DEMO-0004`, telle que la porte MCP l'écrit (E03-S01), sans procédure servie. */
function contextLine(ctx, now) {
  const args = { ctx: CODE, phrase: PHRASE }
  return {
    org_id: ctx.org.id,
    user_id: ctx.e2eUser.id,
    team_id: null,
    ctx: CODE,
    method: 'tools/call',
    tool: `${ctx.spec.prefix}_context`,
    target: PHRASE,
    args,
    args_chars: JSON.stringify(args).length,
    is_error: false,
    error: null,
    duration_ms: 150,
    host: HOST,
    user_agent: USER_AGENT,
    ts: new Date(now - 10 * MINUTE).toISOString(),
  }
}

/**
 * Pose un retour : mis à jour s'il existe (sa date de traitement gardée), sinon inséré.
 * @param {DemoContext & { org: { id: string }, e2eUser: { id: string } }} ctx
 * @param {(typeof TICKETS)[number]} ticket
 */
async function upsertTicket(ctx, ticket) {
  const { sql } = ctx
  // La date de traitement relue puis réécrite, à la milliseconde : postgres.js passe tout paramètre
  // `timestamptz` par une `Date` (`supabase-patterns.md § Couplage à Supabase (ADR-012)`) ; celles que
  // posent la Démo et le service (`new Date()`) n'ont pas de microsecondes à perdre.
  const existing = await maybeOne(
    sql`select id, handled_at from platform.feedback
         where org_id = ${ctx.org.id} and ctx = ${ticket.ctx} and type = ${ticket.type}`,
    `lecture du retour de ${ticket.ctx}`,
  )
  const handled = ticket.state !== 'open'
  const values = {
    user_id: ctx.e2eUser.id,
    text: ticket.text,
    target: ticket.target,
    state: ticket.state,
    resolution: ticket.resolution,
    handled_by: handled ? ctx.e2eUser.id : null,
    handled_at: handled ? (existing?.handled_at ?? new Date().toISOString()) : null,
  }
  if (existing) {
    await must(sql`update platform.feedback set ${sql(values)} where id = ${existing.id}`, `mise à jour du retour de ${ticket.ctx}`)
    return
  }
  await must(
    sql`insert into platform.feedback ${sql({ org_id: ctx.org.id, ctx: ticket.ctx, type: ticket.type, ...values })}`,
    `insertion du retour de ${ticket.ctx}`,
  )
}

/** @type {{ name: string, run: (ctx: DemoContext) => Promise<void> }} */
export const section = {
  name: 'usage',
  async run(ctx) {
    if (!ctx.org || !ctx.e2eUser) throw new Error('usage : organisation ou compte E2E absents (posés par la section identite)')
    const { sql } = ctx
    await must(sql`delete from platform.journal where org_id = ${ctx.org.id} and ctx = ${CODE}`, 'suppression de la conversation fictive DEMO-0004')
    await must(sql`insert into platform.journal ${sql(contextLine(ctx, Date.now()))}`, 'insertion de la conversation fictive DEMO-0004')
    for (const ticket of TICKETS) await upsertTicket(ctx, ticket)
    ctx.report(`usage : conversation ${CODE} sans procédure, ${TICKETS.length} retours fictifs (ouvert, pris en compte, décliné)`)
  },
}
