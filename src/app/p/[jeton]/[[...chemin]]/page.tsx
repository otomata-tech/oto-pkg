import type { Metadata } from "next"
import { cache } from "react"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { isPlatformError, readPublicNode, requestHost } from "@otomata_tech/oto_platform/server"
import { CoquilleOto, PAGE_PUBLIQUE, PagePublique, type PagePubliqueProps } from "@otomata_tech/oto_platform/ui"
import { marqueDeLAdresse } from "@/lib/plateforme/marque-de-l-adresse"

// La page publique d'un lien de partage (E05-S10, AC-d2 à AC-d6 ; ADR-013 § 4, § 5) : `/p/<jeton>` pour le
// contenu partagé, `/p/<jeton>/<chemin>` pour un contenu dessous que le lien couvre. Hors session : le
// middleware laisse passer `/p/*` et y pose `X-Robots-Tag` ; `readPublicNode` lit par l'organisation de
// l'adresse et le jeton seuls, sans identité. Au thème de l'organisation, lu comme la page de connexion le lit
// (`marqueDeLAdresse`). Un lien inconnu, désactivé ou hors de portée : le vrai 404, le même pour tous (AC-d5),
// d'où aucun `loading.tsx` ici (un chargement diffusé d'abord enverrait un 200). Jamais indexée (AC-d6) : la
// balise ici, l'en-tête au middleware, et aucune page `sitemap`.

const ECHEC = "Une erreur est survenue. Réessayez."

type PagePubliqueParams = { params: Promise<{ jeton: string; chemin?: string[] }> }

type Lecture = PagePubliqueProps["resultat"]

const ROBOTS: Metadata["robots"] = { index: false, follow: false }

/**
 * La lecture du lien, une fois par requête (les métadonnées et la page la partagent) ; `null` pour tout ce que
 * le lien ne sert pas, sans dire pourquoi. Une panne se dit, journalisée par son code.
 */
const lire = cache(async (jeton: string, chemin: string | null): Promise<Lecture | null> => {
  // Hors de tout `try` : au prérendu, `headers()` lève pour marquer la route dynamique (`api-patterns.md`).
  const host = requestHost(await headers())
  try {
    return { data: await readPublicNode(host, jeton, chemin) }
  } catch (error) {
    if (isPlatformError(error) && error.code === "not_found") return null
    console.error("[plateforme] page publique : lecture impossible", isPlatformError(error) ? error.code : error)
    return { error: ECHEC }
  }
})

/** Le chemin d'un contenu dessous, tel que l'adresse le porte ; `null` pour le contenu partagé. */
const cheminDe = (segments: string[] | undefined): string | null => (segments && segments.length > 0 ? segments.join("/") : null)

export async function generateMetadata({ params }: PagePubliqueParams): Promise<Metadata> {
  const { jeton, chemin } = await params
  const lecture = await lire(jeton, cheminDe(chemin))
  if (lecture === null) return { title: PAGE_PUBLIQUE.introuvable, robots: ROBOTS }
  // Une panne se titre par la phrase de la page, jamais par le titre d'un 404.
  if (lecture.error !== undefined) return { title: PAGE_PUBLIQUE.echec, robots: ROBOTS }
  return { title: lecture.data.node.title, description: lecture.data.node.summary || undefined, robots: ROBOTS }
}

export default async function PagePubliqueDuLien({ params }: PagePubliqueParams) {
  const { jeton, chemin } = await params
  const [marque, lecture] = await Promise.all([marqueDeLAdresse(), lire(jeton, cheminDe(chemin))])
  if (lecture === null) notFound()
  return (
    <CoquilleOto theme={marque?.theme} pleinePage>
      <PagePublique resultat={lecture} adresse={`/p/${jeton}`} marque={marque} />
    </CoquilleOto>
  )
}
