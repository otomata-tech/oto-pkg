// L'écran « Contexte » (E11-S10, lot e, AC-e2) : ce que lit l'assistant de la personne, ouvert par le menu du compte
// (`portage-ecrans.md § 0`) ; l'en-tête, puis la vue (`ContexteServi`), montée telle quelle. Server Component ; les
// quatre états (`portage-ecrans.md § 4`) : la vue, l'échec de la lecture de l'identité (« Réessayer »), le
// chargement ; la vue dit elle-même une partie vide. Sans lui, la route n'aurait ni en-tête du paquet ni chargement.
import { Info } from "@phosphor-icons/react/dist/ssr/Info"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { Icon } from "../ds/react/icon"
import { ScreenHeader } from "../ds/react/screen-header"
import { Skeleton } from "../ds/react/skeleton"
import { ContexteServi, type DonneesDuContexteServi } from "./contexte-servi"
import { CONTEXTE_SERVI } from "./libelles"

export type EcranDuContexteProps = {
  /** Ce que la page a lu ; `{ error }` quand l'identité n'a pas pu l'être. */
  resultat: Resultat<DonneesDuContexteServi>
  Lien: LienDeLHote
  /** Le préfixe des pages de l'arbre (« /n/ ») : la version publiée d'un Contexte, et les liens de l'éditeur. */
  prefixeDesPages: string
  /** L'adresse de l'écran (`/context`), pour « Réessayer ». */
  ici: string
}

export function EcranDuContexte({ resultat, Lien, prefixeDesPages, ici }: EcranDuContexteProps) {
  return (
    <>
      <ScreenHeader title={CONTEXTE_SERVI.titre} icon={<Icon as={Info} size="sm" />} />
      {resultat.error !== undefined ? (
        <ErreurDeLecture message={resultat.error} href={ici} Lien={Lien} />
      ) : (
        <ContexteServi donnees={resultat.data} Lien={Lien} prefixeDesPages={prefixeDesPages} ici={ici} />
      )}
    </>
  )
}

/** Le chargement, que l'hôte passe en `fallback` de son `<Suspense>` : le conteneur parle, les rectangles se taisent. */
export function EcranDuContexteChargement() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="oto-sr-only">{CONTEXTE_SERVI.chargement}</span>
      <Skeleton shape="text" width="20%" />
      <Skeleton shape="card" />
      <Skeleton shape="card" />
    </div>
  )
}
