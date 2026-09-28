// Porté d'oto-frontend (src/design-system/components/react/layout.jsx, `Grid`) : une grille de contenu
// mesurée sur l'îlot (container query), pas sur la fenêtre, qui replie à deux puis à une colonne ; des
// classes et un attribut, le CSS d'`ui/ds/app/islands.css` fait le reste. Tel quel, en TypeScript.
import type { ComponentProps } from "react"
import { cx } from "./outils"

export const Grid = ({ cols = 2, className, children, ...rest }: ComponentProps<"div"> & { cols?: 2 | 3 | 4 }) => (
  <div className={cx("oto-grid", className)} data-cols={String(cols)} {...rest}>
    {children}
  </div>
)
