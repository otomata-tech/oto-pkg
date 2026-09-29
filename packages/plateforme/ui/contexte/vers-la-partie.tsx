"use client"
// La partie que nomme l'adresse (`/context#<ancre>`), amenée à l'écran une fois la vue « Contexte » montée
// (E05-S12, AC-8 ; E05-S11, AC-11). La vue arrive en flux, sous le `<Suspense>` de la page : quand le routeur de
// l'hôte cherche l'ancre, la partie n'existe pas encore, et le contenu reste en haut. Sans cet îlot, une ligne de
// l'encart d'un Contexte ouvre la vue, mais pas sur sa partie dès qu'elle est sous la ligne de flottaison.
// E11-S10 (AC-f6) : l'ancre est suivie aussi quand elle change (`hashchange`, la vue déjà ouverte) ; une ancre
// sans partie amène le haut de la vue (`haut`). Ne rend rien.
import { useEffect } from "react"

export function VersLaPartie({ haut }: { haut: string }) {
  useEffect(() => {
    const amener = () => {
      // Les ancres des parties sont en ASCII (`ancreDeLaPartie`) : rien à décoder, et un `%` isolé ne lève pas.
      const ancre = window.location.hash.slice(1)
      const cible = (ancre && document.getElementById(ancre)) || document.getElementById(haut)
      cible?.scrollIntoView({ block: "start" })
    }
    // Au montage, une adresse sans ancre laisse la vue où le navigateur l'a ouverte.
    if (window.location.hash.length > 1) amener()
    window.addEventListener("hashchange", amener)
    return () => window.removeEventListener("hashchange", amener)
  }, [haut])
  return null
}
