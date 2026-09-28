"use client"

// Porté d'oto-frontend (src/design-system/components/react/hooks.js) : les comportements partagés des
// sur-couches — ancrage, fermeture, parcours aux flèches, valeur contrôlée ou non, point de rupture —,
// tels quels, en TypeScript. Changé : `useMediaQuery` part de `false` et lit la fenêtre après le
// montage (le rendu du serveur et l'hydratation s'accordent, portage-ecrans.md § 2) ; `useBreakpoint`
// lit les ruptures sur la racine `.oto`, où `ui/styles/oto.css` les déclare. Retiré : `useTheme`,
// `useFocusTrap`, les avertissements de développement.
import { useCallback, useEffect, useLayoutEffect, useState } from "react"

/** `useLayoutEffect` prévient sur le serveur. */
export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/** Ce que les comportements lisent d'une ref : l'élément, quel qu'en soit le type exact. */
type RefLue = { readonly current: HTMLElement | null }

type Cote = "top" | "bottom" | "left" | "right"
type Alignement = "start" | "center" | "end"
export type Place = { side: Cote; top: number; left: number }

const OPPOSE: Record<Cote, Cote> = { top: "bottom", bottom: "top", left: "right", right: "left" }

/** Le côté demandé s'il y a la place, sinon l'opposé s'il l'a. */
function coteRetenu(side: Cote, rect: DOMRect, taille: { fw: number; fh: number; vw: number; vh: number; gap: number }): Cote {
  const { fw, fh, vw, vh, gap } = taille
  const place: Record<Cote, number> = { bottom: vh - rect.bottom - gap, top: rect.top - gap, right: vw - rect.right - gap, left: rect.left - gap }
  const besoin = side === "top" || side === "bottom" ? fh : fw
  return place[side] < besoin && place[OPPOSE[side]] >= besoin ? OPPOSE[side] : side
}

function position(cote: Cote, align: Alignement, rect: DOMRect, taille: { fw: number; fh: number; gap: number }): { top: number; left: number } {
  const { fw, fh, gap } = taille
  let top = rect.top
  if (cote === "bottom") top = rect.bottom + gap
  else if (cote === "top") top = rect.top - fh - gap
  else if (align === "center") top = rect.top + rect.height / 2 - fh / 2
  let left = rect.left
  if (cote === "right") left = rect.right + gap
  else if (cote === "left") left = rect.left - fw - gap
  else if (align === "end") left = rect.right - fw
  else if (align === "center") left = rect.left + rect.width / 2 - fw / 2
  return { top, left }
}

/**
 * Pose un flottant contre son déclencheur : le côté demandé s'il tient, sinon l'opposé, puis calé
 * dans la fenêtre ; replacé au défilement et au redimensionnement plutôt que refermé.
 */
export function useAnchor(
  anchorRef: RefLue,
  floatRef: RefLue,
  { open, side = "bottom", align = "start", gap = 6 }: { open: boolean; side?: Cote; align?: Alignement; gap?: number },
): Place {
  const [placed, setPlaced] = useState<Place>({ side, top: 0, left: 0 })

  const place = useCallback(() => {
    const ancre = anchorRef.current
    const flottant = floatRef.current
    if (!ancre || !flottant) return
    const rect = ancre.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const fw = flottant.offsetWidth
    const fh = flottant.offsetHeight
    const cote = coteRetenu(side, rect, { fw, fh, vw, vh, gap })
    const { top, left } = position(cote, align, rect, { fw, fh, gap })
    setPlaced({ side: cote, top: Math.max(8, Math.min(top, vh - fh - 8)), left: Math.max(8, Math.min(left, vw - fw - 8)) })
  }, [anchorRef, floatRef, side, align, gap])

  useIsoLayoutEffect(() => {
    if (!open) return
    place()
    const options = { passive: true, capture: true }
    window.addEventListener("scroll", place, options)
    window.addEventListener("resize", place, options)
    return () => {
      window.removeEventListener("scroll", place, options)
      window.removeEventListener("resize", place, options)
    }
  }, [open, place])

  return placed
}

