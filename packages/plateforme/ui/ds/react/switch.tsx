"use client"

// Porté d'oto-frontend (`shared/commutateur.tsx`, `Commutateur`) : l'interrupteur en balisage natif habillé
// du design system (`oto-choice`, `oto-switch-track`, `choice.css`) ; l'élément natif porte l'état, le focus
// et `Espace`, la piste est décorative. Sorti du partage sur le web (E11-S01, AC-g9) pour les réglages d'un
// tableau : sans lui, le balisage se recopie dans un second écran.
import { forwardRef, useId, type ChangeEventHandler, type ReactNode } from "react"

type SwitchProps = {
  label: ReactNode
  description: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: ChangeEventHandler<HTMLInputElement>
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch({ label, description, checked, disabled = false, onChange }, ref) {
  const id = useId()
  // Le nom est l'intitulé seul ; l'explication, sa description : dans le `<label>`, elle allongeait le nom.
  const idDuTitre = `${id}-titre`
  const idDeLExplication = `${id}-explication`
  return (
    <label className="oto-choice" htmlFor={id} data-disabled={disabled ? "" : undefined}>
      <input id={id} ref={ref} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={onChange} aria-labelledby={idDuTitre} aria-describedby={idDeLExplication} />
      <span className="oto-switch-track" aria-hidden="true" />
      <span className="oto-choice-text">
        <span id={idDuTitre}>{label}</span>
        <span id={idDeLExplication} className="oto-choice-desc">
          {description}
        </span>
      </span>
    </label>
  )
})
