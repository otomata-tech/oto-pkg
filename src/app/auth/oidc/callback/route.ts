import { NextResponse, type NextRequest } from "next/server"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { oidcCallback } from "@/lib/plateforme/oidc-session"
import { acceptOidcInvitations, getRequestOrigin } from "@/lib/plateforme/session"

// Retour de l'émetteur OIDC de l'hôte (E01-S11 b, AC-b2) : le code échangé, la session chiffrée posée,
// les invitations en attente acceptées par le service du paquet, comme en mode Supabase au retour d'un
// lien (`/auth/callback`). En mode Supabase, la route n'existe pas (404).
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!oidcEnabled()) return new NextResponse(null, { status: 404 })
  return oidcCallback(request, await getRequestOrigin(), acceptOidcInvitations)
}
