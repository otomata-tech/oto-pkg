import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { listTrash } from "@otomata_tech/oto_platform/server"
import { EcranDeLaCorbeille, resultatDe } from "@otomata_tech/oto_platform/ui"
import { getPlatformIdentitySafely } from "@/lib/plateforme/session"

// « Corbeille » (E05-S10, partie b2, AC-b11) : les contenus mis à la corbeille que la personne peut
// restaurer (portée et purge décidées par le service du paquet), lus avec le jeton de la session ; l'écran
// restaure par l'API du paquet et ouvre le contenu restauré sous le préfixe des pages.
export const metadata: Metadata = {
  title: "Corbeille",
  robots: { index: false },
}

const ECHEC = { error: "Une erreur est survenue. Réessayez." } as const

export default async function CorbeillePage() {
  // La session et l'appartenance se revérifient ici, hors de tout `try` : le layout n'est pas une
  // frontière (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`).
  const identite = await getPlatformIdentitySafely("trash")
  if (identite?.error?.code === "unauthenticated") redirect("/login")
  if (identite?.error) redirect("/no-organization")

  const resultat = identite ? await resultatDe(listTrash(identite.data.session.db, identite.data.identity)) : ECHEC
  return <EcranDeLaCorbeille resultat={resultat} prefixeDesPages="/n/" />
}
