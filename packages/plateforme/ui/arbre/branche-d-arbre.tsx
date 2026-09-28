"use client"

import { useId, useState, type ReactNode } from "react"
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight"

type BrancheDArbreProps = {
  titre: string
  /** La ligne rendue côté serveur : le lien de l'hôte y est déjà posé. */
  ligne: ReactNode
  ouverteParDefaut: boolean
  children: ReactNode
}

/**
 * Seul morceau client de l'arbre : l'état plié / déplié d'une branche. La bascule est le FRÈRE
 * du lien, jamais dedans — un bouton dans une ancre est du HTML invalide (repris de `RailTree`).
 */
export function BrancheDArbre({ titre, ligne, ouverteParDefaut, children }: BrancheDArbreProps) {
  const [ouverte, setOuverte] = useState(ouverteParDefaut)
  const idEnfants = useId()

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={ouverte}
          aria-controls={idEnfants}
          aria-label={`${ouverte ? "Replier" : "Déplier"} ${titre}`}
          onClick={() => setOuverte(!ouverte)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-mute hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <CaretRight aria-hidden="true" className={ouverte ? "size-4 rotate-90" : "size-4"} />
        </button>
        {ligne}
      </div>
      {/* `hidden` plutôt qu'un démontage : `aria-controls` doit pointer sur un élément qui existe. */}
      <ul id={idEnfants} hidden={!ouverte} className="pl-5">
        {children}
      </ul>
    </li>
  )
}
