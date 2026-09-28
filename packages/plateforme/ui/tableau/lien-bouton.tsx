// Un lien de l'hôte habillé en bouton du design system (E05-S09 partie c2) : « Réessayer », « Charger plus »,
// « Retirer les filtres », l'action d'un vide. Un bouton qui navigue casserait le clic milieu et l'ouverture
// dans un onglet. Server Component, interne au tableau.
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"

export function LienBouton({ Lien, href, variante, children }: { Lien: LienDeLHote; href: string; variante: "secondary" | "ghost"; children: string }) {
  return (
    <Lien href={href} className="oto-btn" data-variant={variante} data-size="sm">
      {children}
    </Lien>
  )
}
