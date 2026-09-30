// L'écran « Contexte » (E11-S10, lot e, AC-e2) : ce que lit l'assistant de la personne, ouvert par le menu du compte
// (`portage-ecrans.md § 0`) ; l'en-tête, puis la vue (`ContexteServi`), montée telle quelle. Server Component ; les
// quatre états (`portage-ecrans.md § 4`) : la vue, l'échec de la lecture de l'identité (« Réessayer »), le
// chargement ; la vue dit elle-même une partie vide. Sans lui, la route n'aurait ni en-tête du paquet ni chargement.
// E11-S15 (AC-a8) : sous le titre, « À quoi sert cette page » explique le contexte, ouvert.
import { Info } from "@phosphor-icons/react/dist/ssr/Info"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { AnimatedIcon, Icon } from "../ds/react/icon"
import { LinkedContent } from "../ds/react/linked-content"
import { ScreenHeader } from "../ds/react/screen-header"
import { Skeleton } from "../ds/react/skeleton"
import { ContexteServi, type DonneesDuContexteServi } from "./contexte-servi"
import { ANNEXES, CONTEXTE_SERVI, EXPLICATION_DU_CONTEXTE } from "./libelles"

export type EcranDuContexteProps = {
  /** Ce que la page a lu ; `{ error }` quand l'identité n'a pas pu l'être. */
  resultat: Resultat<DonneesDuContexteServi>
  Lien: LienDeLHote
  /** Le préfixe des pages de l'arbre (« /n/ ») : les liens de l'éditeur et des listes servies. */
  prefixeDesPages: string
  /** L'adresse de l'écran (`/context`), pour « Réessayer ». */
  ici: string
}

/**
 * « À quoi sert cette page » (E11-S15, AC-a8) : ce qu'est le contexte, comment il vit et son ordre, dans l'encart d'aide
 * d'un Contexte (`AnnexesDuContexte`), ouvert : sans lui, la vue montre des parties sans dire ce qu'elles sont.
 */
function Explication() {
  const { ceQuEst, fonctionnement, ordre, etapes, plafond } = EXPLICATION_DU_CONTEXTE
  return (
    // Un `<details>` a le rôle `group` sans nom propre : il prend celui de son titre.
    <LinkedContent open aria-label={ANNEXES.titre} title={ANNEXES.titre} icon={<AnimatedIcon as={Info} size="xs" />}>
      <div className="flex flex-col gap-2 text-sm text-ink">
        <p>{ceQuEst}</p>
        <p>{fonctionnement}</p>
        <p>{ordre}</p>
        <ol className="list-decimal space-y-1 ps-6">
          {etapes.map((etape) => (
            <li key={etape}>{etape}</li>
          ))}
        </ol>
        <p>{plafond}</p>
      </div>
    </LinkedContent>
  )
}

export function EcranDuContexte({ resultat, Lien, prefixeDesPages, ici }: EcranDuContexteProps) {
  return (
    <>
      <ScreenHeader title={CONTEXTE_SERVI.titre} icon={<Icon as={Info} size="sm" />} />
      {/* L'encart dans la colonne de la vue, jamais en frère au niveau de l'écran : là, `.oto-content > *` le centrait
          par sa marge `auto`, que `.oto-linked { margin: 0 }`, chargée après, efface (portage-ecrans.md § 0). */}
      <div className="flex flex-col gap-5">
        <Explication />
        {resultat.error !== undefined ? (
          <ErreurDeLecture message={resultat.error} href={ici} Lien={Lien} />
        ) : (
          <ContexteServi donnees={resultat.data} Lien={Lien} prefixeDesPages={prefixeDesPages} ici={ici} />
        )}
      </div>
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
