// La session d'une requête de la porte, partagée par `handlePlateforme`, la route isolée d'un fichier HTML
// (`files-html.ts`), qui la vérifie elle-même pour répondre en texte brut, et la route du formulaire de dépôt
// (`uploads.ts`) : le jeton de l'hôte vérifié (`verifyToken`, ADR-012 § 5 b), l'appelant qu'en tire `verifiedCaller`,
// son client de base, puis, au moment que chaque porte choisit, l'identité par l'adresse ; le contrôle d'origine d'une
// mutation et la réponse d'erreur en JSON. Sans lui, les portes recopieraient la séquence, la phrase du refus, le
// contrôle d'origine et la forme de l'erreur (`coding-standards.md § DRY`).
import { makeVerifyToken, verifiedCaller, type VerifyToken } from "../mcp/auth"
import { createPlatformDb, type PlatformDb } from "../server/db"
import { HTTP_STATUS, isPlatformError, PlatformError } from "../server/errors"
import { requestOrigin, resolveIdentity, type Identity } from "../server/identity"

/** Ce qu'une porte reçoit de l'hôte pour vérifier la session. */
export type SessionOptions = {
  /** Jeton de la session de l'hôte ; vérifié ici par `verifyToken`. */
  accessToken: string | null | undefined
  /** Vérificateur du jeton ; sans lui, `makeVerifyToken()` (l'émetteur de l'hôte), comme `/api/mcp`. */
  verifyToken?: VerifyToken
}

/** Le client de base de l'appelant vérifié, et l'email qu'en lit l'identité. */
export type VerifiedSession = { db: PlatformDb; email: string }

/** Le refus d'une requête sans jeton ou au jeton refusé : `forbidden`, que chaque porte sert en 401. */
export function authenticationRequired(): PlatformError {
  return new PlatformError("forbidden", "Authentication required.")
}

/**
 * Le jeton de la session vérifié, puis le client de base de son appelant ; `null` sans jeton, ou pour un jeton que
 * le vérificateur refuse ou dont il ne tire aucun appelant. Une panne du vérificateur remonte à la porte.
 */
export async function verifiedSession(request: Request, options: SessionOptions): Promise<VerifiedSession | null> {
  if (!options.accessToken) return null
  const verifyToken = options.verifyToken ?? makeVerifyToken()
  const caller = verifiedCaller((await verifyToken(request, options.accessToken))?.extra)
  if (!caller) return null
  return { db: createPlatformDb({ caller }), email: caller.email ?? "" }
}

/** L'identité de la session par l'adresse ; l'identifiant interne est celui de la session, que la base traduit (E01-S11). */
export function sessionIdentity(session: VerifiedSession, host: string | null): Promise<Identity> {
  return resolveIdentity(session.db, host, { email: session.email })
}

/** L'origine de l'adresse appelée (`https://acme.oto.cx`), par l'hôte qui a résolu l'organisation. */
export function addressOrigin(request: Request, host: string | null): string {
  return requestOrigin(request.headers, host ?? "", new URL(request.url).protocol.replace(/:$/, ""))
}

/**
 * Un Route Handler n'a pas la protection d'origine des Server Actions (`security-patterns.md § CSRF Protection`) : une
 * mutation vient de l'adresse elle-même, sinon `forbidden`.
 */
export function requireSameOrigin(request: Request, origin: string): void {
  if (request.headers.get("origin")?.toLowerCase() !== origin) throw new PlatformError("forbidden", "Cross-origin request refused.")
}

/** Une erreur en JSON : `{ error: { code, message, details? } }`, au statut de `HTTP_STATUS` (H04). */
export function errorResponse(error: PlatformError, status = HTTP_STATUS[error.code]): Response {
  const body = { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
  return Response.json({ error: body }, { status })
}

/** Toute erreur devient un `PlatformError` ; une panne inattendue garde son détail au log serveur. */
export function asPlatformError(error: unknown): PlatformError {
  if (isPlatformError(error)) return error
  console.error("[platform] api: unexpected error", error)
  return new PlatformError("internal", "Internal error.")
}
