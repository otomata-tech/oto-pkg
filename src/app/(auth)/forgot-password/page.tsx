import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CoquilleOto, EcranDAuthentification } from "@otomata_tech/oto_platform/ui"
import { marqueDeLAdresse } from "@/lib/plateforme/marque-de-l-adresse"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { LIEN } from "@/app/(auth)/classes-oto"
import { FormulaireMotDePasseOublie } from "./formulaire-mot-de-passe-oublie"

// `/forgot-password` sur le gabarit des écrans d'authentification, porté d'oto-frontend (E05-S09, partie
// d3) : la page lit la marque de l'adresse et pose la racine `.oto` ; le formulaire (M01) rend l'îlot ; la
// légende d'oto-frontend (`password-forgot.lazy.tsx`) ramène à la connexion. Propre à Supabase Auth : en
// mode OIDC, le mot de passe se gère chez l'émetteur, la page n'existe pas (AC-b5 d'E01-S11).

export const metadata: Metadata = {
  title: "Mot de passe oublié",
}

export default async function ForgotPasswordPage() {
  if (oidcEnabled()) notFound()
  const marque = await marqueDeLAdresse()

  return (
    <CoquilleOto theme={marque?.theme} pleinePage>
      <EcranDAuthentification
        marque={marque}
        legende={
          <>
            Vous vous en souvenez ?{" "}
            <Link href="/login" className={LIEN}>
              Se connecter
            </Link>
          </>
        }
      >
        <FormulaireMotDePasseOublie />
      </EcranDAuthentification>
    </CoquilleOto>
  )
}
