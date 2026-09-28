// Porté d'oto-frontend (src/design-system/components/react/forms.jsx, `Textarea`) : le champ de plusieurs
// lignes, à la forme d'un champ (`oto-input`), trois lignes par défaut. Tel quel, en TypeScript.
import { forwardRef, type ComponentProps } from "react"
import { cx } from "./outils"

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx("oto-input", "oto-textarea", className)} {...rest} />
})
