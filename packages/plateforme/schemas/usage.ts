// L'usage d'une organisation (E08-S09, FR-OBS-04) : les paramètres de l'adresse `/admin/usage` et la
// forme que `server/usage.ts` rend à l'écran. Sans ce module, la page lirait ses paramètres bruts et
// l'écran devinerait la forme du calcul.
import * as z from "zod/v4"
import { journalPeriodSchema } from "./journal"

/**
 * Appels lus au plus dans une fenêtre, les plus récents (AC8, N2) : au-delà, le calcul le dit. Ici,
 * face commune, pour que le service qui borne et l'écran qui dit la borne lisent la même valeur.
 */
export const USAGE_MAX_LINES = 20_000

/**
 * `period` et `team`, noms des paramètres de `/journal` (E05-S05 ; en anglais, E11-S07) : 30 jours par défaut et
 * pour toute valeur inconnue (N3) ; un identifiant d'équipe mal formé est ignoré (AC2).
 */
export const usageQuerySchema = z.object({
  period: journalPeriodSchema.catch(30),
  team: z.uuid().optional().catch(undefined),
})

export type UsageQuery = z.output<typeof usageQuerySchema>
export type UsagePeriod = UsageQuery["period"]

/** Le tableau de bord d'usage (AC3 à AC8), sur les lignes `tools/call` de la fenêtre. */
export type UsageSummary = {
  periode: UsagePeriod
  /** L'équipe du filtre ; `null` sans filtre, ou pour un identifiant inconnu. */
  team: { id: string; name: string } | null
  /** Plus de `USAGE_MAX_LINES` appels dans la fenêtre : le calcul porte sur les plus récents (AC8). */
  truncated: boolean
  /** La date de la plus ancienne ligne lue quand le calcul est tronqué. */
  coveredFrom: string | null
  totals: { conversations: number; people: number; calls: number; errors: number }
  procedures: { path: string; title: string; served: number; conversations: number; people: number; lastServedAt: string }[]
  functions: { name: string; calls: number; errors: number; lastError: { message: string; at: string } | null }[]
  unmatched: { count: number; items: { ctx: string; at: string; person: string | null; phrase: string; host: string | null }[] }
}
