"use client"

// La décision sur la ligne courante de la file de revue (E07-S03, AC11 à AC14 ; H99, HN-E07S03-2,
// HN-E07S03-6) : la ligne (sa clé, puis ses valeurs), la raison facultative, puis « Refuser → <état> » et
// « Approuver → <état> », qui envoient `POST tables/review` avec la clé et la révision lues. L'issue
// s'annonce (« P-003 → qualifié. », ou la ligne sautée parce qu'elle a changé), le focus va à l'îlot de la
// file, et la page se relit : la ligne suivante paraît. Un refus se dit sous la ligne, la raison gardée.
// Les décisions de la session font le résumé à copier ; l'îlot, monté avec la clé du tableau, les garde
// d'une relecture à l'autre. Reçoit des données et les valeurs déjà rendues, jamais une fonction
// (`portage-ecrans.md § 2`). Sans lui, une personne ne décide pas d'une ligne à l'écran.
//
// Porté d'oto-frontend (`src/components/shared/attentes.tsx`, `WaitItem`, `wait-decision-dialog.tsx`) : une
// demande, son glyphe, la réponse en ligne sans étiquette visible (son nom accessible), deux boutons (le
// refus à gauche, l'accord à droite, `disabled` et `aria-busy` pendant l'envoi), la raison gardée après un
// échec, dit par une alerte, le focus rendu à l'îlot après une décision. Retiré : le dialogue de
// confirmation (un clic par ligne, E07-S03), « GO », la relecture d'une exécution (`runId`), les courriels
// non branchés.
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Pause } from "@phosphor-icons/react/dist/csr/Pause"
import { useForm } from "react-hook-form"
import { REVIEW_REASON_MAX, reviewDecisionSchema, type ReviewOutcome } from "../../schemas"
import { appelerPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { replierLeFocusSur } from "../components/focus"
import { AnimatedIcon } from "../ds/react/icon"
import { InputAffix } from "../ds/react/input-affix"
import { Alert, Button } from "../ds/react/primitives"
import { Select } from "../ds/react/select"
import { WaitItem } from "../ds/react/wait-list"
import { dateCourte } from "../format/dates"
import { useRafraichir } from "../hote/rafraichir"
import { FICHE, MESSAGES_DE_LA_REVUE, refuseeAvecRaison, resumeDeLaRevue, REVUE, type SessionDeRevue } from "./libelles"
import { ResumeDeRevue } from "./resume-de-revue"

/** La raison, seul champ de la décision : le schéma de l'API, réduit à elle (`forms-patterns.md § Principe`). */
const raisonSchema = reviewDecisionSchema.pick({ reason: true })

type Raison = { reason?: string }
type Decision = "approve" | "reject"

/** Une ligne de la file : sa clé, la révision lue, et ses valeurs rendues par la file au format de la grille. */
type LigneARevoir = { key: string; revision: number; valeurs: ReactNode }

type DecisionDeRevueProps = {
  /** Le chemin du tableau. */
  table: string
  /** Les premières lignes de la file, dans l'ordre des clés ; vide quand il n'y a rien à revoir. */
  lignes: readonly LigneARevoir[]
  /** Le nombre de lignes à revoir : au-delà des lignes lues, la fiche dit qu'il en reste (HN-M54-5). */
  total: number
  /** Les états que posent les deux décisions (`review.reject`, `review.approve`). */
  etats: { refuser: string; approuver: string }
  /** L'identifiant de l'îlot de la file, qui reçoit le focus après une décision. */
  ancre: string
}

const SESSION_VIDE: SessionDeRevue = { approuvees: [], refusees: [], sautees: [] }

/**
 * La session après une issue : une décision écrite compte dans son état, une ligne sautée à part (AC12,
 * AC14) ; un refus garde sa raison, que le résumé rend à l'assistant (fiche D99, M54, P4).
 */
function avecLIssue(session: SessionDeRevue, issue: ReviewOutcome, decision: Decision, raison: string | undefined): SessionDeRevue {
  if (issue.outcome === "skipped") return { ...session, sautees: [...session.sautees, issue.key] }
  if (decision === "approve") return { ...session, approuvees: [...session.approuvees, issue.key] }
  return { ...session, refusees: [...session.refusees, raison ? refuseeAvecRaison(issue.key, raison) : issue.key] }
}

/** Les fiches de la file en choix de la liste. */
function optionsDesFiches(lignes: readonly LigneARevoir[]) {
  return lignes.map((ligne) => ({ value: ligne.key, label: ligne.key }))
}

type ChoixDeLaFicheProps = {
  id: string
  lignes: readonly LigneARevoir[]
  total: number
  courante: string
  occupe: boolean
  choisir: (cle: string, retour?: boolean) => void
}

/**
 * Choisir la fiche à décider, ou passer à la suivante (fiche D99, M54, P2) : sans lui, une ligne rendue par
 * l'assistant ne se décide qu'après toutes celles dont la clé la précède. Rien sous deux fiches. Quand la
 * file compte plus de lignes que les fiches lues, il le dit (« 20 premières sur 57 »), et « Passer » depuis
 * la dernière dit son retour à la première (HN-M54-5).
 */
function ChoixDeLaFiche({ id, lignes, total, courante, occupe, choisir }: ChoixDeLaFicheProps) {
  if (lignes.length < 2) return null
  const rang = lignes.findIndex((ligne) => ligne.key === courante)
  const retour = rang + 1 >= lignes.length
  const suivante = lignes[retour ? 0 : rang + 1].key
  return (
    <div className="flex flex-wrap items-center gap-2 px-2">
      <label htmlFor={`${id}-fiche`} className="oto-caption">
        {FICHE.choisir}
      </label>
      <Select id={`${id}-fiche`} size="sm" value={courante} disabled={occupe} options={optionsDesFiches(lignes)} onChange={(evenement) => choisir(evenement.target.value)} />
      <Button variant="ghost" size="sm" disabled={occupe} onClick={() => choisir(suivante, retour)}>
        {FICHE.passer}
      </Button>
      {total > lignes.length && <span className="oto-caption">{FICHE.premieres(lignes.length, total)}</span>}
    </div>
  )
}

export function DecisionDeRevue({ table, lignes, total, etats, ancre }: DecisionDeRevueProps) {
  const id = useId()
  const rafraichir = useRafraichir()
  const racine = useRef<HTMLDivElement>(null)
  const refuser = useRef<HTMLButtonElement>(null)
  const approuver = useRef<HTMLButtonElement>(null)
  // Un double clic arrive avant que les boutons désactivés soient rendus : ce verrou tient l'envoi unique.
  const enCours = useRef(false)
  const relireApresLAlerte = useRef(false)
  const aRendreLeFocus = useRef<Decision | null>(null)
  const [envoi, setEnvoi] = useState<Decision | null>(null)
  const [annonce, setAnnonce] = useState("")
  const [alerte, setAlerte] = useState("")
  const [session, setSession] = useState(SESSION_VIDE)
  // La fiche choisie, par sa clé ; absente de la file relue (décidée, partie) : la première.
  const [choisie, setChoisie] = useState<string | null>(null)
  const form = useForm<Raison>({ resolver: zodResolver(raisonSchema), defaultValues: { reason: "" } })
  const erreurDeRaison = form.formState.errors.reason !== undefined
  const rang = Math.max(0, lignes.findIndex((une) => une.key === choisie))
  const ligne = lignes[rang] ?? null

  /** Une autre fiche : la raison saisie pour la précédente part avec elle, la fiche montrée s'annonce, et le retour à la première. */
  function choisir(cle: string, retour = false) {
    setChoisie(cle)
    form.reset({ reason: "" })
    setAlerte("")
    setAnnonce(retour ? FICHE.retour(cle, total > lignes.length) : FICHE.montree(cle))
  }

  useEffect(() => {
    // L'alerte « Cette ligne n'existe plus. » est rendue, donc annoncée : la relecture peut emporter la ligne.
    if (!alerte || !relireApresLAlerte.current) return
    relireApresLAlerte.current = false
    rafraichir()
  }, [alerte, rafraichir])

  // Après chaque rendu, et non au seul changement d'`envoi` : une réponse rapide rend l'envoi et sa fin
  // dans le même rendu. Après un refus, le focus revient au bouton pressé, réactivé : la raison est encore là.
  useEffect(() => {
    if (envoi !== null || aRendreLeFocus.current === null) return
    const bouton = aRendreLeFocus.current === "reject" ? refuser.current : approuver.current
    aRendreLeFocus.current = null
    bouton?.focus()
  })

  async function decider(decision: Decision, { reason }: Raison) {
    if (!ligne || enCours.current) return
    enCours.current = true
    setEnvoi(decision)
    setAnnonce("")
    setAlerte("")
    try {
      const corps = { table, key: ligne.key, revision: ligne.revision, decision, ...(reason ? { reason } : {}) }
      const reponse = await appelerPlateforme<ReviewOutcome>({ methode: "POST", ressource: "tables/review", corps })
      if (reponse.erreur) {
        relireApresLAlerte.current = reponse.erreur.code === "not_found"
        aRendreLeFocus.current = decision
        setAlerte(messageDErreur(reponse.erreur, MESSAGES_DE_LA_REVUE))
        return
      }
      const issue = reponse.data
      setSession((avant) => avecLIssue(avant, issue, decision, reason))
      setAnnonce(issue.outcome === "decided" ? REVUE.decidee(issue.key, issue.state) : REVUE.sautee(issue.key, issue.currentState))
      // La ligne décidée quitte la file : la fiche suivante reste choisie après la relecture.
      setChoisie(lignes[rang + 1]?.key ?? null)
      form.reset({ reason: "" })
      // La ligne décidée quitte la file à la relecture : le focus l'attend sur l'îlot de la file.
      replierLeFocusSur(ancre, racine.current)
      rafraichir()
    } finally {
      enCours.current = false
      setEnvoi(null)
    }
  }

  const decisions = session.approuvees.length + session.refusees.length + session.sautees.length
  // Calculé au navigateur, après une décision : jamais au rendu du serveur, où la session est vide.
  const resume = decisions > 0 ? resumeDeLaRevue(table, dateCourte(new Date().toISOString()) ?? "", session, { approuver: etats.approuver, refuser: etats.refuser }) : null
  const envoyer = (decision: Decision) => () => void form.handleSubmit((saisie) => decider(decision, saisie))()
  const gestes = ligne && (
    <>
      <InputAffix
        aria-label={REVUE.raison}
        placeholder={REVUE.raisonInvite}
        maxLength={REVIEW_REASON_MAX}
        invalid={erreurDeRaison}
        aria-invalid={erreurDeRaison || undefined}
        aria-describedby={erreurDeRaison ? `${id}-raison-erreur` : undefined}
        {...form.register("reason")}
      />
      {/* L'accord n'est pas le premier bouton du clavier : le refus d'abord, l'accord en dernier. */}
      <Button ref={refuser} variant="secondary" size="sm" disabled={envoi !== null} aria-busy={envoi === "reject" || undefined} onClick={envoyer("reject")}>
        {REVUE.refuser(etats.refuser)}
      </Button>
      <Button ref={approuver} variant="primary" size="sm" disabled={envoi !== null} aria-busy={envoi === "approve" || undefined} onClick={envoyer("approve")}>
        {REVUE.approuver(etats.approuver)}
      </Button>
    </>
  )
  return (
    <div ref={racine} className="flex flex-col gap-2">
      {ligne && <ChoixDeLaFiche id={id} lignes={lignes} total={total} courante={ligne.key} occupe={envoi !== null} choisir={choisir} />}
      {ligne && <WaitItem icon={<AnimatedIcon as={Pause} anim="pop" size="xs" />} demand={ligne.key} source={ligne.valeurs} actions={gestes} />}
      {erreurDeRaison && (
        <p id={`${id}-raison-erreur`} className="oto-field-error px-2">
          {REVUE.raisonTropLongue}
        </p>
      )}
      {/* Montée vide : l'issue d'une décision s'annonce quand elle arrive. */}
      <p role="status" className="px-2 text-sm text-ink">
        {annonce}
      </p>
      {alerte && <Alert tone="fail">{alerte}</Alert>}
      {resume && <ResumeDeRevue key={resume} texte={resume} />}
    </div>
  )
}
