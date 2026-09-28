/**
 * Section `tableau` de la Démo (E01-S06, contrat `DemoSection` d'E01-S05) : le tableau
 * `ventes/suivi_prospects` et ses dix lignes (blocs `row`, ADR-011), ceux du module
 * `scripts/lib/pilot-qualification.mjs` (E06-S01) : en-tête publié quand il en diffère (H91, NH13), lignes
 * remises à leur état initial à chaque passage (AC14, NH8), dont P-003, P-006 et P-009 « à revoir », la
 * file de l'écran de revue (E07-S03, HN-E07S03-7 ; NH15). La page `ventes/prospects_valbrune` porte une
 * vue du tableau et la carte de la grille tarifaire (E07-S03).
 *
 * Ce que ça empêche : un pilote (E06-S01, E06-S02) et des fonctions `table.*` (E07) sans tableau à lire
 * ni file à rejouer entre deux démonstrations, et une revue humaine sans ligne à revoir. Aucune ligne
 * « en cours » (réservé à `table.claim`), « qualifié » ni « écarté » (réservés à la revue humaine, P10).
 * Rejouable : une ligne déjà à l'état initial n'est pas réécrite ; une ligne qui en diffère reprend ses
 * valeurs, sa provenance du module et un bail vide, sa révision avance de 1 (H100), sous la garde de la
 * révision lue (une ligne changée au même moment est laissée, et dite) ; une ligne absente est insérée,
 * une ligne hors du module supprimée. La page publiée n'est pas republiée.
 *
 * Reprend de la maquette (`scripts/lib/proto-data.mjs`, prospects) les prospects fictifs ; retire les
 * états `relancé`, `gagné`, `perdu` et le statut « en cours » semé.
 */
import { PILOT_TABLE } from '../lib/pilot-qualification.mjs'
import { documentBlocks, ensureNode, must, publishOnce, publishWhenChanged, sameJson } from './publication.mjs'

/**
 * Les champs du contexte d'E01-S05 que cette section lit.
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`)
 * @property {{ id: string } | null} org  posé par la section `identite`
 * @property {{ id: string, email: string } | null} e2eUser  posé par la section `identite`
 * @property {(line: string) => void} report
 */

const { lifecycle } = PILOT_TABLE.header

/** La page de la vue et de la carte (E07-S03, AC15, AC16, AC19 ; H121) : données fictives seulement. */
export const PROSPECTS_VALBRUNE = {
  node: {
    path: 'ventes/prospects_valbrune',
    kind: 'page',
    title: 'Prospects de Valbrune',
    summary: 'Les prospects de Valbrune, vus depuis le suivi des prospects.',
  },
  blocks: [
    { type: 'paragraph', text: 'Vue tenue à jour depuis le suivi des prospects.' },
    {
      type: 'reference',
      data: { path: 'ventes/suivi_prospects', view: { filter: { ville: 'Valbrune' }, columns: ['entreprise', 'statut'], limit: 5 } },
    },
    { type: 'reference', data: { path: 'conseil/grille_tarifaire' } },
  ],
}

/**
 * La provenance d'une ligne à l'état initial (E01-S06, « Contenu semé ») : chaque colonne importée au
 * nom du compte E2E ; les cellules complétées d'une ligne « à revoir » écrites par son assistant, avec
 * le commentaire du module (celle que la remise d'E07-S03 donne à `statut`).
 * @param {{ data: Record<string, unknown> }} row
 * @param {{ by: string, at: string }} seed
 */
function initialProvenance(row, { by, at }) {
  const reviewed = row.data[lifecycle.column] === lifecycle.review.state
  const { columns, comment } = PILOT_TABLE.completed
  return Object.fromEntries(
    Object.keys(row.data).map((column) => [
      column,
      reviewed && columns.includes(column) ? { origin: 'agent', by, at, comment } : { origin: 'import', by, at },
    ]),
  )
}

/** La provenance sans ses dates : une ligne remise hier est à l'état initial aujourd'hui. */
function withoutDates(provenance) {
  const cells = provenance !== null && typeof provenance === 'object' ? Object.entries(provenance) : []
  return Object.fromEntries(cells.map(([column, cell]) => [column, cell !== null && typeof cell === 'object' ? { ...cell, at: undefined } : cell]))
}

