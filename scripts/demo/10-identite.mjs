/**
 * Section `identite` de la Démo (E01-S05) : le compte E2E, l'organisation, les équipes Ventes et
 * Support ; le compte E2E en est l'administrateur et le responsable de Ventes.
 *
 * Idempotente par clés naturelles : email du compte, `slug`, `(org_id, slug)`, `(org_id, user_id)`,
 * `(team_id, user_id)`. Ce qui existe est complété, jamais recréé : noms remis à leur valeur, rôle
 * remis à `admin`, responsable reposé, `settings.domains` remis aux domaines du pilote (E06-S01, AC14) ;
 * l'équipe par défaut et `profile.name` posés seulement s'ils manquent ; le préfixe, immuable, n'est
 * jamais écrit. Le compte E2E est créé s'il manque et jamais modifié s'il existe : ce peut être celui de
 * JB (N2). Noms fictifs (ADR-010). L'organisation créée ici porte `settings.demo` : la marque sans
 * laquelle la garde de l'exécuteur (`guardOrg`) refuse de la resemer ou de la réinitialiser. Le
 * compte passe par l'API d'administration d'Auth (`ctx.auth`, nulle en mode OIDC : la personne de
 * `--user`), tout le reste par la connexion d'administration (`ctx.sql`, E01-S10 f1). Le mode OIDC sert
 * aux tests (`tests/integration/isolation/donnees.ts`) : l'identifiant de `--user` n'est confronté à aucun
 * sujet de l'émetteur (HN-E11S14-11), un uuid mal saisi crée un membre relié à personne.
 */
import { PILOT_DOMAINS } from '../lib/pilot-qualification.mjs'
import { accountCopy } from '../lib/account-copy.mjs'
import { maybeOne, must, one } from './publication.mjs'

const E2E_NAME = 'Compte E2E'
const TEAMS = [
  { slug: 'ventes', name: 'Ventes' },
  { slug: 'support', name: 'Support' },
]
const LEAD_TEAM = 'ventes'
const USERS_PER_PAGE = 200
// Constat du résumé pour chaque colonne remise ou posée.
const CHANGES = {
  name: 'nom remis',
  settings: 'domaines posés',
  role: 'rôle remis à admin',
  profile: 'nom posé',
}

// Une réponse de l'API d'administration d'Auth : ses données ; en échec, l'opération nommée.
function authData({ data, error }, operation) {
  if (error) throw new Error(`${operation} : ${error.message}`)
  return data
}

// Rien n'est écrit quand rien n'a changé : un second passage laisse les lignes identiques (AC2).
// `table` vient des appels de ce fichier, jamais d'une valeur lue ; `where` est un fragment `sql`.
async function reconcile(sql, table, where, patch) {
  const columns = Object.keys(patch)
  if (columns.length === 0) return 'à jour'
  await must(sql`update ${sql(`platform.${table}`)} set ${sql(patch)} where ${where}`, `mise à jour de ${table}`)
  return columns.map((column) => CHANGES[column]).join(', ')
}

// supabase-js n'offre aucune recherche de compte par email : les pages sont parcourues jusqu'à la
// dernière, incomplète (son `nextPage` ne lit que le premier chiffre du numéro de page).
async function findUser(auth, email) {
  const wanted = email.toLowerCase()
  for (let page = 1; ; page += 1) {
    const { users } = authData(await auth.listUsers({ page, perPage: USERS_PER_PAGE }), 'lecture des comptes')
    const user = users.find((candidate) => candidate.email?.toLowerCase() === wanted)
    if (user) return user
    if (users.length < USERS_PER_PAGE) return null
  }
}

// L'email et le nom du compte, que la ligne `members` recopie : sans clé vers `auth.users`, la base
// ne les lit plus dans le compte (E01-S09, AC15). En mode OIDC (`auth` nul, E11-S14), aucun compte : la
// personne est l'identifiant de `--user`, sous l'email du compte E2E et le nom de la Démo.
async function ensureE2eUser({ auth, env, report }) {
  if (!auth) {
    report('compte E2E : personne de --user, sans compte Auth (mode OIDC)')
    return { id: env.e2eUserId, email: env.e2eEmail, name: E2E_NAME }
  }
  const existing = await findUser(auth, env.e2eEmail)
  if (existing) {
    report('compte E2E : existant, laissé tel quel')
    return { id: existing.id, email: existing.email ?? env.e2eEmail, name: accountCopy(existing).name }
  }
  const { user } = authData(
    await auth.createUser({
      email: env.e2eEmail,
      password: env.e2ePassword,
      email_confirm: true,
      user_metadata: { full_name: E2E_NAME },
    }),
    'création du compte E2E',
  )
  report('compte E2E : créé, email confirmé')
  return { id: user.id, email: user.email ?? env.e2eEmail, name: E2E_NAME }
}

