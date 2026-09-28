"use client"

// L'îlot d'un écran d'authentification : tête, corps, pied. Client pour une seule raison, la cible de
// repli du focus : quand un statut paraît (« un lien vient de partir »), il s'écrit dans la région montée
// d'emblée et le focus va au titre. Le bouton qui l'a déclenché, désactivé pendant l'envoi ou retiré avec
// le formulaire, a pu perdre le focus : sans cible, il repartirait sur `<body>`.
//
// Porté d'oto-frontend (`src/components/auth/auth-page.tsx`, l'îlot) : `Island` nommé par son titre,
// `IslandHead` et son `h2` en `tabIndex={-1}`, focalisé à l'arrivée d'un statut sur une dépendance
// booléenne, `IslandBody` ouvert par la région `role="status"` montée vide, `IslandFoot` pour l'action.
// Changé : le statut est un texte, dit dans un `Alert` du design system dont il est le titre (encre :
// la description y est en `--mute`, 4,39:1 sur le vert du succès en Manuscrit, la nuit) ; le pied range
// ses gestes en colonne, pleine largeur (un formulaire de l'hôte y porte son bouton).

import { useEffect, useRef, type ReactNode } from "react"
import { Island, IslandBody, IslandFoot, IslandHead } from "../ds/react/island"
import { Alert } from "../ds/react/primitives"

type IlotDAuthentificationProps = {
  /** Le titre de l'écran, en `h2` : le `h1` est le produit (`EcranDAuthentification`). */
  titre: string
  /** Ce qui s'annonce (un succès) : écrit dans la région montée d'emblée, et nulle part ailleurs. */
  statut?: string
  /** Le pied : l'action de l'écran, pleine largeur. Sans lui, aucun `<footer>`. */
  pied?: ReactNode
  children: ReactNode
}

export function IlotDAuthentification({ titre, statut, pied, children }: IlotDAuthentificationProps) {
  const refDuTitre = useRef<HTMLHeadingElement>(null)

  // Un booléen en dépendance, jamais le texte : le focus revient au titre quand un statut paraît,
  // puis reste où la personne le met.
  const annonce = Boolean(statut)
  useEffect(() => {
    if (annonce) refDuTitre.current?.focus()
  }, [annonce])

  return (
    <Island aria-label={titre}>
      <IslandHead>
        {/* `-1`, jamais un `tabIndex` positif : atteignable par script, hors de l'ordre de tabulation. */}
        <h2 ref={refDuTitre} tabIndex={-1}>
          {titre}
        </h2>
      </IslandHead>
      <IslandBody>
        {/* Montée vide, toujours : une région montée avec son message n'est pas annoncée. Vide, elle ne
            prend aucune place (le corps d'îlot n'est pas une pile à gouttière) ; le message s'y écrit, et
            nulle part ailleurs ; l'`Alert` n'y est pas une seconde région (`role="none"`, M31). */}
        <div role="status">{statut ? <Alert role="none" tone="ok" title={statut} className="mb-3" /> : null}</div>
        {children}
      </IslandBody>
      {pied !== undefined && (
        <IslandFoot>
          <div className="flex w-full flex-col gap-2">{pied}</div>
        </IslandFoot>
      )}
    </Island>
  )
}
