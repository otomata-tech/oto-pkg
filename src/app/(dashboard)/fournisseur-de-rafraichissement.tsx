"use client"

import { useTransition, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ContexteDeLHote, ContexteDeRafraichissement } from "@otomata_tech/oto_platform/ui"
import { logoutAction } from "@/lib/actions/auth"

// Ce que l'hôte prête aux écrans du paquet, qui n'importent aucun routeur (ADR-008 § 2) : la relecture
// (E05-S03, AC3) — après une mutation, un îlot appelle `useRafraichir()` et Next relit la page sans
// recharger le document — et, pour le rail (E05-S09, AC-a6), son lien, l'adresse courante, `push` et la
// déconnexion (`logoutAction`, qui renvoie à /login). Colocalisé dans le groupe de routes, son seul
// consommateur.
export function FournisseurDeRafraichissement({ children }: { children: ReactNode }) {
  const router = useRouter()
  // La déconnexion part dans une transition : la redirection qu'elle rejette (Next 15) et une requête
  // en échec remontent aux frontières de la page au lieu de rester des promesses rejetées sans suite
  // (`api-patterns.md § Type de retour standard`).
  const [, demarrer] = useTransition()
  // `null` hors du routeur de l'App Router (rendu isolé d'un test) : aucune ligne n'est alors courante.
  const chemin = usePathname() ?? ""
  const hote = { Lien: Link, chemin, naviguer: (adresse: string) => router.push(adresse), deconnecter: () => demarrer(() => logoutAction()) }
  return (
    <ContexteDeRafraichissement.Provider value={() => router.refresh()}>
      <ContexteDeLHote.Provider value={hote}>{children}</ContexteDeLHote.Provider>
    </ContexteDeRafraichissement.Provider>
  )
}
