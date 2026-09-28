"use client"
// La partie que nomme l'adresse (`/?onglet=contexte#<ancre>`), amenée à l'écran une fois la vue « Contexte » montée
// (E05-S12, AC-8 ; E05-S11, AC-11). La vue arrive en flux, sous le `<Suspense>` de la page : quand le routeur de
// l'hôte cherche l'ancre, la partie n'existe pas encore, et le contenu reste en haut. Sans cet îlot, une ligne de
// l'encart d'un Contexte ouvre la vue, mais pas sur sa partie dès qu'elle est sous la ligne de flottaison.
// Ne rend rien.
import { useEffect } from "react"

export function VersLaPartie() {
  useEffect(() => {
    // Les ancres des parties sont en ASCII (`ancreDeLaPartie`) : rien à décoder, et un `%` isolé ne lève pas.
    const ancre = window.location.hash.slice(1)
    if (ancre) document.getElementById(ancre)?.scrollIntoView({ block: "start" })
  }, [])
  return null
}
