import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CoquilleOto, EcranDAuthentification, IlotDAuthentification } from "@otomata_tech/oto_platform/ui"
import { confirmerLienAction } from "@/lib/actions/auth"
import { marqueDeLAdresse } from "@/lib/plateforme/marque-de-l-adresse"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { BOUTON_PRINCIPAL } from "@/app/(auth)/classes-oto"

// Page publique : la personne qui clique sur le lien de l'email n'a pas encore de session. Son
// ouverture ne vérifie rien — une passerelle de messagerie qui ouvre le lien ne consomme pas le
// jeton (fiche D11) ; le jeton est vérifié au clic sur « Continuer » (`confirmerLienAction`). Hors
// du groupe `(auth)`, elle pose elle-même sa racine `.oto` et le gabarit (E05-S07). Lien magique de
// Supabase Auth : en mode OIDC, la page n'existe pas (AC-b5 d'E01-S11).
export const metadata: Metadata = {
  title: "Ouvrir votre session",
  robots: { index: false },
}

type Parametre = string | string[] | undefined

const valeur = (parametre: Parametre) => (typeof parametre === "string" ? parametre : "")

export default async function ConfirmerPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: Parametre; type?: Parametre; next?: Parametre }>
}) {
  if (oidcEnabled()) notFound()
  const parametres = await searchParams
  const marque = await marqueDeLAdresse()

  return (
    <CoquilleOto theme={marque?.theme} pleinePage>
      <EcranDAuthentification marque={marque}>
        <IlotDAuthentification
          titre="Connexion"
          pied={
            <form action={confirmerLienAction}>
              <input type="hidden" name="token_hash" value={valeur(parametres.token_hash)} />
              <input type="hidden" name="type" value={valeur(parametres.type)} />
              <input type="hidden" name="next" value={valeur(parametres.next)} />
              <button type="submit" className={BOUTON_PRINCIPAL}>
                Continuer
              </button>
            </form>
          }
        >
          <p className="text-sm text-mute">Cliquez pour ouvrir votre session.</p>
        </IlotDAuthentification>
      </EcranDAuthentification>
    </CoquilleOto>
  )
}
