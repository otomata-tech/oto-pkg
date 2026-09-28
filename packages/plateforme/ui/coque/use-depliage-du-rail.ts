"use client"

// Les branches ouvertes de l'arbre du rail (E05-S10, partie b, AC-b2) : un clic sur un nœud qui a des
// sous-nœuds l'ouvre (sa page) ET le déplie ; les ancêtres de la page ouverte se déplient à chaque
// navigation, d'où qu'elle vienne (fil, palette, lien dans un bloc) ; la bascule garde son geste. Sans lui,
// une branche ne se dépliait qu'au montage du rail (`defaultExpanded`), jamais au clic sur son nom.
import { createContext, useCallback, useContext, useState } from "react"

/** Les chemins des ancêtres d'un chemin : `a/b/c` → `a`, `a/b`. */
function ancetres(chemin: string | null): string[] {
  if (!chemin) return []
  const segments = chemin.split("/")
  return segments.slice(0, -1).map((_segment, rang) => segments.slice(0, rang + 1).join("/"))
}

/** Le chemin d'un nœud dans une adresse de l'hôte, sous le préfixe de ses pages ; `null` hors de l'arbre. */
function cheminDans(adresse: string, prefixe: string): string | null {
  if (!adresse.startsWith(prefixe)) return null
  const chemin = adresse.slice(prefixe.length).split(/[?#]/)[0]
  return chemin === "" ? null : chemin
}

export type DepliageDuRail = {
  /** Les branches ouvertes, par chemin. */
  ouverts: ReadonlySet<string>
  /** La bascule d'une branche (son chevron). */
  basculer: (chemin: string, ouvert: boolean) => void
  /** Le clic sur le nom d'une ligne, par son adresse : sa branche s'ouvre. */
  deplier: (adresse: string) => void
}

export function useDepliageDuRail(adresseCourante: string, prefixe: string): DepliageDuRail {
  const courant = cheminDans(adresseCourante, prefixe)
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(() => new Set(ancetres(courant)))
  const [vu, setVu] = useState(courant)
  // Une navigation : les ancêtres de la page ouverte se déplient, ce qui était ouvert le reste.
  if (vu !== courant) {
    setVu(courant)
    setOuverts((avant) => new Set([...avant, ...ancetres(courant)]))
  }
  const basculer = useCallback((chemin: string, ouvert: boolean) => {
    setOuverts((avant) => {
      const suivants = new Set(avant)
      if (ouvert) suivants.add(chemin)
      else suivants.delete(chemin)
      return suivants
    })
  }, [])
  const deplier = useCallback(
    (adresse: string) => {
      const chemin = cheminDans(adresse, prefixe)
      if (chemin) setOuverts((avant) => (avant.has(chemin) ? avant : new Set([...avant, chemin])))
    },
    [prefixe],
  )
  return { ouverts, basculer, deplier }
}

/** Le dépliage au clic, que lit la ligne du rail (`LigneDuRail`) ; hors de l'arbre (Accueil), rien. */
export const DeplierAuClic = createContext<((adresse: string) => void) | null>(null)

export const useDeplierAuClic = () => useContext(DeplierAuClic)
