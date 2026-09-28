// Porté d'oto-frontend (src/design-system/components/react/home.jsx, `WaitList`, `WaitItem`) : l'îlot qui
// appelle une décision, visuellement distinct (`oto-wait`), nommé par son titre, le compte en pastille ; son
// corps n'est pas un `IslandBody` (des lignes serrées dans un îlot qui ne défile pas). Une demande se lit
// dans l'ordre du DOM : la conséquence, sa provenance, puis les actions. Tels quels, en TypeScript. Retiré :
// les avertissements de développement (le type exige `label`).
import { forwardRef, type ComponentProps, type ReactNode } from "react"
import { Island, IslandHead } from "./island"
import { cx } from "./outils"

/** `null`, `undefined` et `false` disent « pas ce créneau » ; `0` est un contenu légitime. */
const present = (creneau: ReactNode) => creneau != null && creneau !== false

type WaitListProps = ComponentProps<"section"> & {
  /** Le titre affiché et le nom accessible de l'îlot. */
  label: string
  count?: ReactNode
  headEnd?: ReactNode
}

export const WaitList = forwardRef<HTMLElement, WaitListProps>(function WaitList({ label, count, headEnd, className, children, ...rest }, ref) {
  return (
    <Island ref={ref} {...rest} className={cx("oto-wait", className)} aria-label={label}>
      <IslandHead>
        <h2>{label}</h2>
        {present(headEnd) && headEnd}
        {/* Le compte, à part de `headEnd` : la seule information que les écrans qui portent l'îlot partagent tous. */}
        {present(count) && (
          <span className="oto-badge" data-tone="review">
            {count}
          </span>
        )}
      </IslandHead>
      <div className="oto-wait-body">{children}</div>
    </Island>
  )
})

type WaitItemProps = ComponentProps<"div"> & {
  icon?: ReactNode
  /** La conséquence du geste, énoncée en premier. */
  demand: ReactNode
  source?: ReactNode
  actions?: ReactNode
}

export const WaitItem = forwardRef<HTMLDivElement, WaitItemProps>(function WaitItem({ icon, demand, source, actions, className, children, ...rest }, ref) {
  return (
    <div ref={ref} {...rest} className={cx("oto-wait-item", "anim-host", className)}>
      {present(icon) && <span className="oto-wait-item-lead">{icon}</span>}
      <span className="oto-wait-item-main">
        <strong className="oto-wait-item-demand">{demand}</strong>
        {present(source) && <span className="oto-wait-item-source">{source}</span>}
      </span>
      {present(actions) && <span className="oto-wait-item-actions">{actions}</span>}
      {children}
    </div>
  )
})
