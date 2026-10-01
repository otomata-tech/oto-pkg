// Les organisations d'une personne (offres de l'hôte, décision du 2026-10-01) : une personne peut en créer plusieurs par
// l'inscription, et être membre de plusieurs ; le menu de l'entreprise du rail les lui montre pour passer de l'une à
// l'autre. Chaque organisation a sa propre adresse (`docs/conception/identite-et-connexion.md`) : la bascule mène à
// cette adresse, où la session se reprend. Sans ce module, aucun service ne listait les organisations d'une personne
// hors de l'équipe plateforme (`admin/orgs.ts`, `listOrgs`).
import type { PersonOrganisation } from "../schemas"
import type { PlatformDb } from "./db"
import { inTransaction } from "./errors"
import { normalizeHost, type Identity } from "./identity"

/** Au plus autant d'organisations dans le menu : au-delà, la liste est coupée, par nom. */
const MAX_LISTED = 50

/** Une adresse du poste de développement (`localhost`, `*.localhost`) : elle ne répond qu'à qui s'y trouve déjà. */
function isLocal(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost")
}

/** Le nombre de libellés de fin communs à deux adresses (`demo.oto.test` et `acme.oto.test` : deux). */
function sharedSuffix(a: string, b: string): number {
  const [left, right] = [a.split(".").reverse(), b.split(".").reverse()]
  let shared = 0
  while (shared < left.length && shared < right.length && left[shared] === right[shared]) shared += 1
  return shared
}

/**
 * Parmi les adresses d'une organisation, celle que la personne peut joindre depuis l'adresse de sa requête : la plus
 * proche de celle-ci (le plus de libellés de fin communs : même domaine parent), puis une adresse qui n'est pas du
 * poste de développement, puis l'ordre alphabétique. Sans adresse de requête, seuls les deux derniers critères jouent.
 */
export function reachableHost(hosts: readonly string[], requestHost: string | null): string | null {
  const from = normalizeHost(requestHost)
  const ranked = hosts
    .map((host) => ({ host, shared: from ? sharedSuffix(host, from) : 0, local: isLocal(host) }))
    .sort((a, b) => b.shared - a.shared || Number(a.local) - Number(b.local) || a.host.localeCompare(b.host))
  return ranked[0]?.host ?? null
}

/**
 * Les organisations dont la personne de l'identité est membre, par nom, avec une adresse de chacune (`reachableHost`,
 * d'après `requestHost`, l'adresse de la requête ; `null` sans adresse) et celle de la requête marquée `current`. Le
 * filtre est dans la requête, sur ses propres lignes `members` : jamais la seule RLS, qui lui montrerait aussi les
 * organisations où elle n'a qu'un accès plateforme.
 */
export async function listMyOrganisations(db: PlatformDb, identity: Identity, requestHost: string | null = null): Promise<PersonOrganisation[]> {
  const rows = await inTransaction(db, "listMyOrganisations: members, orgs, org_domains", (sql) => sql<{ id: string; name: string; hosts: string[] | null }[]>`
    select o.id, o.name, (select array_agg(d.host) from platform.org_domains d where d.org_id = o.id) as hosts
      from platform.members m join platform.orgs o on o.id = m.org_id
     where m.user_id = ${identity.user.id}
     order by o.name, o.id
     limit ${MAX_LISTED}`)
  return rows.map((row) => ({ id: row.id, name: row.name, host: reachableHost(row.hosts ?? [], requestHost), current: row.id === identity.org.id }))
}
