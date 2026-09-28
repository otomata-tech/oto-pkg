// La liste des conversations du journal (E05-S05, AC2, AC3, AC6) : un tableau par code `ctx`, la plus
// récente d'abord, 50 lignes au plus, et son pied (suite, borne de 2 000 appels). Server Component : il
// met chaque conversation en mots et en adresses, que le tableau (îlot client) rend tels quels.
//
// Porté d'oto-frontend (`journal-des-appels.tsx`, `deroules-du-suivi.tsx`) : l'avertissement titré d'une
// liste qui s'arrête avant la fin, en ton d'examen et non d'échec (une limite n'est pas une panne) ; l'état
// vide qui propose d'élargir ; la lecture en échec dans l'`Alert` du design system (E05-S09, partie d1).
// Changé : une suite existe (le curseur du service), « Conversations plus anciennes » y mène. Retiré :
// `useCallLog`, le hors-scope d'un déroulé, `run_id` et « Jamais clôturée » (un `ctx` par conversation, H27).
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight"
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise"
import type { ConversationSummary, JournalPage } from "../../schemas"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { EmptyState } from "../ds/react/empty-state"
import { AnimatedIcon } from "../ds/react/icon"
import { Alert } from "../ds/react/primitives"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { dateEtHeureLisibles } from "../format/dates"
import { ABSENT, AUCUNE_CONVERSATION, ELARGIR, LISTE_ARRETEE, PERIODE_TRONQUEE, PERSONNE_RETIREE, RETIRER_LES_FILTRES } from "./libelles"
import { TableauDesConversations, type LigneDeConversation } from "./tableau-des-conversations"

export type ListeDesConversationsProps = {
  resultat: Resultat<JournalPage>
  Lien: LienDeLHote
  /** L'adresse courante, pour « Réessayer ». */
  ici: string
  /** L'adresse qui ouvre une conversation, filtres gardés. */
  hrefDOuverture: (code: string) => string
  /** L'adresse de la page suivante, par son curseur. */
  hrefDeLaSuite: (curseur: string) => string
  hrefDuNoeud: (chemin: string) => string
  /** Un filtre (équipe, personne, erreurs) est posé : l'état vide propose de le retirer (AC2). */
  filtrePose: boolean
  /** L'adresse du journal sans paramètre. */
  sansFiltre: string
}

/**
 * La procédure servie ; sinon « Aucune » et la demande, déjà coupée par le service
 * (`JOURNAL_REQUEST_CHARS`) ; « — » sans `context` visible.
 */
function servie(conversation: ConversationSummary): string {
  if (!conversation.context) return ABSENT
  return conversation.request ? `Aucune « ${conversation.request} »` : "Aucune"
}

function versLigne(conversation: ConversationSummary, props: Pick<ListeDesConversationsProps, "hrefDOuverture" | "hrefDuNoeud">): LigneDeConversation {
  return {
    ctx: conversation.ctx,
    debut: dateEtHeureLisibles(conversation.startedAt) ?? ABSENT,
    personne: conversation.userName ?? PERSONNE_RETIREE,
    hote: conversation.host ?? ABSENT,
    procedure: conversation.procedurePath ? { chemin: conversation.procedurePath, href: props.hrefDuNoeud(conversation.procedurePath) } : null,
    servie: servie(conversation),
    appels: conversation.calls,
    erreurs: conversation.errors,
    ouverture: props.hrefDOuverture(conversation.ctx),
  }
}

function Vide({ filtrePose, sansFiltre, Lien }: Pick<ListeDesConversationsProps, "filtrePose" | "sansFiltre" | "Lien">) {
  return (
    <EmptyState
      icon={<AnimatedIcon as={ClockCounterClockwise} size="lg" />}
      title={AUCUNE_CONVERSATION}
      action={
        filtrePose && (
          <Lien href={sansFiltre} className="oto-btn anim-host" data-variant="secondary" data-size="md">
            <span>{RETIRER_LES_FILTRES}</span>
          </Lien>
        )
      }
    >
      {ELARGIR}
    </EmptyState>
  )
}

/** La liste, dans l'un de ses trois états servis : erreur, vide, données ; le chargement est celui de l'écran. */
export function ListeDesConversations({ resultat, ...props }: ListeDesConversationsProps) {
  const { Lien } = props
  if (resultat.error !== undefined) return <ErreurDeLecture message={resultat.error} href={props.ici} Lien={Lien} />
  const page = resultat.data
  return (
    <div className="flex flex-col gap-4">
      {/* Une liste qui ne dit pas qu'elle est incomplète se lirait comme complète (AC6). */}
      {page.truncated && (
        <Alert tone="review" title={LISTE_ARRETEE}>
          {PERIODE_TRONQUEE}
        </Alert>
      )}
      {page.conversations.length === 0 ? (
        <Vide filtrePose={props.filtrePose} sansFiltre={props.sansFiltre} Lien={Lien} />
      ) : (
        <TableauDesConversations lignes={page.conversations.map((conversation) => versLigne(conversation, props))} />
      )}
      {page.nextCursor && (
        <Lien href={props.hrefDeLaSuite(page.nextCursor)} className="oto-list-more">
          Conversations plus anciennes
          <AnimatedIcon as={ArrowRight} size="xs" />
        </Lien>
      )}
    </div>
  )
}
