// Porté d'oto-frontend (src/design-system/components/react/content.jsx, `ContentTree`, `ContentTreeItem`) :
// une liste de contenus liés, pas un `role="tree"` (ses lignes sont des liens et ne se déplient pas : une
// sémantique d'arbre promettrait les flèches, `aria-expanded` et `aria-level`) ; le glyphe est le frère du
// lien ; une ligne cassée le dit par le mot et le glyphe, jamais par la seule couleur. Tels quels, en
// TypeScript.
import type { ComponentProps, ReactNode } from "react"
import { cx } from "./outils"

export const ContentTree = ({ className, children, ...rest }: ComponentProps<"ul">) => (
  <ul className={cx("oto-content-tree", className)} {...rest}>
    {children}
  </ul>
)

type ContentTreeItemProps = ComponentProps<"li"> & { icon?: ReactNode; broken?: boolean }

export const ContentTreeItem = ({ icon, broken, className, children, ...rest }: ContentTreeItemProps) => (
  <li className={cx("oto-content-tree-row", "anim-host", className)} data-broken={broken ? "" : undefined} {...rest}>
    <span className="oto-content-tree-icon">{icon}</span>
    {children}
  </li>
)
