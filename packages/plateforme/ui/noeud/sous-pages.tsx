// « Contenus liés » (E05-S10, partie b, AC-b6), qui remplace « Sous-pages » (E05-S02, AC3) : au-dessus du
// contenu, dans sa largeur et hors de la carte des blocs, un repli fermé par défaut, « Contenus liés (N) » ;
// ouvert, « Dessous » (les nœuds sous celui-ci, leur nature et leur résumé) et « Cités » (les contenus que
// cite un bloc de ce nœud, et ceux qui le citent). Server Component ; aucun repli quand rien n'est lié (une
// commande qui s'ouvre sur « rien » est une impasse). Les liens arrivent après la page, sous leur propre
// `<Suspense>` : l'en-tête et le document ne les attendent pas. Sans lui, le résumé d'un nœud dessous et ce
// qui cite une page ne se lisent nulle part à l'écran.
//
// Porté d'oto-frontend (`components/noeud/qui-sen-sert.tsx`) : `LinkedContent`, ses intitulés et sa note,
// `ContentTree`, `ObjectLink`. Changé : les rubriques, lues dans `loadNode` et dans les liens `links` que sert
// `read` (E03-S07) ; retiré : la note de pied d'Oto.
//
// E05-S11 (retours 13 et 20, fiche D107) : trois rubriques, « Sous-pages », « Mentionnés » (ce que les blocs du
// nœud citent) et « Mentionné dans » (ce qui le cite), chacune absente quand elle est vide ; le résumé compte
// les trois. Les mêmes liens donnent aux blocs le titre et la place de chaque page citée (`ciblesDesLiens`).
import { Suspense, use, type ReactNode } from "react"
import { TreeStructure } from "@phosphor-icons/react/dist/ssr/TreeStructure"
import type { NodeView, TreeNode } from "../../schemas"
import type { Resultat } from "../api/resultat"
import { natureDuGenre } from "../arbre/depuis-l-arbre"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import type { NatureDeNoeud } from "../arbre/types"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { ContentTree, ContentTreeItem } from "../ds/react/content-tree"
import { AnimatedIcon } from "../ds/react/icon"
import { LinkedContent } from "../ds/react/linked-content"
import { ObjectLink } from "../ds/react/object-link"
import { dernierSegment, type CiblesDesLiens } from "./en-ligne"
import { GlypheDeNature } from "./glyphes"
import { CONTENUS_LIES, NATURES, resumeCompte } from "./libelles"

/** Un contenu cité par un bloc du nœud : `missing`, sans cible visible ; `moved`, rangé depuis à `vers`. */
export type ContenuCite = { chemin: string; titre: string | null; etat: "ok" | "missing" | "moved"; vers?: string }

/** Les liens d'un nœud, les premiers de chaque côté et leur total (`read`, E03-S07 AC4). */
export type LiensDuNoeud = { cites: ContenuCite[]; totalCites: number; citant: { chemin: string; titre: string }[]; totalCitant: number }

type Navigation = { Lien: LienDeLHote; hrefDuChemin: (chemin: string) => string; ici: string }

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
const texte = (valeur: unknown): string | null => (typeof valeur === "string" && valeur !== "" ? valeur : null)
const nombre = (valeur: unknown, sinon: number): number => (typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0 ? valeur : sinon)

function citeDe(lien: Record<string, unknown>): ContenuCite[] {
  const chemin = texte(lien.path)
  if (!chemin) return []
  const etat = lien.status === "missing" || lien.status === "moved" ? lien.status : "ok"
  const vers = texte(lien.moved_to)
  return [{ chemin, titre: texte(lien.title), etat, ...(vers ? { vers } : {}) }]
}

/**
 * Les liens d'un nœud dans les champs que sert `read` (`links_out`, `links_in` et leurs totaux, E03-S07
 * AC4), lus champ par champ ; un contenu cité par deux ancres (`#clé`) ne se montre qu'une fois.
 */
export function liensDeLaLecture(donnees: Record<string, unknown>): LiensDuNoeud {
  const sortants = (Array.isArray(donnees.links_out) ? donnees.links_out : []).filter(estObjet).flatMap(citeDe)
  const cites = [...new Map(sortants.map((cite) => [cite.chemin, cite])).values()]
  const citant = (Array.isArray(donnees.links_in) ? donnees.links_in : []).filter(estObjet).flatMap((lien) => {
    const chemin = texte(lien.path)
    return chemin ? [{ chemin, titre: texte(lien.title) ?? chemin }] : []
  })
  return {
    cites,
    totalCites: nombre(donnees.links_out_total, sortants.length) - (sortants.length - cites.length),
    citant,
    totalCitant: nombre(donnees.links_in_total, citant.length),
  }
}

function aplatir(arbre: readonly TreeNode[]): TreeNode[] {
  return arbre.flatMap((noeud) => [noeud, ...aplatir(noeud.children)])
}

