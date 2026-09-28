"use client"

// La barre d'outils du tableau (E07-S03, AC5), collée à l'en-tête de la table : « Chercher dans <n> lignes »,
// un champ soumis (Entrée), jamais appliqué à la frappe — filtrer en client ne filtrerait que les lignes
// chargées —, qui garde le tri et les filtres ; puis ce que la grille y pose (« Retirer les filtres »). Îlot
// client : il reçoit des données et du `ReactNode` déjà rendu, jamais une fonction, et navigue par l'hôte
// (`useHote`). Le champ, non contrôlé, se remonte quand l'adresse change la recherche (retour du navigateur) ;
// remonté par sa propre recherche, il reprend le focus (`accessibility-patterns.md § Focus Management`).
//
// Porté d'oto-frontend (`src/components/noeud/barre-du-tableau.tsx`) : `ListTools` du design system, son nom
// et son invite qui comptent les lignes, le glyphe de loupe qui s'anime, la recherche soumise, le champ
// remonté par sa clé. Changé : le compte est celui des lignes du tableau (oto-frontend : celles qui
// répondent). Retiré : le menu d'ordre (« Modifié récemment », une clé méta que le service ne trie pas, H96)
// et la pastille des lignes écrites par une exécution (portage-ecrans.md § 5).
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass"
import { AnimatedIcon } from "../ds/react/icon"
import { ListTools } from "../ds/react/list-tools"
import { useHote } from "../hote/navigation"
import { adresseDuTableau, avecRecherche, type Reglages } from "./adresse"
import { GRILLE } from "./libelles"

type BarreDuTableauProps = {
  reglages: Reglages
  /** L'adresse du tableau sans paramètre : la base de l'adresse d'une recherche. */
  adresse: string
  /** Les lignes du tableau, qui nomment le champ ; `null` quand leur lecture a échoué. */
  lignes: number | null
  children?: ReactNode
}

export function BarreDuTableau({ reglages, adresse, lignes, children }: BarreDuTableauProps) {
  const { naviguer } = useHote()
  const barre = useRef<HTMLDivElement>(null)
  // La recherche envoyée d'ici : quand l'adresse la porte, le champ remonté reprend le focus que sa remontée a emporté.
  const envoyee = useRef<string | null>(null)
  const q = reglages.q ?? ""

  useLayoutEffect(() => {
    const attendue = envoyee.current
    envoyee.current = null
    if (attendue === q) barre.current?.querySelector("input")?.focus()
  }, [q])

  const chercher = (texte: string) => {
    const suite = avecRecherche(reglages, texte)
    envoyee.current = suite.q ?? ""
    naviguer(adresseDuTableau(adresse, suite))
  }

  const nom = lignes === null ? GRILLE.chercher : GRILLE.chercherDans(lignes)
  return (
    <ListTools ref={barre} key={q} label={nom} placeholder={nom} defaultValue={q} icon={<AnimatedIcon as={MagnifyingGlass} anim="magnify" size="xs" />} onSearch={chercher}>
      {children}
    </ListTools>
  )
}
