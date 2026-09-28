// Porté d'oto-frontend (src/design-system/components/react/content.jsx, `Reader`, `ReaderHeading`,
// `ReaderParagraph`, `ReaderList`) : le corps d'un document en lecture, variante du corps d'îlot
// (`data-reading`), et non un conteneur de plus ; des enfants React, jamais une chaîne injectée en HTML
// (XSS stockée). L'intertitre est un `<h2>` par défaut (le `<h1>` est à l'en-tête d'écran) ; la liste est un
// `<ol>` quand le bloc est numéroté, c'est la balise qui porte le sens et le navigateur qui numérote. Tels
// quels, en TypeScript.
import type { ComponentProps, ElementType, ReactNode } from "react"
import { cx } from "./outils"

export const Reader = ({ className, children, ...rest }: ComponentProps<"div">) => (
  <div className={cx("oto-island-body", className)} data-reading="" {...rest}>
    {children}
  </div>
)

type ReaderHeadingProps = ComponentProps<"h2"> & { as?: ElementType }

export const ReaderHeading = ({ as: Tag = "h2", className, children, ...rest }: ReaderHeadingProps) => (
  <Tag className={cx("oto-reader-heading", className)} {...rest}>
    {children}
  </Tag>
)

export const ReaderParagraph = ({ className, children, ...rest }: ComponentProps<"p">) => (
  <p className={cx("oto-reader-para", className)} {...rest}>
    {children}
  </p>
)

// Sans `ref` : la balise change avec `as`, et la liste d'un document ne se vise pas.
type ReaderListProps = Omit<ComponentProps<"ul">, "children" | "ref"> & {
  as?: "ul" | "ol"
  /** Les éléments, quand l'appelant n'en rend pas lui-même (`children`). */
  items?: readonly ({ id?: string; text?: ReactNode } | string)[]
  start?: number
  children?: ReactNode
}

export const ReaderList = ({ as: Tag = "ul", items = [], className, children, ...rest }: ReaderListProps) => (
  <Tag className={cx("oto-reader-list", className)} {...rest}>
    {children ?? items.map((item, rang) => (typeof item === "string" ? <li key={rang}>{item}</li> : <li key={item.id ?? rang}>{item.text}</li>))}
  </Tag>
)
