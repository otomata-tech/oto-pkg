// Les routes du dépôt par lien (E10-S02 lot f : AC-f4, AC-f8, AC-f11, AC-f15 ; ADR-018), servies par des branches avant
// la table de dispatch, qui ne lit qu'un corps JSON (`serve`, `handler.ts`) : le corps est ici le fichier lui-même.
// `POST uploads/<jeton>` : la seule porte sans session qui écrit (ADR-018 § 1), avant le jeton de session, en texte brut
// lisible par `curl`, sans CORS ; ses refus avant le service (méthode, `Origin`, forme du jeton, borne du corps) ne
// lisent ni la base ni plus que la borne du corps, et ne consomment pas le ticket. `POST uploads/<jeton>/form` : le formulaire de dépôt, une route à session distincte (ADR-018 § 8), sous
// le contrôle d'origine des mutations, en JSON pour l'écran. Chacune n'accepte que son jeton (HN-E10S02-108). Adaptateur
// mince : `server/uploads.ts` décide ; session, origine et réponse d'erreur en JSON sont celles de la porte (`session.ts`).
import { UPLOAD_BYTES_MAX, UPLOAD_TOKEN_PATTERN } from "../schemas"
import { readBounded } from "../server/bounded-read"
import { HTTP_STATUS, PlatformError } from "../server/errors"
import { receiveFormUpload, receiveLinkUpload, unknownUploadLink } from "../server/uploads"
import {
  addressOrigin,
  asPlatformError,
  authenticationRequired,
  errorResponse,
  requireSameOrigin,
  sessionIdentity,
  verifiedSession,
  type SessionOptions,
} from "./session"

/** Ce que la porte reçoit de l'hôte : l'adresse, et l'exécution après la réponse (journal). */
type UploadRouteOptions = { host: string | null; defer?: (task: () => Promise<void>) => void }

/** Les en-têtes de toute réponse de la porte sans session (AC-f8) : du texte, jamais gardé, jamais indexé. */
export const UPLOAD_HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const

/**
 * `uploads/<jeton>` : la porte sans session (ADR-018 § 1), toute méthode ; hors `POST`, son refus `forbidden`, sans
 * session (HN-E10S02-120), jamais le 401 JSON des routes à session.
 */
export function isUploadRoute(segments: readonly string[]): boolean {
  return segments.length === 2 && segments[0] === "uploads"
}

/** `POST uploads/<jeton>/form` : le formulaire de dépôt, sous session (ADR-018 § 8). */
export function isUploadFormRoute(segments: readonly string[], method: string): boolean {
  return method.toUpperCase() === "POST" && segments.length === 3 && segments[0] === "uploads" && segments[2] === "form"
}

function tooLarge(): never {
  throw new PlatformError("too_large", `The file is over 1 MB (${UPLOAD_BYTES_MAX} bytes): attach a larger file from the page itself.`)
}

/**
 * Le corps, lu par morceaux et coupé au-delà de 1 Mo (AC-f4, 3 et 4) : un `Content-Length` trop grand est refusé sans
 * rien lire ; sans lui, la lecture s'arrête à la borne (`readBounded`).
 */
async function boundedBody(request: Request): Promise<Uint8Array> {
  const length = request.headers.get("content-length")
  if (length !== null && Number(length) > UPLOAD_BYTES_MAX) tooLarge()
  if (!request.body) return new Uint8Array(0)
  return readBounded(request.body, UPLOAD_BYTES_MAX, tooLarge)
}

/**
 * `POST uploads/<jeton>` (AC-f4) : dans cet ordre, et au premier refus, une autre méthode que `POST` (`forbidden`,
 * HN-E10S02-120 : un `GET` d'un navigateur ne porte pas d'`Origin`), un en-tête `Origin` (`forbidden`, sans lire le
 * corps ni la base : un navigateur, un site tiers, un HTML vu), la forme du jeton (`not_found`), la borne du corps
 * (`too_large`) ; puis le service consomme le ticket par le jeton de `curl`, relit l'identité et le droit, contrôle et
 * écrit. Le `Content-Type` est ignoré (`curl` envoie `application/x-www-form-urlencoded`), comme tout paramètre de
 * l'adresse : le ticket fixe la destination. Réponse et refus en texte brut, `<code>: <message>`, au statut de `HTTP_STATUS`.
 */
export async function uploadResponse(request: Request, options: UploadRouteOptions, segments: readonly string[]): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "POST") throw new PlatformError("forbidden", "Only POST is accepted here: send the file with curl --data-binary, or use the form link.")
    if (request.headers.has("origin")) throw new PlatformError("forbidden", "Requests from a browser are refused: send the file with curl, or use the form link.")
    const token = segments[1] ?? ""
    if (!UPLOAD_TOKEN_PATTERN.test(token)) throw unknownUploadLink()
    const bytes = await boundedBody(request)
    const origin = addressOrigin(request, options.host)
    const result = await receiveLinkUpload(options.host, token, { bytes, origin, userAgent: request.headers.get("user-agent"), defer: options.defer })
    return new Response(`${result.text}\n`, { status: 200, headers: UPLOAD_HEADERS })
  } catch (error) {
    const failure = asPlatformError(error)
    return new Response(`${failure.code}: ${failure.message}\n`, { status: HTTP_STATUS[failure.code], headers: UPLOAD_HEADERS })
  }
}

/**
 * `POST uploads/<jeton>/form` (AC-f15) : la session vérifiée (sans elle, 401), l'origine de la mutation contrôlée comme
 * toute mutation de la porte (`security-patterns.md § CSRF Protection`), l'identité, la forme du jeton et la borne du
 * corps ; puis le ticket de cette personne relu par le jeton du formulaire (une autre personne ne consomme rien) et
 * l'envoi. JSON pour l'écran.
 */
export async function uploadFormResponse(request: Request, options: SessionOptions & UploadRouteOptions, segments: readonly string[]): Promise<Response> {
  try {
    const session = await verifiedSession(request, options)
    if (!session) return errorResponse(authenticationRequired(), 401)
    const origin = addressOrigin(request, options.host)
    requireSameOrigin(request, origin)
    const identity = await sessionIdentity(session, options.host)
    const token = segments[1] ?? ""
    if (!UPLOAD_TOKEN_PATTERN.test(token)) throw unknownUploadLink()
    const bytes = await boundedBody(request)
    const result = await receiveFormUpload(session.db, identity, token, { bytes, origin, userAgent: request.headers.get("user-agent"), defer: options.defer })
    return Response.json({ data: result.data }, { status: 200, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return errorResponse(asPlatformError(error))
  }
}
