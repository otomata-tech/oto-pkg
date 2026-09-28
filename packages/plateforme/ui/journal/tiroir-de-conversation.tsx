"use client"

// Le tiroir d'une conversation du journal (E05-S09, partie d1). Porté d'oto-frontend (`fiche-dun-appel.tsx`,
// `timeline-dun-deroule.tsx`) : le `Drawer` du design system, un `<dialog>` natif (piège de focus, Échap,
// inertie du fond, le focus rendu au déclencheur à la fermeture), ouvert par l'adresse, jamais par un état
// qui ne survivrait pas au rechargement. Changé : le contenu est rendu par la page (Server Component) ; fermer
// ouvre l'adresse sans la conversation (`useHote().naviguer`) et referme le tiroir sans attendre la relecture.
import { useState, type ReactNode } from "react"
import { Drawer } from "../ds/react/drawer"
import { useHote } from "../hote/navigation"

type TiroirDeConversationProps = { titre: string; fermer: string; children: ReactNode }

export function TiroirDeConversation({ titre, fermer, children }: TiroirDeConversationProps) {
  const { naviguer } = useHote()
  const [ouvert, setOuvert] = useState(true)
  return (
    <Drawer
      open={ouvert}
      onClose={() => {
        setOuvert(false)
        naviguer(fermer)
      }}
      side="right"
      title={titre}
      closeLabel="Fermer le détail"
    >
      {children}
    </Drawer>
  )
}
