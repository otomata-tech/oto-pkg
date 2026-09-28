// Porté d'oto-frontend (src/design-system/components/react/layout.jsx, `Island`, `IslandHead`, `IslandBody`,
// `IslandFoot`) : l'îlot de la grammaire d'îlots, détaché sur le bureau, qui découpe son contenu ; son
// en-tête et son pied fixes, son corps qui défile entre les deux ; des classes et des attributs, le CSS
// d'`ui/ds/app/islands.css` fait le reste. Tels quels, en TypeScript. `layout.tsx` (partie a) garde le
// bureau, le contenu et le rail.
import { forwardRef, type ComponentProps, type ElementType } from "react"
import { cx } from "./outils"

type IslandProps = ComponentProps<"section"> & {
  /** Prend la place restante dans un groupe d'îlots. */
  grow?: boolean
  /** Un îlot découpe son contenu ; `visible` le laisse sortir, et l'îlot répond alors de son découpage. */
  overflow?: "visible"
  as?: ElementType
}

export const Island = forwardRef<HTMLElement, IslandProps>(function Island({ grow, overflow, as: Tag = "section", className, children, ...rest }, ref) {
  return (
    <Tag ref={ref} className={cx("oto-island", className)} data-grow={grow ? "" : undefined} data-overflow={overflow} {...rest}>
      {children}
    </Tag>
  )
})

export const IslandHead = ({ className, children, ...rest }: ComponentProps<"header">) => (
  <header className={cx("oto-island-head", className)} {...rest}>
    {children}
  </header>
)

/** Le corps, la zone qui défile ; `flush` retire son rembourrage (un tableau bord à bord). */
export const IslandBody = ({ flush, className, children, ...rest }: ComponentProps<"div"> & { flush?: boolean }) => (
  <div className={cx("oto-island-body", className)} data-flush={flush ? "" : undefined} {...rest}>
    {children}
  </div>
)

export const IslandFoot = ({ className, children, ...rest }: ComponentProps<"footer">) => (
  <footer className={cx("oto-island-foot", className)} {...rest}>
    {children}
  </footer>
)
