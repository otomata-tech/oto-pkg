// Consentement OAuth des assistants (E02-S02, H16, ADR-004 § 8) : Supabase envoie la personne sur
// `/oauth/consent?authorization_id=…` de l'adresse de site avant de délivrer un code à l'assistant.
// Ce module lit la demande (client, compte, accès, organisation visée) et rend la décision. Sans lui,
// la page et l'action de l'hôte porteraient cette logique, qu'un ERP devrait recopier.
//
// Repris du banc E03 (`mcp-test/src/app/(auth)/oauth/consent/page.tsx` l. 22-123, `actions.ts`
// l. 21-66) : identifiant validé avant le SDK, redirection si déjà consenti, `webUrl`, client sans
// nom, `scope` omis, relecture avant la décision, `skipBrowserRedirect: true`. Retiré : la marque
// tirée de l'hôte de la page (l'organisation vient de `resource`), le journal à clé secrète, et
// « déjà autorisé » (mesuré : une demande déjà affichée n'est jamais relue approuvée, HN-E02S02-20).
// `getAuthorizationDetails` ne rend pas `resource` : la base le lit, pour la seule demande en
// attente de l'appelant (`oauth_pending_resource`, E01-S06, fiche D10).
import type { AuthOAuthServerApi } from "@supabase/supabase-js"
import type { Theme } from "../schemas"
import { authorizationIdSchema, consentDecisionSchema, webUrl, type DecisionError } from "../schemas/oauth"
import { readBrand } from "./brand"
import type { PlatformDb } from "./db"
import { fromDatabaseError, isPlatformError, PlatformError } from "./errors"
import { normalizeHost, resolveOrg } from "./identity"
import { oidcMode } from "./issuer"

export const CONSENT_PATH = "/oauth/consent"

/** Chemin de la ressource MCP d'une organisation, sur son adresse (`https://acme.oto.cx/api/mcp`). */
export const MCP_RESOURCE_PATH = "/api/mcp"

/** Chemin du MCP admin (E08-S02), servi sur toute adresse : l'organisation est un argument de ses outils (H105). */
export const MCP_ADMIN_RESOURCE_PATH = "/api/mcp-admin"

/**
 * Page de consentement d'une demande, où revient la personne après sa connexion ; la page seule
 * quand l'identifiant, venu d'une adresse ou d'un formulaire, est hors motif.
 */
export function consentPath(rawAuthorizationId: unknown): string {
  const parsed = authorizationIdSchema.safeParse(rawAuthorizationId)
  return parsed.success ? `${CONSENT_PATH}?authorization_id=${encodeURIComponent(parsed.data)}` : CONSENT_PATH
}

// La personne consent à ce qu'elle comprend ; un scope inconnu s'affiche tel quel (HN-E02S02-8).
// Une `Map` : un scope nommé `toString` ne doit pas trouver de libellé dans le prototype d'un objet.
const SCOPE_LABELS: ReadonlyMap<string, string> = new Map([
  ["openid", "Vous identifier"],
  ["email", "Lire votre adresse email"],
  ["profile", "Lire votre nom"],
  ["offline_access", "Rester connecté sans vous le redemander"],
])

function scopeLine(scope: string): string {
  const label = SCOPE_LABELS.get(scope)
  return label ? `${label} (${scope})` : scope
}

const UNNAMED_CLIENT = "Client sans nom"

/** Les méthodes serveur OAuth du client d'auth de l'hôte (session à cookies du starter). */
export type ConsentAuth = {
  oauth: Pick<AuthOAuthServerApi, "getAuthorizationDetails" | "approveAuthorization" | "denyAuthorization">
}

/**
 * L'organisation visée, lue par `resource` : connue (avec l'appartenance de l'appelant et sa marque,
 * E09-S02), adresse sans organisation, MCP admin (HN-E02S02-28), ou non déterminée (ressource absente,
 * illisible ou hors de ces deux MCP, fonction absente ou en panne). Les clés sont celles de l'écran
 * (`ui/oauth/types.ts`, `MarqueDOrganisation` pour la marque), que l'hôte lui passe telles quelles
 * (HN-E02S02-12).
 */
export type ConsentOrg =
  | { etat: "connue"; nom: string; membre: boolean; marque: { theme: Theme; logo: string | null; nomAffiche: string } }
  | { etat: "inconnue"; hote: string }
  | { etat: "administration" }
  | { etat: "indeterminee" }

