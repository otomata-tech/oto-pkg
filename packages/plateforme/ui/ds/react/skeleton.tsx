// Porté d'oto-frontend (src/design-system/components/react/primitives.jsx, `Skeleton`, `SkeletonText`) : des
// rectangles `aria-hidden`, le conteneur parle (`role="status"`) ; douze rectangles annoncés un par un
// rendraient le chargement illisible. Tels quels, en TypeScript.
import type { ComponentProps } from "react"
import { cx } from "./outils"

type SkeletonProps = ComponentProps<"span"> & {
  shape?: "text" | "circle" | "card" | "row"
  width?: number | string
  height?: number | string
}

export function Skeleton({ shape = "text", width, height, className, style, ...rest }: SkeletonProps) {
  return <span {...rest} className={cx("oto-skeleton", className)} data-shape={shape} style={{ inlineSize: width, blockSize: height, ...style }} aria-hidden="true" />
}

export function SkeletonText({ lines = 3, className, ...rest }: ComponentProps<"div"> & { lines?: number }) {
  return (
    <div {...rest} className={cx("oto-skeleton-text", className)} role="status" aria-busy="true" aria-live="polite">
      <span className="oto-sr-only">Chargement</span>
      {Array.from({ length: lines }, (_, rang) => (
        // Aucune donnée n'existe encore : le rang est l'identité de la ligne, qui ne se réordonne jamais.
        <Skeleton key={rang} shape="text" />
      ))}
    </div>
  )
}
