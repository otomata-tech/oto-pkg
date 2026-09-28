// « Journal » (E05-S05, AC1 à AC8, AC14) : les conversations que l'appelant voit (H74, portée
// décidée par le service), filtrées par l'adresse de l'hôte, et le détail de l'une d'elles
// (`?conversation=`). Server Component : il aiguille et calcule les adresses ; seuls la période, le tableau
// et le tiroir sont des îlots client, qui reçoivent des données et des adresses. La navigation vient de
// l'hôte (`Lien`, `hrefDuJournal`, `hrefDuNoeud`), `ui/` n'importe aucun routeur.
//
// Porté d'oto-frontend par E05-S09 (partie d1 ; `suivi-de-lentreprise.tsx`, `journal-des-appels.tsx`,
// `deroules-du-suivi.tsx`, `fiche-dun-appel.tsx`, `timeline-dun-deroule.tsx`, `fenetre-du-suivi.tsx`,
// `etats-du-suivi.tsx`, `schemas/monitoring.ts`) : l'en-tête d'écran, dont la période est l'action (elle
// commande tout l'écran) ; un îlot, les filtres puis le tableau ; le détail dans un tiroir ouvert par
// l'adresse ; l'état porté par l'URL, les valeurs illisibles rattrapées et dites, un message constant par
// état. Changé : l'écran est le journal seul (une lentille), les conversations groupées par code `ctx`, les
// filtres par équipe, personne et erreurs. Retiré : TanStack Router et Query, les six onglets du suivi,
// `run_id` et le vocabulaire de déroulé (architecture § 10).
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise"
import { JOURNAL_PERIODS, type ConversationDetail, type JournalFilters, type JournalPage, type JournalParam, type MemberView, type TeamView } from "../../schemas"
import { messageDErreur } from "../api/messages"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { Icon } from "../ds/react/icon"
import { Island, IslandBody } from "../ds/react/island"
import { ScreenHeader } from "../ds/react/screen-header"
import { Skeleton } from "../ds/react/skeleton"
import { pluriel } from "../equipes/libelles"
import { PanneauDeConversation } from "./conversation"
import { ListeDesConversations } from "./conversations"
import { FiltresDuJournal } from "./filtres-du-journal"
import { FILTRE_IGNORE, META, SUITE_PERIMEE, TITRE } from "./libelles"
import { PeriodeDuJournal } from "./periode-du-journal"

/** Les paramètres d'une adresse du journal ; un paramètre absent n'y est pas écrit. */
export type ParametresDuJournal = Partial<Record<JournalParam, string>>

export type EcranDuJournalProps = {
  /** La page de conversations de la période. */
  resultat: Resultat<JournalPage>
  /** Les paramètres de l'adresse, lus par `journalFiltersSchema`. */
  filtres: JournalFilters
  /** La conversation que l'adresse nomme (`null` : introuvable), lue seulement quand elle en nomme une. */
  conversation?: Resultat<ConversationDetail | null>
  /** Les options des filtres : les équipes et les membres de l'organisation (AC4). */
  equipes: Resultat<TeamView[]>
  personnes: Resultat<MemberView[]>
  Lien: LienDeLHote
  /** L'adresse de l'hôte pour ces paramètres : une chaîne rendue ici, jamais passée à un client. */
  hrefDuJournal: (parametres: ParametresDuJournal) => string
  hrefDuNoeud: (chemin: string) => string
}

// La phrase d'une panne, lue dans la table des messages comme le fait `resultatDe`.
const ECHEC = messageDErreur({ code: "internal", statut: 0 })

/** Les paramètres rattrapés que dit la phrase générale ; le curseur et le code ont la leur (AC6, AC7). */
const FILTRES_DITS: readonly JournalParam[] = ["periode", "equipe", "personne", "erreurs", "appels"]

/** Équipe, personne ou erreurs seulement : la période n'est pas un filtre, l'état vide la nomme (AC2). */
function filtrePose(filtres: JournalFilters): boolean {
  return filtres.equipe !== undefined || filtres.personne !== undefined || filtres.erreurs !== undefined
}

/**
 * Les adresses de l'écran. Chaque lien ne change que son paramètre : la liste garde la conversation
 * ouverte, la conversation garde la page de la liste ; un curseur de liste périmé n'est pas recopié ;
 * changer de période oublie la suite de la liste et la conversation ouverte.
 */
