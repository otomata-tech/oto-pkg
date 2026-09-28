// Signalement d'un assistant (E03-S05, H22) : type en liste fermée, texte et cible bornés. Un schéma
// pour l'outil `feedback` (`mcp/schemas.ts` y ajoute `ctx` et les descriptions servies) et, plus
// tard, pour l'administration des retours (E08-S06, E08-S09) : un schéma, une source de vérité
// (`forms-patterns.md § Principe`). Bornes : celles qu'E03-S01 sert (4 000 caractères : le check de
// `feedback.text`, E01-S06). `zod/v4` comme tout schemas/ (P1).
import * as z from "zod/v4"
import { journalPeriodSchema } from "./journal"

/** Les trois types de H22 ; non exportée, aucun module ne la lit (N12) : les faces lisent `feedbackTypeSchema`. */
const FEEDBACK_TYPES = ["friction", "gap", "error"] as const

export const feedbackTypeSchema = z.enum(FEEDBACK_TYPES)

export const feedbackInputSchema = z.object({
  type: feedbackTypeSchema,
  text: z.string().trim().min(1).max(4000),
  target: z.string().trim().min(1).max(200).optional(),
})

export type FeedbackInput = z.infer<typeof feedbackInputSchema>

// ------------------------------------------------------------------ Administration (E08-S09)
// Les états d'un ticket et les paramètres de l'écran « Retours », partagés par l'écran, l'API et le
// service qu'E08-S06 réutilise. Sans eux, l'écran, la route et le MCP admin décriraient chacun un état.

export type FeedbackType = z.infer<typeof feedbackTypeSchema>

/** Les quatre états (E08-S09 N5), dans l'ordre des comptes de l'écran ; le check de `feedback.state`. */
const FEEDBACK_STATES = ["open", "acknowledged", "resolved", "declined"] as const

export const feedbackStateSchema = z.enum(FEEDBACK_STATES)

export type FeedbackState = z.infer<typeof feedbackStateSchema>

/** `int` de `feedback.number` : un numéro au-delà ne désigne aucun ticket. */
const MAX_TICKET_NUMBER = 2_147_483_647

/** « FB-0012 » → 12 : l'inverse de `ticketNumber` (`server/feedback.ts`), numéro de l'organisation (E01-S06). */
export const ticketSchema = z
  .string()
  .regex(/^FB-\d{4,}$/)
  .transform((ticket) => Number(ticket.slice("FB-".length)))
  .pipe(z.number().int().max(MAX_TICKET_NUMBER))

/**
 * Un changement d'état (AC10, AC11) : la résolution, espaces de bord retirés, compte 3 à 2 000
 * caractères (le check de `feedback.resolution` ; 3 par analogie avec H92) et un refus l'exige : sans
 * motif, un refus ne se distingue pas d'un oubli (Oto `usage-loop.md`).
 */
export const feedbackStateChangeSchema = z
  .object({
    state: feedbackStateSchema,
    resolution: z.string().trim().min(3).max(2000).optional(),
  })
  .refine((change) => change.state !== "declined" || change.resolution !== undefined, {
    path: ["resolution"],
    message: "A declined ticket needs a resolution.",
  })

export type FeedbackStateChangeInput = z.input<typeof feedbackStateChangeSchema>
export type FeedbackStateChange = z.output<typeof feedbackStateChangeSchema>

/** Les filtres d'état de l'écran : « à traiter » (ouverts et pris en compte, un filtre, pas un état), chaque état, « tous ». */
const FEEDBACK_FILTERS = ["to_handle", ...FEEDBACK_STATES, "all"] as const

/**
 * Les paramètres de `/admin/retours` (AC9), noms français comme ceux de `/journal` (N7) : une valeur
 * absente ou illisible retombe sur son défaut, jamais passée brute à une requête.
 */
export const feedbackListQuerySchema = z.object({
  etat: z.enum(FEEDBACK_FILTERS).catch("to_handle"),
  type: feedbackTypeSchema.optional().catch(undefined),
  periode: journalPeriodSchema.catch(30),
  curseur: z.string().min(1).max(200).optional().catch(undefined),
})

export type FeedbackListQuery = z.output<typeof feedbackListQuerySchema>
export type FeedbackFilter = FeedbackListQuery["etat"]

/** Un ticket tel que l'écran et le MCP admin le lisent (E08-S09, champs anglais H05). */
export type FeedbackTicketView = {
  /** « FB-0012 » : le numéro de l'organisation, jamais l'identifiant global. */
  ticket: string
  number: number
  createdAt: string
  /** `null` : la personne n'est plus membre. */
  person: string | null
  type: FeedbackType
  target: string | null
  text: string
  state: FeedbackState
  resolution: string | null
  /** `null` : jamais traité, ou traité par quelqu'un qui n'est plus membre (`handledAt` le dit). */
  handledBy: string | null
  handledAt: string | null
  ctx: string | null
}

export type FeedbackCounts = Record<FeedbackState, number>

/** Une page de tickets, les comptes par état sur la fenêtre et le type, la suite (AC12). */
export type FeedbackList = { tickets: FeedbackTicketView[]; counts: FeedbackCounts; nextCursor: string | null }
