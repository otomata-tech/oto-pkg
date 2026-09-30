// Lecture publique d'un lien (E05-S10 partie d, ADR-013 § 4, § 5) : `GET /api/plateforme/public/<jeton>`,
// et `?path=` pour un contenu dessous. Servie par la porte avant le jeton de session, sans identité ni
// journal : le lecteur est anonyme, seul le jeton le désigne, et l'organisation est celle de l'adresse.
// Adaptateur mince : `readPublicNode` (`server/shares.ts`) décide. Toujours `X-Robots-Tag: noindex,
// nofollow` (AC-d6) et jamais en cache partagé ; un jeton inconnu, désactivé ou hors de portée : 404, la
// même réponse (AC-d5). Sans elle, la page `/p/<jeton>` de l'hôte n'a que le service.
//
// E10-S02 (lot c, AC-c5 ; ADR-016 § 7, ADR-017 § 5) : les fichiers qu'un lien sert, sous la décision de
// `public_file_by_token` : `public/<jeton>/files/<id>` (redirection 302 vers l'URL présignée, comme la lecture d'une
// personne connectée), `…/markdown` (les blocs d'un `.md`, pour la visionneuse) et `…/html` (la route isolée, en
// texte, aux en-têtes d'ADR-017, `api/files-html.ts`).
import { publicReadQuerySchema } from "../schemas"
import { HTTP_STATUS, isPlatformError, PlatformError } from "../server/errors"
import { publicFileMarkdown, publicFileReadUrl } from "../server/files/view"
import { readPublicNode } from "../server/shares"
import { publicFileHtmlResponse } from "./files-html"

/** Les en-têtes de toute réponse publique : jamais indexée, jamais gardée par un cache partagé. */
export const PUBLIC_HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store" } as const

/** Ce qu'une adresse publique désigne : le contenu du lien, ou un fichier qu'il sert (lu, en blocs, en HTML). */
type PublicTarget = { kind: "node" } | { kind: "file"; id: string; as: "read" | "markdown" | "html" }

function publicTarget(segments: readonly string[]): PublicTarget | null {
  if (segments[0] !== "public") return null
  if (segments.length === 2) return { kind: "node" }
  if (segments[2] !== "files" || segments.length < 4 || segments.length > 5) return null
  const as = segments[4] ?? "read"
  return as === "read" || as === "markdown" || as === "html" ? { kind: "file", id: segments[3], as } : null
}

/** `GET public/<jeton>` et les fichiers qu'il sert : les seules routes de la porte servies sans session. */
export function isPublicRoute(segments: readonly string[], method: string): boolean {
  return method.toUpperCase() === "GET" && publicTarget(segments) !== null
}

function failure(error: PlatformError): Response {
  return Response.json({ error: { code: error.code, message: error.message } }, { status: HTTP_STATUS[error.code], headers: PUBLIC_HEADERS })
}

/** Un fichier qu'un lien sert : la redirection de sa lecture, ou ses blocs (un `.md`) ; la route HTML à part. */
async function publicFileResponse(request: Request, host: string | null, token: string, target: Extract<PublicTarget, { kind: "file" }>): Promise<Response> {
  if (target.as === "html") return publicFileHtmlResponse(request, host, token, target.id)
  if (target.as === "markdown") return Response.json({ data: await publicFileMarkdown(host, token, target.id) }, { status: 200, headers: PUBLIC_HEADERS })
  const url = await publicFileReadUrl(host, token, target.id, Object.fromEntries(new URL(request.url).searchParams))
  return new Response(null, { status: 302, headers: { ...PUBLIC_HEADERS, Location: url } })
}

/** La réponse d'une lecture publique : `{ data }` ou `{ error }`, aux en-têtes publics ; la redirection d'un fichier. */
export async function publicResponse(request: Request, host: string | null, segments: readonly string[]): Promise<Response> {
  try {
    const target = publicTarget(segments)
    // Tel quel : un jeton en base64url n'a rien d'encodé, et un `%` mal formé tombe au 404 du jeton.
    if (target?.kind === "file") return await publicFileResponse(request, host, segments[1] ?? "", target)
    const parsed = publicReadQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return failure(new PlatformError("not_found", "Not found."))
    const view = await readPublicNode(host, segments[1] ?? "", parsed.data.path)
    return Response.json({ data: view }, { status: 200, headers: PUBLIC_HEADERS })
  } catch (error) {
    if (isPlatformError(error)) return failure(error)
    console.error("[platform] public: unexpected error", error)
    return failure(new PlatformError("internal", "Internal error."))
  }
}
