"use client"

// Le menu « ⋯ » d'une ligne du tableau des personnes (E05-S03, AC6 à AC9, AC13 ; porté par E05-S09 partie d1).
// Porté d'oto-frontend (`member-actions.tsx`, `MemberMenu`) : un déclencheur nommé « Gérer <personne> », le
// groupe « Ses équipes » que partagent le « + » et le « ⋯ », « Annuler l'invitation » sur une ligne invitée
// et « Retirer de … » sur les autres, chacun confirmé par un dialogue, puis l'échec dit par un second ;
// l'échec d'un choix de menu dit sous le déclencheur. Changé : le rôle, que l'écran d'aujourd'hui règle,
// devient un groupe de choix exclusifs du menu (administrateur seul ; plus d'équipe par défaut, E05-S13
// AC-26) ; « Retirer » sur sa propre ligne pour l'administrateur (sa question dit
// qu'il perd l'accès) ; l'annulation d'une invitation par l'administrateur ou par qui l'a envoyée
// (E02-S01). Retiré : « Quitter l'entreprise… » (aucun départ volontaire dans la plateforme).
import { useState } from "react"
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree"
import { UserMinus } from "@phosphor-icons/react/dist/csr/UserMinus"
import { XCircle } from "@phosphor-icons/react/dist/csr/XCircle"
import { updateMemberSchema } from "../../schemas"
import { AnimatedIcon } from "../ds/react/icon"
import { DropdownMenu, type MenuItem } from "../ds/react/overlays"
import { IconButton } from "../ds/react/primitives"
import { DialogueDAnnulation, DialogueDEchec, DialogueDeRetrait } from "./dialogues-des-personnes"
import { EchecDuGeste, equipesComposables, itemsDeSesEquipes, useBascule, type EquipeProposee } from "./equipes-d-une-personne"
import { useGeste } from "./gestes"
import { refusDuDernierAdministrateur, ROLES } from "./libelles"
import type { LigneDeMembre, LigneDInvitation } from "./lignes-des-personnes"
import type { Moi } from "./types"

type MenuProps = { ligne: LigneDeMembre; moi: Moi; nomOrganisation: string; toutes: readonly EquipeProposee[] | null; apresUnDepart: () => void }

/**
 * Le déclencheur du menu d'une ligne, nommé : vingt lignes annonceraient sinon vingt boutons identiques. Un
 * élément et non un composant : le menu pose sa ref et ses gestionnaires sur l'élément qu'il reçoit.
 */
function declencheur(nom: string) {
  return (
    <IconButton label={`Gérer ${nom}`} variant="ghost" size="sm">
      <AnimatedIcon as={DotsThree} size="xs" />
    </IconButton>
  )
}

/** Le groupe « Rôle », choix exclusifs réservés à l'administrateur (AC7). */
function itemsDeReglages(ligne: LigneDeMembre, regler: (role: "admin" | "member") => void): MenuItem[] {
  return [
    { group: "Rôle" },
    ...(["admin", "member"] as const).map((role) => ({ label: ROLES[role], radio: true, checked: ligne.role === role, onSelect: () => regler(role) })),
  ]
}

export function MenuDUnMembre({ ligne, moi, nomOrganisation, toutes, apresUnDepart }: MenuProps) {
  const bascule = useBascule(ligne)
  const reglage = useGeste()
  const retrait = useGeste()
  const [aRetirer, setARetirer] = useState(false)
  const [echec, setEchec] = useState("")
  const composables = equipesComposables(toutes, moi)
  const messages = refusDuDernierAdministrateur(nomOrganisation)

  const regler = (role: "admin" | "member") => {
    // Le choix déjà servi ne change rien : aucune requête.
    if (role === ligne.role) return
    const saisie = updateMemberSchema.safeParse({ role })
    if (!saisie.success) return
    // Un administrateur qui se rétrograde perd ce menu à la relecture : le focus va au tableau.
    const depart = ligne.soi && saisie.data.role === "member"
    reglage.envoyer({ methode: "PATCH", ressource: `members/${ligne.id}`, corps: saisie.data }, messages, { succes: depart ? apresUnDepart : undefined })
  }
  const retirer = () => {
    setARetirer(false)
    retrait.envoyer({ methode: "DELETE", ressource: `members/${ligne.id}` }, messages, { succes: apresUnDepart, refus: setEchec })
  }

  const items: MenuItem[] = [
    ...(moi.estAdmin ? itemsDeReglages(ligne, regler) : []),
    ...(composables.length > 0 ? itemsDeSesEquipes(ligne, composables, bascule.basculer, bascule.enCours) : []),
    ...(moi.estAdmin
      ? [{ separator: true }, { label: `Retirer de ${nomOrganisation}`, icon: <AnimatedIcon as={UserMinus} size="xs" />, destructive: true, onSelect: () => setARetirer(true) }]
      : []),
  ]
  if (items.length === 0) return null
  return (
    <>
      <span className="flex flex-col items-end">
        <DropdownMenu align="end" trigger={declencheur(ligne.nom)} items={items} />
        <EchecDuGeste erreur={reglage.erreur || bascule.erreur} />
      </span>
      <DialogueDeRetrait nom={ligne.nom} soi={ligne.soi} nomOrganisation={nomOrganisation} open={aRetirer} onRenoncer={() => setARetirer(false)} onConfirmer={retirer} />
      <DialogueDEchec titre={`Retirer ${ligne.nom} de ${nomOrganisation}`} message={echec} onFermer={() => setEchec("")} />
    </>
  )
}

type MenuDInvitationProps = { ligne: LigneDInvitation; nomOrganisation: string; apresUnDepart: () => void }

/** « Annuler l'invitation », pour l'administrateur ou qui l'a envoyée (AC6) ; une invitation déjà partie se dit, puis la page se relit. */
export function MenuDUneInvitation({ ligne, nomOrganisation, apresUnDepart }: MenuDInvitationProps) {
  const annulation = useGeste()
  const [aAnnuler, setAAnnuler] = useState(false)
  const [echec, setEchec] = useState<{ message: string; partie: boolean }>({ message: "", partie: false })

  const annuler = () => {
    setAAnnuler(false)
    annulation.envoyer(
      { methode: "DELETE", ressource: `invitations/${ligne.id}` },
      { not_found: "Cette invitation n'est plus en attente : elle a été acceptée ou annulée." },
      { succes: apresUnDepart, refus: (message, erreur) => setEchec({ message, partie: erreur.code === "not_found" }) },
    )
  }
  const fermerLEchec = () => {
    const partie = echec.partie
    setEchec({ message: "", partie: false })
    if (partie) annulation.relire()
  }

  if (!ligne.annulable) return null
  const items: MenuItem[] = [{ label: "Annuler l'invitation", icon: <AnimatedIcon as={XCircle} size="xs" />, destructive: true, onSelect: () => setAAnnuler(true) }]
  return (
    <>
      <DropdownMenu align="end" trigger={declencheur(ligne.email)} items={items} />
      <DialogueDAnnulation email={ligne.email} nomOrganisation={nomOrganisation} open={aAnnuler} onRenoncer={() => setAAnnuler(false)} onConfirmer={annuler} />
      <DialogueDEchec titre={`Annuler l'invitation de ${ligne.email}`} message={echec.message} onFermer={fermerLEchec} />
    </>
  )
}
