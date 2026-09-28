"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Alert, Button, Field, IlotDAuthentification, Input } from "@otomata_tech/oto_platform/ui"
import { forgotPasswordAction } from "@/lib/actions/auth"
import { forgotPasswordSchema, type ForgotPasswordData } from "@/lib/schemas/auth"
import { SERVEUR_INJOIGNABLE } from "@/app/(auth)/messages"

// Le formulaire de `/forgot-password` (M01) : la page, Server Component, lit la marque de l'adresse et
// exporte son titre. Porté d'oto-frontend (`src/components/auth/password-forgot-form.tsx`, avant le
// retrait de sa démonstration) : React Hook Form sur le schéma de l'action, « Adresse mail » et son
// erreur sous le champ, l'échec dans un `Alert`, « Envoyer le lien » au pied relié par `form`,
// « Envoi… » pendant l'envoi ; au succès, le formulaire disparaît et la confirmation s'écrit dans la
// région de l'îlot, qui ramène le focus au titre. Changé : la confirmation est celle de l'action, la même
// pour toute adresse. Retiré : TanStack Query, le lien de réinitialisation rendu en démonstration.

const FORMULAIRE = "mot-de-passe-oublie"

export function FormulaireMotDePasseOublie() {
  const [erreur, setErreur] = React.useState<string | null>(null)
  const [confirmation, setConfirmation] = React.useState<string | null>(null)
  const form = useForm<ForgotPasswordData>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  })
  const { errors, isSubmitting } = form.formState

  // L'appel de l'action peut échouer (réseau, déploiement remplacé) : le bouton se libère et l'échec se
  // dit, au lieu d'un bouton figé sans message.
  const demander = form.handleSubmit(async ({ email }) => {
    const donnees = new FormData()
    donnees.set("email", email)
    try {
      const resultat = await forgotPasswordAction(donnees)
      if (resultat.data) setConfirmation(resultat.data.message)
      else setErreur(resultat.error)
    } catch {
      setErreur(SERVEUR_INJOIGNABLE)
    }
  })

  // Chaque envoi efface l'échec d'avant, champ refusé compris : il ne se lit plus sous une autre erreur.
  function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    setErreur(null)
    void demander(evenement)
  }

  // Renvoyer le lien n'apporterait rien, et un champ resté sous un succès invite à recommencer : au
  // succès, ni formulaire ni pied.
  return (
    <IlotDAuthentification
      titre="Mot de passe oublié"
      statut={confirmation ?? undefined}
      pied={
        confirmation ? undefined : (
          <Button type="submit" form={FORMULAIRE} variant="primary" block disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Envoi…" : "Envoyer le lien"}
          </Button>
        )
      }
    >
      {confirmation ? null : (
        <form id={FORMULAIRE} className="flex flex-col gap-3" noValidate onSubmit={envoyer}>
          {erreur && (
            <Alert tone="fail" title="Le lien n'a pas pu être demandé">
              {erreur}
            </Alert>
          )}
          <Field label="Adresse mail" error={errors.email?.message}>
            <Input type="email" autoComplete="email" autoFocus {...form.register("email")} />
          </Field>
        </form>
      )}
    </IlotDAuthentification>
  )
}
