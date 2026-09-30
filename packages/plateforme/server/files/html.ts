// La route isolée d'un fichier HTML (E10-S02 lot c : AC-c3, AC-c5 ; ADR-017 § 1, § 5) : les en-têtes exacts de
// l'ADR, que la route pose sur toute réponse, erreurs comprises, et le texte servi, décidé ici. Le fichier s'exécute
// dans l'iframe de la visionneuse, sur une origine opaque (`sandbox` sans `allow-same-origin`) : ni cookie, ni
// stockage, ni API de l'hôte ; `connect-src 'none'`, `form-action 'none'` et `base-uri 'none'` ferment les
// requêtes d'un script, l'envoi d'un formulaire et `<base>`. Une requête dont `Sec-Fetch-Dest` n'est pas `iframe`
// (onglet, fenêtre ouverte, lien direct) est refusée comme un fichier inconnu : le fichier ne s'ouvre jamais hors de
// la visionneuse et de sa bannière. Tout écart à ces en-têtes est une faille (revue ligne à ligne, ADR-017).
// Sans lui, un fichier HTML ne se verrait pas, ou se verrait dans l'origine de l'application.
import { fileTypeOf } from "../../schemas"
import type { PlatformDb } from "../db"
import { PlatformError } from "../errors"
import type { Identity } from "../identity"
import { objectText, readableFile, requireStore, unknownFile } from "./service"
import { publicHtmlText } from "./view"

/** La politique d'ADR-017 § 1, mot pour mot : les CDN admis sont ceux des artefacts de Claude. */
export const HTML_CONTENT_SECURITY_POLICY = [
  "sandbox allow-scripts allow-popups allow-forms",
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ")

/** Les en-têtes de la route, hors `Content-Type` (ADR-017 § 1). */
const ISOLATION_HEADERS = {
  "Content-Security-Policy": HTML_CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
} as const

/** Le type d'un fichier servi, et celui d'une erreur, servie en texte brut, jamais en JSON dans l'iframe (AC-c3). */
const HTML_TYPE = "text/html; charset=utf-8"
const TEXT_TYPE = "text/plain; charset=utf-8"

/**
 * Les en-têtes d'une réponse de la route : ceux d'ADR-017 § 1, le type du contenu (HTML servi, texte brut pour une
 * erreur) ; par un lien public, `X-Robots-Tag: noindex, nofollow` en plus (§ 5).
 */
export function htmlHeaders(options: { error: boolean; publicRoute: boolean }): Record<string, string> {
  return {
    "Content-Type": options.error ? TEXT_TYPE : HTML_TYPE,
    ...ISOLATION_HEADERS,
    ...(options.publicRoute ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  }
}

/**
 * La route n'est servie qu'à un iframe (ADR-017 § 1) : `Sec-Fetch-Dest` présent et différent d'`iframe` refuse ; un
 * navigateur qui ne l'envoie pas est servi (HN-E10S02-12).
 */
export function servedInFrame(secFetchDest: string | null): boolean {
  return secFetchDest === null || secFetchDest.toLowerCase() === "iframe"
}

/**
 * Le texte d'un fichier `html` pour la route isolée d'une personne connectée (AC-c3) : la requête d'un iframe, un
 * fichier `ready` dont l'appelant lit le nœud, de type `html`, lu en UTF-8 strict (`objectText`). Hors iframe, d'un
 * autre type, inconnu, `pending`, d'une autre organisation ou illisible : `not_found`, la même réponse.
 */
export async function fileHtml(db: PlatformDb, identity: Identity, input: { file: unknown; secFetchDest: string | null }): Promise<string> {
  if (!servedInFrame(input.secFetchDest)) throw unknownFile()
  const store = requireStore()
  const file = await readableFile(db, identity, input.file)
  if (fileTypeOf(file.name) !== "html") throw unknownFile()
  return objectText(store, identity.org.id, file)
}

/**
 * Le texte d'un fichier `html` pour la route isolée d'un lien public (AC-c5) : la requête d'un iframe, puis la
 * décision de `public_file_by_token`. Tout refus : `not_found`, la même réponse qu'une lecture publique introuvable.
 */
export async function publicFileHtml(host: string | null, token: string, input: { file: string; secFetchDest: string | null }): Promise<string> {
  if (!servedInFrame(input.secFetchDest)) throw new PlatformError("not_found", "Not found.")
  return publicHtmlText(host, token, input.file)
}
