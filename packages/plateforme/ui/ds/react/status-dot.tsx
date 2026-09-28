// Porté d'oto-frontend (src/design-system/components/react/primitives.jsx, `StatusDot` et `AGENT_STATES`) :
// le point d'état, qui porte toujours son mot (`aria-label` pour le lecteur d'écran, `title` pour la
// souris) ; un point coloré sans mot n'est pas une information. Tel quel, en TypeScript.
import type { ComponentProps } from "react"
import { cx } from "./outils"

/** Le mot de chaque état, dit à la place de la couleur. */
export const AGENT_STATES = {
  rest: "Au repos",
  queued: "En file",
  running: "En cours",
  thinking: "Réfléchit",
  live: "En ligne",
  ok: "Réussi",
  review: "À valider",
  failed: "Échec",
  paused: "En pause",
} as const

type StatusDotProps = ComponentProps<"span"> & { state?: keyof typeof AGENT_STATES; label?: string }

export function StatusDot({ state = "rest", label, className, ...rest }: StatusDotProps) {
  const texte = label ?? AGENT_STATES[state]
  // Le rôle, le nom et l'infobulle passent après les attributs reçus : ils sont la raison d'être du composant.
  return <span {...rest} className={cx("oto-dot", className)} data-state={state} role="img" aria-label={texte} title={texte} />
}
