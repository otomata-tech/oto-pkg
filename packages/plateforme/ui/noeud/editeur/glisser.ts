"use client"

// Le glisser-déposer d'un bloc par sa poignée (E05-S10, AC-a3) : la vraie rangée bouge, d'un rang chaque fois
// que le pointeur franchit le milieu d'une voisine, par la même opération pure que ⌥↑ / ⌥↓ (`deplacer` du
// modèle) ; l'ordre part une seule fois, au dépôt (`move_block`). En deçà de 4 px, c'est un clic : la poignée
// ouvre son menu ; après un déplacement, le clic qui termine le geste n'ouvre rien. Sans lui, un bloc ne
// change de place que rang par rang, par le menu ou le clavier.
//
// Porté d'oto-frontend (`components/editor/use-drag-block.ts`). Repris : Pointer Events et capture du
// pointeur (ni HTML5 DnD, absent au tactile, ni fantôme, que l'îlot rognerait), le seuil de geste, un pas par
// milieu franchi, le défilement entretenu aux bords, l'enregistrement au dépôt seulement, le clic avalé.
// Changé : les rangées sont lues sous la racine de l'éditeur (`[data-cle]`), et c'est la fenêtre qui défile
// (l'îlot de la plateforme ne défile pas) ; un pas attend que le rendu l'ait posé avant le suivant.
//
// E11-S17 (AC-a8) : la poignée d'un bloc sélectionné parmi d'autres glisse le groupe, qui passe une voisine au milieu de
// celle qui le précède ou le suit ; interrompu, l'éditeur remet lui-même l'ordre d'avant.
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react"

/** En deçà, c'est un clic : le menu de la poignée s'ouvre sans déplacer le bloc. */
const SEUIL_DE_GESTE_PX = 4
/** La bande, aux bords de la fenêtre, où le défilement s'entretient tout seul. */
const ZONE_DE_BORD_PX = 40
/** Ce qu'on défile par image : à 60 Hz, ~720 px/s. */
const PAS_DE_DEFILEMENT_PX = 12

/** Les gestionnaires de la poignée, servis aux rangées par le contexte de l'éditeur. */
export type PoigneeGlissee = {
  appui: (cle: string, evenement: PointerEvent<HTMLElement>) => void
  mouvement: (evenement: PointerEvent<HTMLElement>) => void
  lacher: (evenement: PointerEvent<HTMLElement>) => void
  annuler: () => void
  clicCapture: (evenement: MouseEvent<HTMLElement>) => void
}

type Parametres = {
  racine: RefObject<HTMLElement | null>
  /**
   * Un rang de plus ou de moins, dans le modèle seulement. Un groupe (E11-S17, AC-a8) rend le rang où il a posé la
   * rangée tenue : regroupé au premier pas, il ne la décale pas toujours d'un seul rang.
   */
  glisser: (cle: string, pas: -1 | 1) => number | void
  /** Le geste est fini : l'ordre part. */
  deposer: (cle: string) => void
  /** Les rangées qui se glissent avec la rangée tenue, elle comprise : les blocs sélectionnés, ou elle seule (AC-a8). */
  groupe: (cle: string) => readonly string[]
  /** Un geste interrompu : `true` quand l'éditeur a remis lui-même l'ordre d'avant (un groupe) ; sinon, pas à pas. */
  revenir: (cle: string) => boolean
}

/** `decalage` : les rangs gagnés depuis l'appui (négatif vers le haut), que défait un geste annulé. */
type Geste = { cle: string; depart: number; aBouge: boolean; attendu: number | null; decalage: number }

/**
 * Le rang de la rangée tenue parmi les rangées, le premier et le dernier rang de son groupe, et le milieu de chacune, lus
 * dans le DOM : le groupe passe une voisine quand le pointeur franchit le milieu de celle qui le précède ou le suit.
 */
function mesurer(racine: HTMLElement | null, cle: string, groupe: readonly string[]): { rang: number; premier: number; dernier: number; milieux: number[] } {
  const rangees = racine ? [...racine.querySelectorAll<HTMLElement>("[data-cle]")] : []
  const rangs = rangees.flatMap((rangee, rang) => (groupe.includes(rangee.dataset.cle ?? "") ? [rang] : []))
  const rang = rangees.findIndex((rangee) => rangee.dataset.cle === cle)
  return {
    rang,
    premier: Math.min(rang, ...rangs),
    dernier: Math.max(rang, ...rangs),
    milieux: rangees.map((rangee) => {
      const boite = rangee.getBoundingClientRect()
      return boite.top + boite.height / 2
    }),
  }
}

