// Porté d'oto-frontend (src/design-system/icons/icon.jsx) : `Icon` et `AnimatedIcon`, l'enveloppe qui
// fixe la taille et le geste de survol d'un glyphe. Changé : les glyphes sont ceux de Phosphor, une
// icône par import, passée en `as` (portage-ecrans.md § 3) ; la table des mariages ne
// garde que les gestes du glyphe entier (`ui/ds/icons/anim.css`).
import type { ComponentProps, ComponentType } from "react"
import type { IconWeight } from "@phosphor-icons/react"

/** Les seules tailles du système : `xs` dans le rail et les menus, `lg` dans les états vides. */
export const ICON_SIZES = { xs: 14, sm: 16, md: 20, lg: 24 } as const

export type IconSize = keyof typeof ICON_SIZES

/** Un glyphe Phosphor (`@phosphor-icons/react/dist/csr/<Nom>` ou `/dist/ssr/<Nom>`). */
export type Glyphe = ComponentType<{ size?: number; weight?: IconWeight; "aria-hidden"?: boolean | "true" }> & { displayName?: string }

type IconProps = Omit<ComponentProps<"span">, "children"> & {
  as: Glyphe
  size?: IconSize
  /** Quand l'icône porte seule un sens ; sinon elle est décorative, hors de l'arbre d'accessibilité. */
  label?: string
}

export function Icon({ as: Glyph, size = "sm", label, className = "", ...rest }: IconProps) {
  return (
    <span
      {...rest}
      className={`oto-icon ${className}`.trim()}
      data-size={size}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" })}
    >
      <Glyph size={ICON_SIZES[size]} weight="regular" aria-hidden="true" />
    </span>
  )
}

/**
 * Le geste de chaque glyphe, lu de son `displayName` (Phosphor le suffixe d'`Icon` : `GearIcon`) ;
 * `pop` à défaut, qui transforme le glyphe entier.
 */
export const MARIAGES: Readonly<Record<string, string>> = {
  ArrowRight: "nudge",
  SignOut: "nudge",
  ArrowUpRight: "nudge",
  CaretDown: "drop",
  CaretUpDown: "pop",
  Gear: "turn",
  PencilSimple: "tilt",
  PencilSimpleLine: "tilt",
  MagnifyingGlass: "magnify",
  Info: "bounce",
  WarningCircle: "bounce",
  Sparkle: "pop",
  Users: "pulse",
  User: "pulse",
  DotsThree: "pulse",
  Plus: "pop",
  X: "cross",
}

export function gesteDe(Glyph: Glyphe | undefined): string {
  const nom = Glyph?.displayName?.replace(/Icon$/, "")
  return (nom && MARIAGES[nom]) || "pop"
}

type AnimatedIconProps = IconProps & {
  /** Le geste joué au survol ou au focus de l'hôte (`.anim-host`) ; déduit du glyphe à défaut. */
  anim?: string
}

export function AnimatedIcon({ anim, className = "", ...rest }: AnimatedIconProps) {
  return <Icon {...rest} className={`a-${anim ?? gesteDe(rest.as)} ${className}`.trim()} />
}
