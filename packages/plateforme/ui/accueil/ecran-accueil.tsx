// L'accueil (E05-S09, partie b, AC-b1) : le salut, la recherche, « Brancher un assistant » en aparté, le fil
// des activités de la semaine (le journal) et les procédures utiles ; le premier jour prend la place du
// fil et retire les cartes quand rien n'a encore tourné. Server Component : les îlots client ne reçoivent
// que des données. Porté d'oto-frontend (`accueil/ecran-accueil.tsx`). Repris : l'en-tête réduit au salut
// (ni fil d'Ariane ni action : l'accueil est la racine), `HomeLayout` et ses quatre créneaux, les états
// réunis à l'écran (un îlot reçoit une donnée déjà lue), le premier jour qui retire les cartes. Changé : les
// données viennent de la page de l'hôte, lues sous le jeton de la session (`resultat`), au lieu de TanStack
// Query ; une identité illisible se dit une fois, avec « Réessayer ». Retiré : « Agents et activités » (le
// fil reste, seul), « Connecteurs » (V2), « En attente de vous » et le résumé de l'en-tête, qu'aucun service
// ne compose (`portage-ecrans.md § 5`).
//
// E05-S11 (retours 4 et 6 de JB, AC-12) : l'îlot principal porte deux onglets dans l'adresse (`?onglet=`),
// « Activités » (le fil, ou le premier jour) et « Contexte » (ce que lit l'assistant, `ContexteServi`), par
// les `Onglets` de l'écran des équipes (motif APG), comme l'îlot « Procédures et activités » d'oto-frontend.
//
// E05-S12 (lot B, AC-18, HN-E05S12-20) : l'îlot principal seul à gauche ; à droite la recherche, « Brancher
// un assistant », puis « Procédures les plus utilisées » ; « Contenus récents » quitte l'accueil.
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { ContexteServi } from "../contexte/contexte-servi"
import { HomeLayout } from "../ds/react/home"
import { Island } from "../ds/react/island"
import { ScreenHeader } from "../ds/react/screen-header"
import { Skeleton } from "../ds/react/skeleton"
import { Onglets } from "../equipes/onglets"
import { BranchementIA } from "./branchement-ia"
import { ActivitesDeLAccueil } from "./fil-activite"
import { FirstDay } from "./first-day"
import { ACCUEIL, ONGLETS } from "./libelles"
import { ProceduresUtiles } from "./procedures-utiles"
import { RechercheDeLAccueil } from "./recherche-de-l-accueil"
import { ONGLETS_DE_L_ACCUEIL, type DonneesDeLAccueil, type OngletDeLAccueil } from "./types"

/** Le salut, décoratif : le titre se lit sans lui. */
const SALUT = <span aria-hidden="true">👋</span>

export type EcranDAccueilProps = {
  /** Ce que la page a lu ; `{ error }` quand l'identité n'a pas pu l'être. */
  donnees: Resultat<DonneesDeLAccueil>
  Lien: LienDeLHote
  /** L'adresse du journal : « Tout le journal ». */
  hrefDuJournal: string
  /** L'adresse d'une conversation au journal, par son code `ctx` : une procédure lancée l'ouvre. */
  hrefDeConversation: (code: string) => string
  /** L'adresse de « Brancher un assistant » (`/connect`) : les guides pas à pas. */
  hrefDesGuides: string
  /** Le préfixe des pages de l'arbre (« /n/ ») : l'adresse d'un contenu est ce préfixe suivi de son chemin. */
  prefixeDesPages: string
  /** L'onglet ouvert de l'îlot principal, lu dans l'adresse par la page (AC-12). */
  onglet: OngletDeLAccueil
  /** L'adresse d'un onglet de l'accueil (`/`, `/?onglet=contexte`). */
  hrefDOnglet: (onglet: OngletDeLAccueil) => string
  /** L'adresse de la page Profil : la partie « Vous » de la vue « Contexte » y renvoie (AC-14). */
  hrefDuProfil: string
}

/**
 * Le premier jour (AC-16) : aucune activité cette semaine, aucun assistant jamais branché. Une lecture en
 * échec n'est pas un vide : l'écran ne conclut jamais de ce qu'il ne sait pas.
 */