export function useGlisser(parametres: Parametres): { enCours: string | null; poignee: PoigneeGlissee } {
  const [enCours, setEnCours] = useState<string | null>(null)
  const geste = useRef<Geste | null>(null)
  const avale = useRef(false)
  const image = useRef<number | undefined>(undefined)
  const vitesse = useRef(0)
  // Les rappels du dernier rendu : un geste commencé plus tôt déplace le modèle courant.
  const lus = useRef(parametres)
  useEffect(() => {
    lus.current = parametres
  })

  const arreterLeDefilement = () => {
    if (image.current !== undefined) cancelAnimationFrame(image.current)
    image.current = undefined
  }
  // Quitter l'écran au milieu d'un geste ne laisse pas de boucle d'images en vie.
  useEffect(() => arreterLeDefilement, [])

  /** Sans boucle, le pointeur immobile contre le bord n'émet plus rien, et le défilement s'arrêterait là. */
  const entretenirLeDefilement = (y: number) => {
    vitesse.current = y < ZONE_DE_BORD_PX ? -PAS_DE_DEFILEMENT_PX : y > window.innerHeight - ZONE_DE_BORD_PX ? PAS_DE_DEFILEMENT_PX : 0
    if (vitesse.current === 0) return arreterLeDefilement()
    if (image.current !== undefined) return
    const pas = () => {
      window.scrollBy(0, vitesse.current)
      image.current = requestAnimationFrame(pas)
    }
    image.current = requestAnimationFrame(pas)
  }

  const finir = () => {
    arreterLeDefilement()
    geste.current = null
    setEnCours(null)
  }

  const poignee: PoigneeGlissee = {
    appui(cle, evenement) {
      if (evenement.button !== 0) return
      geste.current = { cle, depart: evenement.clientY, aBouge: false, attendu: null, decalage: 0 }
      // Les événements continuent d'arriver sur la poignée quand le pointeur en sort.
      evenement.currentTarget.setPointerCapture?.(evenement.pointerId)
    },
    mouvement(evenement) {
      const courant = geste.current
      if (!courant) return
      if (!courant.aBouge && Math.abs(evenement.clientY - courant.depart) < SEUIL_DE_GESTE_PX) return
      if (!courant.aBouge) {
        courant.aBouge = true
        setEnCours(courant.cle)
      }
      const { rang, premier, dernier, milieux } = mesurer(lus.current.racine.current, courant.cle, lus.current.groupe(courant.cle))
      // Le pas précédent n'est pas encore rendu : une décision sur les anciennes positions sauterait un cran.
      if (courant.attendu !== null && rang !== courant.attendu) return
      const suivant = milieux[dernier + 1]
      const precedent = milieux[premier - 1]
      const pas = suivant !== undefined && evenement.clientY > suivant ? 1 : precedent !== undefined && evenement.clientY < precedent ? -1 : 0
      if (pas !== 0) {
        courant.decalage += pas
        const pose = lus.current.glisser(courant.cle, pas)
        courant.attendu = typeof pose === "number" ? pose : rang + pas
      }
      entretenirLeDefilement(evenement.clientY)
    },
    lacher(evenement) {
      const courant = geste.current
      if (evenement.currentTarget.hasPointerCapture?.(evenement.pointerId)) evenement.currentTarget.releasePointerCapture(evenement.pointerId)
      finir()
      if (!courant?.aBouge) return
      avale.current = true
      lus.current.deposer(courant.cle)
    },
    annuler() {
      const courant = geste.current
      finir()
      if (!courant) return
      // Un geste interrompu par le système (`pointercancel` : appel, défilement tactile) ne dépose rien : le bloc
      // reprend sa place d'origine, sans quoi l'écran montrerait un ordre que rien n'a enregistré.
      if (lus.current.revenir(courant.cle)) return
      const retour = courant.decalage > 0 ? -1 : 1
      for (let reste = Math.abs(courant.decalage); reste > 0; reste -= 1) lus.current.glisser(courant.cle, retour)
    },
    clicCapture(evenement) {
      // Un déplacement se termine par un clic sur la poignée : sans cette garde, chaque dépôt ouvrirait son menu.
      if (!avale.current) return
      avale.current = false
      evenement.preventDefault()
      evenement.stopPropagation()
    },
  }
  return { enCours, poignee }
}
