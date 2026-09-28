"use client"

// Porté d'oto-frontend (src/design-system/components/react/overlays.jsx, `Popover`, `PopoverBody`) : le
// popover contient (le menu, lui, commande) et peut porter un formulaire ; ancré sur son déclencheur (le
// déclencheur est l'ancre, jamais une enveloppe en `display: contents`, que rien ne mesure), monté dans un
// portail pour ne pas être découpé par son îlot, fermé par Échap et le clic extérieur. Tels quels, en
// TypeScript. Changé, comme le menu d'`overlays.tsx` : le portail se monte dans la racine `.oto` du
// déclencheur, qui porte les jetons ; à l'ouverture le focus entre dans le panneau (monté en fin de racine,
// il serait sinon hors d'atteinte au clavier), et Échap le rend au déclencheur. Retiré : `PopoverHead`,
// `PopoverFoot`, qu'aucun écran porté n'emploie. Partie c2 : l'ancre est celle d'`anchor.tsx`, partagée avec `Tooltip`.
import { useCallback, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Anchor } from "./anchor"
import { useAnchor, useDismiss } from "./hooks"
import { cx } from "./outils"
import { Portail, racineOto } from "./overlays"

type PopoverProps = Omit<ComponentProps<"div">, "children"> & {
  trigger: ReactNode
  /** Tenu par l'appelant quand il le passe (deux déclencheurs pour un même panneau) ; ici sinon. */
  open?: boolean
  onOpenChange?: (ouvert: boolean) => void
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  children?: ReactNode
}

export function Popover({ trigger, open: ouvertImpose, onOpenChange, side = "bottom", align = "start", className, style, children, ...rest }: PopoverProps) {
  const [ouvertInterne, setOuvertInterne] = useState(false)
  const open = ouvertImpose ?? ouvertInterne
  const [conteneur, setConteneur] = useState<Element | null>(null)
  const anchorRef = useRef<HTMLElement>(null)
  const floatRef = useRef<HTMLDivElement>(null)
  const placed = useAnchor(anchorRef, floatRef, { open, side, align })
  const id = useId()

  const poser = useCallback(
    (ouvrir: boolean) => {
      // La racine `.oto` du déclencheur, lue au geste : le panneau s'y monte dès le rendu qui l'ouvre.
      if (ouvrir) setConteneur(racineOto(anchorRef.current))
      setOuvertInterne(ouvrir)
      onOpenChange?.(ouvrir)
    },
    [onOpenChange],
  )
  const fermer = useCallback(() => {
    // Le panneau part avec le focus : il revient au déclencheur, jamais sur la page.
    if (floatRef.current?.contains(document.activeElement)) anchorRef.current?.focus()
    poser(false)
  }, [poser])
  useDismiss(open, fermer, [anchorRef, floatRef])

  useEffect(() => {
    if (open) floatRef.current?.focus()
  }, [open])

  return (
    <>
      <Anchor ref={anchorRef} onClick={() => poser(!open)} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined}>
        {trigger}
      </Anchor>
      {open && (
        <Portail conteneur={conteneur}>
          <div
            {...rest}
            ref={floatRef}
            id={id}
            role="dialog"
            tabIndex={-1}
            className={cx("oto-pop", className)}
            data-side={placed.side}
            // La position calculée passe après le `style` de l'appelant, sinon le panneau repartirait en haut à gauche.
            style={{ ...style, top: placed.top, left: placed.left, outline: "none" }}
          >
            {children}
          </div>
        </Portail>
      )}
    </>
  )
}

export const PopoverBody = ({ className, children, ...rest }: ComponentProps<"div">) => (
  <div className={cx("oto-pop-body", className)} {...rest}>
    {children}
  </div>
)
