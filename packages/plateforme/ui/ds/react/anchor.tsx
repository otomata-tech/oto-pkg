"use client"

// Porté d'oto-frontend (src/design-system/components/react/overlays.jsx, `Anchor`) : le déclencheur est
// l'ancre, jamais une enveloppe en `display: contents`, que rien ne mesure ; sa ref est fusionnée, ses
// gestionnaires chaînés avant ceux du flottant ; un texte ou un fragment reçoit une boîte réelle. Tel quel,
// en TypeScript, pour `DropdownMenu` (`overlays.tsx`), `Popover` et `Tooltip`.
import { cloneElement, forwardRef, isValidElement, type ReactElement, type ReactNode, type Ref } from "react"
import { mergeRefs } from "./outils"

type Proprietes = Record<string, unknown>

/** Un élément qui peut porter une ref et des gestionnaires : ni un fragment ni un autre type interne de React. */
function peutPorterUneAncre(element: ReactNode): element is ReactElement<Proprietes & { ref?: Ref<HTMLElement> }> {
  return isValidElement(element) && typeof element.type !== "symbol"
}

/** Le gestionnaire du déclencheur d'abord, le nôtre ensuite ; une valeur qui n'est pas une fonction remplace. */
function enchainer(leur: unknown, notre: unknown): unknown {
  if (typeof notre !== "function" || typeof leur !== "function") return notre
  return (...args: unknown[]) => {
    leur(...args)
    return notre(...args)
  }
}

/** Ce qu'un flottant pose sur son déclencheur : le popover l'ouvre au clic, l'infobulle au survol et au focus. */
type AncreProps = {
  children: ReactNode
  onClick?: () => void
  onKeyDown?: (evenement: { key: string; preventDefault: () => void }) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
  "aria-expanded"?: boolean
  "aria-haspopup"?: "menu" | "dialog"
  "aria-controls"?: string
  "aria-describedby"?: string
}

export const Anchor = forwardRef<HTMLElement, AncreProps>(function Anchor({ children, ...propres }, ref) {
  if (peutPorterUneAncre(children)) {
    const suivantes: Proprietes = { ref: mergeRefs(children.props.ref, ref) }
    for (const [cle, valeur] of Object.entries(propres)) {
      // Une valeur absente (`aria-controls` fermé) n'efface pas celle du déclencheur.
      if (valeur !== undefined) suivantes[cle] = enchainer(children.props[cle], valeur)
    }
    return cloneElement(children, suivantes)
  }
  return (
    <span ref={ref} style={{ display: "inline-flex" }} {...propres}>
      {children}
    </span>
  )
})
