"use client"

// Le repli du focus après un geste qui emporte son déclencheur (E05-S09, partie d1 ;
// `accessibility-patterns.md § Focus Management`) : une ligne retirée, un menu qui part avec un rôle, un
// bouton « Ajouter » qui change de liste. La relecture arrive après la réponse, et le déclencheur part avec
// elle : c'est quand la donnée relue est rendue que le focus, tombé sur `<body>` ou sur un élément retiré, va
// à l'ancre (un conteneur en `tabIndex={-1}`), par la règle commune `replierLeFocusSur`. Porté d'oto-frontend
// (`member-actions.tsx`, `onLigneRetiree` ; `team-people-dialog.tsx`, `replierLeFocus`), qui le faisaient au
// succès de la mutation ; ici au rendu de la relecture, qui seul sait que le déclencheur est parti. Un focus
// posé ailleurs par la personne y reste.
import { useEffect, useRef } from "react"
import { replierLeFocusSur } from "../components/focus"

/** Rend le geste à appeler après un succès ; `releve` est la donnée que la relecture remplace. */
export function useRepliDuFocus(ancre: string, releve: unknown): () => void {
  const apresUnDepart = useRef(false)
  useEffect(() => {
    if (!apresUnDepart.current) return
    apresUnDepart.current = false
    // Aucun geste à inspecter : son déclencheur est déjà parti avec la relecture.
    replierLeFocusSur(ancre, null)
  }, [ancre, releve])
  return () => {
    apresUnDepart.current = true
  }
}