/**
 * Les cibles des pages que citent les blocs montrés (E05-S11, AC-26, AC-27), lues dans l'arbre visible : un
 * chemin de l'arbre sous son titre, un autre sans page visible (`null`). Seuls les chemins cités partent vers
 * l'îlot de l'éditeur, jamais l'arbre entier. Arbre illisible : aucune cible, rien n'est deviné. Arbre coupé
 * (`truncated`) : un chemin absent reste inconnu, son lien est gardé.
 */
export function ciblesDesLiens(arbre: { tree: readonly TreeNode[]; truncated: boolean } | null, chemins: readonly string[]): CiblesDesLiens | undefined {
  if (arbre === null) return undefined
  const cites = new Set(chemins)
  const visibles = new Map(aplatir(arbre.tree).flatMap((noeud) => (cites.has(noeud.path) ? [[noeud.path, noeud.title] as const] : [])))
  return Object.fromEntries([...cites].flatMap((chemin): [string, CiblesDesLiens[string]][] => {
    const titre = visibles.get(chemin)
    if (titre !== undefined) return [[chemin, { titre, chemin }]]
    return arbre.truncated ? [] : [[chemin, null]]
  }))
}

/**
 * Les cibles complétées par les liens sortants lus (`links_out`, les 20 premiers) : un contenu déplacé mène à sa
 * nouvelle place, sous son titre ; un contenu sans cible se lit en texte.
 */
function avecLesMentions(cibles: CiblesDesLiens | undefined, liens: LiensDuNoeud): CiblesDesLiens | undefined {
  if (cibles === undefined) return undefined
  const lues = liens.cites.map((cite) => [cite.chemin, cite.etat === "missing" ? null : { titre: cite.titre ?? dernierSegment(cite.chemin), chemin: cite.etat === "moved" && cite.vers ? cite.vers : cite.chemin }] as const)
  return { ...cibles, ...Object.fromEntries(lues) }
}

/** Les cibles complétées par les champs de `read` lus, ou telles quelles si leur lecture a échoué (le bandeau le dit). */
export function ciblesLues(cibles: CiblesDesLiens | undefined, lu: Resultat<Record<string, unknown>>): CiblesDesLiens | undefined {
  return lu.error !== undefined ? cibles : avecLesMentions(cibles, liensDeLaLecture(lu.data))
}

/** La nature de chaque nœud visible, par chemin : le glyphe d'un contenu cité ; un chemin inconnu se montre en page. */
function naturesParChemin(arbre: readonly TreeNode[] | null): ReadonlyMap<string, NatureDeNoeud> {
  return new Map((arbre ? aplatir(arbre) : []).map((noeud) => [noeud.path, natureDuGenre(noeud.kind)]))
}

type NavigationDesLignes = Pick<Navigation, "Lien" | "hrefDuChemin">

/** Une rubrique du bandeau : son intitulé, sa liste nommée, et ce que le service n'a pas servi. */
function Rubrique({ titre, autres, children }: { titre: string; autres: number; children: ReactNode }) {
  return (
    <>
      <p className="oto-linked-label">{titre}</p>
      <ContentTree aria-label={titre}>{children}</ContentTree>
      {autres > 0 && <p className="oto-linked-note">{CONTENUS_LIES.autres(autres)}</p>}
    </>
  )
}

function SousPages({ enfants, total, Lien, hrefDuChemin }: NavigationDesLignes & { enfants: NodeView["children"]; total: number }) {
  if (total === 0) return null
  return (
    <Rubrique titre={CONTENUS_LIES.sousPages} autres={total - enfants.length}>
      {enfants.map((enfant) => (
        <ContentTreeItem key={enfant.path} icon={<GlypheDeNature nature={natureDuGenre(enfant.kind)} />}>
          <ObjectLink as={Lien} href={hrefDuChemin(enfant.path)} name={enfant.title} meta={`${NATURES[enfant.kind]} · ${enfant.summary}`} />
        </ContentTreeItem>
      ))}
    </Rubrique>
  )
}

/** Un contenu mentionné : son lien (vers sa nouvelle place s'il a été rangé ailleurs), ou son chemin seul, sans cible. */
function LigneMentionnee({ cite, nature, Lien, hrefDuChemin }: NavigationDesLignes & { cite: ContenuCite; nature: NatureDeNoeud }) {
  if (cite.etat === "missing") {
    return (
      <ContentTreeItem broken icon={<GlypheDeNature nature={nature} />}>
        <span className="oto-object-link">
          <span className="oto-object-link-name">{cite.chemin}</span>
          <span className="oto-object-link-meta">{CONTENUS_LIES.sansCible}</span>
        </span>
      </ContentTreeItem>
    )
  }
  const deplace = cite.etat === "moved" && cite.vers ? cite.vers : null
  return (
    <ContentTreeItem icon={<GlypheDeNature nature={nature} />}>
      <ObjectLink as={Lien} href={hrefDuChemin(deplace ?? cite.chemin)} name={cite.titre ?? cite.chemin} meta={deplace ? CONTENUS_LIES.deplace(deplace) : undefined} />
    </ContentTreeItem>
  )
}

