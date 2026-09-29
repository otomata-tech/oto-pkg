// « Brancher mon Claude, ChatGPT ou Mistral » (E02-S04, E11-S09, FR-CONN-04, `mcp-patterns.md § 9`) : pour
// l'organisation de l'adresse, le guide par assistant (`GuideDeBranchement`, le même que la fenêtre de
// l'accueil), puis la dernière connexion de chaque assistant. Server Component : seul le guide est client.
// Exemples et connexions arrivent en `resultat` (portage § 4) ; l'adresse ne lit pas la base, le guide
// reste affiché quand une lecture échoue.
//
// Porté d'oto-frontend (`src/components/accueil/branchement-ia.tsx` et la grammaire de ses écrans,
// `src/routes/settings.profile.lazy.tsx`) : l'en-tête d'écran (`ScreenHeader`), un îlot par rubrique
// (`Island`, `IslandHead` et son `h2`, `IslandBody`), la colonne d'un écran qui se lit
// (`.oto-content-max[data-width="document"]`). Retiré : la carte de l'accueil, le tutoriel « Bientôt »
// (→ le guide), l'état « Aucun client branché » que rien ne servait (→ dernières connexions du journal),
// `lucide-react`.
import { Robot } from "@phosphor-icons/react/dist/ssr/Robot"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { COMPTE } from "../coque/libelles"
import { Icon } from "../ds/react/icon"
import { Island, IslandBody, IslandHead } from "../ds/react/island"
import { ScreenHeader } from "../ds/react/screen-header"
import { Skeleton } from "../ds/react/skeleton"
import { dateLisible } from "../format/dates"
import { GuideDeBranchement } from "./guide-de-branchement"
import type { AdresseDeConnexion, DerniereConnexion, ExempleDePrompt } from "./types"

type EcranConnexionProps = {
  adresse: AdresseDeConnexion
  /** Les procédures utiles, les plus utilisées d'abord : les demandes à essayer du guide (AC-7). */
  prompts: Resultat<ExempleDePrompt[]>
  /** Une ligne par famille d'assistants, de la plus récente à la plus ancienne (AC7). */
  connexions: Resultat<DerniereConnexion[]>
  Lien: LienDeLHote
  /** L'adresse de la page dans l'hôte : « Réessayer » d'une lecture en échec y ramène. */
  ici: string
}

const CODE = "oto-mono break-words"
const VOS_CONNEXIONS = "Vos connexions"

function VosConnexions({ connexions, nom, Lien, ici }: Pick<EcranConnexionProps, "connexions" | "Lien" | "ici"> & { nom: string }) {
  if (connexions.error !== undefined) return <ErreurDeLecture message={connexions.error} href={ici} Lien={Lien} />
  if (connexions.data.length === 0) {
    return <p>{`Aucun assistant ne s'est encore connecté à ${nom} avec votre compte.`}</p>
  }
  return (
    <ul className="flex flex-col gap-1">
      {connexions.data.map(({ famille, signature, date }) => (
        <li key={famille}>
          <span className="font-medium">{famille}</span>
          {` : dernière connexion le ${dateLisible(date) ?? "?"} `}
          <code className={`${CODE} text-mute`}>{`(${signature})`}</code>
        </li>
      ))}
    </ul>
  )
}

export function EcranConnexion({ adresse, prompts, connexions, Lien, ici }: EcranConnexionProps) {
  return (
    <>
      <ScreenHeader title={COMPTE.brancher} icon={<Icon as={Robot} size="md" />} />
      <div className="oto-content-max flex flex-col gap-3" data-width="document">
        {/* Sans en-tête : le titre de l'écran le nomme déjà, la barre d'onglets nomme l'assistant. */}
        <Island>
          <IslandBody>
            <GuideDeBranchement adresse={adresse} exemples={prompts} connexions={connexions} />
          </IslandBody>
        </Island>
        <Island aria-label={VOS_CONNEXIONS}>
          <IslandHead>
            <h2>{VOS_CONNEXIONS}</h2>
          </IslandHead>
          <IslandBody className="flex flex-col gap-3">
            <VosConnexions connexions={connexions} nom={adresse.nom} Lien={Lien} ici={ici} />
          </IslandBody>
        </Island>
      </div>
    </>
  )
}

/** L'état de chargement, rendu par le `loading.tsx` de l'hôte (AC8) : l'en-tête et des îlots en attente. */
export function EcranConnexionChargement() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="oto-sr-only">Chargement de la page de branchement…</span>
      <Skeleton width="16rem" height="1.75rem" />
      <Skeleton shape="card" />
      <Skeleton shape="card" />
    </div>
  )
}
