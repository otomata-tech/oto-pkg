import { NextResponse } from "next/server"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { acceptPendingInvitations } from "@/lib/plateforme/session"
import { loginPath, safeRedirect } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/utils/safe-next-path"

// Retour d'un lien PKCE (`?code=`) : réinitialisation du mot de passe, Google et Microsoft (E09-S03).
// Le lien d'invitation et de connexion porte `token_hash`, vérifié au clic sur `/auth/confirm` (D11).
// Propre à Supabase Auth : en mode OIDC, le retour est `/auth/oidc/callback`, celle-ci n'existe pas
// (AC-b5 d'E01-S11).
export async function GET(request: Request) {
  if (oidcEnabled()) return new NextResponse(null, { status: 404 })
  const { searchParams, origin } = new URL(request.url)
  // Erreur rendue par le serveur d'auth (refus du hook d'inscription, annulation chez le fournisseur…) :
  // un message unique sur la page de connexion, sans recopier `error_description` (E09-S03, AC5). Un
  // lien de réinitialisation expiré (`otp_expired`) revient aussi ici : il garde le message d'E02-S01.
  if (searchParams.get("error")) {
    if (searchParams.get("error_code") === "otp_expired") return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
    // La page demandée avant la connexion (consentement OAuth, E02-S02) survit au refus : la connexion
    // suivante y ramène encore.
    const retour = safeRedirect(searchParams.get("next"))
    return NextResponse.redirect(`${origin}${retour === "/" ? "/login?error=oauth" : `${loginPath(retour)}&error=oauth`}`)
  }

  const code = searchParams.get("code")
  // `next` vient de l'URL : seul un chemin relatif du site est accepté (redirection ouverte).
  const next = safeNextPath(searchParams.get("next"))

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Les invitations en attente de cet email entrent avec la session ; un échec ne bloque pas (N3).
      await acceptPendingInvitations(data.session)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
