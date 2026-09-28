// Client OpenID Connect de l'hôte de référence (E01-S11 partie b, ADR-012 § 1) : configuration,
// découverte et échanges avec l'émetteur de l'hôte (Logto, Keycloak : `PLATFORM_OIDC_ISSUER`). Le
// protocole (PKCE, `state`, `nonce`, échange du code, validation de l'`id_token`, rafraîchissement)
// passe par `oauth4webapi`, jamais écrit à la main (story, Contexte) ; le cookie de la session est dans
// `oidc-session.ts`. Chargé par le middleware, qui tourne sur Edge : ni la face server du paquet, ni
// API propre à Node.
import * as oauth from "oauth4webapi"

/** Entrée de la connexion chez l'émetteur ; `?redirect=` : la page où revenir (AC-b1). */
export const OIDC_LOGIN_PATH = "/auth/oidc/login"
const CALLBACK_PATH = "/auth/oidc/callback"
/** Où l'émetteur ramène après la déconnexion : adresse à déclarer chez lui, comme le rappel. */
const AFTER_LOGOUT_PATH = "/login"

/**
 * `offline_access` : un jeton de rafraîchissement (AC-b3), que l'émetteur ne délivre qu'avec
 * `prompt=consent` (OpenID Connect Core § 11 ; Logto retire le scope sans lui).
 */
const SCOPE = "openid email profile offline_access"
/** Durée d'un jeton d'accès dont la réponse ne dit pas `expires_in` : courte, il se rafraîchit tôt. */
const DEFAULT_EXPIRES_IN_S = 300
const REQUEST_TIMEOUT_MS = 5_000
const DISCOVERY_TTL_MS = 60 * 60 * 1000
/** Un échec de la découverte gardé : pendant une panne de l'émetteur, une lecture par fenêtre. */
const DISCOVERY_FAILURE_TTL_MS = 10_000
const SECRET_MIN_CHARS = 32
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/** La session d'une personne connectée chez l'émetteur, telle que le cookie la garde. */
export type OidcSession = {
  /** `sub` de l'`id_token` validé : la personne chez l'émetteur. */
  subject: string
  /** L'email de l'`id_token`, seulement vérifié (`email_verified`), jamais une valeur de repli. */
  email: string | null
  name: string | null
  accessToken: string
  refreshToken: string | null
  /** Pour `id_token_hint` à la déconnexion. */
  idToken: string | null
  /** Expiration du jeton d'accès, en millisecondes depuis l'epoch. */
  expiresAt: number
}

/** La connexion en cours, entre le départ vers l'émetteur et son retour. */
export type PendingLogin = { state: string; nonce: string; codeVerifier: string; redirectUri: string; next: string }

export type OidcConfig = { issuer: URL; audience: string; clientId: string; clientSecret: string; secret: string; insecure: boolean }

/** Configuration de l'hôte manquante ou fausse : la variable nommée, jamais sa valeur. */
export class OidcConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OidcConfigError"
  }
}

/** Le mode de l'hôte : un émetteur OIDC dès que `PLATFORM_OIDC_ISSUER` est posée, Supabase Auth sinon (HN-E01S11-1). */
export function oidcEnabled(): boolean {
  return Boolean(process.env.PLATFORM_OIDC_ISSUER)
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new OidcConfigError(`${name} missing: required with PLATFORM_OIDC_ISSUER`)
  return value
}

/** La clé du cookie : seule variable qu'exige la lecture d'une session (écrans, route de l'API). */
export function sessionSecret(): string {
  const secret = required("PLATFORM_SESSION_SECRET")
  if (secret.length < SECRET_MIN_CHARS) throw new OidcConfigError(`PLATFORM_SESSION_SECRET shorter than ${SECRET_MIN_CHARS} characters`)
  return secret
}

function parsed(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    // Une adresse illisible se nomme par sa variable, jamais par l'erreur d'analyse.
    return null
  }
}

/**
 * L'émetteur et le client web de l'hôte ; `http` admis sur la machine locale seulement, comme le
 * paquet (HN-E01S11a1c-5). Lève `OidcConfigError`, qui nomme la première variable manquante ou fausse.
 */
export function oidcConfig(): OidcConfig {
  const issuer = parsed(required("PLATFORM_OIDC_ISSUER"))
  const insecure = issuer?.protocol === "http:" && LOCAL_HOSTS.has(issuer.hostname)
  if (!issuer || !(issuer.protocol === "https:" || insecure) || issuer.search || issuer.hash) {
    throw new OidcConfigError("PLATFORM_OIDC_ISSUER is not an https address without query nor fragment")
  }
  const audience = required("PLATFORM_OIDC_AUDIENCE")
  const clientId = required("PLATFORM_OIDC_CLIENT_ID")
  const clientSecret = required("PLATFORM_OIDC_CLIENT_SECRET")
  return { issuer, audience, clientId, clientSecret, secret: sessionSecret(), insecure }
}

