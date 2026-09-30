import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { uploadForm } from "@otomata_tech/oto_platform/server"
import { EcranDeDepot, REFUS_DU_DEPOT, resultatDe } from "@otomata_tech/oto_platform/ui"
import { getPlatformIdentitySafely } from "@/lib/plateforme/session"

// « Déposer un fichier » (E10-S02 lot f, AC-f15 ; ADR-018 § 8) : la page de `form_url` d'`upload.link`, en anglais
// (E11-S07), sous la session de la personne du ticket. La page revérifie la session hors de tout `try` (le layout n'est
// pas une frontière), puis lit la destination du ticket sans le consommer ; le service décide (une autre personne, un
// lien servi ou expiré : le même refus). L'écran envoie le fichier à la route à session du paquet.
export const metadata: Metadata = {
  title: "Déposer un fichier",
  robots: { index: false },
}

const ECHEC = { error: "Une erreur est survenue. Réessayez." } as const

export default async function DepotPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const identite = await getPlatformIdentitySafely("upload")
  if (identite?.error?.code === "unauthenticated") redirect("/login")
  if (identite?.error) redirect("/no-organization")

  const resultat = identite ? await resultatDe(uploadForm(identite.data.session.db, identite.data.identity, token), REFUS_DU_DEPOT) : ECHEC
  return <EcranDeDepot resultat={resultat} jeton={token} />
}
