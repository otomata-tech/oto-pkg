// Émetteur OpenID Connect de test, servi en mémoire (E01-S11, HN-E01S11-5 : ni banc, ni service réel) :
// découverte, clés et `userinfo` rendus par un `fetch` de remplacement, que le test pose à la place du
// `fetch` global (`vi.stubGlobal`) ; jetons signés à l'exécution, aucun écrit en littéral
// (`testing-strategy.md § Anti-patterns`). Chaque émetteur a sa propre adresse : la découverte et les
// clés que le paquet garde par adresse ne passent pas d'un test à l'autre. Partie b : l'autorisation
// (`authorize`, l'écran de connexion de l'émetteur), le point de jeton (code avec PKCE, rafraîchissement),
// la révocation et la déconnexion annoncée, pour le client OIDC de l'hôte.
import { createHash, randomBytes } from "crypto"
import { decodeJwt, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose"

export type TestIssuerOptions = {
  /** Adresse de l'émetteur ; par défaut, une adresse propre à cet émetteur, au chemin `/oidc`. */
  issuer?: string
  /** Algorithme de la clé ; ES384 par défaut, celui que signe Logto. */
  alg?: "ES384" | "RS256"
  /** Forme de la découverte servie : OpenID Connect, métadonnées OAuth (RFC 8414), ou aucune. */
  discovery?: "openid" | "oauth" | "none"
  /** Chemin des clés sous l'émetteur ; `null` : la découverte ne donne pas de `jwks_uri`. */
  jwksPath?: string | null
  /** Émetteur écrit dans la découverte, quand le test le veut autre que le vrai. */
  announcedIssuer?: string
  /** `false` : la découverte n'annonce pas de `end_session_endpoint`. */
  endSession?: boolean
}

type Sign = { key?: CryptoKey; issuer?: string; audience?: string | string[] }

/** La personne qui se connecte à l'écran de l'émetteur (`authorize`). */
export type TestPerson = {
  sub: string
  /** Claims de ses jetons : email, `email_verified`, nom. */
  claims?: Record<string, unknown>
  /** Claims de son `id_token` remplacés, pour un `nonce`, un `aud`, un `iss` ou un `exp` faux. */
  idToken?: JWTPayload
}

export type TestIssuer = {
  issuer: string
  /** Chaque adresse servie, dans l'ordre : découverte, clés, `userinfo`, jeton, révocation. */
  requests: string[]
  /** Ce que `userinfo` rend pour un sujet ; un sujet absent reçoit 401. */
  userinfo: Map<string, Record<string, unknown>>
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  /** Un jeton de cet émetteur (sa clé, son adresse, une heure), claims et en-tête `at+jwt`. */
  sign: (claims: JWTPayload, options?: Sign) => Promise<string>
  /** Clients enregistrés, identifiant → secret (`client_secret_basic`). */
  clients: Map<string, string>
  /** Jetons de rafraîchissement valides ; en retirer un le révoque, comme le point de révocation. */
  refreshTokens: Map<string, { person: TestPerson; clientId: string }>
  /** Durée des jetons d'accès (`expires_in`), en secondes ; 0 : expiré dès sa délivrance. */
  accessTokenTtl: number
  /**
   * L'écran de connexion de l'émetteur : `person` s'y connecte, et l'adresse de rappel qu'il rend
   * (code, `state`, `iss`). Lève si la demande d'autorisation n'est pas celle d'un client enregistré,
   * avec PKCE S256.
   */
  authorize: (authorizationUrl: string, person: TestPerson) => string
}

/** Ce qu'une autorisation donne à l'échange de son code. */
type Grant = { person: TestPerson; clientId: string; redirectUri: string; challenge: string; nonce: string | null; resource: string | null }

const json = (body: unknown, status = 200) => Response.json(body, { status })
const oauthError = (error: string, status = 400) => json({ error }, status)

function discoveryDocument(issuer: string, options: TestIssuerOptions, alg: string): Record<string, unknown> {
  const jwksPath = options.jwksPath === undefined ? "/jwks" : options.jwksPath
  return {
    issuer: options.announcedIssuer ?? issuer,
    authorization_endpoint: `${issuer}/auth`,
    token_endpoint: `${issuer}/token`,
    ...(jwksPath === null ? {} : { jwks_uri: `${issuer}${jwksPath}` }),
    userinfo_endpoint: `${issuer}/me`,
    revocation_endpoint: `${issuer}/token/revocation`,
    ...(options.endSession === false ? {} : { end_session_endpoint: `${issuer}/session/end` }),
    id_token_signing_alg_values_supported: [alg],
  }
}

/** Le chemin où la découverte est servie, selon sa forme (OpenID Connect Discovery § 4 ; RFC 8414 § 3.1). */
function discoveryAddress(issuer: string, form: "openid" | "oauth"): string {
  const url = new URL(issuer)
  return form === "openid" ? `${issuer}/.well-known/openid-configuration` : `${url.origin}/.well-known/oauth-authorization-server${url.pathname}`
}

/** L'identifiant du client de `client_secret_basic` (RFC 6749 § 2.3.1), s'il est enregistré avec ce secret. */
function authenticated(request: Request, clients: Map<string, string>): string | null {
  const basic = /^Basic (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
  if (!basic) return null
  const [id = "", secret = ""] = Buffer.from(basic, "base64")
    .toString("utf8")
    .split(":")
    .map((part) => decodeURIComponent(part.replace(/\+/g, " ")))
  return clients.get(id) === secret ? id : null
}

export async function testIssuer(options: TestIssuerOptions = {}): Promise<TestIssuer> {
  const issuer = options.issuer ?? `https://issuer-${randomBytes(4).toString("hex")}.example.test/oidc`
  const alg = options.alg ?? "ES384"
  const pair = await generateKeyPair(alg, { extractable: true })
  const kid = `k-${randomBytes(3).toString("hex")}`
  const jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid, alg, use: "sig" }] }
  const form = options.discovery ?? "openid"
  const document = discoveryDocument(issuer, options, alg)
  const requests: string[] = []
  const userinfo = new Map<string, Record<string, unknown>>()
  const clients = new Map<string, string>()
  const refreshTokens = new Map<string, { person: TestPerson; clientId: string }>()
  const codes = new Map<string, Grant>()

  /** Les jetons d'une personne pour un client : accès (audience de la ressource), `id_token`, rafraîchissement. */
  async function tokens(person: TestPerson, clientId: string, grant: { nonce: string | null; resource: string | null }): Promise<Response> {
    const now = Math.floor(Date.now() / 1000)
    const ttl = issued.accessTokenTtl
    const access = await new SignJWT({ ...person.claims, sub: person.sub, client_id: clientId })
      .setProtectedHeader({ alg, kid, typ: "at+jwt" })
      .setIssuer(issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .setAudience(grant.resource ?? clientId)
      .sign(pair.privateKey)
    const idClaims = { iss: issuer, aud: clientId, sub: person.sub, iat: now, exp: now + 3600, ...(grant.nonce ? { nonce: grant.nonce } : {}), ...person.claims, ...person.idToken }
    const idToken = await new SignJWT(idClaims).setProtectedHeader({ alg, kid, typ: "JWT" }).sign(pair.privateKey)
    const refreshToken = randomBytes(16).toString("hex")
    refreshTokens.set(refreshToken, { person, clientId })
    return json({ access_token: access, token_type: "Bearer", expires_in: ttl, id_token: idToken, refresh_token: refreshToken, scope: "openid email profile offline_access" })
  }

  /** Le point de jeton : code d'autorisation avec son vérificateur PKCE, ou jeton de rafraîchissement. */
  async function token(request: Request): Promise<Response> {
    const clientId = authenticated(request, clients)
    if (!clientId) return oauthError("invalid_client", 401)
    const body = new URLSearchParams(await request.text())
    if (body.get("grant_type") === "refresh_token") {
      const known = refreshTokens.get(body.get("refresh_token") ?? "")
      if (!known || known.clientId !== clientId) return oauthError("invalid_grant")
      return tokens(known.person, clientId, { nonce: null, resource: body.get("resource") })
    }
    const code = body.get("code") ?? ""
    const grant = codes.get(code)
    codes.delete(code)
    const verifier = body.get("code_verifier") ?? ""
    const proof = createHash("sha256").update(verifier).digest("base64url")
    if (!grant || grant.clientId !== clientId || grant.redirectUri !== body.get("redirect_uri") || grant.challenge !== proof) return oauthError("invalid_grant")
    if (grant.resource !== body.get("resource")) return oauthError("invalid_target")
    return tokens(grant.person, clientId, grant)
  }

  /** Le point de révocation (RFC 7009) : le jeton de rafraîchissement de ce client oublié ; 200, même pour un jeton inconnu (§ 2.2). */
  async function revocation(request: Request): Promise<Response> {
    const clientId = authenticated(request, clients)
    if (!clientId) return oauthError("invalid_client", 401)
    const token = new URLSearchParams(await request.text()).get("token") ?? ""
    if (refreshTokens.get(token)?.clientId === clientId) refreshTokens.delete(token)
    return new Response(null, { status: 200 })
  }

  async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init)
    requests.push(request.url)
    if (form !== "none" && request.url === discoveryAddress(issuer, form)) return json(document)
    if (options.jwksPath !== null && request.url === `${issuer}${options.jwksPath ?? "/jwks"}`) return json(jwks)
    if (request.url === `${issuer}/me`) {
      const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
      const claims = bearer ? userinfo.get(String(decodeJwt(bearer).sub)) : undefined
      return claims ? json(claims) : json({ error: "invalid_token" }, 401)
    }
    if (request.url === `${issuer}/token` && request.method === "POST") return token(request)
    if (request.url === `${issuer}/token/revocation` && request.method === "POST") return revocation(request)
    return json({ error: "not_found" }, 404)
  }

  async function sign(claims: JWTPayload, signing: Sign = {}): Promise<string> {
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg, kid, typ: "at+jwt" })
      .setIssuer(signing.issuer ?? issuer)
      .setIssuedAt()
      .setExpirationTime("1h")
    if (signing.audience !== undefined) jwt.setAudience(signing.audience)
    return jwt.sign(signing.key ?? pair.privateKey)
  }

  function authorize(authorizationUrl: string, person: TestPerson): string {
    const url = new URL(authorizationUrl)
    const parameter = (name: string) => url.searchParams.get(name)
    const clientId = parameter("client_id") ?? ""
    const redirectUri = parameter("redirect_uri") ?? ""
    const challenge = parameter("code_challenge") ?? ""
    if (`${url.origin}${url.pathname}` !== `${issuer}/auth` || !clients.has(clientId) || parameter("response_type") !== "code") {
      throw new Error("authorize: not an authorization request of a registered client")
    }
    if (parameter("code_challenge_method") !== "S256" || !challenge) throw new Error("authorize: PKCE S256 required")
    const code = randomBytes(12).toString("hex")
    codes.set(code, { person, clientId, redirectUri, challenge, nonce: parameter("nonce"), resource: parameter("resource") })
    const callback = new URL(redirectUri)
    callback.searchParams.set("code", code)
    callback.searchParams.set("state", parameter("state") ?? "")
    callback.searchParams.set("iss", issuer)
    return callback.href
  }

  const issued: TestIssuer = { issuer, requests, userinfo, fetch: serve, sign, clients, refreshTokens, accessTokenTtl: 3600, authorize }
  return issued
}
