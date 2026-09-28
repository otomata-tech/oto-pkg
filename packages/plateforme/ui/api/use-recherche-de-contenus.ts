"use client"

// La recherche des contenus que la personne peut lire, par le service de l'outil `find`
// (`GET /api/plateforme/search`) : une seule lecture pour la palette ⌘K (`coque/palette-de-recherche.tsx`) et
// pour « @ » dans un bloc (E05-S10, AC-a9, `noeud/editeur/citer.tsx`). Sans lui, les deux écrans refont la
// même requête, la même pause de frappe et le même rejet d'une réponse dépassée (`coding-standards.md § DRY`).
import { useRef, useState } from "react"
import { SEARCH_QUERY_MAX, type SearchMatch } from "../../schemas/search"
import { appelerPlateforme } from "./client"

/** `plus` : les contenus trouvés au-delà de ceux servis (`more`). */
export type RechercheDeContenus = { etat: "repos" } | { etat: "en-cours" } | { etat: "lue"; trouves: SearchMatch[]; plus: number } | { etat: "en-panne" }

/** Une recherche part après une courte pause de frappe, et à partir de deux caractères. */
const PAUSE_MS = 250
const CARACTERES_MIN = 2

/** Une requête après la pause de frappe ; une réponse dépassée est ignorée ; moins de deux caractères, le repos. */
export function useRechercheDeContenus() {
  const [resultat, setResultat] = useState<RechercheDeContenus>({ etat: "repos" })
  const minuterie = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const derniere = useRef("")

  function chercher(saisie: string) {
    clearTimeout(minuterie.current)
    const q = saisie.trim().slice(0, SEARCH_QUERY_MAX)
    derniere.current = q
    if (q.length < CARACTERES_MIN) return setResultat({ etat: "repos" })
    setResultat({ etat: "en-cours" })
    minuterie.current = setTimeout(() => {
      void appelerPlateforme<{ matches: SearchMatch[]; more: number }>({ methode: "GET", ressource: `search?q=${encodeURIComponent(q)}` }).then((reponse) => {
        if (derniere.current !== q) return
        setResultat(reponse.erreur ? { etat: "en-panne" } : { etat: "lue", trouves: reponse.data.matches, plus: reponse.data.more })
      })
    }, PAUSE_MS)
  }

  return { resultat, chercher }
}
