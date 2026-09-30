"use client"

// Relire la page après une mutation (E05-S03, AC3, HN-E05S03-1) : l'hôte fournit sa relecture
// (`router.refresh()` dans Next), `ui/` n'importe aucun routeur (ADR-008 § 2). Sans fournisseur (un
// hôte qui ne le pose pas), la page se recharge : plus lent, jamais faux.
// E11-S20 (AC-5, HN-E11S20-1) : chaque relecture de la page, qui suit chaque geste, demande aussi au rail de relire
// son arbre ; sans rail monté, rien ne part.
import { createContext, useCallback, useContext } from "react"
import { relireLeRail } from "../coque/use-arbre-du-rail"

export const ContexteDeRafraichissement = createContext<() => void>(() => window.location.reload())

export function useRafraichir(): () => void {
  const relireLaPage = useContext(ContexteDeRafraichissement)
  return useCallback(() => {
    relireLaPage()
    relireLeRail()
  }, [relireLaPage])
}
