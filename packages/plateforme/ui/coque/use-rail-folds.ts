"use client"

// Porté d'oto-frontend (src/components/coque/use-rail-folds.ts et src/hooks/use-preference-locale.ts) :
// les sections repliées du rail, une préférence de CE navigateur (ni l'adresse, ni le serveur) ; le
// stockage porte les sections REPLIÉES, jamais les dépliées, pour qu'une clé absente donne un rail
// complet ; un stockage refusé (navigation privée) garde le défaut. Changé : la préférence se lit après
// le montage, le rendu du serveur et l'hydratation s'accordent (portage-ecrans.md § 2) ; un seul hook.
import { useCallback, useEffect, useState } from "react"

const CLE_DE_STOCKAGE = "oto-rail-plis"
const SEPARATEUR = "\n"

function lire(): string[] {
  try {
    return (window.localStorage.getItem(CLE_DE_STOCKAGE) ?? "").split(SEPARATEUR).filter(Boolean)
  } catch {
    // Stockage indisponible : aucune section repliée pour cette session.
    return []
  }
}

function ecrire(sections: string[]): void {
  try {
    window.localStorage.setItem(CLE_DE_STOCKAGE, sections.join(SEPARATEUR))
  } catch {
    // Le pli vaut pour la session en cours ; il ne survivra simplement pas au rechargement.
  }
}

export type RailFolds = {
  /** Vrai quand la section est repliée ; une section inconnue du stockage est dépliée. */
  isFolded: (section: string) => boolean
  /** Replie ce qui est déplié, déplie ce qui est replié, et l'écrit. */
  toggle: (section: string) => void
}

export function useRailFolds(): RailFolds {
  const [repliees, setRepliees] = useState<string[]>([])

  useEffect(() => {
    setRepliees(lire())
  }, [])

  const toggle = useCallback((section: string) => {
    setRepliees((avant) => {
      const suivantes = avant.includes(section) ? avant.filter((une) => une !== section) : [...avant, section]
      ecrire(suivantes)
      return suivantes
    })
  }, [])

  return { isFolded: (section) => repliees.includes(section), toggle }
}
