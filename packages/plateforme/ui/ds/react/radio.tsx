// Porté d'oto-frontend (src/design-system/components/react/forms.jsx, `Radio`) : le bouton radio natif,
// masqué à l'œil mais dans le flux, qui reçoit le focus ; la pastille dessinée est son frère immédiat, et
// `:checked + .oto-radio-box` fait tout le travail, sans JavaScript. Tel quel, en TypeScript.
// Partie c2 : `RadioGroup`, un `<fieldset>` et sa `<legend>`, sans laquelle un lecteur d'écran annonce des options isolées.
import { forwardRef, type ComponentProps, type ReactNode } from "react"
import { cx } from "./outils"

type RadioProps = Omit<ComponentProps<"input">, "type"> & {
  label?: ReactNode
  description?: ReactNode
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio({ label, description, disabled, className, ...rest }, ref) {
  return (
    <label className={cx("oto-choice", className)} data-disabled={disabled ? "" : undefined}>
      <input type="radio" ref={ref} disabled={disabled} {...rest} />
      <span className="oto-radio-box" aria-hidden="true" />
      {(label || description) && (
        <span className="oto-choice-text">
          {label}
          {description && <span className="oto-choice-desc">{description}</span>}
        </span>
      )}
    </label>
  )
})

type OptionDeRadio = { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean }

type RadioGroupProps = Omit<ComponentProps<"fieldset">, "onChange"> & {
  legend?: ReactNode
  name?: string
  value?: string
  onChange?: (valeur: string) => void
  options?: OptionDeRadio[]
  orientation?: "vertical" | "horizontal"
  variant?: "cards"
}

export function RadioGroup({ legend, name, value, onChange, options = [], orientation = "vertical", variant, className, children, ...rest }: RadioGroupProps) {
  return (
    <fieldset className={cx("oto-radio-group", className)} data-orientation={orientation} data-variant={variant} {...rest}>
      {legend && <legend>{legend}</legend>}
      {options.length
        ? options.map((option) => (
            <Radio
              key={option.value}
              name={name}
              value={option.value}
              label={option.label}
              description={option.description}
              disabled={option.disabled}
              checked={value === option.value}
              onChange={() => onChange?.(option.value)}
            />
          ))
        : children}
    </fieldset>
  )
}
