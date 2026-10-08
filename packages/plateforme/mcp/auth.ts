// Jeton d'accès du MCP (ADR-004 § 3, H20, mcp-patterns.md § 6) : signature par la JWKS de l'émetteur
// de l'hôte, `iss` exact, `exp` et `sub` exigés, `nbf` jugé par jose. Sans ce vérificateur,
// `withMcpAuth` ne rendrait aucun 401 sur un jeton faux ou expiré. Émetteur configuré (E01-S11,
// `server/issuer.ts`) : Supabase Auth par défaut, dont `aud` vaut `authenticated` pour tout jeton du
// projet et n'est pas vérifiée (l'appartenance, relue à chaque appel, compense) ; un émetteur OIDC,
// dont les clés viennent de la découverte et dont `aud` doit porter `PLATFORM_OIDC_AUDIENCE` ou la
// ressource que les métadonnées annoncent pour l'adresse appelée (`<origine>/api/mcp`, `/api/mcp-admin`).
//
// Repris du banc E03 (`mcp-test/src/auth-test/token.ts` l. 23-102) : JWKS mémoïsée, tolérance
// d'horloge de 5 s, aucun `expiresAt`. Retiré : le motif de refus journalisé (aucune ligne n'est écrite
// pour une requête sans jeton valide, AC2). Rien n'est lu à l'import (N10).
// Repris d'Oto 1 (`oto-backend/docs/auth-logto.md`) : l'algorithme vient de la clé, jamais fixé (son
// vérificateur, fixé à RS256, refusait tous les jetons ES384 de Logto). Retiré : la façade devant
// l'émetteur, le relais d'autorisation et les jetons maison (ADR-004, ADR-012 § 2).
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose"
import { getPublicOrigin } from "mcp-handler"
import { discover, issuerConfig } from "../server/issuer"
import { isJsonObject } from "../server/json"
import { MCP_ADMIN_RESOURCE_PATH, MCP_RESOURCE_PATH } from "../server/oauth"
import { callerName, PlatformConfigError, type Caller, type IssuedCaller } from "../server/sql"

/** Signature attendue par `withMcpAuth` (mcp-handler) : `undefined` → 401. */
export type VerifyToken = (request: Request, bearer?: string) => Promise<AuthInfo | undefined>

/** Horloges de l'émetteur et de l'hébergeur : quelques secondes d'écart ne refusent pas un jeton. */
const CLOCK_TOLERANCE_S = 5
/** Délai d'un appel à `userinfo` : au-delà, l'appel est servi sans email (HN-E01S11-2). */
const USERINFO_TIMEOUT_MS = 5_000
/** Réponses de `userinfo` gardées au plus : une instance ne grossit pas sans fin. */
const USERINFO_CACHE_MAX = 1_000

// Mémoïsée par adresse : jose y garde les clés entre deux requêtes d'une même instance.
let remote: { url: string; jwks: JWTVerifyGetKey } | null = null

function remoteJwks(url: string): JWTVerifyGetKey {
  if (remote?.url !== url) remote = { url, jwks: createRemoteJWKSet(new URL(url)) }
  return remote.jwks
}

function claimText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

/** L'email d'un jeu de claims, seulement s'il est vérifié (`email_verified`, OpenID Connect Core § 5.1). */
function verifiedIn(claims: Record<string, unknown>): string | undefined {
  return claims.email_verified === true ? claimText(claims.email) : undefined
}

/** Ce que vérifie un jeton, selon l'émetteur, d'où vient son email, et la variable qui désigne l'émetteur (log). */
type TokenCheck = {
  issuer: string
  kind: IssuedCaller["issuerKind"]
  audience?: string[]
  keys: JWTVerifyGetKey
  email: (payload: JWTPayload, bearer: string) => Promise<string | undefined>
  variable: "NEXT_PUBLIC_SUPABASE_URL" | "PLATFORM_OIDC_ISSUER"
}

/** Les chemins des ressources que décrivent les métadonnées (`metadata.ts`) : le MCP de l'organisation et le MCP admin. */
const RESOURCE_PATHS = new Set([MCP_RESOURCE_PATH, MCP_ADMIN_RESOURCE_PATH])

/**
 * Les audiences admises d'un jeton OIDC : celle de l'hôte (`PLATFORM_OIDC_AUDIENCE`, que le client web demande),
 * et, sur `/api/mcp` et `/api/mcp-admin`, la ressource que les métadonnées annoncent pour l'adresse appelée
 * (RFC 8707 : `<origine publique>/<chemin>`, la même lecture de l'origine que `metadata.ts`). Un émetteur qui met
 * dans `aud` la ressource demandée (Logto) sert ainsi le MCP admin et chaque adresse d'organisation, chacune
 * déclarée chez lui ; un jeton émis pour une autre adresse reste refusé.
 */
