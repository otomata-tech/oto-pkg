"use client"

// Porté d'oto-frontend (src/design-system/components/react/overlays.jsx, `Drawer`) : le panneau latéral, un
// `<dialog>` natif (piège de focus, Échap, couche du dessus, inertie du fond viennent du navigateur) ;
// latéral sur grand écran, en bas sur un téléphone, où un panneau venu du côté n'a nulle part où aller ;
// la ref d'un consommateur fusionnée avec la sienne. Tel quel, en TypeScript. Changé : `useNativeDialog`
// de la partie a, qui rend le focus quand le panneau est démonté ouvert.
import { useId, useRef, type ComponentProps, type ReactNode } from "react"
import { GLYPHE_FERMER, useNativeDialog } from "./dialog"
import { useBreakpoint } from "./hooks"
import { cx, mergeRefs } from "./outils"

type DrawerProps = Omit<ComponentProps<"dialog">, "title" | "open"> & {
  open: boolean
  onClose: () => void
  side?: "right" | "left" | "bottom"
  snap?: "sm" | "md" | "full"
  title?: ReactNode
  footer?: ReactNode
  handle?: boolean
  closeLabel?: string
}

export function Drawer({ open, onClose, side = "right", snap, title, footer, handle, closeLabel = "Fermer", className, children, ref: leurRef, ...rest }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const closing = useNativeDialog(ref, open, onClose)
  const narrow = useBreakpoint("sm")
  const effectiveSide = narrow && side !== "bottom" ? "bottom" : side
  const titleId = useId()

  return (
    <dialog
      {...rest}
      ref={mergeRefs(leurRef, ref)}
      className={cx("oto-drawer", className)}
      data-side={effectiveSide}
      data-snap={snap}
      data-closing={closing ? "" : undefined}
      aria-labelledby={title ? titleId : rest["aria-labelledby"]}
      onClick={(evenement) => {
        rest.onClick?.(evenement)
        if (evenement.target === ref.current) onClose()
      }}
    >
      {(handle ?? effectiveSide === "bottom") && <div className="oto-drawer-handle" aria-hidden="true" />}
      {title && (
        <header className="oto-drawer-head">
          <h2 className="oto-drawer-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="oto-icon-btn" aria-label={closeLabel} onClick={onClose}>
            {GLYPHE_FERMER}
          </button>
        </header>
      )}
      <div className="oto-drawer-body">{children}</div>
      {footer && <footer className="oto-drawer-foot">{footer}</footer>}
    </dialog>
  )
}
