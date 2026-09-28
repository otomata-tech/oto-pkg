import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CoquilleOto, EcranDAuthentification } from "@otomata_tech/oto_platform/ui"
import { marqueDeLAdresse } from "@/lib/plateforme/marque-de-l-adresse"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { LIEN } from "@/app/(auth)/classes-oto"
import { FormulaireNouveauMotDePasse } from "./formulaire-nouveau-mot-de-passe"

// `/reset-password` sur le gabarit des écrans d'authentification, porté d'oto-frontend (E05-S09, partie
// d3) : la page lit la marque de l'adresse et pose la racine `.oto` ; le formulaire (M01) rend l'îlot ; la
// légende d'oto-frontend (`password-reset.lazy.tsx`) mène à la connexion. Propre à Supabase Auth : en mode
// OIDC, la page n'existe pas (AC-b5 d'E01-S11).

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
}

export default async function ResetPasswordPage() {
  if (oidcEnabled()) notFound()
  const marque = await marqueDeLAdresse()

  return (
    <CoquilleOto theme={marque?.theme} pleinePage>
      <EcranDAuthentification
        marque={marque}
        legende={
          <Link href="/login" className={LIEN}>
            Se connecter
          </Link>
        }
      >
        <FormulaireNouveauMotDePasse />
      </EcranDAuthentification>
    </CoquilleOto>
  )
}
