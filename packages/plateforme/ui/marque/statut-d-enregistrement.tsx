"use client"

// Le statut de l'écran de marque (E09-S01, AC7). « Marque enregistrée. » arrive avec le rechargement
// qui suit un enregistrement, donc dans le HTML du serveur ; or une région `role="status"` n'annonce
// que ce qui change après son montage. Le message ne s'écrit donc qu'une fois l'écran hydraté :
// instantané vide pour le serveur et l'hydratation, puis celui du client.
import { useSyncExternalStore } from "react"

const aucunAbonnement = () => () => {}

export function StatutDEnregistrement({ message }: { message: string }) {
  const hydrate = useSyncExternalStore(aucunAbonnement, () => true, () => false)
  return (
    <div role="status" className="oto-caption">
      {hydrate ? message : ""}
    </div>
  )
}
