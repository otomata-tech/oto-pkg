/**
 * Section `procedure` de la Démo (E01-S06, contrat `DemoSection` d'E01-S05) : la procédure
 * `ventes/qualifier_prospects` du module `scripts/lib/pilot-qualification.mjs` (E06-S01), publiée en
 * blocs (ADR-011) : un titre, un résumé qui porte ses deux formulations (P37), des étapes numérotées dont
 * quatre portent l'appel exact d'une fonction `table.*` en bloc `call` (H59, P38) ; aucun en-tête.
 *
 * Ce que ça empêche : un routage (E03-S02) et un pilote (E06-S01, E06-S02) sans procédure à servir.
 * Rejouable : la procédure n'est republiée que si elle diffère du module (NH13).
 *
 * Reprend de la maquette (`scripts/lib/proto-data.mjs`, `ventes/qualifier_prospects`) les étapes ;
 * retire les clôtures ```` ``` acme_call ```` (→ blocs `call`), les phrases déclencheuses et voisines,
 * la remise en file « à traiter » (→ revue humaine, « à revoir »).
 */
import { PILOT_PROCEDURE } from '../lib/pilot-qualification.mjs'
import { ensureNode, publishWhenChanged } from './publication.mjs'

/**
 * Les champs du contexte d'E01-S05 que cette section lit.
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`)
 * @property {{ id: string } | null} org  posé par la section `identite`
 * @property {(line: string) => void} report
 */

/** @type {{ name: string, run: (ctx: DemoContext) => Promise<void> }} */
export const section = {
  name: 'procedure',
  async run(ctx) {
    if (!ctx.org) throw new Error('procedure : organisation absente (posée par la section identite)')
    const at = new Date().toISOString()
    const { path, label, title, summary } = PILOT_PROCEDURE
    // Sans en-tête (P37) : `meta` vide.
    const nodeId = await ensureNode(ctx, 'ventes', { path, kind: 'procedure', title, summary, meta: {} })
    await publishWhenChanged(ctx, { label, nodeId, document: PILOT_PROCEDURE, at })
  },
}
