"use client"

// Porté d'oto-frontend (src/design-system/components/react/lists.jsx, `ListTools`) : au-dessus d'une liste,
// un champ de filtre et un créneau de menu ; le filtre est SOUMIS (Entrée) et l'appelant décide ce qu'il en
// fait (une adresse), jamais une requête par frappe ; `role="search"` en fait un repère nommé ; le champ est
// non contrôlé, l'appelant le resynchronise en le remontant (`key`). Le `<label>` ne peut pas être visible :
// `label` est le nom accessible du champ. Tel quel, en TypeScript. Retiré : l'avertissement de
// développement d'un `label` absent (le type l'exige).
import type { ComponentProps, FormEvent, ReactNode } from "react"
import { InputAffix } from "./input-affix"
import { cx } from "./outils"

type ListToolsProps = Omit<ComponentProps<"div">, "onSubmit"> & {
  label: string
  placeholder?: string
  defaultValue?: string
  icon?: ReactNode
  onSearch?: (valeur: string) => void
  menu?: ReactNode
}

export function ListTools({ label, placeholder, defaultValue, icon, onSearch, menu, className, children, ...rest }: ListToolsProps) {
  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    const champ = evenement.currentTarget.querySelector("input")
    onSearch?.(champ ? champ.value.trim() : "")
  }

  return (
    <div {...rest} className={cx("oto-list-tools", className)}>
      <form className="oto-list-filter" role="search" onSubmit={soumettre}>
        <InputAffix type="search" name="q" aria-label={label} placeholder={placeholder} defaultValue={defaultValue} start={icon} />
      </form>
      {menu}
      {children}
    </div>
  )
}
