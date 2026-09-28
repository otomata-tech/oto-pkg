"use client"

// Le nœud ouvert, pour la ligne courante du rail (E05-S10, partie b2, AC-b12 ; décision de JB du 2026-09-28) :
// après un renommage, l'adresse du navigateur garde l'ancien chemin, un alias qui mène toujours au contenu, tant
// que la personne reste sur la page (la réécrire sur place remontait toute la page sous Next 15, focus et frappes
// perdus) ; la prochaine ouverture montre la nouvelle. La page du nœud annonce son chemin actuel, relu à chaque
// relecture (`NoeudOuvert`, monté par l'en-tête) ; le rail lit l'adresse courante par `useAdresseCourante` : à
// l'adresse annoncée, celle du chemin actuel. Rail et page sont frères chez l'hôte : l'annonce passe par ce
// module, que l'hôte n'a pas à monter. Sans lui, un contenu renommé n'est plus la ligne courante du rail.
import { useEffect, useSyncExternalStore } from "react"
import { useHote } from "../hote/navigation"

type Annonce = { adresse: string; chemin: string }

let annonce: Annonce | null = null
const abonnes = new Set<() => void>()

function poser(suivante: Annonce | null) {
  annonce = suivante
  for (const abonne of abonnes) abonne()
}

function abonner(abonne: () => void) {
  abonnes.add(abonne)
  return () => {
    abonnes.delete(abonne)
  }
}

/** Annonce le chemin actuel du nœud ouvert à l'adresse courante de l'hôte ; ne rend rien. */
export function NoeudOuvert({ chemin }: { chemin: string }) {
  const { chemin: adresse } = useHote()
  useEffect(() => {
    // Sans hôte, aucune adresse courante : rien à reconnaître.
    if (adresse === "") return
    const ici = { adresse, chemin }
    poser(ici)
    return () => {
      if (annonce === ici) poser(null)
    }
  }, [adresse, chemin])
  return null
}

/**
 * L'adresse courante pour le rail : celle de l'hôte, sauf quand la page ouverte y a annoncé son chemin actuel
 * (un alias après un renommage ou un déplacement) : l'adresse de ce chemin sous `prefixe`. Au rendu serveur et
 * à l'hydratation, celle de l'hôte.
 */
export function useAdresseCourante(prefixe: string): string {
  const { chemin: adresse } = useHote()
  const lue = useSyncExternalStore(
    abonner,
    () => annonce,
    () => null,
  )
  return lue !== null && lue.adresse === adresse ? `${prefixe}${lue.chemin}` : adresse
}
