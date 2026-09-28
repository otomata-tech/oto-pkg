import { NextResponse, type NextRequest } from "next/server"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { oidcLogout } from "@/lib/plateforme/oidc-session"
import { getRequestOrigin } from "@/lib/plateforme/session"

// Déconnexion OIDC de l'hôte (E01-S11 b, AC-b4) : la session de l'hôte retirée, puis la personne passe
// chez l'émetteur, qui ferme la sienne. En `POST` seulement : une adresse en `GET` se précharge (lien,
// navigateur) et déconnecterait sans geste. Le bouton « Se déconnecter » des écrans passe par
// `logoutAction`, qui fait la même chose. En mode Supabase, la route n'existe pas (404).
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!oidcEnabled()) return new NextResponse(null, { status: 404 })
  const origin = await getRequestOrigin()
  // Un Route Handler n'a pas la protection d'origine des Server Actions (`security-patterns.md § CSRF
  // Protection`) : une déconnexion vient de l'adresse elle-même, comme une mutation de l'API.
  if (!origin || request.headers.get("origin")?.toLowerCase() !== origin) return new NextResponse(null, { status: 403 })
  return oidcLogout(request, origin)
}
