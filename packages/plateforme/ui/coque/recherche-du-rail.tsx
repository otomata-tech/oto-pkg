"use client"

// Porté d'oto-frontend (src/components/coque/rail-application.tsx : `RailSearch` et `PaletteDeRecherche`,
// montés ensemble) : « Rechercher » et ⌘K ouvrent la même palette, montée une fois. Exporté seul pour une
// barre latérale d'ERP (ADR-008 point 7, AC-a8).
import { useState } from "react"
import type { TreeNode } from "../../schemas"
import { sectionsDeLArbre } from "../arbre/depuis-l-arbre"
import { RailSearch } from "../ds/react/rail"
import { ecransPermis } from "./ecrans"
import { PaletteDeRecherche } from "./palette-de-recherche"
import type { AdressesDuRail, EquipeDuRail } from "./types"

export type RechercheDuRailProps = {
  /** L'arbre et ses équipes, dont la palette cherche les titres ; `null` quand leur lecture a échoué. */
  arbre: { tree: TreeNode[]; equipes: EquipeDuRail[] } | null
  handle: string | null
  adresses: AdressesDuRail
  administre: boolean
}

export function RechercheDuRail({ arbre, handle, adresses, administre }: RechercheDuRailProps) {
  const [ouverte, setOuverte] = useState(false)
  const sections = arbre ? sectionsDeLArbre(arbre.tree, arbre.equipes, handle) : null
  return (
    <>
      <RailSearch onOpen={() => setOuverte(true)} />
      <PaletteDeRecherche open={ouverte} onClose={() => setOuverte(false)} ecrans={ecransPermis(adresses, administre)} sections={sections} prefixe={adresses.pages} />
    </>
  )
}