function liensDe({ filtres, resultat, hrefDuJournal }: EcranDuJournalProps) {
  const liste = { periode: String(filtres.periode), equipe: filtres.equipe, personne: filtres.personne, erreurs: filtres.erreurs }
  const curseur = resultat.data?.restarted ? undefined : filtres.curseur
  const ouverte = { conversation: filtres.conversation, appels: filtres.appels }
  return {
    ici: hrefDuJournal({ ...liste, curseur: filtres.curseur, ...ouverte }),
    sansFiltre: hrefDuJournal({}),
    fermer: hrefDuJournal({ ...liste, curseur }),
    periode: (jours: number) => hrefDuJournal({ ...liste, periode: String(jours) }),
    ouverture: (code: string) => hrefDuJournal({ ...liste, curseur, conversation: code }),
    suite: (suivant: string) => hrefDuJournal({ ...liste, curseur: suivant, ...ouverte }),
    appelsSuivants: (suivants: string) => hrefDuJournal({ ...liste, curseur, conversation: filtres.conversation, appels: suivants }),
  }
}

/**
 * Ce que l'adresse demandait sans être comprise. Au dessin de l'`Alert` du design system, sans son rôle de
 * région : le message vient de l'URL, présent au rendu du serveur, il ne serait pas annoncé
 * (`accessibility-patterns.md § Régions dynamiques`).
 */
function Avertissements({ filtres, resultat }: Pick<EcranDuJournalProps, "filtres" | "resultat">) {
  const ignore = filtres.ignored.some((parametre) => FILTRES_DITS.includes(parametre))
  const suitePerimee = filtres.ignored.includes("curseur") || resultat.data?.restarted === true
  if (!ignore && !suitePerimee) return null
  return (
    <div className="oto-alert" data-tone="review">
      <div className="oto-alert-body">
        {ignore && <p className="oto-alert-title">{FILTRE_IGNORE}</p>}
        {suitePerimee && <p className="oto-alert-title">{SUITE_PERIMEE}</p>}
      </div>
    </div>
  )
}

/** La conversation que l'adresse nomme ; un code mal formé répond comme un code inconnu (H68, AC7). */
function conversationOuverte({ filtres, conversation }: EcranDuJournalProps): Resultat<ConversationDetail | null> | null {
  if (filtres.ignored.includes("conversation")) return { data: null }
  if (filtres.conversation === undefined) return null
  return conversation ?? { error: ECHEC }
}

/** « 12 conversations · 85 appels » : ce que la période compte, filtres compris ; la phrase de l'écran sinon. */
function meta({ resultat }: EcranDuJournalProps): string {
  if (!resultat.data) return META
  return `${pluriel(resultat.data.total, "conversation", "conversations")} · ${pluriel(resultat.data.calls, "appel", "appels")}`
}

export function EcranDuJournal(props: EcranDuJournalProps) {
  const { filtres, Lien } = props
  const liens = liensDe(props)
  const conversation = conversationOuverte(props)
  const periodes = JOURNAL_PERIODS.map((jours) => ({ valeur: String(jours), libelle: `${jours} jours`, href: liens.periode(jours) }))
  return (
    <>
      <ScreenHeader
        title={TITRE}
        icon={<Icon as={ClockCounterClockwise} size="sm" />}
        meta={meta(props)}
        actions={<PeriodeDuJournal periodes={periodes} valeur={String(filtres.periode)} />}
      />
      <Island aria-label="Le journal des conversations">
        <IslandBody className="flex flex-col gap-4">
          <FiltresDuJournal filtres={filtres} equipes={props.equipes} personnes={props.personnes} adresse={liens.sansFiltre} ici={liens.ici} filtrePose={filtrePose(filtres)} Lien={Lien} />
          <Avertissements filtres={filtres} resultat={props.resultat} />
          <ListeDesConversations
            resultat={props.resultat}
            Lien={Lien}
            ici={liens.ici}
            hrefDOuverture={liens.ouverture}
            hrefDeLaSuite={liens.suite}
            hrefDuNoeud={props.hrefDuNoeud}
            filtrePose={filtrePose(filtres)}
            sansFiltre={liens.sansFiltre}
          />
        </IslandBody>
      </Island>
      {/* Une clé par conversation : un tiroir fermé ne reste pas fermé quand l'adresse en ouvre une autre. */}
      {conversation && (
        <PanneauDeConversation
          key={filtres.conversation ?? "introuvable"}
          resultat={conversation}
          Lien={Lien}
          ici={liens.ici}
          fermer={liens.fermer}
          hrefDesAppelsSuivants={liens.appelsSuivants}
        />
      )}
    </>
  )
}

/** L'état de chargement, rendu par le `loading.tsx` de l'hôte (AC2). */
export function EcranDuJournalChargement() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="oto-sr-only">Chargement du journal…</span>
      <Skeleton shape="text" width="20%" />
      {["un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit"].map((rang) => (
        <Skeleton key={rang} shape="row" />
      ))}
    </div>
  )
}
