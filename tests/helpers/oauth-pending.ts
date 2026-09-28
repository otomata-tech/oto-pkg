// Demandes d'autorisation en attente du serveur OAuth de Supabase Auth (E02-S02), pour les tests du
// consentement sur la vraie base (E01-S10, lot t1-e2b1) : ce que lit `oauth_pending_resource` (fiche D10),
// une demande que `getAuthorizationDetails` a rattachée à la personne. Ces tests simulent ce SDK, leur
// frontière : seule la connexion d'administration des tests peut alors poser la demande dans son état
// rattaché, avec une ressource que le serveur OAuth refuserait (« not a url »). Supabase seulement :
// `auth.oauth_authorizations` est la table de ce serveur, qu'un Postgres nu n'a pas. Un client jetable
// (`test-<hex>`, public, comme ceux de l'API d'administration d'Auth) porte les demandes, et rien de plus :
// écrit par cette connexion, le serveur OAuth le refuse à `authorize` (500, sonde du lot, 2026-09-26) ;
// `cleanup()` le supprime avec elles (cascade), avant `seed.cleanup()`, qui ferme la connexion. Il se
// supprime ici : l'API d'administration d'Auth le garderait (`deleted_at`), comme les 3 691 clients
// `test-…` qu'elle a laissés sur le projet (relevé du 2026-09-26, aucun vivant).
//
// Une demande vise un compte Supabase Auth (`user_id`, clé vers `auth.users`) : les personnes passées à
// `pendingRequests` reçoivent le leur, à leur identifiant et à leur adresse, par l'API d'administration
// d'Auth, et le perdent au ménage (E01-S10 f2 : le mode de transition des fixtures, qui les créait, est tombé).
import { randomUUID } from "crypto"
import { authAdminClient, hex } from "./plateforme"
import type { TestSql } from "./sql"

/** L'adresse de retour du client jetable ; celle que montre l'écran vient des détails du SDK simulé. */
const REDIRECT = "http://127.0.0.1:9/callback"

export type PendingRequests = {
  /** Une demande en attente pour `resource`, rattachée à `userId` (`null` : pas encore) ; rend son `authorization_id`. */
  pending(resource: string | null, userId: string | null): Promise<string>
  /** Rattache la demande à la personne, ce que fait `getAuthorizationDetails` sous sa session. */
  tie(authorizationId: string, userId: string): Promise<void>
  /** Supprime le client jetable et ses demandes, puis les comptes créés ; lève en nommant ceux qui restent. */
  cleanup(): Promise<void>
}

/** Une personne semée (`seedReferenceOrg`) dont une demande vise le compte. */
export type PendingPerson = { id: string; email: string; name?: string }

/** Le compte Supabase Auth de chaque personne, à son identifiant et à son adresse, email confirmé. */
async function createAccounts(people: readonly PendingPerson[]): Promise<string[]> {
  const created: string[] = []
  for (const person of people) {
    const { error } = await authAdminClient().auth.admin.createUser({
      id: person.id,
      email: person.email,
      email_confirm: true,
      user_metadata: person.name ? { full_name: person.name } : undefined,
    })
    if (error) throw new Error(`createUser failed: ${error.message}`)
    created.push(person.id)
  }
  return created
}

/**
 * Le client jetable, puis ses demandes. Une demande vise le compte Supabase Auth de sa personne : celui des
 * personnes de `people`, créé ici.
 */
export async function pendingRequests(sql: TestSql, people: readonly PendingPerson[] = []): Promise<PendingRequests> {
  const accounts = await createAccounts(people)
  const [client] = await sql<{ id: string }[]>`
    insert into auth.oauth_clients (id, client_name, registration_type, redirect_uris, grant_types, token_endpoint_auth_method, client_type)
    values (${randomUUID()}, ${`test-${hex(4)}`}, 'manual', ${REDIRECT}, 'authorization_code,refresh_token', 'none', 'public')
    returning id`
  return {
    async pending(resource, userId) {
      const authorizationId = hex(16)
      await sql`
        insert into auth.oauth_authorizations (id, authorization_id, client_id, user_id, redirect_uri, scope, resource)
        values (${randomUUID()}, ${authorizationId}, ${client.id}, ${userId}, ${REDIRECT}, 'openid email profile offline_access', ${resource})`
      return authorizationId
    },
    async tie(authorizationId, userId) {
      await sql`update auth.oauth_authorizations set user_id = ${userId} where authorization_id = ${authorizationId}`
    },
    async cleanup() {
      const failures: string[] = []
      try {
        await sql`delete from auth.oauth_clients where id = ${client.id}`
      } finally {
        for (const id of accounts) {
          const { error } = await authAdminClient().auth.admin.deleteUser(id)
          if (error) failures.push(`${id}: ${error.message}`)
        }
      }
      if (failures.length > 0) throw new Error(`deleteUser failed: ${failures.join("; ")}`)
    },
  }
}
