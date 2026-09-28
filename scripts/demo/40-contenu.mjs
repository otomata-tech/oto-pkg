/**
 * Section `contenu` de la Démo (E01-S06, contrat `DemoSection` d'E01-S05) : les quatre Contextes
 * publiés en blocs (Tout le monde, Ventes, Support, l'espace personnel du compte E2E), la page
 * `conseil` et la grille tarifaire, les notes du salon, le connecteur `mail` activé et le compte simulé
 * « Mail Ventes ». E06-S01 : les documents du pilote (Contextes de Tout le monde, de Ventes et de Perso,
 * grille tarifaire, notes du salon) viennent de `scripts/lib/pilot-qualification.mjs`, republiés
 * seulement quand ils en diffèrent (NH13) ; `support/contexte` reste celui d'E01-S06, publié une fois.
 *
 * Ce que ça empêche : des contrôles visuels et un smoke d'E03 sans Contexte publié ni page à lire, et un
 * pilote sans source interne que `find` trouve (NH5). Données fictives (ADR-010) ; ni vocabulaire ni
 * sujets (ADR-011 § 7). Rejouable : un document conforme au module n'est pas republié, une activation
 * ou un compte présents sont laissés.
 *
 * Reprend de la maquette (`scripts/lib/proto-data.mjs`, guide et grille) le contenu fictif ; retire
 * le vocabulaire, les phrases déclencheuses et les sections en markdown (→ blocs).
 */
import { PILOT_CONTEXTS, PILOT_PAGES } from '../lib/pilot-qualification.mjs'
import { documentBlocks, ensureNode, findNode, maybeOne, must, one, publishOnce, publishWhenChanged } from './publication.mjs'

/**
 * Les champs du contexte d'E01-S05 que cette section lit.
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`)
 * @property {{ id: string } | null} org  posé par la section `identite`
 * @property {{ id: string, email: string } | null} e2eUser  posé par la section `identite`
 * @property {Record<string, string>} teams  slug → id, posé par la section `identite`
 * @property {(line: string) => void} report
 */

const heading = (text, key) => ({ type: 'heading', text, data: { level: 1 }, key })
const paragraph = (text) => ({ type: 'paragraph', text })

/** Le Contexte de Support (E01-S06), hors du pilote : publié une fois. */
const CONTEXTE_SUPPORT = {
  path: 'support/contexte',
  label: 'Contexte de support',
  title: 'Contexte',
  summary: "Règles de l'équipe Support, lues par les assistants de ses membres.",
  blocks: [heading('Règles', 'regles'), paragraph("Répondre sous 24 h ouvrées. Toute panne qui touche plus d'un site est un incident.")],
}

/** Page d'organisation, jamais publiée : le dossier de la grille. */
export const CONSEIL = { path: 'conseil', kind: 'page', title: 'Conseil', summary: 'Offres et tarifs du conseil en énergie.' }

/** Connecteur simulé `mail` (H81, H85) et le compte d'équipe qui s'en sert. */
export const CONNECTEUR = {
  connector: 'mail',
  account: { connector: 'mail', owner_kind: 'team', team: 'ventes', label: 'Mail Ventes', mode: 'simule', status: 'active' },
}

// Le chemin du Contexte personnel se lit dans le handle du compte E2E, posé par la section `arbre`.
async function personalContextPath({ sql, org, e2eUser }) {
  const member = await one(
    sql`select profile from platform.members where org_id = ${org.id} and user_id = ${e2eUser.id}`,
    'lecture du membre E2E',
  )
  if (!member.profile?.handle) throw new Error('handle du compte E2E absent (posé par la section arbre)')
  return `private/${member.profile.handle}/contexte`
}

async function contextNode(ctx, path, label) {
  const node = await findNode(ctx, path)
  if (!node) throw new Error(`${label} absent (posé par la section arbre)`)
  return node.id
}

async function publishContexts(ctx, at) {
  for (const contexte of PILOT_CONTEXTS) {
    const nodeId = await contextNode(ctx, contexte.path ?? (await personalContextPath(ctx)), contexte.label)
    await publishWhenChanged(ctx, { label: contexte.label, nodeId, document: contexte, at })
  }
  const { path, label, title, summary, blocks } = CONTEXTE_SUPPORT
  await publishOnce(ctx, { label, nodeId: await contextNode(ctx, path, label), blocks: documentBlocks(blocks, at), header: { title, summary } })
}

/** Les pages du pilote sous leur parent : `conseil` (posé ici), `ventes` (posé par la section arbre). */
async function publishPages(ctx, at) {
  for (const page of PILOT_PAGES) {
    const parent = page.path.slice(0, page.path.lastIndexOf('/'))
    const nodeId = await ensureNode(ctx, parent, { path: page.path, kind: 'page', title: page.title, summary: page.summary })
    await publishWhenChanged(ctx, { label: page.label, nodeId, document: page, at })
  }
}

async function ensureConnector({ sql, org, e2eUser, teams, report }) {
  const activation = await maybeOne(
    sql`select state from platform.connector_activations where org_id = ${org.id} and connector = ${CONNECTEUR.connector}`,
    "lecture de l'activation mail",
  )
  if (activation) {
    report('connecteur mail : présent')
  } else {
    await must(
      sql`insert into platform.connector_activations
          ${sql({ org_id: org.id, connector: CONNECTEUR.connector, state: 'active', activated_by: e2eUser.id })}`,
      'activation du connecteur mail',
    )
    report('connecteur mail : activé')
  }
  const { team, ...account } = CONNECTEUR.account
  const found = await maybeOne(
    sql`select id from platform.accounts where org_id = ${org.id} and label ilike ${account.label}`,
    'lecture du compte Mail Ventes',
  )
  if (found) {
    report('compte Mail Ventes : présent')
    return
  }
  await must(
    sql`insert into platform.accounts ${sql({ org_id: org.id, owner_team_id: teams[team], ...account })}`,
    'création du compte Mail Ventes',
  )
  report('compte Mail Ventes : créé (simulé)')
}

/** @type {{ name: string, run: (ctx: DemoContext) => Promise<void> }} */
export const section = {
  name: 'contenu',
  async run(ctx) {
    if (!ctx.org) throw new Error('contenu : organisation absente (posée par la section identite)')
    if (!ctx.e2eUser) throw new Error('contenu : compte E2E absent (posé par la section identite)')
    const at = new Date().toISOString()
    // Les pages avant les Contextes : le lien du Contexte de Tout le monde vers la grille trouve sa
    // cible (`links.target_node_id`) dès le premier passage.
    await ensureNode(ctx, 'guide', CONSEIL)
    await publishPages(ctx, at)
    await publishContexts(ctx, at)
    await ensureConnector(ctx)
  },
}
