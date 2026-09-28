// Faits des équipes dans `context` : les équipes de la personne et leurs responsables (P39 : sans règles
// d'équipe en texte), puis, par connecteur actif, le compte de ses appels (E04-S01, AC21). Repris de la
// maquette (`mcp-test/src/proto/services/context.ts` l. 121-136) : l'emplacement de la ligne des
// connecteurs ; retiré : règles et `teams.connectors` (droits par équipe en JSON, remplacés par
// l'activation, les comptes et leurs règles). E05-S12 (D109) : plus de bloc par équipe ni de phrase « sans
// équipe », une ligne de faits en tête de la partie de chaque équipe (`contexts.ts`). E05-S13 (fiche D128) :
// plusieurs responsables (« Lead: A, B. »), plus d'équipe par défaut, les connecteurs dans la partie de
// chaque équipe qui a un compte, les autres dans celle de Tout le monde.
import { teamConnectorLines } from "../../connectors/lines"
import type { PlatformDb } from "../../db"
import { leadNames } from "../../directory"
import { inTransaction } from "../../errors"
import type { Identity } from "../../identity"
import { isJsonObject } from "../../json"

const TEAM_CONNECTORS_HEADER =
  "Connectors (this team runs a call when the procedure or the call names it, or when it is your only team with an account; if several are, ask the user which one):"
const EVERYONE_CONNECTORS_HEADER = "Connectors (when no team of yours runs the call):"

/**
 * Les responsables de chaque équipe de la personne (`team_members.role`), par leur nom de profil ; sans nom
 * de profil, un responsable n'est pas nommé. Une lecture pour toutes les équipes (leur liste en un
 * paramètre lié), aucune sans équipe.
 */
async function leadsByTeam(db: PlatformDb, identity: Identity): Promise<Map<string, string[]>> {
  const teamIds = identity.teams.map((team) => team.id)
  if (teamIds.length === 0) return new Map()
  const rows = await inTransaction(
    db,
    "teamFacts: team_members, members",
    (sql) => sql<{ team_id: string; user_id: string; profile: unknown }[]>`
      select tm.team_id, tm.user_id, m.profile
        from platform.team_members tm
        join platform.members m on m.user_id = tm.user_id and m.org_id = ${identity.org.id}
       where tm.team_id = any(${teamIds}::uuid[]) and tm.role = 'lead'`,
  )
  const names = new Map<string, string>()
  for (const row of rows) {
    const name = isJsonObject(row.profile) ? row.profile.name : undefined
    if (typeof name === "string" && name) names.set(row.user_id, name)
  }
  const leads = new Map<string, string[]>()
  for (const row of rows) leads.set(row.team_id, [...(leads.get(row.team_id) ?? []), row.user_id])
  return new Map([...leads].map(([teamId, userIds]) => [teamId, leadNames(userIds, (userId) => names.get(userId))]))
}

/**
 * Les faits des équipes : une ligne par équipe, dans l'ordre d'`identity.teams` (par nom) ; les lignes des
 * connecteurs de chaque équipe (en-tête compris, vide sans compte), dans le même ordre ; celles de Tout le
 * monde (connecteurs dont aucune équipe de la personne n'a de compte).
 */
export type TeamFacts = { teams: string[]; teamConnectors: string[][]; connectors: string[] }

/**
 * Les équipes viennent d'`identity.teams`, relues par `resolveIdentity` à chaque requête (par nom) ; les
 * responsables et les lignes des connecteurs (activations, comptes, niveaux) se lisent en parallèle, sous
 * RLS. Chaque ligne ouvre la partie du Contexte de son équipe (E05-S12, D109) ; les connecteurs, sous leur
 * en-tête (aucune ligne sans connecteur actif), suivent celle de chaque équipe qui a un compte, ou les faits
 * de l'organisation (compte de l'organisation : le mode du compte se sait avant l'envoi, N17, banc E04 F5).
 */
export async function teamFacts(db: PlatformDb, identity: Identity): Promise<TeamFacts> {
  const [leads, connectors] = await Promise.all([leadsByTeam(db, identity), teamConnectorLines(db, identity)])
  const headed = (header: string, lines: readonly string[]) => (lines.length > 0 ? [header, ...lines] : [])
  return {
    teams: identity.teams.map((team) => {
      const names = leads.get(team.id) ?? []
      return `Team ${team.name}.${names.length > 0 ? ` Lead: ${names.join(", ")}.` : ""}`
    }),
    teamConnectors: identity.teams.map((team) => headed(TEAM_CONNECTORS_HEADER, connectors.teams.get(team.id) ?? [])),
    connectors: headed(EVERYONE_CONNECTORS_HEADER, connectors.everyone),
  }
}
