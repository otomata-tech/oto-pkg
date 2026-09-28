// Porté d'oto-frontend (src/design-system/components/react/blocks.jsx, `BlockRow`) : la rangée d'un bloc et
// sa gouttière, une géométrie et aucune logique d'édition ; trois emplacements passés par l'écran, le « + »
// puis la poignée côte à côte à gauche (l'ordre du DOM est l'ordre visuel, donc celui de la tabulation), le
// menu à droite ; révélés au survol et au focus (`:focus-within`), l'opacité change, jamais la boîte ; les
// deux cellules sont rendues même vides, pour qu'une rangée reste à l'aplomb de ses voisines. Tel quel, en
// TypeScript.
import type { ComponentProps, ReactNode } from "react"
import { cx } from "./outils"

type BlockRowProps = ComponentProps<"div"> & {
  handle?: ReactNode
  menu?: ReactNode
  insert?: ReactNode
  /** `editing` (le caret est là) et `moving` maintiennent la gouttière révélée : une présence, pas une teinte. */
  state?: "editing" | "moving"
}

export function BlockRow({ handle, menu, insert, state, className, children, ...rest }: BlockRowProps) {
  return (
    <div className={cx("oto-block-row", className)} data-state={state} {...rest}>
      <div className="oto-block-gutter">
        <div className="oto-block-insert">{insert}</div>
        <div className="oto-block-handle">{handle}</div>
      </div>
      {children}
      {menu && <div className="oto-block-menu">{menu}</div>}
    </div>
  )
}
