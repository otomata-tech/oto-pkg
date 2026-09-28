// Porté d'oto-frontend (src/design-system/components/react/layout.jsx, `TwoColumns`) : la mise en page des
// écrans de consultation, une colonne principale qui porte la matière et une colonne de cartes annexes
// (`<aside>`), au rapport 1,18 / 1, alignées en haut ; `main="document"` prend la mesure de lecture ; sous
// 1 024 px, une seule colonne. Tel quel, en TypeScript.
import { forwardRef, type ComponentProps, type ReactNode } from "react"
import { cx } from "./outils"

type TwoColumnsProps = ComponentProps<"div"> & {
  aside?: ReactNode
  main?: "document"
}

export const TwoColumns = forwardRef<HTMLDivElement, TwoColumnsProps>(function TwoColumns({ aside, main, className, children, ...rest }, ref) {
  return (
    <div ref={ref} {...rest} className={cx("oto-two-columns", className)} data-main={main}>
      <div className="oto-two-columns-main">{children}</div>
      {aside != null && aside !== false && <aside className="oto-two-columns-aside">{aside}</aside>}
    </div>
  )
})