function requestOptions(config: OidcConfig) {
  return { signal: () => AbortSignal.timeout(REQUEST_TIMEOUT_MS), [oauth.allowInsecureRequests]: config.insecure }
}

/** Requêtes au point de jeton : la ressource de RFC 8707, pour que le jeton d'accès porte `PLATFORM_OIDC_AUDIENCE`. */
function tokenOptions(config: OidcConfig) {
  return { ...requestOptions(config), additionalParameters: { resource: config.audience } }
}

function clientOf(config: OidcConfig): oauth.Client {
  return { client_id: config.clientId }
}

let discovered: { issuer: string; until: number; value: Promise<oauth.AuthorizationServer> } | null = null

async function readDiscovery(config: OidcConfig): Promise<oauth.AuthorizationServer> {
  const response = await oauth.discoveryRequest(config.issuer, requestOptions(config))
  return oauth.processDiscoveryResponse(config.issuer, response)
}

/** La découverte OpenID Connect de l'émetteur, gardée une heure ; l'émetteur annoncé doit égaler la variable. */
function authorizationServer(config: OidcConfig): Promise<oauth.AuthorizationServer> {
  const issuer = config.issuer.href
  if (discovered?.issuer === issuer && Date.now() < discovered.until) return discovered.value
  const entry = { issuer, until: Date.now() + DISCOVERY_TTL_MS, value: readDiscovery(config) }
  discovered = entry
  entry.value.catch(() => {
    entry.until = Date.now() + DISCOVERY_FAILURE_TTL_MS
  })
  return entry.value
}

/** Une adresse de la découverte où part le navigateur (autorisation, déconnexion). */
function browserEndpoint(value: string | undefined, field: string): URL {
  const url = value ? parsed(value) : null
  if (!url) throw new OidcConfigError(`PLATFORM_OIDC_ISSUER: discovery has no ${field}`)
  return url
}

/** Ce qu'un échec du protocole laisse au log : un code, jamais un jeton ni un corps de réponse. */
export function oidcFailure(error: unknown): string {
  if (error instanceof oauth.ResponseBodyError) return `${error.error}, HTTP ${error.status}`
  // `error` de l'adresse de rappel vient du navigateur : un code OAuth, ou rien.
  if (error instanceof oauth.AuthorizationResponseError) return /^[\w.-]{1,64}$/.test(error.error) ? error.error : "authorization error"
  if (error instanceof OidcConfigError) return error.message
  if (error instanceof oauth.OperationProcessingError || error instanceof oauth.UnsupportedOperationError) return error.code ?? error.name
  return error instanceof Error ? error.name : "unknown error"
}

/** Le profil d'un `id_token` validé : l'email seulement vérifié (HN-E01S09-3), le nom s'il est un texte. */
function profileOf(claims: oauth.IDToken): Pick<OidcSession, "email" | "name"> {
  const email = claims.email_verified === true && typeof claims.email === "string" && claims.email ? claims.email : null
  const name = typeof claims.name === "string" && claims.name ? claims.name : null
  return { email, name }
}

/** Les jetons d'une réponse de l'émetteur ; un rafraîchissement qui n'en rend pas un nouveau garde l'ancien. */
function tokensOf(tokens: oauth.TokenEndpointResponse, previous?: OidcSession): Pick<OidcSession, "accessToken" | "refreshToken" | "idToken" | "expiresAt"> {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previous?.refreshToken ?? null,
    idToken: tokens.id_token ?? previous?.idToken ?? null,
    expiresAt: Date.now() + (tokens.expires_in ?? DEFAULT_EXPIRES_IN_S) * 1000,
  }
}

/**
 * Le départ vers l'émetteur (AC-b1) : son adresse d'autorisation (PKCE, `state`, `nonce`, ressource
 * `PLATFORM_OIDC_AUDIENCE`, pour que le jeton d'accès passe la vérification de l'API) et la connexion
 * en cours, que le rappel relira. `null`, au log, quand l'émetteur ne répond pas ; lève `OidcConfigError`.
 */
export async function authorizationRequest(config: OidcConfig, origin: string, next: string): Promise<{ url: string; pending: PendingLogin } | null> {
  let as: oauth.AuthorizationServer
  try {
    as = await authorizationServer(config)
  } catch (error) {
    console.error(`[oidc] login: issuer unavailable (${oidcFailure(error)})`)
    return null
  }
  const url = browserEndpoint(as.authorization_endpoint, "authorization_endpoint")
  const pending: PendingLogin = {
    state: oauth.generateRandomState(),
    nonce: oauth.generateRandomNonce(),
    codeVerifier: oauth.generateRandomCodeVerifier(),
    redirectUri: `${origin}${CALLBACK_PATH}`,
    next,
  }
  const parameters = {
    client_id: config.clientId,
    redirect_uri: pending.redirectUri,
    response_type: "code",
    scope: SCOPE,
    prompt: "consent",
    resource: config.audience,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await oauth.calculatePKCECodeChallenge(pending.codeVerifier),
    code_challenge_method: "S256",
  }
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value)
  return { url: url.href, pending }
}

