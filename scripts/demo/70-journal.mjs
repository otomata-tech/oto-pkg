/**
 * Section `journal` de la Démo (E05-S05, contrat `DemoSection` d'E01-S05) : trois conversations
 * fictives du compte E2E, aux codes fixes `DEMO-0001` à `DEMO-0003`, datées des dernières minutes :
 * une procédure servie et des appels réussis, une demande sans procédure puis `find`, un `call` en
 * échec dont les arguments portent un jeton, écrit tel quel : c'est le masquage à la lecture
 * (E05-S05, AC8) que le contrôle visuel vérifie.
 *
 * Ce que ça empêche : un écran `/journal` et un `read journal` sans conversation à montrer, et un
 * masquage jamais essayé sur une ligne écrite hors de `writeJournal`. Rejouable : les lignes de ces
 * trois codes sont supprimées puis réinsérées à chaque passage, aux heures du passage. Données
 * fictives seulement (ADR-010) ; ces codes ne sont jamais émis (l'alphabet de Crockford n'a pas de O).
 */
import { must } from './publication.mjs'

/**
 * Les champs du contexte d'E01-S05 que cette section lit.
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`)
 * @property {{ prefix: string }} spec
 * @property {{ id: string } | null} org  posé par la section `identite`
 * @property {{ id: string, email: string } | null} e2eUser  posé par la section `identite`
 * @property {Record<string, string>} teams  slug → id, posé par la section `identite`
 * @property {(line: string) => void} report
 */

const CODES = ['DEMO-0001', 'DEMO-0002', 'DEMO-0003']
const HOST = 'claude-ai@0.1.0'
const USER_AGENT = 'Claude-User'
const TABLE = 'ventes/suivi_prospects'
const MINUTE = 60_000

/**
 * Les appels des trois conversations : outil, cible, arguments, équipe porteuse (`call` seulement),
 * erreur, durée, minutes avant le passage.
 */
const CONVERSATIONS = [
  [
    { tool: 'context', target: 'ventes/qualifier_prospects', args: { phrase: 'Qualifie les prospects à traiter' }, ms: 180, ago: 45 },
    { tool: 'read', target: 'ventes/qualifier_prospects', args: { path: 'ventes/qualifier_prospects' }, ms: 95, ago: 44 },
    { tool: 'call', target: 'table.schema', args: { function: 'table.schema', arguments: { table: TABLE } }, team: true, ms: 120, ago: 43 },
    { tool: 'call', target: 'table.claim', args: { function: 'table.claim', arguments: { table: TABLE, worker: 'Démo', limit: 3 } }, team: true, ms: 240, ago: 42 },
  ],
  [
    { tool: 'context', target: 'combien de prospects à Valbrune', args: { phrase: 'combien de prospects à Valbrune' }, ms: 150, ago: 30 },
    { tool: 'find', target: 'prospects Valbrune', args: { query: 'prospects Valbrune' }, ms: 210, ago: 29 },
  ],
  [
    { tool: 'context', target: 'complète la fiche du prospect P-001', args: { phrase: 'complète la fiche du prospect P-001' }, ms: 160, ago: 15 },
    {
      tool: 'call',
      target: 'table.write',
      args: {
        function: 'table.write',
        arguments: { table: TABLE, rows: [{ key: 'P-001', set: { statut: 'à revoir' } }], api_token: 'demo-secret' },
      },
      team: true,
      error: `invalid_arguments: Unknown column « statut » in ${TABLE}.`,
      ms: 1240,
      ago: 14,
    },
  ],
]

/** Les lignes à insérer : toutes aux mêmes colonnes, telles que la porte MCP les écrit (E03-S01). */
function rows(ctx, now) {
  return CONVERSATIONS.flatMap((calls, index) =>
    calls.map((call) => {
      const args = { ctx: CODES[index], ...call.args }
      return {
        org_id: ctx.org.id,
        user_id: ctx.e2eUser.id,
        team_id: call.team ? ctx.teams.ventes : null,
        ctx: CODES[index],
        method: 'tools/call',
        tool: `${ctx.spec.prefix}_${call.tool}`,
        target: call.target,
        args,
        args_chars: JSON.stringify(args).length,
        is_error: call.error !== undefined,
        error: call.error ?? null,
        duration_ms: call.ms,
        host: HOST,
        user_agent: USER_AGENT,
        ts: new Date(now - call.ago * MINUTE).toISOString(),
      }
    }),
  )
}

/** @type {{ name: string, run: (ctx: DemoContext) => Promise<void> }} */
export const section = {
  name: 'journal',
  async run(ctx) {
    if (!ctx.org || !ctx.e2eUser || !ctx.teams.ventes) throw new Error('journal : organisation, compte E2E ou équipe Ventes absents (posés par la section identite)')
    const { sql } = ctx
    await must(sql`delete from platform.journal where org_id = ${ctx.org.id} and ctx in ${sql(CODES)}`, 'suppression des conversations fictives')
    const lines = rows(ctx, Date.now())
    await must(sql`insert into platform.journal ${sql(lines)}`, 'insertion des conversations fictives')
    ctx.report(`journal : ${CODES.length} conversations fictives du compte E2E (${lines.length} appels, ${CODES.join(', ')})`)
  },
}
