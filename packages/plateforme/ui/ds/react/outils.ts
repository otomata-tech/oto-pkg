// Porté d'oto-frontend (src/design-system/components/react/hooks.js, « Outils ») : `cx`, `mergeRefs`,
// `initials`, tels quels, en TypeScript ; `chain` vit dans `overlays.tsx` (`enchainer`), son seul lecteur. Retiré :
// `monogram` et `useRefList`, que la coque ne lit pas.
import type { Ref } from "react"

/** Les classes présentes, jointes. */
export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ")

/** Plusieurs refs sur un nœud : celle du consommateur n'est jamais perdue. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    }
  }
}

/**
 * Les initiales d'un avatar : un mot, une lettre ; deux mots, la première et la dernière. Le trait
 * d'union et l'apostrophe séparent des mots (« Marie-Claire » → « MC »).
 */
export function initials(name = ""): string {
  const words = String(name)
    .trim()
    .split(/[\s\-–—'’]+/)
    .filter(Boolean)
  if (!words.length) return "?"
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}