/** La demande à montrer, dans la forme de l'écran (`DemandeDeConsentement`). */
export type ConsentDetails = {
  authorizationId: string
  client: { nom: string; site: string | null; logo: string | null }
  compte: string
  adresseDeRetour: string
  acces: { scope: string; libelle: string }[]
  organisation: ConsentOrg
}

type ToAssistant = { kind: "redirect"; url: string }

export type ConsentRequest = { kind: "invalid" } | { kind: "expired" } | ToAssistant | { kind: "ask"; demande: ConsentDetails }

export type ConsentDecisionResult = ToAssistant | { kind: "retry"; authorizationId: string; erreur: DecisionError } | { kind: "invalid" }

const UNDETERMINED: ConsentOrg = { etat: "indeterminee" }
const ADMINISTRATION: ConsentOrg = { etat: "administration" }

/**
 * Retour vers l'assistant par l'adresse que rend Supabase. Elle est bâtie sur la `redirect_uri` que
 * le client a lui-même enregistrée (enregistrement dynamique ouvert) et part dans `redirect()`, dont
 * Next fait un `location.assign` sans filtrer `javascript:` : `http:` et `https:` seulement, ceux des
 * trois hosts (`mcp-patterns.md § 6`). Elle porte le code : jamais au journal. `null` si refusée.
 */
function toAssistant(redirectUrl: string): ToAssistant | null {
  const url = webUrl(redirectUrl)
  if (url) return { kind: "redirect", url }
  console.error("[platform] consent: return address refused, neither http nor https")
  return null
}

/**
 * L'adresse de retour telle que la suivra le navigateur : hôte en punycode, jamais sa forme Unicode
 * (un « а » cyrillique s'y lit comme un « a »).
 */
function asTheBrowserReadsIt(address: string): string {
  try {
    return new URL(address).href
  } catch {
    // Illisible : montrée telle quelle, React l'échappe ; aucune décision n'y mènera (`toAssistant`).
    return address
  }
}

/**
 * Ressource de la demande en attente de l'appelant (`oauth_pending_resource`, à appeler après
 * `getAuthorizationDetails`, qui rattache la demande à la personne), analysée, ou `null`.
 */
async function pendingResource(db: PlatformDb, authorizationId: string): Promise<URL | null> {
  const resource = await db
    .tx((sql) => sql<{ resource: string | null }[]>`select platform.oauth_pending_resource(${authorizationId}) as resource`)
    .then(
      ([row]) => row?.resource ?? null,
      (error) => {
        // Fonction absente (`42883`, migration non appliquée) ou panne : l'organisation reste non déterminée, la
        // panne dite au log seulement (`fromDatabaseError`) ; ce qui ne vient pas de la base remonte (HN-E01S10-15).
        // Sur la face SQL, la base ne refuse aucun jeton (M32) : aucun `unauthorized` à garder.
        fromDatabaseError(error, "consent: oauth_pending_resource")
        return null
      },
    )
  if (!resource) return null
  try {
    return new URL(resource)
  } catch {
    // Ressource illisible : l'organisation reste non déterminée.
    return null
  }
}

/** Les organisations de l'appelant (`member_orgs`) ; `null` en panne, dite au log seulement. */
async function memberOrgs(db: PlatformDb): Promise<string[] | null> {
  return db
    .tx((sql) => sql<{ org_id: string }[]>`select m.org_id from platform.member_orgs() as m(org_id)`)
    .then(
      (rows) => rows.map((row) => row.org_id),
      (error) => {
        fromDatabaseError(error, "consent: member_orgs")
        return null
      },
    )
}

/**
 * Organisation servie à cet hôte (`org_by_host`), appartenance de l'appelant (`member_orgs`) et marque
 * (E09-S02, AC14) : la même pour un membre et pour un non-membre, publique sur `/login` de l'adresse.
 */
async function orgOfHost(db: PlatformDb, host: string): Promise<ConsentOrg> {
  try {
    const [org, memberships] = await Promise.all([resolveOrg(db, host), memberOrgs(db)])
    if (!memberships) return UNDETERMINED
    const { theme, logoUrl, displayName } = readBrand(org)
    const marque = { theme, logo: logoUrl, nomAffiche: displayName }
    return { etat: "connue", nom: org.name, membre: memberships.includes(org.id), marque }
  } catch (error) {
    if (isPlatformError(error) && error.code === "unknown_org") return { etat: "inconnue", hote: host }
    console.error("[platform] consent: organisation unavailable", error)
    return UNDETERMINED
  }
}

