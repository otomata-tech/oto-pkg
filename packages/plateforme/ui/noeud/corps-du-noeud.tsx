// Le corps d'un nœud (E05-S02, AC3, AC4, AC7 à AC9, AC17 ; E05-S09, partie c1) : l'avis de la version
// publiée, le document dans son îlot (ses blocs lus, ou l'éditeur au niveau écriture), et le complément de
// l'hôte ; les sous-pages sont dans « Contenus liés », hors du document (E05-S10, AC-b6). Un tableau n'a pas d'éditeur : son brouillon (titre et résumé en
// attente, lignes écrites par le modèle) a son bandeau et sa publication, sa grille vit dans le complément
// (E07-S03, HN-E05S02-27). Server Component. Sans lui, l'écran n'aurait que son en-tête.
//
// Porté d'oto-frontend (`routes/n.$nodeId.lazy.tsx`, `NoeudCharge`, et `components/noeud/corps-du-noeud.tsx`,
// `CorpsDuNoeud`) : le document dans un îlot nommé par le titre, le corps de lecture (`Reader`), les blocs
// dans l'ordre, la clé de chaque bloc son `id`. Retiré : le
// corps d'une page héritée (`CorpsHerite`), la méta d'un tableau par sa première page de lignes.
//
// E05-S11 : une page citée se lit par son titre (AC-26, AC-27), d'abord par l'arbre visible (`cibles`), puis par
// les liens sortants lus (`liens`, que seul le titre d'un lien attend, M64) ; l'indication
// d'enregistrement d'un tableau se pose en haut à droite de son brouillon (AC-1).
import type { ReactNode } from "react"
import type { BlockView, NodeView } from "../../schemas"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { LIEN } from "../components/classes"
import { EmptyState } from "../ds/react/empty-state"
import { Island } from "../ds/react/island"
import { Alert } from "../ds/react/primitives"
import { Reader } from "../ds/react/reader"
import { EditeurDeBlocs } from "./editeur/editeur-de-blocs"
import { IndicationDEnregistrement } from "./editeur/lignes-d-etat"
import { cheminsCitesDans, type CiblesDesLiens } from "./en-ligne"
import { ECRAN, genreDuNoeud, PAGE_VIDE, phraseDePublication } from "./libelles"
import { BandeauDuBrouillon, Publication } from "./publication"
import { RenduDUnBloc } from "./rendu-des-blocs"

/** Le niveau d'écriture de l'écran (AC9) : celui d'un rédacteur hors de la version publiée, sinon aucun. */
export function niveauDEcritureDe(vue: NodeView, versionPubliee: boolean): 2 | 3 | null {
  return vue.level === 1 || versionPubliee ? null : vue.level
}

/**
 * Les blocs que l'écran montre (AC9) : le brouillon quand l'écran écrit (`niveauDEcritureDe`), sinon
 * les blocs publiés. La page de l'hôte en résout les références (E07-S03).
 */
export function blocsAffiches(vue: NodeView, versionPubliee: boolean): BlockView[] {
  return niveauDEcritureDe(vue, versionPubliee) !== null && vue.draft ? vue.draft.blocks : vue.blocks
}

/** Les textes d'un bloc qui peuvent citer une page : son texte, et chaque élément d'une liste ou d'une liste à cocher. */
function textesDe(bloc: BlockView): string[] {
  const elements = Array.isArray(bloc.data.items) ? bloc.data.items : []
  const texteDElement = (element: unknown) => {
    if (typeof element === "string") return element
    return typeof element === "object" && element !== null && "text" in element && typeof element.text === "string" ? element.text : ""
  }
  return [bloc.text ?? "", ...elements.map(texteDElement)]
}

/** Les chemins que citent des blocs (E05-S11, AC-27) : l'écran n'en lit les cibles que pour eux. */
export function cheminsCites(blocs: readonly BlockView[]): string[] {
  return blocs.flatMap((bloc) => textesDe(bloc).flatMap(cheminsCitesDans))
}

