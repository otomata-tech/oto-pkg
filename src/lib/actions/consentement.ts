"use server"

import { redirect } from "next/navigation"
import { CONSENT_PATH, consentDecision, consentPath } from "@otomata_tech/oto_platform/server"
import { loginPath } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/server"

/**
 * « Refuser » ou « Autoriser » sur `/oauth/consent` (E02-S02, AC15 à AC18). La session d'abord : la
 * page a pu vieillir, et la décision exige la session à cookies du starter (HN-E02S02-3). Le paquet
 * valide le formulaire, relit la demande et rend la décision ; les redirections suivent, hors de tout
 * `try` : vers l'assistant, ou de retour sur la demande avec l'erreur à montrer.
 */
export async function deciderConsentementAction(formData: FormData): Promise<never> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(loginPath(consentPath(formData.get("authorization_id"))))

  const decision = await consentDecision({ auth: supabase.auth }, formData)
  // Formulaire altéré : l'état « lien invalide » de la page, aucun appel au SDK.
  if (decision.kind === "invalid") redirect(CONSENT_PATH)
  if (decision.kind === "retry") redirect(`${consentPath(decision.authorizationId)}&error=${decision.erreur}`)
  // L'adresse de retour que rend Supabase (avec `code=` ou `error=access_denied`), vérifiée http(s)
  // par le paquet, jamais une valeur du formulaire.
  redirect(decision.url)
}
