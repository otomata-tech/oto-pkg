"use client"

// La période du journal, 7, 30 ou 90 jours, dans l'en-tête de l'écran (E05-S05, AC4 ; portée par E05-S09
// partie d1). Portée d'oto-frontend (`fenetre-du-suivi.tsx`) : un `SegmentedControl`, qui FILTRE, trois
// valeurs qui se montrent au lieu de se déplier, tirées de la seule liste des périodes ; la période vit dans
// l'adresse, jamais dans un état local ; la valeur rendue par le design system est ramenée dans la liste
// par une garde (`find`), jamais un `Number()` nu. Changé : choisir une période ouvre l'adresse que la page
// lui a calculée (`useHote().naviguer`), filtres gardés, suite de la liste oubliée.
import { SegmentedControl } from "../ds/react/segmented-control"
import { useHote } from "../hote/navigation"

type Periode = { valeur: string; libelle: string; href: string }

/** Les segments du contrôle : une valeur et son libellé par période. */
const segments = (periodes: Periode[]) => periodes.map((periode) => ({ value: periode.valeur, label: periode.libelle }))

export function PeriodeDuJournal({ periodes, valeur }: { periodes: Periode[]; valeur: string }) {
  const { naviguer } = useHote()
  return (
    <SegmentedControl
      label="La période observée"
      options={segments(periodes)}
      value={valeur}
      onChange={(choisie) => {
        const periode = periodes.find((candidate) => candidate.valeur === choisie)
        if (periode && periode.valeur !== valeur) naviguer(periode.href)
      }}
    />
  )
}
