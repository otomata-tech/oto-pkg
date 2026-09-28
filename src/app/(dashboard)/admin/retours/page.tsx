import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { feedbackListQuerySchema, type FeedbackListQuery, type UsagePeriod } from "@otomata_tech/oto_platform/schemas"
import { handlesFeedback, listFeedback, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"
import { EcranRetours, resultatDe, type EcranRetoursProps } from "@otomata_tech/oto_platform/ui"
import { getPlatformIdentitySafely } from "@/lib/plateforme/session"
import { ADRESSES } from "../adresses"

// « Retours des assistants » (E08-S09) : des frictions d'assistant, destinées à l'équipe plateforme. E05-S13 (AC-9,
// HN-E05S13-7) : réservé au membre de l'équipe plateforme qui administre l'organisation de l'adresse
// (`handlesFeedback`), décidé ici avant tout appel ; à tout autre, `notFound()` (l'administrateur du client ne
// sait plus que l'écran existe) ; le service le redécide. L'écran change l'état d'un retour par
// `PATCH /api/plateforme/feedback/<ticket>`, puis la page se relit.
export const metadata: Metadata = {
  title: "Retours des assistants",
  robots: { index: false },
}

const ECHEC = { error: "Une erreur est survenue. Réessayez." } as const

/** L'adresse des retours pour ces paramètres ; un paramètre absent n'y est pas écrit. */
function hrefDeFiltre(parametres: FeedbackListQuery): string {
  const recherche = new URLSearchParams({ etat: parametres.etat, periode: String(parametres.periode) })
  if (parametres.type) recherche.set("type", parametres.type)
  if (parametres.curseur) recherche.set("curseur", parametres.curseur)
  return `/admin/retours?${recherche}`
}

/** La conversation du ticket dans l'écran Journal (E05-S05). */
const hrefDeConversation = (code: string, periode: UsagePeriod) => `/journal?conversation=${encodeURIComponent(code)}&periode=${periode}`

function lire(db: PlatformDb, identity: Identity, filtres: FeedbackListQuery): Promise<EcranRetoursProps["resultat"]> {
  const state = filtres.etat === "all" ? undefined : filtres.etat
  return resultatDe(listFeedback(db, identity, { state, type: filtres.type, days: filtres.periode, cursor: filtres.curseur }))
}

export default async function RetoursPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // La session et l'appartenance se revérifient ici, hors de tout `try` : le layout n'est pas une
  // frontière (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`).
  const identite = await getPlatformIdentitySafely("admin/retours")
  if (identite?.error?.code === "unauthenticated") redirect("/login")
  if (identite?.error) redirect("/aucune-organisation")

  // Aucune valeur de l'adresse ne va brute à un service : une valeur inconnue retombe sur son défaut (AC9).
  const filtres = feedbackListQuerySchema.parse(await searchParams)
  if (identite && !handlesFeedback(identite.data.identity)) notFound()
  const resultat: EcranRetoursProps["resultat"] = identite ? await lire(identite.data.session.db, identite.data.identity, filtres) : ECHEC
  return (
    <EcranRetours
      resultat={resultat}
      filtres={filtres}
      Lien={Link}
      hrefDeFiltre={hrefDeFiltre}
      hrefDeConversation={hrefDeConversation}
      // Les adresses du rail du staff, que le layout lui donne aussi : Retours y est, seul de « Suivi de l'entreprise ».
      fil={{ adresses: { ...ADRESSES, retours: "/admin/retours" }, administre: identite !== null }}
    />
  )
}