/**
 * Le retour de l'émetteur (AC-b2) : `state` comparé à celui de la connexion en cours, code échangé avec
 * son vérificateur PKCE et la ressource, `id_token` validé (`iss`, `aud`, `nonce`, `exp`, algorithme de
 * la découverte). La session, ou `null`, au log, sur tout refus.
 */
export async function exchangeCode(config: OidcConfig, pending: PendingLogin, callback: URLSearchParams): Promise<OidcSession | null> {
  try {
    const as = await authorizationServer(config)
    const client = clientOf(config)
    const parameters = oauth.validateAuthResponse(as, client, callback, pending.state)
    const auth = oauth.ClientSecretBasic(config.clientSecret)
    const response = await oauth.authorizationCodeGrantRequest(as, client, auth, parameters, pending.redirectUri, pending.codeVerifier, tokenOptions(config))
    const tokens = await oauth.processAuthorizationCodeResponse(as, client, response, { expectedNonce: pending.nonce, requireIdToken: true })
    const claims = oauth.getValidatedIdTokenClaims(tokens)
    return claims ? { subject: claims.sub, ...profileOf(claims), ...tokensOf(tokens) } : null
  } catch (error) {
    console.error(`[oidc] callback: sign-in refused (${oidcFailure(error)})`)
    return null
  }
}

/** La session rafraîchie par son jeton de rafraîchissement (AC-b3) ; `null`, au log, sur tout refus. */
export async function refreshSession(config: OidcConfig, session: OidcSession): Promise<OidcSession | null> {
  if (!session.refreshToken) return null
  try {
    const as = await authorizationServer(config)
    const client = clientOf(config)
    const auth = oauth.ClientSecretBasic(config.clientSecret)
    const response = await oauth.refreshTokenGrantRequest(as, client, auth, session.refreshToken, tokenOptions(config))
    const tokens = await oauth.processRefreshTokenResponse(as, client, response)
    const claims = oauth.getValidatedIdTokenClaims(tokens)
    // Un `id_token` rafraîchi désigne la même personne (OpenID Connect Core § 12.2).
    if (claims && claims.sub !== session.subject) {
      console.error("[oidc] session: the refreshed id_token names another subject")
      return null
    }
    return { ...session, ...(claims ? profileOf(claims) : {}), ...tokensOf(tokens, session) }
  } catch (error) {
    console.error(`[oidc] session: refresh refused (${oidcFailure(error)})`)
    return null
  }
}

/** Le jeton de rafraîchissement révoqué chez l'émetteur (RFC 7009) ; un refus part au log, la déconnexion continue. */
async function revokeRefreshToken(config: OidcConfig, as: oauth.AuthorizationServer, refreshToken: string): Promise<void> {
  try {
    const auth = oauth.ClientSecretBasic(config.clientSecret)
    const options = { ...requestOptions(config), additionalParameters: { token_type_hint: "refresh_token" } }
    await oauth.processRevocationResponse(await oauth.revocationRequest(as, clientOf(config), auth, refreshToken, options))
  } catch (error) {
    console.error(`[oidc] logout: revocation refused (${oidcFailure(error)}), the refresh token stays valid at the issuer`)
  }
}

/**
 * La déconnexion chez l'émetteur (AC-b4). D'abord le jeton de rafraîchissement révoqué, quand la
 * découverte annonce `revocation_endpoint` : sans cela, une copie du cookie faite avant la déconnexion
 * resterait rafraîchissable (chez Keycloak, le jeton hors ligne survit à la fin de la session SSO). Puis
 * où envoyer la personne : `end_session_endpoint` s'il existe, avec `id_token_hint` et le retour sur
 * `/login` ; `/login` sinon, ou quand l'émetteur ne répond pas (la session de l'hôte se ferme quand
 * même). `origin` absente : `/login`, sans passer chez l'émetteur.
 */
export async function signOutAtIssuer(config: OidcConfig, session: OidcSession | null, origin: string | null): Promise<string> {
  const back = origin ? `${origin}${AFTER_LOGOUT_PATH}` : AFTER_LOGOUT_PATH
  let as: oauth.AuthorizationServer
  try {
    as = await authorizationServer(config)
  } catch (error) {
    console.error(`[oidc] logout: issuer unavailable (${oidcFailure(error)}), host session closed only`)
    return back
  }
  if (session?.refreshToken && as.revocation_endpoint) await revokeRefreshToken(config, as, session.refreshToken)
  if (!origin || !as.end_session_endpoint) return back
  const url = browserEndpoint(as.end_session_endpoint, "end_session_endpoint")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("post_logout_redirect_uri", back)
  if (session?.idToken) url.searchParams.set("id_token_hint", session.idToken)
  return url.href
}