/**
 * Organisation visée par la demande. Une ressource `…/api/mcp` la dit par son hôte ; celle du MCP
 * admin est nommée, son organisation étant un argument de ses outils et pas son adresse (H105) ;
 * toute autre ne dit rien. Ne lève jamais : le consentement n'ouvre aucun droit, l'appartenance est
 * revérifiée à chaque appel (ADR-004, HN-E02S02-2).
 */
async function consentOrg(db: PlatformDb, authorizationId: string): Promise<ConsentOrg> {
  const resource = await pendingResource(db, authorizationId)
  if (resource?.pathname === MCP_ADMIN_RESOURCE_PATH) return ADMINISTRATION
  const host = resource?.pathname === MCP_RESOURCE_PATH ? normalizeHost(resource.host) : null
  return host ? orgOfHost(db, host) : UNDETERMINED
}

/**
 * La demande d'autorisation, lue avec la session de la personne. `invalid` : identifiant hors motif,
 * aucun appel au SDK ; `expired` : demande expirée, déjà tranchée ou ouverte avec un autre compte, ou
 * adresse de retour ni `http:` ni `https:` ; `redirect` : consentement déjà donné ; `ask` : l'écran
 * à montrer. En mode OIDC, `not_found` avant tout appel : le consentement des assistants se donne chez
 * l'émetteur, et Supabase Auth n'a aucune demande à montrer (E01-S11, AC-a10).
 */
export async function consentRequest(
  deps: { auth: ConsentAuth; db: PlatformDb },
  rawAuthorizationId: unknown,
): Promise<ConsentRequest> {
  if (oidcMode()) throw new PlatformError("not_found", "Consent is given at the identity provider of this host.")
  const parsed = authorizationIdSchema.safeParse(rawAuthorizationId)
  if (!parsed.success) return { kind: "invalid" }
  const authorizationId = parsed.data

  const { data, error } = await deps.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) {
    console.error("[platform] consent: getAuthorizationDetails", error)
    return { kind: "expired" }
  }
  // Un consentement existe déjà : cette première lecture vient d'approuver la demande.
  if (!("authorization_id" in data)) return toAssistant(data.redirect_url) ?? { kind: "expired" }

  // Supabase omet `scope` quand il est vide (omitempty), malgré son type ; l'ordre et les doublons
  // restent ceux du host.
  const scopes = (data.scope ?? "").split(/\s+/).filter(Boolean)
  return {
    kind: "ask",
    demande: {
      authorizationId,
      client: { nom: data.client.name || UNNAMED_CLIENT, site: webUrl(data.client.uri), logo: webUrl(data.client.logo_uri) },
      compte: data.user.email,
      adresseDeRetour: asTheBrowserReadsIt(data.redirect_uri),
      acces: scopes.map((scope) => ({ scope, libelle: scopeLine(scope) })),
      organisation: await consentOrg(deps.db, authorizationId),
    },
  }
}

/**
 * La décision du formulaire (`authorization_id`, `decision`), partie avec `skipBrowserRedirect` :
 * l'hôte redirige. La demande est relue d'abord (AC15). Tranchée dans un autre onglet ou expirée, elle
 * répond en erreur (400) à la relecture comme à la décision : `retry`, et la page, qui ne peut plus
 * la lire, dit qu'elle ne peut plus être tranchée (HN-E02S02-20). Sur un échec passager de la
 * relecture, la décision part quand même : son propre échec dira de réessayer.
 */
export async function consentDecision(deps: { auth: ConsentAuth }, formData: FormData): Promise<ConsentDecisionResult> {
  const parsed = consentDecisionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { kind: "invalid" }
  const { authorization_id: authorizationId, decision } = parsed.data
  const retry: ConsentDecisionResult = { kind: "retry", authorizationId, erreur: "decision" }

  const current = await deps.auth.oauth.getAuthorizationDetails(authorizationId)
  if (current.error) console.error("[platform] consent: re-read before the decision", current.error)
  // Seule la première lecture d'une demande rend l'adresse de retour à la place des détails, quand un
  // consentement existe déjà : elle vient de l'approuver. « Autoriser » y va ; « Refuser » n'a plus
  // rien à refuser.
  if (current.data && !("authorization_id" in current.data)) {
    if (decision === "deny") return retry
    return toAssistant(current.data.redirect_url) ?? retry
  }

  const options = { skipBrowserRedirect: true }
  const { data, error } =
    decision === "approve"
      ? await deps.auth.oauth.approveAuthorization(authorizationId, options)
      : await deps.auth.oauth.denyAuthorization(authorizationId, options)
  if (error || !data?.redirect_url) {
    console.error(`[platform] consent: ${decision}`, error)
    return retry
  }
  return toAssistant(data.redirect_url) ?? retry
}
