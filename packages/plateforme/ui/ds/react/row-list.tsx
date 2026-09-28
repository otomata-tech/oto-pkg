"use client"

// Porté d'oto-frontend (src/design-system/components/react/lists.jsx, `RowList` et `Row`) : la liste d'objets
// de même nature, et le vide À SA PLACE (un `<li>` qui dit « rien » s'annoncerait « liste, 1 élément ») ;
// `rules` pose un filet entre les lignes d'une liste de phrases, jamais autour ; une ligne : le glyphe de
// nature, l'objet, l'état au bout, des créneaux qui ne rendent rien quand ils sont vides ; `fold` fait du
// glyphe la cible de dépliage (un `<div hidden>`, jamais un démontage ; `aria-expanded` sur le bouton ;
// état contrôlé). Tels quels, en TypeScript. Changé : le chevron est `CaretRight` de Phosphor
// (`ChevronRight` de lucide, portage-ecrans.md § 3) ; le vide, un `<div>`, ne reçoit de la liste que son rôle
// et son nom (les gestionnaires typés pour un `<ul>` ne s'y posent pas). Retiré : l'avertissement de
// développement d'un `foldLabel` absent.
import { Children, forwardRef, useId, type ComponentProps, type ReactNode } from "react"
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight"
import { Icon } from "./icon"
import { cx } from "./outils"

/** `null`, `undefined` et `false` disent « pas ce créneau » ; `0` est un contenu. */
const present = (creneau: ReactNode) => creneau != null && creneau !== false

type RowListProps = ComponentProps<"ul"> & { empty?: ReactNode; rules?: boolean }

export const RowList = forwardRef<HTMLUListElement, RowListProps>(function RowList({ empty, rules, className, children, ...rest }, ref) {
  // `Children.count` compte les enfants du rendu : un `.map` sur un tableau vide en rend zéro.
  const vide = Children.count(children) === 0
  if (vide && present(empty)) {
    return (
      <div className={cx("oto-row-list-empty", className)} role={rest.role} aria-label={rest["aria-label"]}>
        {empty}
      </div>
    )
  }
  return (
    <ul ref={ref} {...rest} className={cx("oto-row-list", className)} data-rules={rules ? "" : undefined}>
      {children}
    </ul>
  )
})

type RowProps = ComponentProps<"li"> & {
  lead?: ReactNode
  end?: ReactNode
  fold?: ReactNode
  open?: boolean
  onToggle?: (ouvert: boolean) => void
  foldLabel?: string
}

export const Row = forwardRef<HTMLLIElement, RowProps>(function Row({ lead, end, fold, open, onToggle, foldLabel, className, children, ...rest }, ref) {
  // Appelé à chaque rendu, pliable ou non : un hook sous condition changerait l'ordre des hooks.
  const idRepli = useId()
  if (!present(fold)) {
    return (
      <li ref={ref} {...rest} className={cx("oto-row", "anim-host", className)}>
        {present(lead) && <span className="oto-row-lead">{lead}</span>}
        {children}
        {present(end) && <span className="oto-row-end">{end}</span>}
      </li>
    )
  }
  return (
    <li ref={ref} {...rest} className={cx("oto-row", "anim-host", className)} data-foldable="" data-open={open ? "" : undefined}>
      <div className="oto-row-head">
        <button type="button" className="oto-row-toggle" aria-expanded={Boolean(open)} aria-controls={idRepli} aria-label={foldLabel} onClick={() => onToggle?.(!open)}>
          {lead}
          <Icon as={CaretRight} size="sm" className="oto-row-chevron" aria-hidden="true" />
        </button>
        {children}
        {present(end) && <span className="oto-row-end">{end}</span>}
      </div>
      <div id={idRepli} className="oto-row-fold" hidden={!open}>
        {fold}
      </div>
    </li>
  )
})
