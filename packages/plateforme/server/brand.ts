// Marque d'une organisation (E09-S01, H110) : lecture normalisée pour le layout, la page de
// connexion et l'écran de marque ; réglage par l'administrateur. Le droit d'écrire se décide ici,
// avant l'écriture (`isOrgAdmin`, E01-S07 AC15) ; la RLS (`orgs_update_admin`) n'est qu'un
// garde-fou. `admin_org update` (E08-S02) réutilise `updateBrand`.
import type * as z from "zod/v4"
import { brandInputSchema, languageSchema, OTO_THEMES, themeSchema, type BrandInput, type Language, type Theme } from "../schemas"
import { isOrgAdmin } from "./access"
import type { PlatformDb } from "./db"
import { databaseFailure, inTransaction, PlatformError } from "./errors"
import type { Identity } from "./identity"
import { isJsonObject } from "./json"

/** Thème du contrat `.oto` sans `data-oto-theme` (`ui/styles/oto.css`). */
const DEFAULT_THEME: Theme = "manuscrit"

/**
 * La marque telle qu'on l'affiche : toujours complète, jamais une adresse de logo non sûre ; la langue de
 * l'organisation seulement quand elle en a une (E05-S11, AC-36, lue par `preferredLanguage`).
 */
export type Brand = { theme: Theme; logoUrl: string | null; displayName: string; language?: Language }

export type BrandSettings = { brand: Brand; orgName: string; canEdit: boolean }

/** Ce que chaque champ refusé attendait, en anglais comme tout message de service (H04). */
const EXPECTED: Record<string, string> = {
  "": "an object with theme, logo_url and display_name",
  theme: `one of ${OTO_THEMES.join(", ")}`,
  logo_url: "an https:// address of at most 2048 characters, or null",
  display_name: "1 to 80 characters, or null",
  language: "fr or en, or null",
}

/**
 * `orgs.brand` lu champ par champ, sans jamais lever : un thème hors des huit devient Manuscrit,
 * un logo qui n'est pas une adresse `https:` disparaît, une langue hors de `fr` et `en` est absente.
 * Le nom montré est toujours celui de l'organisation (E05-S13, AC-3, HN-E05S13-2) : `brand.display_name`,
 * encore accepté à l'écriture, n'est plus lu.
 */
export function readBrand(org: { name: string; brand: unknown }): Brand {
  const brand = isJsonObject(org.brand) ? org.brand : {}
  const theme = themeSchema.safeParse(brand.theme)
  const logoUrl = brandInputSchema.shape.logo_url.safeParse(brand.logo_url)
  const language = languageSchema.safeParse(brand.language)
  return {
    theme: theme.success ? theme.data : DEFAULT_THEME,
    logoUrl: logoUrl.success ? logoUrl.data : null,
    displayName: org.name,
    ...(language.success ? { language: language.data } : {}),
  }
}

/** Ce que l'écran de marque montre : la marque, le nom de l'organisation, le droit de la modifier. */
export async function brandSettings(db: PlatformDb, identity: Identity): Promise<BrandSettings> {
  const [org] = await inTransaction(
    db,
    "brandSettings: orgs",
    (sql) => sql<{ name: string; brand: unknown }[]>`select o.name, o.brand from platform.orgs o where o.id = ${identity.org.id}`,
  )
  if (!org) throw new PlatformError("not_found", "Organisation not found.")
  return { brand: readBrand(org), orgName: org.name, canEdit: isOrgAdmin(identity) }
}

function invalidBrand(error: z.ZodError): PlatformError {
  const paths = [...new Set(error.issues.map((issue) => issue.path.join(".")))]
  const reasons = paths.map((path) => `${path || "body"}: expected ${EXPECTED[path]}`)
  return new PlatformError("invalid_arguments", `Invalid brand: ${reasons.join("; ")}.`, {
    paths: paths.map((path) => path || "body"),
  })
}

/**
 * Enregistre la marque complète de l'organisation de l'identité, réservée à l'administrateur
 * (`isOrgAdmin`), décidé avant l'écriture. Une écriture qui ne rend aucune ligne après cette décision
 * est un conflit, jamais un refus (HN-E01S07-6). Rend la marque écrite et la cible du journal de la
 * porte (H07). Appelée dans la transaction d'un service de la même session (`admin_org update`,
 * `updateOrg`), son écriture la reprend (`db.tx`, HN-E01S10-7) : l'échec de l'un annule l'autre.
 */
export async function updateBrand(
  db: PlatformDb,
  identity: Identity,
  input: unknown,
): Promise<{ data: BrandInput; target: "brand" }> {
  const parsed = brandInputSchema.safeParse(input)
  if (!parsed.success) throw invalidBrand(parsed.error)
  if (!isOrgAdmin(identity)) throw new PlatformError("forbidden", `Only an administrator of ${identity.org.name} can change its brand.`)
  const { theme, logo_url, display_name, language } = parsed.data
  // La langue (AC-36) : écrite si elle est donnée, retirée à `null`, gardée telle qu'enregistrée si elle
  // manque (le formulaire de marque et `admin_org update` ne l'envoient pas).
  const brand = { theme, logo_url, display_name, ...(language ? { language } : {}) }
  const keepLanguage = language === undefined

  const [written] = await db
    .tx((sql) => sql<{ id: string }[]>`
      update platform.orgs
         set brand = ${sql.json(brand)}::jsonb
             || case when ${keepLanguage} then jsonb_strip_nulls(jsonb_build_object('language', brand -> 'language')) else '{}'::jsonb end
       where id = ${identity.org.id} returning id`)
    .catch((error) => {
      throw databaseFailure(error, "updateBrand: orgs update", "The brand could not be saved.")
    })
  // Aucune ligne après la décision : l'organisation a changé entre-temps (supprimée, ou un droit
  // retiré que la base constate).
  if (!written) {
    console.error(`[platform] updateBrand: no row written for organisation ${identity.org.id}`)
    throw new PlatformError("conflict", `The brand of ${identity.org.name} changed meanwhile. Reload it and retry.`)
  }
  return { data: { theme, logo_url, display_name, ...(language === undefined ? {} : { language }) }, target: "brand" }
}
