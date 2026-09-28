// Porté d'oto-frontend (src/design-system/components/react/context.jsx, `NotePanel`, `NoteDefs`, `NoteLabel`,
// `NoteFoot`) : une note et non un îlot, elle éclaire le contenu sans le porter (`<aside>`), nommée par son
// titre quand l'appelant ne la nomme pas (deux repères complémentaires imbriqués sans nom seraient
// indiscernables) ; son titre est un `<p>`, pas un `<h2>` (une aide ne se met pas au rang du texte de la
// page) ; les couples terme-définition en `<dl>`. En TypeScript. Changé : la note porte le rôle `note`, pas
// celui d'un repère complémentaire, qu'elle imbriquait dans la colonne d'annexes (`<aside>` de `TwoColumns` ;
// axe `landmark-complementary-is-top-level`, M31).
import type { ComponentProps, ReactNode } from "react"
import { cx } from "./outils"

type NotePanelProps = Omit<ComponentProps<"aside">, "title"> & { title?: ReactNode; icon?: ReactNode }

export function NotePanel({ title, icon, className, children, ...rest }: NotePanelProps) {
  const nomAccessible = rest["aria-label"] ?? rest["aria-labelledby"] ?? (typeof title === "string" ? title : undefined)
  return (
    <aside role="note" {...rest} aria-label={rest["aria-labelledby"] == null ? nomAccessible : undefined} className={cx("oto-note", className)}>
      {title != null && (
        <p className="oto-note-head">
          {icon}
          {title}
        </p>
      )}
      {children}
    </aside>
  )
}

type NoteDefsProps = ComponentProps<"dl"> & { items?: readonly { term: ReactNode; detail: ReactNode }[] }

/** Les couples « pour qui · quand » : des termes et leurs définitions, dont le lien est toute l'information. */
export const NoteDefs = ({ items = [], className, children, ...rest }: NoteDefsProps) => (
  <dl className={cx("oto-note-def", className)} {...rest}>
    {children ??
      items.map((item, rang) => (
        <div key={rang}>
          <dt>{item.term}</dt>
          <dd>{item.detail}</dd>
        </div>
      ))}
  </dl>
)

/** L'intitulé d'une sous-partie de la note. */
export const NoteLabel = ({ className, children, ...rest }: ComponentProps<"p">) => (
  <p className={cx("oto-note-label", className)} {...rest}>
    {children}
  </p>
)

/** La phrase de pied : elle nuance ce qui précède, elle n'informe pas. */
export const NoteFoot = ({ className, children, ...rest }: ComponentProps<"p">) => (
  <p className={cx("oto-note-foot", className)} {...rest}>
    {children}
  </p>
)
