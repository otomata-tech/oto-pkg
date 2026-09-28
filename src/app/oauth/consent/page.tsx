import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { decisionErrorSchema } from "@otomata_tech/oto_platform/schemas"
import { consentPath, consentRequest } from "@otomata_tech/oto_platform/server"
import { Consentement, Content, CoquilleOto, Desk, type ErreurDeDecision } from "@otomata_tech/oto_platform/ui"
import { deciderConsentementAction } from "@/lib/actions/consentement"
import { oidcEnabled } from "@/lib/plateforme/oidc-client"
import { getPlatformSession } from "@/lib/plateforme/session"
import { loginPath } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/server"

// Page de consentement du serveur OAuth de Supabase (E02-S02, H16) : Supabase y envoie la personne
// (`<adresse de site>/oauth/consent?authorization_id=…`) avant de délivrer un code à l'assistant.
// La page revérifie la session (le middleware ne suffit pas), puis le paquet lit la demande ; elle
// ne garde que la lecture de la session et le choix de l'écran. Thème de l'organisation de la
// ressource (E09-S02, H16), celui par défaut sans organisation connue. Aucun `loading.tsx` : un
// consentement déjà donné redirige tout de suite (307), sans écran de chargement devant (HN-E02S02-21).
// En mode OIDC, les assistants consentent chez l'émetteur : la page n'existe pas (AC-b5 d'E01-S11).
export const metadata: Metadata = {
  title: "Autoriser un assistant",
  robots: { index: false },
}

type Parametre = string | string[] | undefined

const DEMANDE_INVALIDE =
  "Ce lien ne porte pas de demande d'autorisation valide. Relancez la connexion depuis votre assistant."
const DEMANDE_EXPIREE =
  "Cette demande d'autorisation a expiré ou a été ouverte avec un autre compte. Relancez la connexion depuis votre assistant."
const DEMANDE_TRANCHEE =
  "Cette demande a déjà été tranchée, dans un autre onglet par exemple, ou elle a expiré. Si votre assistant n'est pas connecté, relancez la connexion depuis celui-ci."

/**
 * Le message d'une demande que la page ne peut pas montrer. Relue illisible après une décision qui a
 * échoué (`erreur`), elle a été tranchée ailleurs ou a expiré : recharger n'y changerait rien
 * (HN-E02S02-20).
 */
function demandeIllisible(kind: "invalid" | "expired", erreur: ErreurDeDecision | undefined): string {
  if (kind === "invalid") return DEMANDE_INVALIDE
  return erreur ? DEMANDE_TRANCHEE : DEMANDE_EXPIREE
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: Parametre; erreur?: Parametre }>
}) {
  if (oidcEnabled()) notFound()
  const parametres = await searchParams
  const session = await getPlatformSession()
  if (!session) redirect(loginPath(consentPath(parametres.authorization_id)))

  const supabase = await createClient()
  const lecture = await consentRequest({ auth: supabase.auth, db: session.db }, parametres.authorization_id)
  // Consentement déjà donné : Supabase rend l'adresse de retour de l'assistant.
  if (lecture.kind === "redirect") redirect(lecture.url)
  // `erreur` vient de l'adresse : seule une valeur de `decisionErrorSchema` s'affiche.
  const erreur = decisionErrorSchema.safeParse(parametres.erreur).data
  const resultat = lecture.kind === "ask" ? { data: lecture.demande } : { error: demandeIllisible(lecture.kind, erreur) }
  const organisation = lecture.kind === "ask" ? lecture.demande.organisation : null
  const theme = organisation?.etat === "connue" ? organisation.marque.theme : undefined

  // Le bureau sans rail et son contenu, comme les écrans d'authentification (E05-S09, partie d3) : l'îlot
  // centré sans se couper (plus haut que la fenêtre, il défile) ; sans le gabarit, qui poserait « Oto » en
  // second `h1` à côté du nom du client.
  return (
    <CoquilleOto pleinePage theme={theme}>
      <Desk rail={false}>
        <Content>
          <div className="flex h-full items-center-safe justify-center">
            <div className="w-full max-w-md">
              <Consentement resultat={resultat} decider={deciderConsentementAction} erreur={erreur} />
            </div>
          </div>
        </Content>
      </Desk>
    </CoquilleOto>
  )
}