type MentionsProps = Navigation & { liens: Resultat<LiensDuNoeud> | null; natures: ReadonlyMap<string, NatureDeNoeud> }

/** « Mentionnés » puis « Mentionné dans », chacune absente quand elle est vide ; la lecture en cours ou en échec se dit. */
function Mentions({ liens, natures, Lien, hrefDuChemin, ici }: MentionsProps) {
  if (liens === null) {
    return (
      <p role="status" className="oto-linked-note">
        {CONTENUS_LIES.chargement}
      </p>
    )
  }
  if (liens.error !== undefined) return <ErreurDeLecture message={liens.error} href={ici} Lien={Lien} />
  const { cites, totalCites, citant, totalCitant } = liens.data
  return (
    <>
      {totalCites > 0 && (
        <Rubrique titre={CONTENUS_LIES.mentionnes} autres={totalCites - cites.length}>
          {cites.map((cite) => (
            <LigneMentionnee key={cite.chemin} cite={cite} nature={natures.get(cite.vers ?? cite.chemin) ?? "page"} Lien={Lien} hrefDuChemin={hrefDuChemin} />
          ))}
        </Rubrique>
      )}
      {totalCitant > 0 && (
        <Rubrique titre={CONTENUS_LIES.mentionneDans} autres={totalCitant - citant.length}>
          {citant.map((source) => {
            const nature = natures.get(source.chemin) ?? "page"
            return (
              <ContentTreeItem key={source.chemin} icon={<GlypheDeNature nature={nature} />}>
                <ObjectLink as={Lien} href={hrefDuChemin(source.chemin)} name={source.titre} />
              </ContentTreeItem>
            )
          })}
        </Rubrique>
      )}
    </>
  )
}

type BandeauProps = Navigation & {
  enfants: NodeView["children"]
  totalDessous: number
  natures: ReadonlyMap<string, NatureDeNoeud>
  /** `undefined` : l'hôte ne sert pas les liens, les mentions ne sont pas rendues ; `null` : leur lecture est en cours. */
  liens: Resultat<LiensDuNoeud> | null | undefined
}

/** Le résumé compté du bandeau (AC-29) : les sous-pages par nature, puis les mentions dans les deux sens. */
function resumeDuBandeau(enfants: NodeView["children"], totalDessous: number, liens: LiensDuNoeud | undefined): string {
  return [
    totalDessous > 0 ? resumeCompte(enfants.map((enfant) => enfant.kind)) : null,
    liens && liens.totalCites > 0 ? CONTENUS_LIES.nMentionnes(liens.totalCites) : null,
    liens && liens.totalCitant > 0 ? CONTENUS_LIES.nMentionneDans(liens.totalCitant) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Le bandeau : son total, son résumé, puis ses trois rubriques ; rien quand rien n'est lié. */
function Bandeau({ enfants, totalDessous, natures, liens, ...navigation }: BandeauProps) {
  const mentions = liens?.data ? liens.data.totalCites + liens.data.totalCitant : 0
  // Une lecture des liens en échec se dit, même sans rien dessous (portage-ecrans.md § 4).
  if (totalDessous + mentions === 0 && liens?.error === undefined) return null
  const resume = resumeDuBandeau(enfants, totalDessous, liens?.data)
  return (
    <LinkedContent icon={<AnimatedIcon as={TreeStructure} size="xs" />} title={CONTENUS_LIES.titre} count={liens === null ? undefined : totalDessous + mentions} summary={resume || undefined}>
      <SousPages enfants={enfants} total={totalDessous} Lien={navigation.Lien} hrefDuChemin={navigation.hrefDuChemin} />
      {liens !== undefined && <Mentions liens={liens} natures={natures} {...navigation} />}
    </LinkedContent>
  )
}

function BandeauLu({ lecture, ...props }: Omit<BandeauProps, "liens"> & { lecture: Promise<Resultat<Record<string, unknown>>> }) {
  const lu = use(lecture)
  return <Bandeau {...props} liens={lu.error !== undefined ? lu : { data: liensDeLaLecture(lu.data) }} />
}

export type ContenusLiesProps = Navigation & {
  vue: Pick<NodeView, "children" | "childrenTotal">
  /** L'arbre visible : la nature d'un contenu cité ; `null` si sa lecture a échoué (le glyphe d'une page). */
  arbre: readonly TreeNode[] | null
  /** Les champs de `read` sur le nœud (ses liens), lus par l'hôte après la page ; absents, « Cités » n'est pas rendu. */
  liens?: Promise<Resultat<Record<string, unknown>>>
}

export function ContenusLies({ vue, arbre, liens, ...navigation }: ContenusLiesProps) {
  const commun = { enfants: vue.children, totalDessous: vue.childrenTotal, natures: naturesParChemin(arbre), ...navigation }
  if (!liens) return <Bandeau {...commun} liens={undefined} />
  return (
    <Suspense fallback={<Bandeau {...commun} liens={null} />}>
      <BandeauLu {...commun} lecture={liens} />
    </Suspense>
  )
}
