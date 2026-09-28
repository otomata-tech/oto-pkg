import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { readProfile } from "@otomata_tech/oto_platform/server"
import { EcranProfil, resultatDe } from "@otomata_tech/oto_platform/ui"
import { getPlatformIdentitySafely } from "@/lib/plateforme/session"

// « Profil » (E05-S11, AC-3 ; HN-E05S11-30) : ouvert à tout membre de l'organisation de l'adresse. La fiche
// vient de l'identité de la session (`readProfile`, qui refuse l'équipe plateforme entrée sans fiche) ;
// l'écran écrit par `PATCH /api/plateforme/profile`.
export const metadata: Metadata = {
  title: "Profil",
  robots: { index: false },
}

const ECHEC = { error: "Une erreur est survenue. Réessayez." } as const

/** Le refus propre à cette page, que la table commune ne nomme pas. */
const PROPRES = { forbidden: "Seuls les membres de l'organisation ont un profil ici." } as const

export default async function ProfilPage() {
  // La session et l'appartenance se revérifient ici, hors de tout `try` : le layout n'est pas une
  // frontière (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`).
  const identite = await getPlatformIdentitySafely("profil")
  if (identite?.error?.code === "unauthenticated") redirect("/login")
  if (identite?.error) redirect("/aucune-organisation")

  const resultat = identite ? await resultatDe(readProfile(identite.data.identity), PROPRES) : ECHEC
  return <EcranProfil resultat={resultat} />
}
