// Porté d'oto-frontend (src/design-system/components/react/forms.jsx, `InputAffix`) : un champ avec un
// glyphe à gauche, une unité ou un raccourci à droite ; l'anneau de focus se porte sur l'enveloppe, sinon il
// dessine un rectangle à l'intérieur du champ. Tel quel, en TypeScript ; `forms.tsx` (partie a) garde
// `Field` et `Input`.
import { forwardRef, type ComponentProps, type ReactNode } from "react"
import { cx } from "./outils"

type InputAffixProps = ComponentProps<"input"> & {
  start?: ReactNode
  end?: ReactNode
  invalid?: boolean
}

export const InputAffix = forwardRef<HTMLInputElement, InputAffixProps>(function InputAffix({ start, end, disabled, invalid, className, ...rest }, ref) {
  return (
    <div className={cx("oto-input-wrap", className)} data-disabled={disabled ? "" : undefined} aria-invalid={invalid ? true : undefined}>
      {start}
      <input ref={ref} disabled={disabled} {...rest} />
      {end}
    </div>
  )
})