function estLePremierJour({ activites, connexions }: DonneesDeLAccueil): boolean {
  return activites.data?.activities.length === 0 && connexions.data?.length === 0
}

type OngletOuvertProps = Omit<EcranDAccueilProps, "donnees" | "hrefDOnglet" | "hrefDesGuides"> & { lu: DonneesDeLAccueil; premierJour: boolean }

/**
 * Le contenu de l'onglet ouvert : ce que lit l'assistant (`ici`, son adresse, pour « Réessayer »), ou le fil
 * (le premier jour, sa phrase, HN-E05S11-11).
 */
function OngletOuvert({ lu, premierJour, onglet, ici, Lien, hrefDuJournal, hrefDeConversation, hrefDuProfil, prefixeDesPages }: OngletOuvertProps & { ici: string }) {
  if (onglet === "contexte") {
    return lu.contexte && <ContexteServi donnees={lu.contexte} Lien={Lien} prefixeDesPages={prefixeDesPages} hrefDuProfil={hrefDuProfil} ici={ici} />
  }
  if (premierJour) return <FirstDay />
  return (
    <ActivitesDeLAccueil
      activites={lu.activites}
      moi={lu.moi}
      Lien={Lien}
      hrefDuJournal={hrefDuJournal}
      hrefDeConversation={hrefDeConversation}
      prefixeDesPages={prefixeDesPages}
    />
  )
}

/**
 * L'îlot principal (AC-12) : ses deux onglets dans l'adresse, en tête ; il laisse sortir les menus des blocs
 * de la vue « Contexte », comme l'îlot de l'écran des équipes.
 */
function IlotPrincipal({ hrefDOnglet, ...props }: OngletOuvertProps & Pick<EcranDAccueilProps, "hrefDOnglet">) {
  const onglets = ONGLETS_DE_L_ACCUEIL.map((cle) => ({ cle, libelle: ONGLETS[cle], href: hrefDOnglet(cle) }))
  return (
    <Island aria-label={ACCUEIL.ilot} overflow="visible">
      <Onglets label={ACCUEIL.onglets} titre={ACCUEIL.ilot} onglets={onglets} courant={props.onglet}>
        <OngletOuvert {...props} ici={hrefDOnglet(props.onglet)} />
      </Onglets>
    </Island>
  )
}

export function EcranDAccueil({ donnees, hrefDesGuides, ...props }: EcranDAccueilProps) {
  if (donnees.error !== undefined) {
    return (
      <>
        <ScreenHeader icon={SALUT} title={ACCUEIL.bonjour(null)} />
        <HomeLayout main={<ErreurDeLecture message={donnees.error} />} aside={<RechercheDeLAccueil />} />
      </>
    )
  }
  const lu = donnees.data
  const premierJour = estLePremierJour(lu)
  return (
    <>
      <ScreenHeader icon={SALUT} title={ACCUEIL.bonjour(lu.nom)} />
      <HomeLayout
        main={<IlotPrincipal {...props} lu={lu} premierJour={premierJour} />}
        // La recherche passe à droite, au-dessus de « Brancher un assistant » (AC-18).
        aside={<RechercheDeLAccueil />}
        cards={
          <>
            <BranchementIA adresse={lu.adresse} connexions={lu.connexions} guides={hrefDesGuides} />
            {/* Le premier jour retire les procédures : une façon de plus de dire « il n'y a rien » à côté d'un îlot qui le dit déjà. */}
            {!premierJour && <ProceduresUtiles procedures={lu.procedures} Lien={props.Lien} prefixeDesPages={props.prefixeDesPages} />}
          </>
        }
      />
    </>
  )
}

/** Le chargement, que l'hôte passe en `fallback` de son `<Suspense>` : le conteneur parle, les rectangles se taisent. */
export function EcranDAccueilChargement() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="oto-sr-only">{ACCUEIL.chargement}</span>
      <Skeleton shape="text" width="16rem" />
      <HomeLayout main={<Skeleton shape="card" />} aside={<Skeleton shape="row" />} cards={<Skeleton shape="card" />} />
    </div>
  )
}
