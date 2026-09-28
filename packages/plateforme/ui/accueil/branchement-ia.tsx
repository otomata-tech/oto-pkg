"use client"

// L'aparté « Brancher un assistant » de l'accueil (E05-S09, partie b, AC-b1 ; HN-E05S09-3) : l'adresse du
// serveur de l'organisation, copiable, et l'état du branchement ; « Brancher » ouvre le dialogue, qui porte
// l'adresse et mène aux guides de `/connect`, l'adresse directe. Porté d'oto-frontend
// (`accueil/branchement-ia.tsx`). Repris : l'îlot et son en-tête, « Brancher » au bout de la bande et sans
// `data-reveal` (c'est le sujet de la carte), l'adresse lue entière, l'état sous l'adresse, le dialogue `sm`
// et sa ligne d'aide ; la règle en deux temps de son propriétaire, que la source manquante y laissait
// écrite : l'adresse sur la carte tant qu'aucun assistant n'est branché, dans le seul dialogue ensuite.
// Changé : l'état vient des dernières connexions de la personne (E02-S04) ; le tutoriel « Bientôt » est
// servi, les trois guides de `/connect` ; la copie est celle de `/connect` (`ValeurCopiable`, qui dit
// « Copié »). Retiré : « Mistral Vibe » (aucun guide), le libellé « Brancher votre IA » (le nom de l'écran).
import { useState } from "react"
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen"
import type { Resultat } from "../api/resultat"
import type { DerniereConnexion } from "../connexion/types"
import { ValeurCopiable } from "../connexion/valeur-copiable"
import { COMPTE } from "../coque/libelles"
import { Dialog } from "../ds/react/dialog"
import { AnimatedIcon } from "../ds/react/icon"
import { Island, IslandBody, IslandHead } from "../ds/react/island"
import { ObjectLink } from "../ds/react/object-link"
import { Button } from "../ds/react/primitives"
import { StatusDot } from "../ds/react/status-dot"
import { dateLisible } from "../format/dates"
import { useHote } from "../hote/navigation"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { BRANCHEMENT } from "./libelles"

type BranchementIAProps = {
  adresse: string
  connexions: Resultat<DerniereConnexion[]>
  /** L'adresse de `/connect` dans l'hôte : les guides pas à pas. */
  guides: string
}

/** Sous l'adresse, l'état : un point décoratif, le mot le porte (`accessibility-patterns.md § Couleurs & Contraste`). */
function EtatDuBranchement({ connexions }: Pick<BranchementIAProps, "connexions">) {
  if (connexions.error !== undefined) return <ErreurDeLecture message={connexions.error} />
  if (connexions.data.length === 0) {
    return (
      <p className="oto-caption flex items-center gap-2">
        <StatusDot state="rest" aria-hidden="true" />
        {BRANCHEMENT.aucun}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1">
      {connexions.data.map(({ famille, date }) => (
        <li key={famille} className="oto-caption flex items-center gap-2">
          <StatusDot state="ok" aria-hidden="true" />
          {BRANCHEMENT.derniere(famille, dateLisible(date) ?? "?")}
        </li>
      ))}
    </ul>
  )
}

/** La ligne d'aide du dialogue : les guides de `/connect`, par le lien de l'hôte. */
function LienDesGuides({ guides }: Pick<BranchementIAProps, "guides">) {
  const { Lien } = useHote()
  return (
    <ObjectLink
      as={Lien}
      href={guides}
      lead={<AnimatedIcon as={BookOpen} size="xs" />}
      name={BRANCHEMENT.guides}
      // `data-lead` seul ne lève pas le `nowrap` de la méta : sans lui, la liste des assistants se couperait.
      meta={<span className="whitespace-normal">{BRANCHEMENT.assistants}</span>}
    />
  )
}

export function BranchementIA({ adresse, connexions, guides }: BranchementIAProps) {
  const [ouverte, setOuverte] = useState(false)
  const fermer = () => setOuverte(false)
  // Une lecture en échec ne dit pas « branché » : l'adresse reste sur la carte.
  const branche = connexions.data !== undefined && connexions.data.length > 0
  return (
    <Island aria-label={COMPTE.brancher}>
      <IslandHead>
        <h2>{COMPTE.brancher}</h2>
        {/* `ms-auto` sur le `<span>`, jamais sur le bouton : le reset du design system, hors couche, remet à zéro la marge des contrôles. */}
        <span className="ms-auto">
          <Button variant="secondary" size="sm" onClick={() => setOuverte(true)}>
            {BRANCHEMENT.brancher}
          </Button>
        </span>
      </IslandHead>
      <IslandBody className="flex flex-col gap-2">
        {!branche && <ValeurCopiable valeur={adresse} cible={BRANCHEMENT.adresse} />}
        <EtatDuBranchement connexions={connexions} />
      </IslandBody>
      <Dialog
        open={ouverte}
        onClose={fermer}
        size="sm"
        closeLabel={BRANCHEMENT.fermer}
        title={COMPTE.brancher}
        footer={
          <Button variant="secondary" size="sm" onClick={fermer}>
            {BRANCHEMENT.fermer}
          </Button>
        }
      >
        <ValeurCopiable valeur={adresse} cible={BRANCHEMENT.adresse} />
        <LienDesGuides guides={guides} />
      </Dialog>
    </Island>
  )
}
