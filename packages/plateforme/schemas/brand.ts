// Marque d'une organisation (E09-S01, H110) : un des huit thèmes du jeu Oto, un logo par adresse
// `https://`, un nom affiché. Un schéma pour le formulaire (ui/), l'API (api/) et les services
// (server/) : `server/` n'importe pas `ui/`, la liste des thèmes vit donc ici et nulle part ailleurs.
//
// Repris d'oto-frontend (`OTO_THEMES` de `design-system/components/react/product.jsx`) : les huit
// thèmes nommés et leur famille. Retiré : « DA Oto » dans la famille de Manuscrit.
import * as z from "zod/v4"

/** Les huit thèmes : les clés des blocs `.oto[data-oto-theme="…"]` de `ui/styles/oto.css`. */
export const OTO_THEMES = ["manuscrit", "ardoise", "grenat", "brique", "foret", "lagune", "cobalt", "violet"] as const

export const themeSchema = z.enum(OTO_THEMES)

export type Theme = z.infer<typeof themeSchema>

/** Nom et famille de teinte de chaque thème, tels que l'écran de marque les affiche. */
export const THEME_LABELS = {
  manuscrit: ["Manuscrit", "jaune"],
  ardoise: ["Ardoise", "neutre"],
  grenat: ["Grenat", "rouge"],
  brique: ["Brique", "orange"],
  foret: ["Forêt", "vert"],
  lagune: ["Lagune", "cyan"],
  cobalt: ["Cobalt", "bleu"],
  violet: ["Violet", "violet"],
} as const satisfies Record<Theme, readonly [string, string]>

/**
 * Les langues de la V1 (HN-E05S04-5) : celle d'une organisation (`orgs.brand.language`) et celle d'une
 * personne (`members.profile.language`, `schemas/profile.ts`), la langue dans laquelle l'assistant répond
 * (E05-S11, D105, D107). Ici et non dans `profile.ts`, qui lit `themeSchema` : un seul sens d'import.
 */
export const languageSchema = z.enum(["fr", "en"])

export type Language = z.infer<typeof languageSchema>

/** Seule une adresse `https:` lisible devient le `src` d'un logo (`security-patterns.md § XSS Prevention`). */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Un champ texte facultatif : espaces retirés, vide = `null` (valeur retirée). `null` passe tel
 * quel : c'est ce que le formulaire envoie à l'API pour un champ vidé.
 */
function optionalText(rule: z.ZodString) {
  return z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(rule.nullable())
    .nullable()
}

export const brandInputSchema = z.object({
  theme: themeSchema,
  logo_url: optionalText(
    z.string().max(2048, "2 048 caractères au plus.").refine(isHttpsUrl, "L'adresse du logo doit commencer par https://"),
  ),
  // Borne d'Oto pour un nom d'organisation (`oto_mcp/capabilities/orgs/core.py` : 1 à 80).
  display_name: optionalText(z.string().min(1).max(80, "80 caractères au plus.")),
  // La langue de l'organisation (E05-S11, AC-36 ; HN-E05S11-4) : absente, `updateBrand` garde celle qui est
  // enregistrée (le formulaire de marque ne l'envoie pas) ; `null` la retire.
  language: languageSchema.nullable().optional(),
})

/** Forme écrite dans `orgs.brand` (architecture § 4) ; entrée et sortie du schéma sont identiques. */
export type BrandInput = z.infer<typeof brandInputSchema>
