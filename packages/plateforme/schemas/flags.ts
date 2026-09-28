// Drapeaux par organisation (E08-S04, H107) : un schéma pour l'écran d'E08-S03 (ui/), sa route
// d'API (api/) et les services (server/) : un schéma, une source de vérité (H02). `zod/v4`, comme
// tout schemas/ (P1).
import * as z from "zod/v4"

/** Nom d'un drapeau, en snake_case : 2 à 40 caractères, minuscules, chiffres et `_`, une lettre en tête. */
export const flagNameSchema = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/)

/** Poser un drapeau : son nom et sa valeur booléenne, aucun autre champ. */
export const flagToggleSchema = z.strictObject({ name: flagNameSchema, enabled: z.boolean() })

/** Un drapeau déclaré et son état pour l'organisation. */
export const flagViewSchema = z.object({
  name: flagNameSchema,
  description: z.string().min(1).max(200),
  enabled: z.boolean(),
})

export type FlagView = z.infer<typeof flagViewSchema>
