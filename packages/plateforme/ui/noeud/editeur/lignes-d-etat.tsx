"use client"

// Ce que l'éditeur dit de ses écritures (E05-S02, AC10, AC12, AC15, AC18 ; E05-S09, partie c1) : la ligne
// d'état, montée vide au premier rendu (« Enregistrement… », « Enregistré. ») ; la ligne
// d'annonce, « Bloc supprimé. » et « Annuler » pendant dix secondes ; l'alerte d'un refus, près du texte,
// avec ce qu'on peut y faire. Sans elles, un geste partirait sans que personne ne sache s'il est arrivé.
//
// Porté d'oto-frontend (`save-status.tsx`, `SaveLine`, `SaveAlerts` ; `shared/undoable-status-line.tsx`).
// Repris : les régions montées en permanence, jamais remontées, un seul minuteur nettoyé, la copie honnête,
// la ligne en légende (`oto-caption`), l'alerte d'échec du design system (`oto-alert`) avec ses gestes.
// Retiré : la ligne logée dans la méta de l'en-tête (la publication et l'état des écritures vivent ici,
// ensemble), l'état `refused` de l'enregistrement différé. Changé : le rôle `alert` reste sur le message, qui
// naît avec chaque refus, et non sur la boîte.
//
// E05-S11 (retour 1, AC-1, AC-2) : l'indication d'enregistrement quitte la ligne au-dessus des blocs pour le
// haut à droite de la carte du document, en position absolue : rien ne bouge quand elle paraît. Elle lit la
// file de la page, que suivent aussi le titre, le résumé et la publication, et se tait 5 s après la dernière
// écriture réussie.
import { useEffect, useState } from "react"
import { Button } from "../../ds/react/primitives"
import { CopieDuTexte } from "../copie-du-texte"
import { EDITEUR, PUBLICATION_SEULE } from "../libelles"
import { useFileDOperations } from "./file-d-operations"
import { useGestes } from "./gestes"
import type { AlerteDeLEditeur, Annonce } from "./use-envois"

/** Dix secondes : le temps de lire la ligne et de comprendre qu'on s'est trompé (oto-frontend). */
const DELAI_D_ANNULATION_MS = 10_000

/** « Enregistré. » se tait 5 s après la dernière écriture réussie (E05-S11, AC-2). */
const DUREE_D_ENREGISTRE_MS = 5_000

/**
 * Les écritures réussies de la file, comptées : une écriture a abouti quand la révision ou le tampon du
 * brouillon change pendant que la file travaille (une relecture de la page, la file au repos, n'en est pas une).
 */
function useReussites(): { occupee: boolean; arretee: boolean; reussites: number } {
  const { occupee, arretee, revision, tampon } = useFileDOperations()
  const lecture = `${revision}:${tampon ?? ""}`
  const [vu, setVu] = useState({ occupee, lecture, reussites: 0 })
  // Dérivé des instantanés successifs, au rendu : aucun effet de plus entre deux écritures.
  if (vu.occupee !== occupee || vu.lecture !== lecture) {
    setVu({ occupee, lecture, reussites: vu.reussites + (vu.occupee && vu.lecture !== lecture ? 1 : 0) })
  }
  return { occupee, arretee, reussites: vu.reussites }
}

/**
 * L'indication d'enregistrement d'un document (AC-1, AC-2) : « Enregistrement… » tant que la file écrit, puis
 * « Enregistré. » pendant 5 s, à tout niveau d'écriture (E11-S02, AC-c2 : écrire publie) ; montée vide,
 * en haut à droite de la carte qui la contient (`position: relative`). Un échec garde son alerte, et elle se tait.
 */
export function IndicationDEnregistrement() {
  const { occupee, arretee, reussites } = useReussites()
  const [eteinte, setEteinte] = useState(0)
  useEffect(() => {
    if (reussites === 0) return
    const minuteur = setTimeout(() => setEteinte(reussites), DUREE_D_ENREGISTRE_MS)
    return () => clearTimeout(minuteur)
  }, [reussites])
  const texte = arretee ? "" : occupee ? EDITEUR.enregistrement : reussites > eteinte ? PUBLICATION_SEULE.enregistre : ""
  return (
    <p role="status" aria-busy={occupee && !arretee} className="oto-caption oto-indication-d-enregistrement">
      {texte}
    </p>
  )
}

export function LigneDAnnonce({ annonce }: { annonce: Annonce | null }) {
  const gestes = useGestes()
  const { oublierLAnnonce } = gestes
  const id = annonce?.id
  useEffect(() => {
    if (id === undefined) return
    const minuteur = setTimeout(oublierLAnnonce, DELAI_D_ANNULATION_MS)
    return () => clearTimeout(minuteur)
  }, [id, oublierLAnnonce])
  return (
    <p role="status" className="oto-caption flex min-h-5 flex-wrap items-center gap-2">
      {annonce && (
        <>
          {annonce.message}
          {annonce.retiree && (
            <Button variant="ghost" size="sm" onClick={() => annonce.retiree && gestes.retablir(annonce.retiree)}>
              Annuler
            </Button>
          )}
        </>
      )}
    </p>
  )
}

export function AlerteDEdition({ alerte }: { alerte: AlerteDeLEditeur | null }) {
  const gestes = useGestes()
  if (!alerte) return null
  return (
    <div className="oto-alert" data-tone="fail">
      <div className="oto-alert-body">
        {/* Une alerte neuve par message : un élément `role="alert"` n'annonce que ce qui naît avec lui. */}
        <p key={alerte.message} role="alert" className="oto-alert-title">
          {alerte.message}
        </p>
        <div className="oto-alert-actions flex-wrap items-center">
          {alerte.copier && <CopieDuTexte texte={alerte.texte} />}
          {alerte.reessayer && (
            <Button variant="secondary" size="sm" onClick={gestes.relancer}>
              Réessayer
            </Button>
          )}
          {alerte.recharger && (
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
