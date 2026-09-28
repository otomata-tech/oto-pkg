// L'en-tête d'un nœud (E05-S02, AC2, AC8, AC19, AC20 ; E05-S09, partie c1 ; E05-S10, partie b) : l'en-tête
// d'écran du design system (le fil, le glyphe et le titre en `<h1>`, « modifiée …, par … » et son infobulle,
// puis « Partager · <espace> », qui ouvre son popover), puis le chapô de la plateforme
// (le résumé) ; au niveau écriture, le titre et le résumé s'écrivent en place (AC-a1). Server Component : la
// navigation vient de l'hôte, les îlots reçoivent des données.
//
// Porté d'oto-frontend (l'en-tête de `routes/n.$nodeId.lazy.tsx`, `components/noeud/meta-modifiee.tsx`,
// `acces-du-noeud.tsx`) : `ScreenHeader` et ses créneaux, le glyphe de la nature, « modifiée …, par … »
// calculé au rendu (une moitié inconnue se tait), un seul bouton pour le périmètre et le partage, le détail
// dans un popover. Changé : le panneau est celui du partage d'un nœud (E05-S10, AC-b5), le périmètre la
// section du chemin ; le type, l'état, la révision et le propriétaire passent dans une infobulle (AC-a7) ;
// le champ du titre dans le `<h1>` est celui de la plateforme (`TitreModifiable`, à la place de `TitleField`).
// Retiré : la pile d'avatars ; « Déplacer » (AC-b4), que le rail porte (E05-S13, AC-20).
import type { ReactNode } from "react"
import type { NodeView, TreeNode } from "../../schemas"
import { natureDuGenre } from "../arbre/depuis-l-arbre"
import { NoeudOuvert } from "../coque/noeud-ouvert"
import { AccessPanel } from "../ds/react/access-panel"
import { ScreenHeader } from "../ds/react/screen-header"
import { Tooltip } from "../ds/react/tooltip"
import { proprietaire } from "../equipes/libelles"
import { ilYA } from "../format/dates"
import { ResumeModifiable, TitreModifiable } from "./en-tete-modifiable"
import { filDuChemin, porteeDeLaSection, sectionDuChemin } from "./fil"
import { FilDuNoeud } from "./fil-du-noeud"
import { GlypheDeNature, GlypheDePortee } from "./glyphes"
import { detailsDuNoeud, ECRAN, genreDuNoeud, INFOBULLE, modifieeDuNoeud, NATURES } from "./libelles"

type Equipes = readonly { slug: string; name: string }[]

type EnTeteDuNoeudProps = {
  vue: NodeView
  /** Le titre montré : celui du brouillon en attente pour un rédacteur, sinon celui publié. */
  titre: string
  /** `null` : la lecture a échoué (la page le dit) ; le fil n'en devine ni titre ni frère. */
  arbre: readonly TreeNode[] | null
  /** `null` : la lecture des équipes a échoué ; le fil ne nomme alors aucune section d'équipe. */
  equipes: Equipes | null
  /** Le `handle` de la personne : son espace personnel n'est pas un maillon du fil. */
  handle: string | null
  prefixeDesPages: string
  /** Monté sous la file d'écriture seulement (niveau écriture, hors de la version publiée) : le titre s'écrit en place (AC-a1). */
  modifiable: boolean
  /** Le panneau « Partager » (AC-b5) ; absent, l'en-tête n'a pas d'accès. */
  partage?: ReactNode
}

/**
 * La ligne sous le titre (AC-a7) : « modifiée <quand>, par <qui> » (sa nature quand ni l'un ni l'autre n'est
 * connu), focalisable ; son survol et son focus ouvrent l'infobulle du type, de l'état, de la révision et du
 * propriétaire (« Propriétaire : Claire (Privé) »).
 */
function MetaDuNoeud({ vue }: { vue: NodeView }) {
  const modifiee = modifieeDuNoeud(vue, { quand: ilYA(vue.updatedAt), qui: vue.updatedByName })
  const faits = [...detailsDuNoeud(vue), { intitule: INFOBULLE.proprietaire, valeur: proprietaire(vue.owner) }]
  const infobulle = (
    <dl className="oto-node-facts">
      {faits.map((fait) => (
        <div key={fait.intitule}>
          <dt>{fait.intitule}</dt>
          <dd>{fait.valeur}</dd>
        </div>
      ))}
    </dl>
  )
  return (
    <Tooltip content={infobulle} side="bottom">
      {/* Une ligne de texte qui prend le focus pour ouvrir son infobulle au clavier : rien à activer, pas un bouton. */}
      <span tabIndex={0} className="oto-node-modified">
        {modifiee ?? NATURES[vue.kind]}
      </span>
    </Tooltip>
  )
}

export function EnTeteDuNoeud({ vue, titre, arbre, equipes, handle, prefixeDesPages, modifiable, partage }: EnTeteDuNoeudProps) {
  const section = sectionDuChemin(vue.path, equipes, handle)
  const acces = partage ? (
    <AccessPanel
      scope={ECRAN.partager(section.titre)}
      scopeIcon={section.cle === null ? undefined : <GlypheDePortee portee={porteeDeLaSection(section.cle)} />}
      panel={partage}
      panelLabel={ECRAN.panneauDePartage(section.titre)}
    />
  ) : undefined
  return (
    <>
      {/* Le chemin actuel, que le rail reconnaît sous un ancien chemin resté dans l'adresse (AC-b12). */}
      <NoeudOuvert chemin={vue.path} />
      <ScreenHeader
        breadcrumb={<FilDuNoeud maillons={filDuChemin({ chemin: vue.path, titre, arbre, equipes, handle, prefixe: prefixeDesPages })} />}
        icon={<GlypheDeNature nature={natureDuGenre(genreDuNoeud(vue))} taille="sm" />}
        title={modifiable ? <TitreModifiable titre={titre} revisionServie={vue.revision} tamponServi={vue.draft?.draftStamp ?? null} /> : titre}
        meta={<MetaDuNoeud vue={vue} />}
        access={acces}
      />
    </>
  )
}

type ChapoDuNoeudProps = {
  vue: NodeView
  resume: string
  /** Monté sous la file d'écriture seulement (niveau écriture, hors de la version publiée). */
  modifiable: boolean
}

/**
 * Ce que la plateforme dit d'un nœud sous son en-tête, et qu'oto-frontend n'avait pas : le résumé (lu par
 * le routage avec le titre), écrit en place au niveau écriture (AC-a1).
 */
export function ChapoDuNoeud({ vue, resume, modifiable }: ChapoDuNoeudProps) {
  if (!modifiable) return <p className="oto-body">{resume}</p>
  // Une procédure a l'aide d'une page (M59, fiche D104).
  return <ResumeModifiable resume={resume} revisionServie={vue.revision} tamponServi={vue.draft?.draftStamp ?? null} />
}
