// La route isolée d'un fichier HTML (E10-S02 lot c : AC-c3, AC-c5 ; ADR-017 § 1, § 5) : `GET files/<id>/html` et
// `GET public/<jeton>/files/<id>/html`, servies par une branche avant la table de dispatch, qui ne rend que du JSON
// (`serve`, `handler.ts`) : ici, le texte du fichier, ou une erreur en texte brut, `<code>: <message>`, toujours aux
// en-têtes d'ADR-017, jamais du JSON dans l'iframe. La route d'une personne connectée vérifie elle-même le jeton de la
// session par l'aide de la porte (`session.ts`) : sans session, 401 `forbidden`, en texte brut. Adaptateur mince : `server/files/html.ts`
// décide. Une lecture : aucune ligne de journal. Sans elle, l'iframe de la visionneuse n'aurait rien à charger.
import { HTTP_STATUS, isPlatformError, PlatformError } from "../server/errors"
import { fileHtml, htmlHeaders, publicFileHtml } from "../server/files/html"
import { authenticationRequired, sessionIdentity, verifiedSession, type SessionOptions } from "./session"

/** Ce que la porte reçoit de l'hôte et passe à la route (`handlePlateforme`). */
type HtmlRouteOptions = SessionOptions & { host: string | null }

/** `GET files/<id>/html` : la route isolée d'une personne connectée, servie avant le jeton de session. */
export function isFileHtmlRoute(segments: readonly string[], method: string): boolean {
  return method.toUpperCase() === "GET" && segments.length === 3 && segments[0] === "files" && segments[2] === "html"
}

/** Une erreur en texte brut, aux en-têtes de la route ; une panne inattendue garde son détail au log serveur. */
function htmlFailure(error: unknown, publicRoute: boolean, status?: number): Response {
  let failure: PlatformError
  if (isPlatformError(error)) failure = error
  else {
    console.error("[platform] files html: unexpected error", error)
    failure = new PlatformError("internal", "Internal error.")
  }
  return new Response(`${failure.code}: ${failure.message}`, { status: status ?? HTTP_STATUS[failure.code], headers: htmlHeaders({ error: true, publicRoute }) })
}

function htmlServed(text: string, publicRoute: boolean): Response {
  return new Response(text, { status: 200, headers: htmlHeaders({ error: false, publicRoute }) })
}

/**
 * `GET files/<id>/html` (AC-c3) : le jeton de la session vérifié (sans lui, 401), l'identité par l'adresse, puis le
 * texte du fichier sous la décision du service. `segments` : ceux de la route, encore encodés ; un identifiant encodé
 * n'est pas un uuid et tombe au 404 du fichier inconnu.
 */
export async function fileHtmlResponse(request: Request, options: HtmlRouteOptions, segments: readonly string[]): Promise<Response> {
  try {
    const session = await verifiedSession(request, options)
    if (!session) return htmlFailure(authenticationRequired(), false, 401)
    const identity = await sessionIdentity(session, options.host)
    const text = await fileHtml(session.db, identity, { file: segments[1], secFetchDest: request.headers.get("sec-fetch-dest") })
    return htmlServed(text, false)
  } catch (error) {
    return htmlFailure(error, false)
  }
}

/** `GET public/<jeton>/files/<id>/html` (AC-c5) : hors session, sous la décision de `public_file_by_token`. */
export async function publicFileHtmlResponse(request: Request, host: string | null, token: string, fileId: string): Promise<Response> {
  try {
    return htmlServed(await publicFileHtml(host, token, { file: fileId, secFetchDest: request.headers.get("sec-fetch-dest") }), true)
  } catch (error) {
    return htmlFailure(error, true)
  }
}
