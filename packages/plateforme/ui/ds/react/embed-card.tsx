// Porté d'oto-frontend (src/design-system/components/react/content.jsx, `EmbedCard`) : un contenu incorporé
// au fil du texte est un objet, pas une ligne (vignette, nom, type, portée, volume, geste pour y aller) ;
// le nom porte le lien, pas la carte (une carte cliquable qui contient un second lien empile deux cibles
// au même endroit), d'où `...rest` sur le nom ; la portée se dit par un mot, jamais par la seule pastille.
// Tel quel, en TypeScript.
import type { ComponentProps, ElementType, ReactNode } from "react"
import { cx } from "./outils"

type EmbedCardProps = Omit<ComponentProps<"a">, "children"> & {
  icon?: ReactNode
  name: ReactNode
  kind?: ReactNode
  where?: ReactNode
  whereKind?: "here" | "elsewhere"
  volume?: ReactNode
  action?: ReactNode
  /** L'hôte du nom : `a` par défaut, ou le lien de l'hôte (portage-ecrans.md § 1). */
  as?: ElementType
}

export function EmbedCard({ icon, name, kind, where, whereKind = "here", volume, action, as: Tag = "a", className, ...rest }: EmbedCardProps) {
  return (
    <div className={cx("oto-embed", "anim-host", className)}>
      <span className="oto-embed-icon">{icon}</span>
      <span className="oto-embed-text">
        <Tag className="oto-embed-name" {...rest}>
          {name}
        </Tag>
        <span className="oto-embed-meta">
          {kind != null && <span className="oto-embed-kind">{kind}</span>}
          {where != null && (
            <span className="oto-embed-where" data-where={whereKind}>
              {where}
            </span>
          )}
          {volume != null && <span>· {volume}</span>}
        </span>
      </span>
      {action != null && <span className="oto-embed-actions">{action}</span>}
    </div>
  )
}