export type CorpsDuNoeudProps = {
  vue: NodeView
  niveauDEcriture: 2 | 3 | null
  /** Le titre montré : il nomme l'îlot du document. */
  titre: string
  versionPubliee: boolean
  nomOrganisation: string
  Lien: LienDeLHote
  hrefDuChemin: (chemin: string) => string
  prefixeDesPages: string
  referencesRendues?: Readonly<Record<string, ReactNode>>
  complement?: ReactNode
  /** Les cibles des pages que citent les blocs montrés, lues dans l'arbre visible (AC-26, AC-27). */
  cibles?: CiblesDesLiens
  /** Les champs de `read` sur le nœud (ses liens sortants), lus par l'hôte après la page. */
  liens?: Promise<Resultat<Record<string, unknown>>>
}

type LectureProps = Pick<CorpsDuNoeudProps, "Lien" | "hrefDuChemin" | "referencesRendues" | "cibles" | "liens"> & { blocs: BlockView[] }

/**
 * Le document lu (AC4) : ses blocs dans l'ordre ; vide, il le dit (AC7). Rendu une fois : seul le titre d'une page
 * citée attend les liens sortants, les titres de l'arbre d'abord (M64).
 */
function Lecture({ blocs, Lien, hrefDuChemin, referencesRendues, cibles, liens }: LectureProps) {
  return (
    <Reader>
      {blocs.length === 0 ? (
        <EmptyState title={PAGE_VIDE} />
      ) : (
        blocs.map((bloc) => <RenduDUnBloc key={bloc.id} bloc={bloc} Lien={Lien} hrefDuChemin={hrefDuChemin} cibles={cibles} lecture={liens} rendu={referencesRendues?.[bloc.id]} />)
      )}
    </Reader>
  )
}

/**
 * Le brouillon d'un tableau (AC9, AC17) : son bandeau, puis sa publication, seule au niveau gestion : son
 * en-tête écrit en place se publie comme le texte d'une page (E05-S10, AC-a10) ; la grille est dans le complément.
 */
function BrouillonDuTableau({ niveau, phrase, lien }: { niveau: 2 | 3; phrase: string; lien: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-2">
      <IndicationDEnregistrement niveau={niveau} />
      <BandeauDuBrouillon lien={lien} niveau={niveau} />
      <Publication niveau={niveau} phrase={phrase} />
    </div>
  )
}

export function CorpsDuNoeud(props: CorpsDuNoeudProps) {
  const { vue, niveauDEcriture, titre, versionPubliee, Lien, hrefDuChemin } = props
  const lienVersionPubliee = (
    <Lien href={`${hrefDuChemin(vue.path)}?version=publiee`} className={LIEN}>
      {ECRAN.voirLaVersionPubliee}
    </Lien>
  )
  const phrase = phraseDePublication(vue.owner, props.nomOrganisation)
  const blocs = blocsAffiches(vue, versionPubliee)
  return (
    <>
      {versionPubliee && vue.level > 1 && (
        <Alert
          tone="idle"
          title={ECRAN.versionPubliee(vue.revision)}
          actions={
            <Lien href={hrefDuChemin(vue.path)} className={LIEN}>
              {ECRAN.revenirAuBrouillon}
            </Lien>
          }
        />
      )}
      {vue.kind === "table" ? (
        niveauDEcriture !== null && <BrouillonDuTableau niveau={niveauDEcriture} phrase={phrase} lien={lienVersionPubliee} />
      ) : (
        <Island aria-label={titre}>
          {niveauDEcriture === null ? (
            <Lecture blocs={blocs} Lien={Lien} hrefDuChemin={hrefDuChemin} referencesRendues={props.referencesRendues} cibles={props.cibles} liens={props.liens} />
          ) : (
            <EditeurDeBlocs
              key={vue.id}
              niveau={niveauDEcriture}
              blocs={blocs}
              revisionServie={vue.revision}
              phraseDePublication={phrase}
              prefixeDesPages={props.prefixeDesPages}
              lienVersionPubliee={lienVersionPubliee}
              referencesRendues={props.referencesRendues}
              cibles={props.cibles}
              liens={props.liens}
              // Le genre du brouillon s'il en change (E05-S04 : la publication d'un Contexte).
              genre={genreDuNoeud(vue)}
            />
          )}
        </Island>
      )}
      {props.complement}
    </>
  )
}
