// Schémas du consentement OAuth des assistants (E02-S02), partagés par le service `server/oauth.ts`,
// l'écran `ui/oauth/` et la page de l'hôte : un schéma, une source de vérité (H02). `zod/v4` comme
// tout schemas/.
import * as z from "zod/v4"

/**
 * `authorization_id` d'une demande du serveur OAuth de Supabase. Le SDK le place tel quel dans le
 * chemin de ses appels (`/oauth/authorizations/<id>`) : un `/`, un `.` ou un `?` viserait un autre
 * point de l'API d'auth avec la session de la personne.
 */
export const authorizationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/)

/** Le formulaire de la page de consentement : la demande, et le bouton choisi. */
export const consentDecisionSchema = z.object({
  authorization_id: authorizationIdSchema,
  decision: z.enum(["approve", "deny"]),
})

/**
 * L'échec d'une décision, que le service rend, que l'hôte met dans l'adresse de la page
 * (`?error=`) et que l'écran affiche : la seule liste, toute autre valeur de l'adresse est ignorée.
 */
export const decisionErrorSchema = z.enum(["decision"])

export type DecisionError = z.infer<typeof decisionErrorSchema>

/**
 * Adresse `http:` ou `https:` déclarée par un client OAuth (site, logo, adresse de retour), sinon
 * `null` : jamais un `javascript:` en `href`, en `src` ni dans une redirection
 * (`security-patterns.md § XSS Prevention`), ni une adresse à identifiants
 * (`https://claude.ai@evil.example/` se lit « claude.ai » et mène à `evil.example`). Rendue analysée :
 * hôte en punycode, jamais sa forme Unicode, qui se lit comme l'original. Lue par le service, puis
 * revérifiée par l'écran.
 */
export function webUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.username || url.password) return null
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null
  } catch {
    // Illisible : rien à montrer ni à suivre.
    return null
  }
}
