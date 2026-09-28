"use client"

import * as React from "react"
import { useFormStatus } from "react-dom"
import { Alert, Button } from "@otomata_tech/oto_platform/ui"
import { connexionFournisseurAction } from "@/lib/actions/auth"
import type { OAuthProvider } from "@/lib/schemas/auth"
import type { FournisseursActives } from "@/lib/supabase/fournisseurs"
import { CONNEXION_ECHOUEE } from "@/app/(auth)/messages"

// Les boutons des fournisseurs activés sur le projet (E09-S03) : un seul formulaire, chaque bouton
// envoie sa valeur dans `fournisseur`. Texte seul, sans logo de marque (HN-E09S03-4) ; boutons
// secondaires du design system porté, au pied de l'îlot de `/login` (E05-S09, partie d3).

const LIBELLES: Record<OAuthProvider, string> = {
  google: "Continuer avec Google",
  azure: "Continuer avec Microsoft",
}

function BoutonDeFournisseur({ fournisseur }: { fournisseur: OAuthProvider }) {
  // `useFormStatus` lit l'envoi du `<form>` qui l'entoure : ce bouton doit être rendu dedans.
  const { pending, data } = useFormStatus()
  return (
    <Button
      type="submit"
      name="fournisseur"
      value={fournisseur}
      variant="secondary"
      block
      disabled={pending}
      aria-busy={pending && data?.get("fournisseur") === fournisseur}
    >
      {LIBELLES[fournisseur]}
    </Button>
  )
}

type BoutonsDeFournisseursProps = FournisseursActives & {
  /** La page où revenir après la connexion, déjà validée par la page serveur (E02-S02). */
  retour?: string
}

export function BoutonsDeFournisseurs({ google, azure, retour }: BoutonsDeFournisseursProps) {
  const [etat, action] = React.useActionState(connexionFournisseurAction, null)
  return (
    <form action={action} className="flex flex-col gap-2">
      {retour && <input type="hidden" name="redirect" value={retour} />}
      {google && <BoutonDeFournisseur fournisseur="google" />}
      {azure && <BoutonDeFournisseur fournisseur="azure" />}
      {etat?.error && (
        <Alert tone="fail" title={CONNEXION_ECHOUEE}>
          {etat.error}
        </Alert>
      )}
    </form>
  )
}
