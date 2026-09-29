"use client"

// La publication seule et le bandeau du brouillon (E05-S02, AC8, AC9, AC17 ; H63 ; E05-S10, AC-a6). Au
// niveau gestion, aucun bouton « Publier » : ce qui est écrit est publié 3 s après la dernière frappe de la
// personne, et quand elle quitte la page (navigation de l'hôte, `pagehide`, onglet caché). La publication part
// par la file, après les écritures qui la précèdent, avec la révision publiée lue et le dernier tampon du
// brouillon (même service que le bouton d'hier, `publish_node`, garde de révision comprise) ; un champ dont le
// texte est refusé, ou un conflit ouvert, la retient. Un échec se dit, avec « Réessayer », et le texte reste
// dans le brouillon ; la frappe suivante republie. Au niveau écriture, la phrase qui dit à qui revient la
// publication. Rendus par l'éditeur et, pour un tableau sans éditeur, par l'écran (HN-E05S02-27). Sans eux,
// rien d'écrit à l'écran ne serait lu par les assistants, qui lisent la version publiée.
//
// E05-S04 : un refus du contrôle d'une procédure se dit refus par refus, chacun menant à son bloc (AC7) ; un
// Contexte vide ne se publie qu'après confirmation (AC11), sans que la question prenne le focus de celui qui
// écrit. E05-S10 retire le bouton, « Publié en révision N. » et, au niveau gestion, le bandeau d'un brouillon
// que la personne vient d'écrire. E11-S10 (AC-g3) retire la phrase de recharge des conversations.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import type { NodeKind } from "../../schemas"
import type { ErreurPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { PUBLICATION_DU_CONTEXTE } from "../contexte/libelles"
import { Button } from "../ds/react/primitives"
import { useRafraichir } from "../hote/rafraichir"
import { publicationRefusee } from "../procedure/libelles"
import { lireLesRefus, RefusDePublication, type RefusLu } from "../procedure/refus-de-publication"
import { useFileDOperations } from "./editeur/file-d-operations"
import { PUBLICATION, PUBLICATION_SEULE } from "./libelles"

/** 3 s sans frappe : la décision de JB du 2026-09-27 (E05-S10, AC-a6). */
export const DELAI_DE_PUBLICATION_MS = 3_000

type BlocAncre = { id?: string; ref?: string }

type PublicationProps = {
  /** Gestion (3) : la publication seule ; écriture (2) : `phrase`, à qui revient la publication. */
  niveau: 2 | 3
  phrase: string
  /** Le genre du nœud (E05-S04) : un Contexte confirme sa publication vide. */
  genre?: NodeKind
  /**
   * Les blocs du brouillon (E05-S04) : un refus y trouve la référence de son bloc (AC7) ; sans bloc, un
   * Contexte demande confirmation avant de publier (AC11).
   */
  blocs?: readonly BlocAncre[]
}

/**
 * Le bandeau d'un brouillon (AC9) : au niveau écriture, dès le premier geste enregistré, sans relecture ; au
 * niveau gestion, seulement pour un brouillon trouvé à l'ouverture (écrit par un assistant) tant que la
 * personne n'a rien écrit : le sien se publie seul (E05-S10, AC-a6). Un avis, pas une alerte.
 */
export function BandeauDuBrouillon({ lien, niveau }: { lien: ReactNode; niveau: 2 | 3 }) {
  const file = useFileDOperations()
  if (!file.brouillon || (niveau === 3 && file.ecrit)) return null
  return (
    <div className="oto-alert" data-tone="review">
      <div className="oto-alert-body flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="oto-alert-title">
          {file.revision > 0 ? `Brouillon non publié — ouvert sur la révision ${file.revision}.` : "Brouillon non publié — cette page n'a jamais été publiée."}
        </p>
        {lien}
      </div>
    </div>
  )
}

function refusDeLaPublication(erreur: ErreurPlateforme): string {
  if (erreur.statut === 401) return messageDErreur(erreur)
  if (erreur.code === "stale_revision") return PUBLICATION_SEULE.pageChangee
  if (erreur.code === "forbidden") return PUBLICATION.refusee
  return messageDErreur(erreur)
}

/** Ce que les gestes rendus lisent du moteur de la publication, posé par son effet. */
type Commandes = { reessayer: () => void; confirmerLeContexteVide: () => void }

/**
 * Le moteur de la publication seule : il écoute les frappes de la page, publie 3 s après la dernière et à la
 * sortie de la page ; les gestes (« Réessayer », « Publier quand même ») passent par `commandes`.
 */
function usePublicationSeule({ genre, blocs }: { genre?: NodeKind; blocs: readonly BlocAncre[] }) {
  const { envoyer, ecouterLesFrappes, preparer, aUnBrouillon, remplacerLArret } = useFileDOperations()
  const rafraichir = useRafraichir()
  const [erreur, setErreur] = useState("")
  const [refus, setRefus] = useState<RefusLu[] | null>(null)
  const [contexteVide, setContexteVide] = useState(false)
  // Le dernier rendu, lu au départ de la publication : un minuteur armé plus tôt publie l'état courant.
  const lus = useRef({ genre, blocs, rafraichir })
  useLayoutEffect(() => {
    lus.current = { genre, blocs, rafraichir }
  })
  const commandes = useRef<Commandes>({ reessayer: () => {}, confirmerLeContexteVide: () => {} })

  useEffect(() => {
    const etat: { minuteur?: ReturnType<typeof setTimeout>; aPublier: boolean } = { aPublier: false }
    const partir = () => {
      etat.aPublier = false
      envoyer({
        tampon: true,
        // Partie à la fermeture de l'onglet (`pagehide`), la publication doit survivre à la page.
        keepalive: true,
        // Sans brouillon à l'envoi (rien n'a été écrit, ou tout est déjà publié), rien ne part.
        corps: () => (aUnBrouillon() ? { publish: true } : null),
        issue: (issue) => {
          if (!issue.erreur) {
            setErreur("")
            setRefus(null)
            setContexteVide(false)
            return lus.current.rafraichir()
          }
          // Un refus n'arrête pas l'édition : la publication sort de la file, le texte reste dans le brouillon.
          etat.aPublier = true
          remplacerLArret(null)
          // Le contrôle d'une procédure nomme chaque problème par son emplacement (E03-S06, `details.refusals`).
          const lusRefus = issue.erreur.code === "invalid_arguments" ? lireLesRefus(issue.erreur.details) : null
          setRefus(lusRefus)
          setErreur(lusRefus ? "" : refusDeLaPublication(issue.erreur))
          if (issue.erreur.code === "stale_revision" || issue.erreur.code === "not_found") lus.current.rafraichir()
        },
      })
    }
    /** `sortie` : l'onglet se ferme peut-être ; les textes en attente partent en `keepalive`, comme la publication. */
    const publier = (sortie = false) => {
      clearTimeout(etat.minuteur)
      if (!etat.aPublier) return
      // Retenue (texte refusé, conflit, écriture arrêtée) : elle se réessaie après le même délai.
      if (!preparer(sortie)) {
        etat.minuteur = setTimeout(() => publier(), DELAI_DE_PUBLICATION_MS)
        return
      }
      if (lus.current.genre === "context" && lus.current.blocs.length === 0) return setContexteVide(true)
      partir()
    }
    const frappe = () => {
      etat.aPublier = true
      clearTimeout(etat.minuteur)
      etat.minuteur = setTimeout(() => publier(), DELAI_DE_PUBLICATION_MS)
    }
    const fermee = () => publier(true)
    const cachee = () => {
      if (document.visibilityState === "hidden") publier(true)
    }
    commandes.current = {
      reessayer: () => {
        etat.aPublier = true
        publier()
      },
      confirmerLeContexteVide: () => {
        setContexteVide(false)
        partir()
      },
    }
    const desabonner = ecouterLesFrappes(frappe)
    window.addEventListener("pagehide", fermee)
    document.addEventListener("visibilitychange", cachee)
    return () => {
      desabonner()
      window.removeEventListener("pagehide", fermee)
      document.removeEventListener("visibilitychange", cachee)
      // La page quittée par une navigation de l'hôte : ce qui attend sa publication part maintenant.
      publier()
      clearTimeout(etat.minuteur)
    }
  }, [envoyer, ecouterLesFrappes, preparer, aUnBrouillon, remplacerLArret])

  return { erreur, refus, contexteVide, commandes }
}

function PublicationSeule({ genre, blocs }: { genre?: NodeKind; blocs: readonly BlocAncre[] }) {
  const { erreur, refus, contexteVide, commandes } = usePublicationSeule({ genre, blocs })
  return (
    <div role="group" aria-label="Publication" className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${refus ? "basis-full" : ""}`}>
      {erreur && (
        <>
          <p role="alert" className="text-sm text-ink">
            {erreur}
          </p>
          <Button variant="secondary" size="sm" onClick={() => commandes.current.reessayer()}>
            {PUBLICATION_SEULE.reessayer}
          </Button>
        </>
      )}
      {contexteVide && (
        // La question ne prend pas le focus : elle naît pendant qu'on écrit (AC11 d'E05-S04).
        <div role="group" aria-label={PUBLICATION_SEULE.contexteVide} className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink">{PUBLICATION_DU_CONTEXTE.question}</p>
          <Button variant="secondary" size="sm" onClick={() => commandes.current.confirmerLeContexteVide()}>
            {PUBLICATION_DU_CONTEXTE.confirmer}
          </Button>
        </div>
      )}
      {refus && (
        <div className="basis-full space-y-2">
          <p role="alert" className="text-sm font-medium text-ink">
            {publicationRefusee(refus.length)}
          </p>
          <RefusDePublication refus={refus} blocs={blocs} />
        </div>
      )}
    </div>
  )
}

export function Publication({ niveau, phrase, genre, blocs = [] }: PublicationProps) {
  if (niveau < 3) return <p className="oto-caption">{phrase}</p>
  return <PublicationSeule genre={genre} blocs={blocs} />
}
