// Le widget routeur (story widgets-dans-la-conversation) : attend le résultat de l'outil, puis rend sa vue
// (`VueDuResultat`) ou rien. Quatre états : chargement (jamais terminal), données, vide, et l'erreur du délai,
// qui dit quoi demander dans la conversation (`mcp-patterns.md § 5.3`).
import { useEffect, useState } from "react"
import type { SourceDuResultat } from "./bridge"
import { VueDeChargement, VueDuDelai, VueDuResultat } from "./vues"

/** Au-delà, le chargement bascule sur l'erreur du délai. */
export const DELAI_MS = 12_000

type Resultat = Record<string, unknown>

export function Widget({ source }: { source: SourceDuResultat }) {
  const [resultat, setResultat] = useState<Resultat | null>(null)
  const [enRetard, setEnRetard] = useState(false)
  useEffect(() => source.ecouter(setResultat, (nuit) => document.documentElement.classList.toggle("dark", nuit)), [source])
  useEffect(() => {
    if (resultat) return
    const minuterie = window.setTimeout(() => setEnRetard(true), DELAI_MS)
    return () => window.clearTimeout(minuterie)
  }, [resultat])
  return (
    <>
      {resultat ? <VueDuResultat resultat={resultat} /> : !enRetard && <VueDeChargement />}
      <VueDuDelai enRetard={enRetard && !resultat} />
    </>
  )
}
