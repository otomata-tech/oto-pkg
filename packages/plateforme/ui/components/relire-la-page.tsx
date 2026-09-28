"use client"

// « Réessayer » d'une lecture en échec qui n'a ni lien ni adresse de l'hôte (l'accueil) : un bouton du
// design system qui relit la page (`useRafraichir`, `router.refresh()` dans Next). Client : seul ce bouton
// a un gestionnaire ; `ErreurDeLecture` reste un Server Component.
import { Button } from "../ds/react/primitives"
import { useRafraichir } from "../hote/rafraichir"

export function RelireLaPage({ children }: { children: string }) {
  const rafraichir = useRafraichir()
  return (
    <Button variant="secondary" onClick={rafraichir}>
      {children}
    </Button>
  )
}
