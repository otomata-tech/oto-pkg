"use client"

// Un geste de l'écran des équipes vers l'API du paquet (E05-S09, partie d1) : l'envoi, la phrase d'un refus
// (`messageDErreur`, jamais le texte du service), et, après un succès, la relecture de la page par l'hôte.
// Porté d'oto-frontend (`member-actions.tsx`, `useBascule` et les mutations de `queries/members.ts`) ; changé :
// TanStack Query devient l'appel à `/api/plateforme/*` et la relecture (`useRafraichir`). Sans lui, chaque
// menu et chaque dialogue de l'écran redisait ce même envoi.
import { useState, useTransition } from "react"
import { appelerPlateforme, type ErreurPlateforme } from "../api/client"
import { messageDErreur, type MessagesDuGeste } from "../api/messages"
import { useRafraichir } from "../hote/rafraichir"

export type Requete = { methode: "POST" | "PATCH" | "DELETE"; ressource: string; corps?: unknown }

type Suites = {
  /** Ce qui se passe avant la relecture qui suit un succès (le repli du focus, un dialogue refermé). */
  succes?: () => void
  /** Ce qui se passe à un refus, sa phrase en main (un dialogue d'échec ouvert). */
  refus?: (message: string, erreur: ErreurPlateforme) => void
}

export function useGeste() {
  const rafraichir = useRafraichir()
  const [erreur, setErreur] = useState("")
  const [enCours, demarrer] = useTransition()

  const envoyer = (requete: Requete, messages?: MessagesDuGeste, suites: Suites = {}) => {
    setErreur("")
    demarrer(async () => {
      const reponse = await appelerPlateforme(requete)
      if (reponse.erreur) {
        const message = messageDErreur(reponse.erreur, messages)
        if (suites.refus) suites.refus(message, reponse.erreur)
        else setErreur(message)
        return
      }
      suites.succes?.()
      rafraichir()
    })
  }

  return { erreur, enCours, envoyer, relire: rafraichir }
}
