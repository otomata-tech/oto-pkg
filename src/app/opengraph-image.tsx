import { headers } from "next/headers"
import { ImageResponse } from "next/og"
import { requestHost, shareImageData } from "@otomata_tech/oto_platform/server"
import { ImageDePartage, TAILLE_DE_PARTAGE } from "@otomata_tech/oto_platform/ui"

// L'image de partage de toute adresse (E11-S21) : l'organisation de l'adresse seule, jamais une page (HN-E11S21-2) ;
// une messagerie la montre sous un lien collé. Un lien public pose la sienne (`p/[jeton]/share-image`). Publique :
// le middleware la laisse passer, un robot d'aperçu n'a pas de session.

export const size = TAILLE_DE_PARTAGE
export const contentType = "image/png"
export const alt = "Le nom et les couleurs de l'organisation"

export default async function ImageDeLOrganisation() {
  const donnees = await shareImageData(requestHost(await headers()))
  // Sans contenu : une marque changée se voit dans l'heure (HN-E11S21-3).
  return new ImageResponse(<ImageDePartage donnees={donnees} />, { ...TAILLE_DE_PARTAGE, headers: { "Cache-Control": "public, max-age=3600" } })
}
