"use client"

// Porté d'oto-frontend (src/design-system/components/react/lists.jsx, `CounterStrip`) : le bandeau de
// nombres filtrants ; chaque tuile EST un filtre (`<button aria-pressed>`, trois lignes : le chiffre porte,
// le libellé nomme, la précision explique, tous dans le nom accessible), jamais un score agrégé ; le groupe
// porte un nom. Tel quel, en TypeScript. Retiré : l'avertissement de développement d'un `label` absent (le
// type l'exige).
import type { ComponentProps, ReactNode } from "react"
import { cx } from "./outils"

export type Counter = { key: string; value: ReactNode; label: ReactNode; hint?: ReactNode; tone?: "alert" }

type CounterStripProps = Omit<ComponentProps<"div">, "onSelect"> & {
  label: string
  counters: Counter[]
  value?: string
  onSelect?: (key: string) => void
}

/** `null`, `undefined` et `false` disent « pas ce créneau » ; `0` est un contenu. */
const present = (creneau: ReactNode) => creneau != null && creneau !== false

export function CounterStrip({ label, counters, value, onSelect, className, ...rest }: CounterStripProps) {
  return (
    <div {...rest} className={cx("oto-counter-strip", className)} role="group" aria-label={label}>
      {counters.map((compteur) => (
        <button
          key={compteur.key}
          type="button"
          data-press=""
          className="oto-counter"
          aria-pressed={compteur.key === value}
          data-tone={compteur.tone === "alert" ? "alert" : undefined}
          onClick={() => onSelect?.(compteur.key)}
        >
          <span className="oto-counter-value oto-num oto-num-count">{compteur.value}</span>
          <span className="oto-counter-label">{compteur.label}</span>
          {present(compteur.hint) && <span className="oto-counter-hint">{compteur.hint}</span>}
        </button>
      ))}
    </div>
  )
}
