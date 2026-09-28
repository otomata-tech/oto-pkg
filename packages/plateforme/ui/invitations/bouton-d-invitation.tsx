"use client"

// « Inviter quelqu'un », l'action de l'en-tête de l'écran des équipes quand l'onglet des personnes est ouvert
// (E05-S09, partie d1) : un bouton, et le formulaire d'invitation (`InviterQuelquUn`, E02-S01) dans un
// dialogue. Porté d'oto-frontend (`invite-someone.tsx`, `InviteSomeone`) : un seul chemin vers le geste,
// l'en-tête ; le focus posé dans l'adresse à l'ouverture, jamais au montage de l'écran ; le formulaire repart
// vierge à chaque ouverture ; le dialogue reste ouvert après l'envoi, qui s'annonce dans sa région `status`.
// Changé : le rôle et l'équipe du formulaire d'aujourd'hui (H72). Retiré : le prénom (aucun champ ne le porte).
import { useEffect, useRef, useState } from "react"
import { UserPlus } from "@phosphor-icons/react/dist/csr/UserPlus"
import type { InvitationRole } from "../../schemas"
import { Dialog } from "../ds/react/dialog"
import { AnimatedIcon } from "../ds/react/icon"
import { Button } from "../ds/react/primitives"
import { InviterQuelquUn } from "./inviter-quelqu-un"

const TITRE = "Inviter quelqu'un"

type BoutonDInvitationProps = {
  equipes: { id: string; nom: string }[]
  rolesPermis: InvitationRole[]
  equipeObligatoire: boolean
}

export function BoutonDInvitation({ equipes, rolesPermis, equipeObligatoire }: BoutonDInvitationProps) {
  const [ouvert, setOuvert] = useState(false)
  const [ouvertures, setOuvertures] = useState(0)
  const dialogue = useRef<HTMLDialogElement>(null)

  // Le `<dialog>` natif focalise son premier élément à l'ouverture ; cet effet passe après lui et pose le
  // focus là où l'on écrit.
  useEffect(() => {
    if (ouvert) dialogue.current?.querySelector<HTMLInputElement>("input[type='email']")?.focus()
  }, [ouvert, ouvertures])

  return (
    <>
      <Button
        variant="primary"
        iconStart={<AnimatedIcon as={UserPlus} size="xs" aria-hidden="true" />}
        onClick={() => {
          setOuvertures((nombre) => nombre + 1)
          setOuvert(true)
        }}
      >
        {TITRE}
      </Button>
      <Dialog ref={dialogue} open={ouvert} onClose={() => setOuvert(false)} title={TITRE} size="sm">
        <InviterQuelquUn key={ouvertures} equipes={equipes} rolesPermis={rolesPermis} equipeObligatoire={equipeObligatoire} />
      </Dialog>
    </>
  )
}
