// Porté d'oto-frontend (src/design-system/components/react/product.jsx, `ScreenHeader`) : l'en-tête d'écran,
// un seul invariant, le titre (`<h1>`) ; les autres zones sont des créneaux (le fil, la méta, l'état,
// l'accès, les actions), chacun absent sur au moins un écran. Un `<div>` et non un `<header>` : hors de
// `<main>`, un `<header>` ferait un second repère `banner`. L'ordre du DOM est celui de la lecture (le fil,
// le titre, sa méta, puis ce qu'on peut en faire) ; la grille remonte les actions sur le premier rang. Tel
// quel, en TypeScript. Retiré : l'avertissement de développement d'un titre absent (le type l'exige).
import type { ComponentProps, ReactNode } from "react"
import { cx } from "./outils"

/** `null`, `undefined` et `false` disent « pas ce créneau » ; `0` est un contenu. */
const present = (creneau: ReactNode) => creneau != null && creneau !== false

type ScreenHeaderProps = Omit<ComponentProps<"div">, "title"> & {
  title: ReactNode
  icon?: ReactNode
  breadcrumb?: ReactNode
  meta?: ReactNode
  state?: ReactNode
  access?: ReactNode
  actions?: ReactNode
}

export function ScreenHeader({ title, icon, breadcrumb, meta, state, access, actions, className, children, ...rest }: ScreenHeaderProps) {
  // Le premier rang n'existe que si quelque chose l'occupe : le CSS distingue « pas d'actions » d'« actions vides ».
  const aCote = present(state) || present(access) || present(actions)
  return (
    <div {...rest} className={cx("oto-screen-header", className)}>
      {present(breadcrumb) && <div className="oto-screen-header-path">{breadcrumb}</div>}
      <h1 className="oto-page-title">
        {icon}
        {title}
      </h1>
      {present(meta) && <p className="oto-screen-header-meta">{meta}</p>}
      {aCote && (
        <div className="oto-screen-header-side">
          {present(state) && <span className="oto-screen-header-state">{state}</span>}
          {present(access) && <div className="oto-screen-header-access">{access}</div>}
          {present(actions) && <div className="oto-screen-header-actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
