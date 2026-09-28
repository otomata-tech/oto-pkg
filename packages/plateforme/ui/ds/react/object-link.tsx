// Porté d'oto-frontend (src/design-system/components/react/product.jsx, `ObjectLink`) : la rangée d'un
// objet, son nom puis son qualificatif ; `lead`, une tuile frère du nom, la passe sur deux lignes (le nom
// au-dessus, la phrase dessous) : un catalogue se lit mal en une ligne. Tel quel, en TypeScript. Retiré :
// l'avertissement de développement d'un `<a>` sans `href` (l'hôte passe son lien, portage-ecrans.md § 1).
import { forwardRef, type ComponentProps, type ElementType, type ReactNode } from "react"
import { cx } from "./outils"

/** `null`, `undefined` et `false` disent « pas ce créneau » ; `0` est un contenu. */
const present = (creneau: ReactNode) => creneau != null && creneau !== false

type ObjectLinkProps = Omit<ComponentProps<"a">, "ref"> & {
  name: ReactNode
  meta?: ReactNode
  icon?: ReactNode
  lead?: ReactNode
  /** L'élément hôte : `a` par défaut, ou le lien de l'hôte. */
  as?: ElementType
}

export const ObjectLink = forwardRef<HTMLElement, ObjectLinkProps>(function ObjectLink({ name, meta, icon, lead, as: Tag = "a", className, children, ...rest }, ref) {
  return (
    // Un attribut et non une seconde classe : la même rangée, à une tuile près.
    <Tag ref={ref} {...rest} className={cx("oto-object-link", "anim-host", className)} data-lead={present(lead) ? "" : undefined}>
      {present(lead) && <span className="oto-object-link-lead">{lead}</span>}
      <span className="oto-object-link-name">
        {icon}
        {name}
      </span>
      {meta != null && meta !== false && <span className="oto-object-link-meta">{meta}</span>}
      {children}
    </Tag>
  )
})
