import { NextResponse, type NextRequest } from "next/server"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { oidcLogin } from "@/lib/plateforme/oidc-session"
import { getRequestOrigin } from "@/lib/plateforme/session"

// Connexion chez l'émetteur OIDC de l'hôte (E01-S11 b, AC-b1) : le middleware et `/login` y envoient
// une personne sans session, `?redirect=` portant la page où revenir. La page de connexion est celle
// de l'émetteur, habillée chez lui (fiche D79). En mode Supabase, la route n'existe pas (404).
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!oidcEnabled()) return new NextResponse(null, { status: 404 })
  return oidcLogin(await getRequestOrigin(), request.nextUrl.searchParams.get("redirect") ?? "/")
}
