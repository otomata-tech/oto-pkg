import { ImageResponse } from "next/og"
import { requestHost, shareImageData } from "@otomata_tech/oto_platform/server"
import { ImageDePartage, TAILLE_DE_PARTAGE } from "@otomata_tech/oto_platform/ui"

// L'image de partage d'un lien public (E11-S21) : `/p/<jeton>/share-image[/<chemin>]`, le titre et le résumé du contenu
// que le lien sert, aux couleurs de l'organisation ; un lien inconnu, révoqué ou hors de portée : l'image générique,
// jamais une erreur. Une route et non la convention `opengraph-image`, que l'attrape-tout `[[...chemin]]` n'admet pas
// (HN-E11S21-1). `?v=<révision>`, posé par la page, n'est qu'une clé de cache. Aucun cache partagé, comme toute réponse
// publique (ADR-013) : une révocation vaut aussitôt.

type Parametres = { params: Promise<{ jeton: string; chemin?: string[] }> }

export async function GET(request: Request, { params }: Parametres) {
  const { jeton, chemin } = await params
  const donnees = await shareImageData(requestHost(request.headers), { token: jeton, path: chemin && chemin.length > 0 ? chemin.join("/") : null })
  return new ImageResponse(<ImageDePartage donnees={donnees} />, { ...TAILLE_DE_PARTAGE, headers: { "Cache-Control": "private, max-age=300" } })
}
