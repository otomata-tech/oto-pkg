// Lecture publique d'un lien (E05-S10 partie d, ADR-013 § 4, § 5) : `GET /api/plateforme/public/<jeton>`,
// et `?path=` pour un contenu dessous. Servie par la porte avant le jeton de session, sans identité ni
// journal : le lecteur est anonyme, seul le jeton le désigne, et l'organisation est celle de l'adresse.
// Adaptateur mince : `readPublicNode` (`server/shares.ts`) décide. Toujours `X-Robots-Tag: noindex,
// nofollow` (AC-d6) et jamais en cache partagé ; un jeton inconnu, désactivé ou hors de portée : 404, la
// même réponse (AC-d5). Sans elle, la page `/p/<jeton>` de l'hôte n'a que le service.
import { publicReadQuerySchema } from "../schemas"
import { HTTP_STATUS, isPlatformError, PlatformError } from "../server/errors"
import { readPublicNode } from "../server/shares"

/** Les en-têtes de toute réponse publique : jamais indexée, jamais gardée par un cache partagé. */
export const PUBLIC_HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store" } as const

/** `GET public/<jeton>` : la seule route de la porte servie sans session. */
export function isPublicRoute(segments: readonly string[], method: string): boolean {
  return method.toUpperCase() === "GET" && segments.length === 2 && segments[0] === "public"
}

function failure(error: PlatformError): Response {
  return Response.json({ error: { code: error.code, message: error.message } }, { status: HTTP_STATUS[error.code], headers: PUBLIC_HEADERS })
}

/** La réponse d'une lecture publique : `{ data }` ou `{ error }`, aux en-têtes publics. */
export async function publicResponse(request: Request, host: string | null, segments: readonly string[]): Promise<Response> {
  try {
    const parsed = publicReadQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return failure(new PlatformError("not_found", "Not found."))
    // Tel quel : un jeton en base64url n'a rien d'encodé, et un `%` mal formé tombe au 404 du jeton.
    const view = await readPublicNode(host, segments[1] ?? "", parsed.data.path)
    return Response.json({ data: view }, { status: 200, headers: PUBLIC_HEADERS })
  } catch (error) {
    if (isPlatformError(error)) return failure(error)
    console.error("[platform] public: unexpected error", error)
    return failure(new PlatformError("internal", "Internal error."))
  }
}
