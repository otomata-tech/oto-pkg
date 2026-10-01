// Les organisations d'une personne (offres de l'hôte, décision du 2026-10-01) : une personne peut en créer plusieurs par
// l'inscription, et être membre de plusieurs ; le menu de l'entreprise du rail les lui montre pour passer de l'une à
// l'autre. Chaque organisation a sa propre adresse (`docs/conception/identite-et-connexion.md`) : la bascule mène à
// cette adresse, où la session se reprend. Sans ce module, aucun service ne listait les organisations d'une personne
// hors de l'équipe plateforme (`admin/orgs.ts`, `listOrgs`).
import type { PersonOrganisation } from "../schemas"
import type { PlatformDb } from "./db"
import { inTransaction } from "./errors"
import type { Identity } from "./identity"

/** Au plus autant d'organisations dans le menu : au-delà, la liste est coupée, par nom. */
const MAX_LISTED = 50

/**
 * Les organisations dont la personne de l'identité est membre, par nom, avec une adresse de chacune (la première par
 * ordre alphabétique quand elle en a plusieurs ; `null` sans adresse) et celle de la requête marquée `current`. Le
 * filtre est dans la requête, sur ses propres lignes `members` : jamais la seule RLS, qui lui montrerait aussi les
 * organisations où elle n'a qu'un accès plateforme.
 */
export async function listMyOrganisations(db: PlatformDb, identity: Identity): Promise<PersonOrganisation[]> {
  const rows = await inTransaction(db, "listMyOrganisations: members, orgs, org_domains", (sql) => sql<{ id: string; name: string; host: string | null }[]>`
    select o.id, o.name, (select min(d.host) from platform.org_domains d where d.org_id = o.id) as host
      from platform.members m join platform.orgs o on o.id = m.org_id
     where m.user_id = ${identity.user.id}
     order by o.name, o.id
     limit ${MAX_LISTED}`)
  return rows.map((row) => ({ id: row.id, name: row.name, host: row.host, current: row.id === identity.org.id }))
}
