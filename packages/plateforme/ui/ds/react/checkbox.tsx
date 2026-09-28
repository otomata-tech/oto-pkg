"use client"

// Porté d'oto-frontend (src/design-system/components/react/forms.jsx, `Checkbox`) : l'élément natif,
// visuellement masqué mais dans le flux et focalisable ; la boîte dessinée est son frère immédiat, et
// `:checked + .oto-checkbox-box` fait le travail sans JS ; `indeterminate` n'existe qu'en propriété du DOM,
// posée à la main. Tel quel, en TypeScript.
import { forwardRef, useEffect, useRef, type ComponentProps, type ReactNode } from "react"
import { cx, mergeRefs } from "./outils"

type CheckboxProps = Omit<ComponentProps<"input">, "type"> & {
  label?: ReactNode
  description?: ReactNode
  indeterminate?: boolean
}

const CheckMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, description, indeterminate, disabled, className, ...rest }, ref) {
  const inner = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = Boolean(indeterminate)
  }, [indeterminate])

  return (
    <label className={cx("oto-choice", className)} data-disabled={disabled ? "" : undefined}>
      <input type="checkbox" ref={mergeRefs(inner, ref)} disabled={disabled} {...rest} />
      <span className="oto-checkbox-box" aria-hidden="true">
        <CheckMark />
      </span>
      {(label || description) && (
        <span className="oto-choice-text">
          {label}
          {description && <span className="oto-choice-desc">{description}</span>}
        </span>
      )}
    </label>
  )
})
