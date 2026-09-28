// Porté d'oto-frontend (src/design-system/components/react/primitives.jsx, `Tag`) : une étiquette ronde,
// retirable (sa croix nommée « Retirer : <étiquette> »), interactive (`aria-pressed`) ; `{...rest}` d'abord,
// les garanties du composant ensuite. Tel quel, en TypeScript.
import type { ComponentProps, MouseEvent, ReactNode } from "react"
import { cx } from "./outils"

type TagProps = ComponentProps<"span"> & {
  onRemove?: (evenement: MouseEvent<HTMLButtonElement>) => void
  removeLabel?: string
  interactive?: boolean
  pressed?: boolean
  children?: ReactNode
}

export function Tag({ onRemove, removeLabel = "Retirer", interactive, pressed, className, children, ...rest }: TagProps) {
  return (
    <span {...rest} className={cx("oto-tag", className)} data-interactive={interactive ? "" : undefined} aria-pressed={interactive ? Boolean(pressed) : rest["aria-pressed"]}>
      <span className="oto-tag-label">{children}</span>
      {onRemove && (
        <button
          type="button"
          className="oto-tag-remove"
          aria-label={`${removeLabel} : ${typeof children === "string" ? children : ""}`.trim()}
          onClick={(evenement) => {
            evenement.stopPropagation()
            onRemove(evenement)
          }}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
}
