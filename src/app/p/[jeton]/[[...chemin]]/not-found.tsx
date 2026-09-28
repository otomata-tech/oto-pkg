import { CoquilleOto, PagePubliqueIntrouvable } from "@otomata_tech/oto_platform/ui"
import { marqueDeLAdresse } from "@/lib/plateforme/marque-de-l-adresse"

// Le 404 d'un lien public (E05-S10, AC-d5) : la même page pour un jeton inconnu, désactivé, hors de portée ou
// un contenu que le lien ne couvre pas, au thème de l'organisation de l'adresse, sans dire lequel.
export default async function LienPublicIntrouvable() {
  const marque = await marqueDeLAdresse()
  return (
    <CoquilleOto theme={marque?.theme} pleinePage>
      <PagePubliqueIntrouvable marque={marque} />
    </CoquilleOto>
  )
}