async function ensureOrg({ sql, spec, report }) {
  const found = await maybeOne(
    sql`select id, name, settings from platform.orgs where slug = ${spec.slug}`,
    "lecture de l'organisation",
  )
  if (!found) {
    const created = await one(
      sql`insert into platform.orgs
          ${sql({ slug: spec.slug, name: spec.name, prefix: spec.prefix, settings: { domains: PILOT_DOMAINS, demo: true } })}
          returning id`,
      "création de l'organisation",
    )
    report(`organisation ${spec.slug} : créée`)
    return { id: created.id }
  }
  const patch = {}
  if (found.name !== spec.name) patch.name = spec.name
  // Les domaines de travail du pilote, à chaque passage (E06-S01, AC14) : la description de `context` les cite.
  if (found.settings?.domains !== PILOT_DOMAINS) patch.settings = { ...found.settings, domains: PILOT_DOMAINS }
  report(`organisation ${spec.slug} : ${await reconcile(sql, 'orgs', sql`id = ${found.id}`, patch)}`)
  return { id: found.id }
}

async function ensureTeam({ sql, org, report }, team, found) {
  if (found) {
    const patch = found.name === team.name ? {} : { name: team.name }
    report(`équipe ${team.slug} : ${await reconcile(sql, 'teams', sql`id = ${found.id}`, patch)}`)
    return found.id
  }
  const created = await one(
    sql`insert into platform.teams ${sql({ org_id: org.id, slug: team.slug, name: team.name })} returning id`,
    `création de l'équipe ${team.slug}`,
  )
  report(`équipe ${team.slug} : créée`)
  return created.id
}

async function ensureTeams(ctx) {
  const { sql } = ctx
  const rows = await must(
    sql`select id, slug, name from platform.teams
         where org_id = ${ctx.org.id} and slug in ${sql(TEAMS.map((team) => team.slug))}`,
    'lecture des équipes',
  )
  /** @type {Record<string, string>} */
  const ids = {}
  for (const team of TEAMS) {
    ids[team.slug] = await ensureTeam(ctx, team, rows.find((row) => row.slug === team.slug))
  }
  return ids
}

async function ensureAdmin({ sql, org, e2eUser, report }) {
  const match = sql`org_id = ${org.id} and user_id = ${e2eUser.id}`
  const found = await maybeOne(
    sql`select role, profile from platform.members where ${match}`,
    'lecture du membre admin',
  )
  if (!found) {
    await must(
      sql`insert into platform.members ${sql({
        org_id: org.id,
        user_id: e2eUser.id,
        role: 'admin',
        profile: { name: E2E_NAME },
        email: e2eUser.email.toLowerCase(),
        name: e2eUser.name,
      })}`,
      'création du membre admin',
    )
    report('membre admin : créé')
    return
  }
  const patch = {}
  if (found.role !== 'admin') patch.role = 'admin'
  if (!found.profile?.name) patch.profile = { ...found.profile, name: E2E_NAME }
  report(`membre admin : ${await reconcile(sql, 'members', match, patch)}`)
}

// Après la ligne `members` : le responsable est un membre de l'organisation. `team_members.role` est la
// source (E05-S13) : la ligne est insérée au rôle `lead` si elle manque, remise à `lead` sinon ; les
// autres responsables de l'équipe le restent.
async function ensureLead({ sql, e2eUser, teams, report }) {
  const teamId = teams[LEAD_TEAM]
  const membership = await maybeOne(
    sql`select role from platform.team_members where team_id = ${teamId} and user_id = ${e2eUser.id}`,
    `lecture de l'appartenance à ${LEAD_TEAM}`,
  )
  if (!membership) {
    await must(
      sql`insert into platform.team_members ${sql({ team_id: teamId, user_id: e2eUser.id, role: 'lead' })}`,
      `création de l'appartenance à ${LEAD_TEAM}`,
    )
  } else if (membership.role !== 'lead') {
    await must(
      sql`update platform.team_members set role = 'lead' where team_id = ${teamId} and user_id = ${e2eUser.id}`,
      `responsable de ${LEAD_TEAM}`,
    )
  }
  const done = !membership ? 'créée (lead)' : membership.role !== 'lead' ? 'nommé responsable' : 'présente'
  report(`responsable de ${LEAD_TEAM} : ${done}`)
}

/** @type {import('../demo-seed.mjs').DemoSection} */
export const section = {
  name: 'identite',
  async run(ctx) {
    ctx.e2eUser = await ensureE2eUser(ctx)
    ctx.org = await ensureOrg(ctx)
    ctx.teams = await ensureTeams(ctx)
    await ensureAdmin(ctx)
    await ensureLead(ctx)
  },
}
