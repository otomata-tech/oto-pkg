// Porté d'oto-frontend (src/design-system/components/react/primitives.jsx, `Stat`) : une tuile de chiffre,
// qu'on lit (une tuile qu'on clique est une `CounterStrip`) ; le chiffre en tabulaire, l'étiquette en mono
// capitales ; `delta` est signé, le signe donne la direction. Tel quel, en TypeScript.
import type { ComponentProps, ReactNode } from "react"
import { cx } from "./outils"

type StatProps = Omit<ComponentProps<"div">, "children"> & {
  value: ReactNode
  label: ReactNode
  delta?: number | null
}

export function Stat({ value, label, delta, className, ...rest }: StatProps) {
  const dir = delta == null ? null : delta > 0 ? "up" : delta < 0 ? "down" : null
  return (
    <div className={cx("oto-stat", className)} {...rest}>
      <span className="oto-stat-value">{value}</span>
      <span className="oto-stat-label">{label}</span>
      {delta != null && (
        <span className="oto-stat-delta" data-dir={dir || undefined}>
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      )}
    </div>
  )
}
