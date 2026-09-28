import type { Locator } from "@playwright/test"

/**
 * Attend la fin des entrées et des transitions d'un élément et de ses descendants : une capture ne saisit
 * rien à mi-course. Les animations sans fin (un point d'état qui respire) ne s'attendent pas, ni celles que
 * pilote un défilement (`animation-timeline: scroll()` de `table.css` et `misc.css`), qui ne finissent jamais
 * (`testing-strategy.md § Anti-patterns`). Repris de `rail.spec.ts` (E05-S09, partie a), qui l'importe (M31) ;
 * autre lecteur : `accueil.spec.ts` (partie b).
 */
export const auRepos = (element: Locator) =>
  element.evaluate((racine) =>
    Promise.all(
      racine
        .getAnimations({ subtree: true })
        .filter((animation) => animation.timeline instanceof DocumentTimeline)
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ).then(() => undefined),
  )
