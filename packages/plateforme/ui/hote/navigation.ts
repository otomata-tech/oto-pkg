"use client"

// Ce que l'hôte prête aux îlots du rail (E05-S09, AC-a6 à AC-a8) : son composant de lien, l'adresse
// courante, le geste qui ouvre une adresse (`router.push` dans Next) et celui qui ferme la session,
// comme la relecture (`rafraichir.ts`). `ui/` n'importe aucun routeur (ADR-008 § 2) ; une fonction ou
// un composant ne traverse pas la frontière d'un Server Component : l'hôte les pose ici, dans un
// fournisseur client. Sans fournisseur, une ancre et un chargement, aucune ligne courante, pas de
// déconnexion : plus lent, jamais faux, et le même rendu au serveur qu'au navigateur.
import { createContext, useContext, type AnchorHTMLAttributes, type ComponentType } from "react"

/** Un lien de l'hôte qui transmet les attributs d'une ancre (le rail y pose `title`, `aria-current`, ses classes). */
export type LienDuRail = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>

export type Hote = {
  /** Le lien de l'hôte (`next/link`, celui d'un autre routeur, ou `"a"`). */
  Lien: LienDuRail | "a"
  /** L'adresse courante, sans paramètres (`usePathname()` dans Next). */
  chemin: string
  /** Ouvre une adresse de l'application, sans recharger le document. */
  naviguer: (adresse: string) => void
  /** Ferme la session ; absent, le menu du compte n'offre pas « Déconnexion ». */
  deconnecter?: () => void
}

const SANS_HOTE: Hote = {
  Lien: "a",
  chemin: "",
  naviguer: (adresse) => window.location.assign(adresse),
}

export const ContexteDeLHote = createContext<Hote>(SANS_HOTE)

export function useHote(): Hote {
  return useContext(ContexteDeLHote)
}
