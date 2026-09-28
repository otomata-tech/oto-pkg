"use client"

// « Partager sur le web » du panneau « Partager » (E05-S10, AC-d1 ; ADR-013) : pour qui a l'accès complet au
// contenu, un interrupteur qui crée le lien public `/p/<jeton>`, le lien à copier, « Inclure les
// sous-contenus » et « Désactiver le lien » (confirmé en place : l'adresse ne revient pas). Le lien se lit à
// l'ouverture du panneau (`GET shares?path=`), et non par la page à chaque affichage ; se crée ou se règle par
// `POST shares`, se désactive par `DELETE shares/<id>` ; le service décide (accès complet, ni la structure de
// l'arbre ni le Privé d'une autre personne), et son refus se dit dans l'alerte du panneau. Sans lui, un contenu
// ne se partage pas hors de l'organisation.
//
// Repris d'oto-frontend (`components/runs/acces-de-lexecution.tsx`, `LienPourLExterieur` ; `shared/commutateur.tsx`) :
// l'intitulé de section, le commutateur en balisage natif habillé du design system (`oto-choice`,
// `oto-switch-track`), le lien sous lui. Changé : le geste part au réseau, la copie par `ValeurCopiable`, la case
// des sous-contenus, la désactivation confirmée. Retiré : l'historique du lien.
import { useEffect, useId, useRef, useState, type Ref } from "react"
import { shareNodeSchema, type ShareView } from "../../schemas"
import { appelerPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { BOUTON_DISCRET } from "../components/classes"
import { useConfirmationEnLigne } from "../components/confirmation-en-ligne"
import { ValeurCopiable } from "../connexion/valeur-copiable"
import { Checkbox } from "../ds/react/checkbox"
import { PARTAGE_WEB, REFUS_DU_PARTAGE_WEB } from "../noeud/libelles"

/** L'adresse des pages publiques dans l'hôte (ADR-013 § 4 : `/p/<jeton>`), que la page `src/app/p/` monte. */
export const PREFIXE_PUBLIC = "/p/"

type Lecture = { etat: "en-cours" } | { etat: "echec" } | { etat: "lue"; lien: ShareView | null }

/**
 * Ce que le panneau dit pour la section, dans ses propres régions : une annonce (`role="status"`) ou un refus
 * (`role="alert"`). Les setters d'état du panneau, stables d'un rendu à l'autre.
 */
type Voix = { annoncer: (texte: string) => void; signaler: (texte: string) => void }

/** Le lien public du nœud, lu à l'ouverture du panneau ; `relire` rejoue une lecture en échec. */
function useLienPublic(chemin: string, signaler: Voix["signaler"]) {
  const [lecture, setLecture] = useState<Lecture>({ etat: "en-cours" })
  const [essai, setEssai] = useState(0)
  useEffect(() => {
    let monte = true
    void appelerPlateforme<{ share: ShareView | null }>({ methode: "GET", ressource: `shares?path=${encodeURIComponent(chemin)}` }).then((reponse) => {
      if (!monte) return
      if (reponse.erreur) signaler(messageDErreur(reponse.erreur, REFUS_DU_PARTAGE_WEB))
      setLecture(reponse.erreur ? { etat: "echec" } : { etat: "lue", lien: reponse.data.share ?? null })
    })
    return () => {
      monte = false
    }
  }, [chemin, essai, signaler])
  return {
    lecture,
    poser: (lien: ShareView | null) => setLecture({ etat: "lue", lien }),
    relire: () => {
      signaler("")
      setLecture({ etat: "en-cours" })
      setEssai((courant) => courant + 1)
    },
  }
}

/**
 * Le commutateur du design system en balisage natif (oto-frontend, `Commutateur`) : l'élément natif porte
 * l'état, le focus et `Espace` ; la piste est décorative.
 */
function Commutateur({ actif, desactive, basculer, entree }: { actif: boolean; desactive: boolean; basculer: () => void; entree: Ref<HTMLInputElement> }) {
  const id = useId()
  // Le nom est l'intitulé seul ; l'explication, sa description : dans le `<label>`, elle allongeait le nom.
  const idDuTitre = `${id}-titre`
  const idDeLExplication = `${id}-explication`
  return (
    <label className="oto-choice" htmlFor={id} data-disabled={desactive ? "" : undefined}>
      <input id={id} ref={entree} type="checkbox" role="switch" checked={actif} disabled={desactive} onChange={basculer} aria-labelledby={idDuTitre} aria-describedby={idDeLExplication} />
      <span className="oto-switch-track" aria-hidden="true" />
      <span className="oto-choice-text">
        <span id={idDuTitre}>{PARTAGE_WEB.titre}</span>
        <span id={idDeLExplication} className="oto-choice-desc">
          {PARTAGE_WEB.explication}
        </span>
      </span>
    </label>
  )
}

export function PartageSurLeWeb({ chemin, annoncer, signaler }: { chemin: string } & Voix) {
  const { lecture, poser, relire } = useLienPublic(chemin, signaler)
  const [enCours, setEnCours] = useState(false)
  const entree = useRef<HTMLInputElement>(null)
  const lien = lecture.etat === "lue" ? lecture.lien : null
  // Après tout geste (créer, régler, désactiver, refusé ou non), le focus revient à l'interrupteur, qui reste :
  // l'interrupteur et la case, désactivés pendant l'envoi, l'avaient perdu, et « Désactiver le lien » part avec
  // le lien. La demande est un état compté, posé avec la fin de l'envoi : une réponse immédiate rend le début
  // et la fin de l'envoi dans le même rendu (`accessibility-patterns.md § Focus Management`).
  const [demandeDeFocus, setDemandeDeFocus] = useState(0)
  const demandeServie = useRef(0)
  useEffect(() => {
    if (enCours || demandeDeFocus === demandeServie.current) return
    demandeServie.current = demandeDeFocus
    entree.current?.focus()
  })

  /** Un geste : le lien rendu posé et l'annonce faite, ou le refus dit ; `true` s'il a abouti. */
  async function envoyer<T>(envoi: { methode: "POST" | "DELETE"; ressource: string; corps?: unknown }, apres: (donnees: T) => ShareView | null, succes: string): Promise<boolean> {
    annoncer("")
    signaler("")
    setEnCours(true)
    const reponse = await appelerPlateforme<T>(envoi)
    setEnCours(false)
    setDemandeDeFocus((demande) => demande + 1)
    if (reponse.erreur) {
      signaler(messageDErreur(reponse.erreur, REFUS_DU_PARTAGE_WEB))
      return false
    }
    poser(apres(reponse.data))
    annoncer(succes)
    return true
  }

  const question = useConfirmationEnLigne({
    question: PARTAGE_WEB.question,
    libelleConfirmer: PARTAGE_WEB.desactiver,
    envoi: enCours,
    confirmer: () => {
      if (!lien) return
      // Aboutie ou refusée, la question se referme ; le focus va à l'interrupteur (plus haut).
      void envoyer<unknown>({ methode: "DELETE", ressource: `shares/${lien.id}` }, () => null, PARTAGE_WEB.desactive).then(() => question.refermer())
    },
  })

  // « Garder » ou Échap referment la question : le focus revient à l'interrupteur, d'où elle part le plus souvent,
  // et non au bouton « Désactiver le lien » (la question n'y garde pas de référence).
  const ouverte = question.ouverte
  const etaitOuverte = useRef(false)
  useEffect(() => {
    if (etaitOuverte.current && !ouverte) entree.current?.focus()
    etaitOuverte.current = ouverte
  }, [ouverte])

  function regler(corps: unknown, succes: string) {
    const valide = shareNodeSchema.safeParse(corps)
    if (valide.success) void envoyer<{ share: ShareView }>({ methode: "POST", ressource: "shares", corps: valide.data }, (donnees) => donnees.share, succes)
  }

  if (lecture.etat === "en-cours") {
    return (
      <p aria-busy="true" className="oto-caption">
        {PARTAGE_WEB.chargement}
      </p>
    )
  }
  if (lecture.etat === "echec") {
    return (
      <button type="button" className={BOUTON_DISCRET} onClick={relire}>
        {PARTAGE_WEB.reessayer}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <Commutateur actif={lien !== null} desactive={enCours} entree={entree} basculer={() => (lien ? question.demander() : regler({ path: chemin }, PARTAGE_WEB.cree))} />
      {lien && (
        <>
          <ValeurCopiable valeur={`${window.location.origin}${PREFIXE_PUBLIC}${lien.token}`} cible={PARTAGE_WEB.cible} />
          <Checkbox
            label={PARTAGE_WEB.sousContenus}
            description={PARTAGE_WEB.sousContenusDetail}
            checked={lien.includeChildren}
            disabled={enCours}
            onChange={(evenement) => regler({ path: chemin, include_children: evenement.target.checked }, evenement.target.checked ? PARTAGE_WEB.avecSousContenus : PARTAGE_WEB.sansSousContenus)}
          />
          {question.ouverte ? (
            question.rendu
          ) : (
            <button type="button" className={BOUTON_DISCRET} disabled={enCours} onClick={question.demander}>
              {PARTAGE_WEB.desactiver}
            </button>
          )}
        </>
      )}
    </div>
  )
}