/** Une ligne à l'état initial : les valeurs du module, aucun bail, la provenance du module (hors dates). */
function isInitial(stored, row, by) {
  const unclaimed = stored.claimed_by === null && stored.claimed_by_user === null && stored.lease_until === null
  return unclaimed && sameJson(stored.data, row.data) && sameJson(withoutDates(stored.provenance), withoutDates(initialProvenance(row, { by, at: '' })))
}

/** Remet une ligne à l'état initial, sous la garde de la révision lue ; faux si elle a changé entre-temps. */
async function resetRow(ctx, stored, row, at) {
  const by = ctx.e2eUser.id
  const values = {
    data: row.data,
    provenance: initialProvenance(row, { by, at }),
    claimed_by: null,
    claimed_by_user: null,
    lease_until: null,
    revision: stored.revision + 1,
    updated_by: by,
  }
  const { sql } = ctx
  const written = await must(
    sql`update platform.blocks set ${sql(values)}
         where id = ${stored.id} and state = 'published' and revision = ${stored.revision}
         returning id`,
    `remise à l'état initial de ${row.key}`,
  )
  return written.length > 0
}

/**
 * Les dix lignes à leur état initial (AC14) : insérées si absentes, remises si elles diffèrent, laissées
 * sinon ; les lignes hors du module supprimées.
 */
async function resetRows(ctx, tableId, at) {
  const { sql } = ctx
  const stored = await must(
    sql`select id, key, data, provenance, revision, claimed_by, claimed_by_user, lease_until from platform.blocks
         where node_id = ${tableId} and state = 'published' and type = 'row'`,
    'lecture des lignes du suivi des prospects',
  )
  const byKey = new Map(stored.map((row) => [row.key, row]))
  const by = ctx.e2eUser.id
  const missing = PILOT_TABLE.rows.filter((row) => !byKey.has(row.key))
  if (missing.length > 0) {
    const rows = missing.map((row) => ({ org_id: ctx.org.id, node_id: tableId, state: 'published', type: 'row', key: row.key, data: row.data, provenance: initialProvenance(row, { by, at }) }))
    await must(sql`insert into platform.blocks ${sql(rows)}`, 'lignes du suivi des prospects')
  }
  let reset = 0
  const meanwhile = []
  for (const row of PILOT_TABLE.rows) {
    const current = byKey.get(row.key)
    if (!current || isInitial(current, row, by)) continue
    if (await resetRow(ctx, current, row, at)) reset += 1
    else meanwhile.push(row.key)
  }
  const keys = new Set(PILOT_TABLE.rows.map((row) => row.key))
  const extra = stored.filter((row) => !keys.has(row.key)).map((row) => row.id)
  if (extra.length > 0) {
    await must(
      sql`delete from platform.blocks where id in ${sql(extra)} and state = 'published' and type = 'row'`,
      'suppression des lignes hors du module',
    )
  }
  const unchanged = stored.length - extra.length - reset - meanwhile.length
  const changed = meanwhile.length > 0 ? `, ${meanwhile.length} changée(s) entre-temps (${meanwhile.join(', ')}), laissée(s)` : ''
  ctx.report(
    `lignes du suivi des prospects : ${missing.length} ajoutée(s), ${reset} remise(s) à l'état initial, ${unchanged} déjà à l'état initial, ${extra.length} supprimée(s)${changed}`,
  )
}

/** @type {{ name: string, run: (ctx: DemoContext) => Promise<void> }} */
export const section = {
  name: 'tableau',
  async run(ctx) {
    if (!ctx.org) throw new Error('tableau : organisation absente (posée par la section identite)')
    if (!ctx.e2eUser) throw new Error('tableau : compte E2E absent (posé par la section identite)')
    const at = new Date().toISOString()
    const { path, title, summary, header } = PILOT_TABLE
    const tableId = await ensureNode(ctx, 'ventes', { path, kind: 'table', title, summary })
    const document = { title, summary, blocks: [], links: [], meta: header }
    await publishWhenChanged(ctx, { label: 'suivi des prospects', nodeId: tableId, document, at })
    await resetRows(ctx, tableId, at)
    const pageId = await ensureNode(ctx, 'ventes', PROSPECTS_VALBRUNE.node)
    await publishOnce(ctx, { label: 'prospects de Valbrune', nodeId: pageId, blocks: documentBlocks(PROSPECTS_VALBRUNE.blocks, at) })
  },
}
