// « Contexte · Tout le monde » de l'écran « Organisation » (E05-S11, AC-24) : ce que les assistants de
// l'organisation lisent d'abord, ses blocs publiés rendus comme sur sa page en lecture (`RenduDUnBloc`), et
// « Modifier », qui ouvre sa page. Ses titres sont des `<h3>`, sous le `<h2>` de l'îlot. La lecture arrive après l'écran, sous son `<Suspense>` : l'hôte la lance
// (`loadNode`, qui décide du droit) sans l'attendre. Server Component. Sans lui, l'administrateur ne voit
// pas depuis ses réglages ce que ses assistants reçoivent de l'organisation.
//
// E05-S13 (retour 1, AC-4 ; HN-E05S13-3) : sous les blocs, les listes que le texte servi de ce Contexte porte en plus
// (« Rangés sous ce contexte », « Pages citées »), lues dans l'aperçu de `context` (`previewContext`, lancé par l'hôte
// sans être attendu, sous leur propre `<Suspense>`) et rendues comme dans la vue « Contexte » (`ListesServies`). Sans
// elles, l'administrateur ne voit pas les pages rangées sous ce Contexte ni celles qu'il cite, que ses assistants
// reçoivent aussi. Leur échec se dit à part : les blocs restent.
import { Suspense, use } from "react"
import type { BlockView } from "../../../schemas"
import type { Resultat } from "../../api/resultat"
import { TOUT_LE_MONDE } from "../../arbre/depuis-l-arbre"
import { ErreurDeLecture } from "../../components/erreur-de-lecture"
import type { DonneesDeLApercu } from "../../contexte/apercu-du-contexte"
import { ListesServies } from "../../contexte/listes-servies"
import { CONTEXTE_DE_TOUT_LE_MONDE, morceauxDuContexte, partiesDuContexte } from "../../contexte/parties-du-contexte"
import { EmptyState } from "../../ds/react/empty-state"
import { Island, IslandBody, IslandHead } from "../../ds/react/island"
import { Reader } from "../../ds/react/reader"
import { RenduDUnBloc } from "../../noeud/rendu-des-blocs"
import { LienBouton } from "../../tableau/lien-bouton"
import type { LienDeLAdministration } from "../types"

const ANCRE = "organisation-contexte"

const CONTEXTE = {
  titre: `Contexte · ${TOUT_LE_MONDE}`,
  modifier: "Modifier",
  chargement: "Lecture du Contexte…",
  vide: "Rien n'est encore publié dans ce Contexte.",
  videDetail: "Vos assistants le lisent au début de chaque conversation.",
  chargementDesListes: "Lecture des contenus liés…",
  echecDesListes: "Les contenus liés n'ont pas pu être lus.",
} as const

/** Ce que l'hôte passe : les lectures, lancées sans être attendues, et l'adresse des pages. */
export type LectureDuContexte = {
  lecture: Promise<Resultat<BlockView[]>>
  /**
   * `previewContext` sans phrase (E05-S13, AC-4) : les listes servies de ce Contexte sous ses blocs ; sans elle, les
   * blocs seuls.
   */
  apercu?: Promise<Resultat<DonneesDeLApercu>>
  /** Le préfixe des pages de l'hôte (`"/n/"`) : un lien écrit dans un bloc y mène. */
  prefixeDesPages: string
}

type Navigation = { Lien: LienDeLAdministration; ici: string; prefixeDesPages: string }

function BlocsPublies({ lecture, Lien, ici, prefixeDesPages }: Navigation & { lecture: LectureDuContexte["lecture"] }) {
  const lu = use(lecture)
  if (lu.error !== undefined) return <ErreurDeLecture message={lu.error} href={ici} Lien={Lien} />
  if (lu.data.length === 0) {
    return (
      <EmptyState compact title={CONTEXTE.vide}>
        {CONTEXTE.videDetail}
      </EmptyState>
    )
  }
  const hrefDuChemin = (chemin: string) => `${prefixeDesPages}${chemin}`
  return (
    <Reader>
      {lu.data.map((bloc) => (
        <RenduDUnBloc key={bloc.id} bloc={bloc} Lien={Lien} hrefDuChemin={hrefDuChemin} baliseDeTitre="h3" />
      ))}
    </Reader>
  )
}

/** Les listes servies de ce Contexte (AC-4) : aucune quand son texte servi n'en porte pas ; l'échec se dit, avec « Réessayer ». */
function ListesDuContexte({ apercu, Lien, ici, prefixeDesPages }: Navigation & { apercu: NonNullable<LectureDuContexte["apercu"]> }) {
  const lu = use(apercu)
  if (lu.error !== undefined) return <ErreurDeLecture titre={CONTEXTE.echecDesListes} message={lu.error} href={ici} Lien={Lien} />
  const partie = partiesDuContexte(lu.data).parties.find((une) => une.name === CONTEXTE_DE_TOUT_LE_MONDE)
  // Les blocs publiés sont rendus au-dessus : le corps servi n'est pas répété.
  const morceaux = partie ? morceauxDuContexte(partie.suite, { sansCorps: true }) : []
  return <ListesServies morceaux={morceaux} ancre={ANCRE} prefixeDesPages={prefixeDesPages} Lien={Lien} />
}

type ContexteDeLEntrepriseProps = Navigation & Pick<LectureDuContexte, "lecture" | "apercu"> & { hrefDuContexte: string }

export function ContexteDeLEntreprise({ hrefDuContexte, apercu, ...blocs }: ContexteDeLEntrepriseProps) {
  return (
    <Island aria-labelledby={ANCRE}>
      <IslandHead>
        <h2 id={ANCRE}>{CONTEXTE.titre}</h2>
        {/* `ms-auto` sur le `<span>`, jamais sur le lien : le reset du design system remet à zéro la marge des contrôles. */}
        <span className="ms-auto">
          <LienBouton Lien={blocs.Lien} href={hrefDuContexte} variante="secondary">
            {CONTEXTE.modifier}
          </LienBouton>
        </span>
      </IslandHead>
      <IslandBody>
        <Suspense
          fallback={
            <p role="status" aria-busy="true" className="oto-caption">
              {CONTEXTE.chargement}
            </p>
          }
        >
          <BlocsPublies {...blocs} />
        </Suspense>
        {apercu && (
          <div className="mt-4">
            <Suspense
              fallback={
                <p role="status" aria-busy="true" className="oto-caption">
                  {CONTEXTE.chargementDesListes}
                </p>
              }
            >
              <ListesDuContexte apercu={apercu} Lien={blocs.Lien} ici={blocs.ici} prefixeDesPages={blocs.prefixeDesPages} />
            </Suspense>
          </div>
        )}
      </IslandBody>
    </Island>
  )
}
