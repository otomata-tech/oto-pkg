"use client"

// Les deux boutons du consentement (E02-S02, AC19) : seul morceau client de l'écran, sans prop
// (`portage-ecrans.md § 2`). Ils envoient le `<form action>` que rend l'écran serveur ; pendant la
// décision, `useFormStatus` les désactive tous deux et marque le bouton choisi : une seule décision
// part. Repris du banc E03 (`consent-form.tsx`) : l'état en cours, le bouton choisi marqué. Boutons du
// design system porté (E05-S09, partie d3) : Refuser en secondaire, Autoriser en principal, côte à
// côte. Retiré : l'état client porté par une fonction (→ formulaire et `useFormStatus`), l'indicateur
// tournant (le design system désactive et marque, il ne fait pas tourner de glyphe sans icône).
import { useFormStatus } from "react-dom"
import { Button } from "../ds/react/primitives"

type BoutonDeDecisionProps = { decision: "approve" | "deny"; libelle: string; variante: "primary" | "secondary" }

function BoutonDeDecision({ decision, libelle, variante }: BoutonDeDecisionProps) {
  // `useFormStatus` lit l'envoi du `<form>` qui l'entoure : ce bouton doit être rendu dedans.
  const { pending, data } = useFormStatus()
  const choisi = pending && data?.get("decision") === decision
  return (
    <Button type="submit" name="decision" value={decision} variant={variante} block disabled={pending} aria-busy={choisi}>
      {libelle}
    </Button>
  )
}

export function BoutonsDeDecision() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <BoutonDeDecision decision="deny" libelle="Refuser" variante="secondary" />
      <BoutonDeDecision decision="approve" libelle="Autoriser" variante="primary" />
    </div>
  )
}
