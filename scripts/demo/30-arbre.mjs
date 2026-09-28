/**
 * Section `arbre` de la Démo (E01-S04, contrat `DemoSection` d'E01-S05) : la racine `guide`, le
 * dossier `private`, le Contexte de Tout le monde, le dossier et le Contexte des équipes Ventes et
 * Support, l'espace personnel du compte E2E et son Contexte, et une règle d'exemple : `support` →
 * équipe Ventes en lecture.
 *
 * Ce que ça empêche : une Démo sans arbre (aucune page, aucun droit à montrer), ou un arbre qui
 * diffère de celui d'une organisation créée par `platform.create_org`. La section `identite` crée
 * les équipes et le compte E2E avant l'arbre : les déclencheurs de P39 n'ont rien pu poser. Cette
 * section pose ce qui manque et laisse ce qui existe (clés naturelles : `(org_id, path)`, règle par
 * nœud et sujet). Textes : ceux de `create_org` et des déclencheurs (migration 20260924120000).
 * Aucune valeur lue n'est imprimée : ni l'email du compte E2E, ni le handle qui en dérive.
 */
import { maybeOne, must, one } from './publication.mjs'

/**
 * Les champs du contexte d'E01-S05 que cette section lit.
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`)
 * @property {{ name: string }} spec
 * @property {{ id: string } | null} org  posé par la section `identite`
 * @property {{ id: string, email: string } | null} e2eUser  posé par la section `identite`
 * @property {Record<string, string>} teams  slug → id, posé par la section `identite`
 * @property {(line: string) => void} report
 */

const TEAMS = [
  { slug: 'ventes', name: 'Ventes' },
  { slug: 'support', name: 'Support' },
]
// Règle d'exemple : l'équipe Ventes lit les pages de Support (partage, H66 (4)).
const RULE = { node: 'support', team: 'ventes', level: 'read' }

/**
 * @param {DemoContext & { org: { id: string } }} ctx
 * @param {string} label  ce que la ligne du résumé nomme
 * @param {Record<string, unknown> & { path: string }} node  colonnes de l'insertion, `org_id` en moins
 * @returns {Promise<string>} l'id du nœud
 */
async function ensureNode(ctx, label, node) {
  const { sql } = ctx
  const found = await maybeOne(
    sql`select id from platform.nodes where org_id = ${ctx.org.id} and path = ${node.path}`,
    `lecture du nœud ${label}`,
  )
  if (found) {
    ctx.report(`${label} : présent`)
    return found.id
  }
  const created = await one(
    sql`insert into platform.nodes ${sql({ org_id: ctx.org.id, kind: 'page', ...node })} returning id`,
    `création du nœud ${label}`,
  )
  ctx.report(`${label} : créé`)
  return created.id
}

async function ensureTeamFolder(ctx, rootId, team) {
  const teamId = ctx.teams[team.slug]
  if (!teamId) throw new Error(`arbre : équipe ${team.slug} absente (posée par la section identite)`)
  const folder = await ensureNode(ctx, `dossier ${team.slug}`, {
    parent_id: rootId,
    path: team.slug,
    title: team.name,
    summary: `Les pages de l'équipe ${team.name}.`,
    owner_kind: 'team',
    owner_team_id: teamId,
  })
  await ensureNode(ctx, `Contexte de ${team.slug}`, {
    parent_id: folder,
    path: `${team.slug}/contexte`,
    title: 'Contexte',
    summary: `Ce que les assistants des membres de l'équipe ${team.name} lisent à chaque conversation.`,
  })
  return folder
}

// Le handle nomme l'espace personnel (H61) ; `identite` crée le membre sans lui.
async function ensureHandle({ sql, org, e2eUser, report }) {
  const member = await one(
    sql`select profile from platform.members where org_id = ${org.id} and user_id = ${e2eUser.id}`,
    'lecture du membre E2E',
  )
  if (member.profile?.handle) {
    report('handle du compte E2E : présent')
    return member.profile.handle
  }
  const { handle } = await one(
    sql`select platform.unique_handle(${org.id}, ${e2eUser.email}) as handle`,
    'calcul du handle du compte E2E',
  )
  await must(
    sql`update platform.members set profile = ${{ ...member.profile, handle }}
         where org_id = ${org.id} and user_id = ${e2eUser.id}`,
    'pose du handle du compte E2E',
  )
  report('handle du compte E2E : posé')
  return handle
}

async function ensurePersonalSpace(ctx, privateId) {
  const handle = await ensureHandle(ctx)
  const space = await ensureNode(ctx, 'espace personnel du compte E2E', {
    parent_id: privateId,
    path: `private/${handle}`,
    title: 'Privé',
    summary: 'Votre espace privé, visible de vous seul.',
    owner_kind: 'user',
    owner_user_id: ctx.e2eUser.id,
  })
  await ensureNode(ctx, 'Contexte de l’espace personnel du compte E2E', {
    parent_id: space,
    path: `private/${handle}/contexte`,
    title: 'Contexte',
    summary: 'Ce que votre assistant lit à chaque conversation ; vous seul le recevez.',
  })
}

async function ensureRule({ sql, org, teams, report }, nodeId) {
  const label = `règle ${RULE.node} → équipe ${RULE.team} (lecture)`
  const found = await maybeOne(
    sql`select id from platform.access_rules where node_id = ${nodeId} and subject_team_id = ${teams[RULE.team]}`,
    `lecture de la ${label}`,
  )
  if (found) {
    report(`${label} : présente`)
    return
  }
  await must(
    sql`insert into platform.access_rules
        ${sql({ org_id: org.id, node_id: nodeId, subject_team_id: teams[RULE.team], level: RULE.level })}`,
    `pose de la ${label}`,
  )
  report(`${label} : posée`)
}

/** @type {{ name: string, run: (ctx: DemoContext) => Promise<void> }} */
export const section = {
  name: 'arbre',
  async run(ctx) {
    if (!ctx.org) throw new Error('arbre : organisation absente (posée par la section identite)')
    if (!ctx.e2eUser) throw new Error('arbre : compte E2E absent (posé par la section identite)')
    const root = await ensureNode(ctx, 'racine guide', {
      parent_id: null,
      path: 'guide',
      title: `Guide de ${ctx.spec.name}`,
      summary: "Racine de l'arbre de l'organisation ; son contexte est la page contexte.",
      owner_kind: 'org',
    })
    const privateFolder = await ensureNode(ctx, 'dossier private', {
      parent_id: root,
      path: 'private',
      title: 'Espaces personnels',
      summary: 'Un espace par personne, visible de son seul propriétaire.',
    })
    await ensureNode(ctx, 'Contexte de Tout le monde', {
      parent_id: root,
      path: 'contexte',
      title: 'Contexte',
      summary: "Ce que les assistants de tous les membres de l'organisation lisent à chaque conversation.",
    })
    const folders = {}
    for (const team of TEAMS) folders[team.slug] = await ensureTeamFolder(ctx, root, team)
    await ensurePersonalSpace(ctx, privateFolder)
    await ensureRule(ctx, folders[RULE.node])
  },
}
