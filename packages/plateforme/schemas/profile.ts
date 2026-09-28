// La fiche d'une personne (E05-S04, AC13 ; H31, P39 ; E05-S11, AC-3, AC-5) : ce qu'elle écrit elle-même par
// `PATCH /api/plateforme/profile`, lu par le formulaire de la page « Profil » et par `updateProfile`. Mêmes
// champs et bornes que `update_my_profile` (migration `20260928110000_platform_profil.sql`) : le nom, le
// prénom et le nom de famille (80 caractères chacun), la langue (`fr`, `en`) et la couleur (un des huit
// thèmes) ; une chaîne vide retire la clé ; écrire le prénom ou le nom de famille recompose le nom. Ni
// `handle` (il fonde `private/<handle>`, H61), ni ton, signature ou préférences (P39 : ils s'écrivent dans le
// Contexte Perso). Sans lui, le formulaire et l'API valideraient chacun la fiche.
//
// Repris d'Oto (`oto_mcp/capabilities/profile.py` l. 35-58) : une fiche à champs connus, qu'une personne
// peut vider. Retiré : `crm`, `connectors_wanted`, `company`, `goals`, `tone` et les clés libres.
import * as z from "zod/v4"
import { chars } from "./blocks"
import { languageSchema, themeSchema, type Language, type Theme } from "./brand"

export { languageSchema }

/** La borne du nom, du prénom et du nom de famille, celle d'`update_my_profile`, que l'écran dit aussi. */
export const PROFILE_TEXT_MAX = 80

/** Un texte de la fiche, compté en caractères comme `char_length` dans `update_my_profile` : un emoji compte pour un. */
const texte = (champ: string) =>
  z
    .string()
    .trim()
    .refine((valeur) => chars(valeur) <= PROFILE_TEXT_MAX, `${champ}: ${PROFILE_TEXT_MAX} characters at most.`)
    .optional()

/** Ce qu'une personne change de sa fiche : un champ au moins ; `""` retire la clé (E01-S06 N28). */
export const profilePatchSchema = z
  .strictObject({
    name: texte("Name"),
    first_name: texte("First name"),
    last_name: texte("Last name"),
    language: z.union([languageSchema, z.literal("")]).optional(),
    theme: z.union([themeSchema, z.literal("")]).optional(),
  })
  .refine((patch) => Object.values(patch).some((valeur) => valeur !== undefined), "Give name, first_name, last_name, language or theme.")

export type ProfilePatch = z.output<typeof profilePatchSchema>

/** La fiche rendue par `update_my_profile`, ses champs connus seulement (jamais `handle`). */
export type ProfileView = { name?: string; first_name?: string; last_name?: string; language?: Language; theme?: Theme }

/**
 * Ce que la page « Profil » montre (`readProfile`) : la fiche, et ce que vaut
 * « Celle de l'organisation » pour la langue et la couleur (AC-4, AC-36 : la langue de l'organisation,
 * sinon le français ; son thème).
 */
export type ProfileSheet = { profile: ProfileView; organisation: { language: Language; theme: Theme } }
