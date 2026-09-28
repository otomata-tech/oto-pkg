// Aides des tests d'écran rendus par Testing Library (M15b-1) : l'écran « Brancher un assistant » et
// la page `/connect` (E02-S04) lisaient chacun leurs sections par la même requête.
import { screen } from "@testing-library/react"

/** La `<section>` dont le titre de niveau 2 est `titre` : lève si elle manque. */
export function section(titre: string): HTMLElement {
  const element = screen.getByRole("heading", { level: 2, name: titre }).closest("section")
  if (!element) throw new Error(`section « ${titre} » absente`)
  return element
}
