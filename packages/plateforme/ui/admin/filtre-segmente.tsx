"use client"

// Porté d'oto-frontend (src/components/monitoring/fenetre-du-suivi.tsx) : un choix parmi n qui règle
// l'écran — la fenêtre de 7, 30 ou 90 jours, l'état ou le type des retours — par le `SegmentedControl` du
// design system, celui qui FILTRE ; la valeur vit dans l'adresse, jamais dans un état
// (`state-management.md`), pour qu'un lien dise ce qu'on regarde. Changé : chaque choix porte son adresse,
// construite par l'hôte, et la navigation est la sienne (`useHote`) : un `push`, là où oto-frontend
// remplaçait l'entrée d'historique (l'hôte ne prête que le premier).
import { SegmentedControl, type Segment } from "../ds/react/segmented-control"
import { useHote } from "../hote/navigation"

export type ChoixDuFiltre = { valeur: string; libelle: string; adresse: string }

type FiltreSegmenteProps = {
  /** Le nom du groupe de choix, lu par un lecteur d'écran (« La période observée »). */
  libelle: string
  choix: readonly ChoixDuFiltre[]
  valeur: string
}

/** Les segments du design system, tirés des choix : leur valeur et leur libellé. */
function segmentsDe(choix: readonly ChoixDuFiltre[]): Segment[] {
  return choix.map(({ valeur, libelle }) => ({ value: valeur, label: libelle }))
}

export function FiltreSegmente({ libelle, choix, valeur }: FiltreSegmenteProps) {
  const { naviguer } = useHote()
  return (
    <SegmentedControl
      label={libelle}
      options={segmentsDe(choix)}
      value={valeur}
      onChange={(choisie) => {
        const cible = choix.find((candidat) => candidat.valeur === choisie)
        if (cible) naviguer(cible.adresse)
      }}
    />
  )
}
