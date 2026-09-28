// Porté d'oto-frontend (src/design-system/components/react/context.jsx, `LayerStack`, `LayerLink`) : les
// couches empilées, celle qu'on regarde marquée par `data-here` pour le style et `aria-current` pour le sens
// (un fond teinté n'est pas une information) ; une couche est polymorphe (`as`), un `<a href>` nu
// rechargerait le document entier. Tels quels, en TypeScript.
import type { ComponentProps, ElementType, ReactNode } from "react"
import { cx } from "./outils"

export const LayerStack = ({ className, children, ...rest }: ComponentProps<"div">) => (
  <div className={cx("oto-layers", className)} {...rest}>
    {children}
  </div>
)

type LayerLinkProps = Omit<ComponentProps<"a">, "children"> & {
  icon?: ReactNode
  name: ReactNode
  count?: ReactNode
  here?: boolean
  as?: ElementType
  children?: ReactNode
}

export function LayerLink({ icon, name, count, here, as: Tag = "a", className, children, ...rest }: LayerLinkProps) {
  return (
    <Tag {...rest} className={cx("oto-layer", className)} data-here={here ? "" : undefined} aria-current={here ? "page" : undefined}>
      {icon}
      {name}
      {count != null && <span className="oto-num">{count}</span>}
      {children}
    </Tag>
  )
}