function audiencesOf(configured: string, request: Request): string[] {
  const path = new URL(request.url).pathname
  return RESOURCE_PATHS.has(path) ? [configured, `${getPublicOrigin(request)}${path}`] : [configured]
}

/** Clés de l'émetteur injoignables ou illisibles (jose) : une panne de configuration, pas un jeton faux. */
const KEYS_UNAVAILABLE = new Set(["ERR_JWKS_TIMEOUT", "ERR_JWKS_INVALID", "ERR_JOSE_GENERIC"])

/** Sur Supabase Auth, une session n'existe qu'après la confirmation de l'email (HN-E01S09-3) : le claim fait foi. */
function supabaseCheck(issuer: string, keys?: JWTVerifyGetKey): TokenCheck {
  const jwks = keys ?? remoteJwks(`${issuer}/.well-known/jwks.json`)
  return { issuer, kind: "supabase", keys: jwks, email: async (payload) => claimText(payload.email), variable: "NEXT_PUBLIC_SUPABASE_URL" }
}

// Réponses de `userinfo` par sujet, gardées jusqu'à l'expiration du jeton qui les a obtenues.
const userinfoCache = new Map<string, { email: string | undefined; until: number }>()

function remember(key: string, email: string | undefined, until: number): void {
  if (userinfoCache.size >= USERINFO_CACHE_MAX) {
    const now = Date.now()
    for (const [cached, entry] of userinfoCache) if (entry.until <= now) userinfoCache.delete(cached)
    // Toutes encore valides : la plus ancienne part, l'appel suivant de son sujet relira `userinfo`.
    const oldest = userinfoCache.keys().next()
    if (userinfoCache.size >= USERINFO_CACHE_MAX && !oldest.done) userinfoCache.delete(oldest.value)
  }
  userinfoCache.set(key, { email, until })
}

/**
 * La réponse de `userinfo` : son corps, `null` quand l'émetteur refuse le jeton ; `undefined` sur une
 * panne (réseau, 5xx), qui n'est pas gardée. Aucun message ne cite le jeton ni l'email.
 */
async function userinfoBody(endpoint: string, bearer: string): Promise<{ body: unknown } | undefined> {
  let response: Response
  try {
    response = await fetch(endpoint, { headers: { authorization: `Bearer ${bearer}`, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS) })
  } catch (error) {
    console.error(`[platform] token: userinfo unreachable (${error instanceof Error ? error.name : "error"}), no email for this call`)
    return undefined
  }
  if (response.status >= 500) {
    console.error(`[platform] token: userinfo answered HTTP ${response.status}, no email for this call`)
    return undefined
  }
  if (!response.ok) {
    console.error(`[platform] token: userinfo refused the token (HTTP ${response.status}), no email until it expires`)
    return { body: null }
  }
  // Réponse signée (`application/jwt`) ou illisible : pas d'email, comme une réponse sans lui.
  return { body: await response.json().catch(() => null) }
}

/**
 * L'email vérifié de `userinfo` (HN-E01S11-2), quand le jeton ne le porte pas : les jetons d'accès
 * d'une ressource d'API ne le portent pas toujours. Une réponse d'un autre sujet ne sert pas
 * (OpenID Connect Core § 5.3.4). Réponse gardée jusqu'à l'expiration du jeton ; sur une panne,
 * l'appel est servi sans email, jamais refusé pour elle.
 */
async function userinfoEmail(endpoint: string, bearer: string, payload: JWTPayload): Promise<string | undefined> {
  const key = `${endpoint}\n${payload.sub}`
  const cached = userinfoCache.get(key)
  if (cached && cached.until > Date.now()) return cached.email
  const answer = await userinfoBody(endpoint, bearer)
  if (!answer) return undefined
  const email = isJsonObject(answer.body) && answer.body.sub === payload.sub ? verifiedIn(answer.body) : undefined
  remember(key, email, (payload.exp ?? 0) * 1000)
  return email
}

/** Émetteur OIDC : l'email vérifié du jeton, sinon celui de `userinfo`, sinon aucun (AC-a6). */
function oidcEmail(userinfoEndpoint: string | null) {
  return async (payload: JWTPayload, bearer: string): Promise<string | undefined> => {
    const inToken = verifiedIn(payload)
    if (inToken || !userinfoEndpoint) return inToken
    return userinfoEmail(userinfoEndpoint, bearer, payload)
  }
}

// Un échec de la découverte gardé (`server/issuer.ts`) rend la même erreur à chaque requête de sa
// fenêtre : elle n'est écrite qu'une fois au log.
const reported = new WeakSet<Error>()

