import type { Metadata } from "next"
import { Suspense, use } from "react"
import { redirect } from "next/navigation"
import { Alert, CoquilleOto, EcranDAuthentification } from "@otomata_tech/oto_platform/ui"
import { marqueDeLAdresse } from "@/lib/plateforme/marque-de-l-adresse"
import { OIDC_LOGIN_PATH, oidcEnabled } from "@/lib/plateforme/oidc-client"
import { loginPath, safeRedirect } from "@/lib/schemas/auth"
import { fournisseursActives, type FournisseursActives } from "@/lib/supabase/fournisseurs"
import { CONNEXION_ECHOUEE } from "@/app/(auth)/messages"
import { BoutonsDeFournisseurs } from "./boutons-de-fournisseurs"
import { FormulaireDeConnexion } from "./formulaire-de-connexion"

// `/login` sur le gabarit des écrans d'authentification, porté d'oto-frontend (E05-S09, partie d3), au
// thème de l'organisation de l'adresse : la page pose la racine `.oto`, le gabarit porte la marque et la
// mise en page, le formulaire rend l'îlot.

export const metadata: Metadata = {
  title: "Connexion",
}

type LoginPageProps = {
  /**
   * `error=auth_callback_error` : `/auth/confirmer` ou `/auth/callback` a refusé le lien de l'email ;
   * `error=oauth` : le serveur d'auth a rendu une erreur au retour de Google ou Microsoft (E09-S03) ;
   * `redirect` : la page demandée avant la connexion, où revenir ensuite (E02-S02).
   */
  searchParams?: Promise<{ error?: string | string[]; redirect?: string | string[] }>
}

const RETOUR_DE_FOURNISSEUR_REFUSE =
  "La connexion avec Google ou Microsoft n'a pas abouti. On entre sur invitation : utilisez l'adresse qui a reçu l'invitation, ou demandez une invitation à l'administrateur de votre organisation."

// Sans page d'inscription, l'écran ne doit pas être une impasse (HN-E05S07-12, fiche D1) : la légende
// d'oto-frontend (« Créer un compte ») dit ici qu'on entre sur invitation.
const LEGENDE =
  "Pas encore de compte ? On entre sur invitation : demandez-en une à l'administrateur de votre organisation."

// Au pied de l'îlot, sous les deux boutons du formulaire : « ou » entre deux filets, puis les boutons des
// seuls fournisseurs activés ; rien quand aucun ne l'est, ou quand la lecture échoue (E09-S03, AC1).
function FournisseursDeConnexion({ fournisseurs, retour }: { fournisseurs: Promise<FournisseursActives>; retour?: string }) {
  const { google, azure } = use(fournisseurs)
  if (!google && !azure) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="h-px flex-1 bg-hair" />
        <p className="oto-caption">ou</p>
        <div aria-hidden="true" className="h-px flex-1 bg-hair" />
      </div>
      <BoutonsDeFournisseurs google={google} azure={azure} retour={retour} />
    </div>
  )
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // En mode OIDC, la page de connexion est celle de l'émetteur (AC-b5, fiche D79) : la page demandée
  // part avec la personne, rien d'autre n'est lu.
  if (oidcEnabled()) {
    const demande = (await searchParams)?.redirect
    redirect(loginPath(safeRedirect(typeof demande === "string" ? demande : undefined), OIDC_LOGIN_PATH))
  }
  // La marque pose le thème de la racine : attendue, dans sa borne (HN-E05S07-4). Les fournisseurs
  // sont lancés ensuite, sans être attendus : leurs boutons arrivent en streaming (HN-E09S03-5), et
  // au prérendu du build `headers()` a déjà levé, avant tout appel réseau.
  const marque = await marqueDeLAdresse()
  const fournisseurs = fournisseursActives()
  const parametres = await searchParams
  const retourDeFournisseurRefuse = parametres?.error === "oauth"
  // La page demandée avant la connexion, validée ici : `/` n'a rien à transporter (E02-S02).
  const destination = safeRedirect(typeof parametres?.redirect === "string" ? parametres.redirect : undefined)
  const retour = destination === "/" ? undefined : destination

  return (
    <CoquilleOto theme={marque?.theme} pleinePage>
      <EcranDAuthentification marque={marque} legende={LEGENDE}>
        <FormulaireDeConnexion
          searchParams={searchParams}
          retour={retour}
          alerte={
            retourDeFournisseurRefuse ? (
              <Alert tone="fail" title={CONNEXION_ECHOUEE}>
                {RETOUR_DE_FOURNISSEUR_REFUSE}
              </Alert>
            ) : undefined
          }
          fournisseurs={
            <Suspense fallback={null}>
              <FournisseursDeConnexion fournisseurs={fournisseurs} retour={retour} />
            </Suspense>
          }
        />
      </EcranDAuthentification>
    </CoquilleOto>
  )
}
