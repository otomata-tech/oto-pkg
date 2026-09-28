// Porté d'oto-frontend (src/design-system/components/react/primitives.jsx, `AvatarGroup`) : une pile de
// visages, `max` au plus, le reste en « +N » ; `on` nomme la surface de dessous, dont l'anneau prend la
// couleur. L'`id` d'une personne sort du spread : c'est sa clé, pas un identifiant de document (deux piles
// d'un écran en auraient sinon des doublons). Tel quel, en TypeScript.
import type { ComponentProps } from "react"
import { cx } from "./outils"
import { Avatar } from "./primitives"

type Personne = { id?: string; name?: string; src?: string | null }

type AvatarGroupProps = ComponentProps<"span"> & {
  people?: Personne[]
  max?: number
  size?: "sm" | "md" | "lg"
  on?: "island" | "card" | "desk"
}

export function AvatarGroup({ people = [], max = 4, size = "sm", on = "island", className, ...rest }: AvatarGroupProps) {
  const montres = people.slice(0, max)
  const reste = people.length - montres.length
  return (
    <span className={cx("oto-avatar-group", className)} data-on={on} {...rest}>
      {montres.map(({ id, ...personne }, rang) => (
        <Avatar key={id ?? rang} size={size} {...personne} />
      ))}
      {reste > 0 && (
        <span
          className="oto-avatar oto-avatar-more"
          data-size={size}
          title={people
            .slice(max)
            .map((personne) => personne.name)
            .filter(Boolean)
            .join(", ")}
        >
          +{reste}
        </span>
      )}
    </span>
  )
}
