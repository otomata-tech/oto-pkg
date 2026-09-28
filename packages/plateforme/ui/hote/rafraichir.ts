"use client"

// Relire la page après une mutation (E05-S03, AC3, HN-E05S03-1) : l'hôte fournit sa relecture
// (`router.refresh()` dans Next), `ui/` n'importe aucun routeur (ADR-008 § 2). Sans fournisseur (un
// hôte qui ne le pose pas), la page se recharge : plus lent, jamais faux.
import { createContext, useContext } from "react"

export const ContexteDeRafraichissement = createContext<() => void>(() => window.location.reload())

export function useRafraichir(): () => void {
  return useContext(ContexteDeRafraichissement)
}
