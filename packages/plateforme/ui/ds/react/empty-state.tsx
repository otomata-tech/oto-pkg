// Porté d'oto-frontend (src/design-system/components/react/primitives.jsx, `EmptyState`) : un glyphe de
// 24 px, une phrase, un bouton, jamais d'illustration ; `compact` pose le titre et la phrase sur une ligne,
// pour une carte courte. Tel quel, en TypeScript. Retiré : l'avertissement de développement sur
// `illustration` et `image` (le type ne les accepte pas).
import type { ComponentProps, ReactNode } from "react"
import { cx } from "./outils"

type EmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  icon?: ReactNode
  title?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon, title, children, action, compact, className, ...rest }: EmptyStateProps) {
  return (
    <div className={cx("oto-empty", className)} data-compact={compact ? "" : undefined} {...rest}>
      {icon}
      {title && <p className="oto-empty-title">{title}</p>}
      {children && <p className="oto-empty-text">{children}</p>}
      {action}
    </div>
  )
}
