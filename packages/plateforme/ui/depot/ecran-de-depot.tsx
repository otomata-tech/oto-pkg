// L'écran « Déposer un fichier » (E10-S02 lot f, AC-f15 ; ADR-018 § 8) : la page de `form_url`, sous la session de la
// personne du ticket. La page de l'hôte lit la destination (`uploadForm`, qui ne consomme rien : une autre personne ou un
// lien servi reçoit le refus) ; l'écran la montre (chemin, genre, mode, fichier attendu, échéance), puis l'îlot envoie le
// fichier. Server Component ; données, erreur (`role="alert"`) ; pas de vide (un ticket a toujours sa destination).
// Sans lui, `form_url` ne mènerait nulle part.
import { UploadSimple } from "@phosphor-icons/react/dist/ssr/UploadSimple"
import { fileTypeOf, type UploadFormView } from "../../schemas"
import type { Resultat } from "../api/resultat"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { Icon } from "../ds/react/icon"
import { Island, IslandBody } from "../ds/react/island"
import { ScreenHeader } from "../ds/react/screen-header"
import { heureCourte } from "../format/dates"
import { FormulaireDeDepot } from "./formulaire-de-depot"
import { DEPOT } from "./libelles"

/** Ce que propose le choix du système : l'extension du fichier attendu, sinon celles d'un `.md` ou d'un `.csv`. */
function accepteDe(vue: UploadFormView): string {
  if (vue.kind === "md") return ".md,.markdown,text/markdown"
  if (vue.kind === "csv") return ".csv,text/csv"
  const type = vue.name ? fileTypeOf(vue.name) : null
  return type ? `.${type}` : ""
}

function Destination({ vue, jeton }: { vue: UploadFormView; jeton: string }) {
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-ink">
        <dt className="text-mute">{DEPOT.destination}</dt>
        <dd>
          <code>{vue.path}</code>
        </dd>
        <dt className="text-mute">{DEPOT.depot}</dt>
        <dd>
          {DEPOT.genres[vue.kind]} ({DEPOT.modes[vue.mode]})
        </dd>
        {vue.name && (
          <>
            <dt className="text-mute">{DEPOT.fichier}</dt>
            <dd>{vue.name}</dd>
          </>
        )}
        <dt className="text-mute">{DEPOT.valable}</dt>
        <dd>{heureCourte(vue.expiresAt)}</dd>
      </dl>
      <FormulaireDeDepot jeton={jeton} genre={vue.kind} accepte={accepteDe(vue)} />
    </>
  )
}

type EcranDeDepotProps = {
  /** `uploadForm`, par `resultatDe` : la destination du ticket de la personne. */
  resultat: Resultat<UploadFormView>
  /** Le jeton de l'adresse (`/upload/<jeton>`), que l'îlot renvoie avec le fichier. */
  jeton: string
}

export function EcranDeDepot({ resultat, jeton }: EcranDeDepotProps) {
  return (
    <>
      <ScreenHeader title={DEPOT.titre} icon={<Icon as={UploadSimple} size="sm" />} meta={DEPOT.description} />
      <Island aria-label={DEPOT.ilot}>
        <IslandBody className="flex flex-col gap-4">
          {resultat.error !== undefined ? <ErreurDeLecture titre={DEPOT.impossible} message={resultat.error} /> : <Destination vue={resultat.data} jeton={jeton} />}
        </IslandBody>
      </Island>
    </>
  )
}