/**
 * Échap et clic extérieur ferment la couche du dessus. `pointerdown` et non `click` : une sélection
 * commencée dedans et relâchée dehors ne ferme pas.
 */
export function useDismiss(open: boolean, onClose: () => void, refs: RefLue[] = []): void {
  useEffect(() => {
    if (!open) return
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key !== "Escape") return
      evenement.stopPropagation()
      onClose()
    }
    const surPointeur = (evenement: PointerEvent) => {
      const cible = evenement.target
      if (cible instanceof Node && refs.some((ref) => ref.current?.contains(cible))) return
      onClose()
    }
    document.addEventListener("keydown", surTouche)
    document.addEventListener("pointerdown", surPointeur, true)
    return () => {
      document.removeEventListener("keydown", surTouche)
      document.removeEventListener("pointerdown", surPointeur, true)
    }
    // Les refs sont stables ; l'ouverture et le gestionnaire commandent (comme dans oto-frontend).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])
}

/**
 * Parcours aux flèches d'une liste (menu, palette) : l'index surligné, que le survol et le clavier
 * partagent, et le gestionnaire des touches.
 */
export function useRovingFocus(count: number, { open = true, loop = true, onSelect }: { open?: boolean; loop?: boolean; onSelect?: (index: number) => void } = {}) {
  const [index, setIndex] = useState(-1)

  useEffect(() => {
    if (!open) setIndex(-1)
  }, [open])
  useEffect(() => {
    if (index >= count) setIndex(count - 1)
  }, [count, index])

  const move = useCallback(
    (delta: number) => {
      setIndex((courant) => {
        if (count === 0) return -1
        const suivant = courant + delta
        if (suivant < 0) return loop ? count - 1 : 0
        if (suivant >= count) return loop ? 0 : count - 1
        return suivant
      })
    },
    [count, loop],
  )

  const onKeyDown = useCallback(
    (evenement: { key: string; preventDefault: () => void }) => {
      const gestes: Record<string, () => void> = {
        ArrowDown: () => move(1),
        ArrowUp: () => move(-1),
        Home: () => setIndex(0),
        End: () => setIndex(count - 1),
      }
      const geste = gestes[evenement.key]
      if (geste) {
        evenement.preventDefault()
        geste()
        return
      }
      if (evenement.key === "Enter" && index >= 0) {
        evenement.preventDefault()
        onSelect?.(index)
      }
    },
    [move, count, index, onSelect],
  )

  return { index, setIndex, onKeyDown }
}

/** Une valeur contrôlée par l'appelant quand il la passe, tenue ici sinon. */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (valeur: T) => void): [T, (valeur: T) => void] {
  const controlee = value !== undefined
  const [interne, setInterne] = useState(defaultValue)
  const courante = controlee ? value : interne
  const poser = useCallback(
    (suivante: T) => {
      if (!controlee) setInterne(suivante)
      onChange?.(suivante)
    },
    [controlee, onChange],
  )
  return [courante, poser]
}

/** Une requête média, lue après le montage : le serveur et le premier rendu du navigateur disent `false`. */
export function useMediaQuery(query: string): boolean {
  const [vrai, setVrai] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const media = window.matchMedia(query)
    const suivre = () => setVrai(media.matches)
    suivre()
    media.addEventListener("change", suivre)
    return () => media.removeEventListener("change", suivre)
  }, [query])
  return vrai
}

/** Sous la rupture nommée (`--bp-md` de la racine `.oto`, 768 px à défaut). */
export function useBreakpoint(name: "sm" | "md" | "lg" | "xl" = "md"): boolean {
  const [px, setPx] = useState(768)
  useIsoLayoutEffect(() => {
    const racine = document.querySelector(".oto") ?? document.documentElement
    const valeur = getComputedStyle(racine).getPropertyValue(`--bp-${name}`).trim()
    if (valeur) setPx(parseInt(valeur, 10))
  }, [name])
  return useMediaQuery(`(max-width: ${px - 1}px)`)
}
