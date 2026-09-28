// Les chaînes de classes des écrans d'authentification de l'hôte, rendus sous `CoquilleOto` (E05-S07).
// Depuis E05-S09 (partie d3), les formulaires composent le design system porté (`Button`, `Field`,
// `Input`, `Alert` de `./ui`) : restent ici le lien de texte des écrans et le bouton principal de
// `/auth/confirmer`, écrit en utilitaires. Jetons du jeu seulement (`tests/unit/ui-tokens.test.ts`).

export const BOUTON_PRINCIPAL =
  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-on disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"

// Un lien dans une phrase se distingue autrement que par la couleur (le design system le laisse à la
// couleur du texte, `.oto a`) ; son anneau de focus est celui du design system, `--focus-ring`.
export const LIEN = "underline underline-offset-4"