/** La configuration refusée ou injoignable : 401, et la variable nommée au log (AC-a11). */
function configFailure(error: unknown): null {
  if (error instanceof Error) {
    if (reported.has(error)) return null
    reported.add(error)
  }
  if (error instanceof PlatformConfigError) console.error(`[platform] token: ${error.message}, every token is refused`)
  else console.error("[platform] token: issuer configuration unavailable, every token is refused", error)
  return null
}

/** Ce que vérifie un jeton : l'émetteur passé (tests), sinon celui de la configuration ; `null` : 401. */
async function tokenCheck(options: { jwks?: JWTVerifyGetKey; issuer?: string }, request: Request): Promise<TokenCheck | null> {
  if (options.issuer) return supabaseCheck(options.issuer, options.jwks)
  try {
    const config = issuerConfig()
    if (config.kind === "supabase") return supabaseCheck(config.issuer, options.jwks)
    const found = await discover(config.issuer)
    const keys = options.jwks ?? remoteJwks(found.jwksUri)
    return { issuer: config.issuer, kind: "oidc", audience: audiencesOf(config.audience, request), keys, email: oidcEmail(found.userinfoEndpoint), variable: "PLATFORM_OIDC_ISSUER" }
  } catch (error) {
    return configFailure(error)
  }
}

async function verify(bearer: string, check: TokenCheck): Promise<AuthInfo | undefined> {
  try {
    const { payload } = await jwtVerify(bearer, check.keys, { issuer: check.issuer, audience: check.audience, clockTolerance: CLOCK_TOLERANCE_S, requiredClaims: ["exp", "sub"] })
    const scope = claimText(payload.scope)
    // Pas d'`expiresAt` : `withMcpAuth` revérifierait `exp` sans la tolérance ; jose l'a jugé.
    return {
      token: bearer,
      clientId: claimText(payload.client_id) ?? "",
      scopes: scope ? scope.split(" ").filter(Boolean) : [],
      // `iss` et `issuer_kind` : l'émetteur qui a vérifié le jeton, que `verifiedCaller` passe à la base
      // pour traduire le sujet (E01-S11) ; `iss` vaut `check.issuer`, jose l'a exigé.
      extra: {
        sub: payload.sub,
        email: await check.email(payload, bearer),
        name: callerName({ user_metadata: payload.user_metadata, name: payload.name }),
        iss: check.issuer,
        issuer_kind: check.kind,
      },
    }
  } catch (error) {
    // Refus attendu (signature, expiration, émetteur, audience, forme) : 401 sans bruit. Le reste (clés
    // de l'émetteur injoignables ou illisibles) part au log serveur, la variable nommée (AC-a11), et
    // reste un 401 : jamais de mode anonyme.
    if (!(error instanceof errors.JOSEError)) console.error(`[platform] token: verification failed (issuer of ${check.variable})`, error)
    else if (KEYS_UNAVAILABLE.has(error.code)) console.error(`[platform] token: keys of the issuer of ${check.variable} unavailable (${error.code})`)
    return undefined
  }
}

/**
 * L'appelant vérifié que les trois portes passent à la base (E01-S10) : l'émetteur (`iss`, `issuer_kind`)
 * et le sujet (`sub`) de l'`extra` que rend `makeVerifyToken`, que la base traduit en identifiant interne
 * (E01-S11), avec `email` et `name` ; `null` sans `sub`. Un `extra` qui ne dit pas son émetteur (un
 * vérificateur que l'hôte injecte lui-même, M10) garde le contrat d'E01-S10 : `sub` y est l'identifiant
 * interne. Jamais de valeur de repli : un email absent reste `null` (HN-E01S09-3), quel que soit le
 * texte que la porte affiche.
 */
export function verifiedCaller(extra: Record<string, unknown> | undefined): Caller | null {
  const subject = claimText(extra?.sub)
  if (!subject) return null
  const profile = { email: claimText(extra?.email) ?? null, name: claimText(extra?.name) ?? null }
  const issuer = claimText(extra?.iss)
  const kind = extra?.issuer_kind
  if (!issuer || (kind !== "supabase" && kind !== "oidc")) return { userId: subject, ...profile }
  return { issuer, issuerKind: kind, subject, ...profile }
}

/**
 * Vérificateur pour `withMcpAuth`, et défaut de `handlePlateforme` (M10). Par défaut, l'émetteur de la
 * configuration (`server/issuer.ts`) et ses clés ; les tests passent une JWKS locale
 * (`createLocalJWKSet`) et, pour la forme de Supabase Auth, son émetteur. Tout refus rend `undefined`.
 */
export function makeVerifyToken(options: { jwks?: JWTVerifyGetKey; issuer?: string } = {}): VerifyToken {
  return async (request, bearer) => {
    if (!bearer) return undefined
    const check = await tokenCheck(options, request)
    return check ? verify(bearer, check) : undefined
  }
}
