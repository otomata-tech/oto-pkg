"use client"

// Le titre du panneau des règles d'un nœud, ancre du focus de ses gestes (E05-S03). « Retirer »
// (`ActionPlateforme`) y replie le focus avant la relecture, sans en connaître l'issue : si la règle
// retirée donnait la lecture à qui regarde, la relecture remplace le panneau entier, titre compris,
// par l'alerte « introuvable », sous le même identifiant. Le titre qui part avec le focus le passe à
// cette alerte ; sans lui, le focus tombait sur `<body>` (revue de M13a). Au titre de carte du design system
// porté depuis E05-S09 (partie d1) ; son anneau de focus est celui du design system.
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { replierLeFocusSur } from "../components/focus"

export function TitreDuPanneau({ id, children }: { id: string; children: ReactNode }) {
  const titre = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    const element = titre.current
    // Nettoyé avant que React retire le titre : le focus y est encore. L'élément qui le remplace n'est
    // posé qu'après ce nettoyage : le focus l'y rejoint une fois la relecture posée. Un titre qui part
    // sans le focus (démontage simulé du mode strict, changement d'onglet) ne le déplace pas.
    return () => {
      if (element !== null && document.activeElement === element) queueMicrotask(() => replierLeFocusSur(id, null))
    }
  }, [id])

  return (
    <h2 ref={titre} id={id} tabIndex={-1} className="oto-card-title">
      {children}
    </h2>
  )
}
