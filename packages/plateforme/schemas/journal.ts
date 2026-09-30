// Le journal des appels (E05-S05) : paramètres de l'adresse `/journal`, sections de `read journal`,
// et les formes que `server/journal-read.ts` rend à l'écran comme au modèle. Sans ce module, l'écran
// et le service décriraient chacun une conversation, et un paramètre illisible ferait tomber la page.
//
// Repris d'oto-frontend (`src/schemas/monitoring.ts`) : les fenêtres 7 / 30 / 90 jours, une union de
// littéraux plutôt qu'un nombre libre, la valeur illisible rattrapée par son défaut. Retiré : les six
// onglets du suivi, `appel` et `deroule` (ici une conversation par son code `ctx`).
import * as z from "zod/v4"
import { ctxCodeSchema } from "./ctx"

/** Les périodes de l'écran, en jours (AC4) ; 7 par défaut. */
export const JOURNAL_PERIODS = [7, 30, 90] as const

/** Le chemin du journal (P22) : servi par `read`, réservé pour `write` (HN-E05S05-8). */
export const JOURNAL_PATH = "journal"

/** Lignes regroupées au plus par lecture d'une période, les plus récentes (HN-E05S05-1) ; l'écran et `read` le disent (AC6). */
export const JOURNAL_ROWS_SCANNED = 2000

/** La demande citée d'une conversation sans procédure servie, coupée une fois par le service (AC3, AC9). */
export const JOURNAL_REQUEST_CHARS = 80

export const journalPeriodSchema = z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))

/**
 * Les paramètres de l'adresse, en anglais (E11-S07), un schéma par paramètre : `cursor` pour la liste, `calls`
 * pour les appels d'une conversation ouverte (les deux se lisent ensemble, liste et panneau restent affichés).
 */
const PARAMS = {
  period: journalPeriodSchema,
  team: z.uuid(),
  person: z.uuid(),
  errors: z.literal("1"),
  cursor: z.string().max(200),
  conversation: ctxCodeSchema,
  calls: z.string().max(200),
}

export type JournalParam = keyof typeof PARAMS

type ParamValue<K extends JournalParam> = z.output<(typeof PARAMS)[K]>

/** Un paramètre lu : absent ou vide (« Toutes les équipes » envoie `team=`), il n'est pas posé. */
function readParam<K extends JournalParam>(raw: Record<string, unknown>, key: K, ignored: JournalParam[]): ParamValue<K> | undefined {
  const value = raw[key]
  if (value === undefined || value === "") return undefined
  const parsed = PARAMS[key].safeParse(value)
  // `PARAMS[key]` est l'union des sept schémas pour TypeScript : il ne relie pas la sortie à `K`.
  if (parsed.success) return parsed.data as ParamValue<K>
  ignored.push(key)
  return undefined
}

/**
 * Les paramètres de `/journal`, lus par la page et jamais passés bruts à une requête
 * (`api-patterns.md § Search & Filter`). Une valeur illisible (période 12, identifiant mal formé,
 * valeur répétée) retombe sur son défaut et son nom va dans `ignored`, que l'écran dit (AC4).
 */
export const journalFiltersSchema = z.record(z.string(), z.unknown()).transform((raw) => {
  const ignored: JournalParam[] = []
  return {
    period: readParam(raw, "period", ignored) ?? 7,
    team: readParam(raw, "team", ignored),
    person: readParam(raw, "person", ignored),
    errors: readParam(raw, "errors", ignored),
    cursor: readParam(raw, "cursor", ignored),
    conversation: readParam(raw, "conversation", ignored),
    calls: readParam(raw, "calls", ignored),
    ignored,
  }
})

export type JournalFilters = z.output<typeof journalFiltersSchema>

/** Les sections de `read {path: "journal"}` (AC9 à AC11) : les 24 dernières heures, 7 jours, une conversation. */
export const journalSectionSchema = z.union([z.literal("today"), z.literal("week"), ctxCodeSchema])

export type JournalSection = z.output<typeof journalSectionSchema>

/** Une valeur d'arguments telle que l'écran et `read` la montrent : masquée, coupée (AC8). */
export type JournalArgs = null | boolean | number | string | JournalArgs[] | { [key: string]: JournalArgs }

/**
 * Une conversation : les lignes de la portée de l'appelant qui portent le même `ctx` (AC5,
 * HN-E05S05-1). `context` : un appel `context` y est visible ; il a servi `procedurePath` quand c'est
 * une procédure que l'appelant lit, sinon sa cible est la demande (`request`, nulle sans phrase).
 */
export type ConversationSummary = {
  ctx: string
  startedAt: string
  lastAt: string
  userId: string | null
  /** `null` : la personne n'est plus membre (« Personne retirée »). */
  userName: string | null
  host: string | null
  context: boolean
  procedurePath: string | null
  /** La demande, coupée à `JOURNAL_REQUEST_CHARS` (« … » compris). */
  request: string | null
  calls: number
  errors: number
}

/** Une page de conversations (AC3, AC6), la plus récente d'abord ; les comptes portent sur toute la fenêtre. */
export type JournalPage = {
  conversations: ConversationSummary[]
  /** Conversations de la fenêtre, filtres compris. */
  total: number
  /** Appels de ces conversations. */
  calls: number
  /** Conversations qui comptent au moins un appel en échec. */
  withErrors: number
  /** La période compte plus d'appels que la lecture n'en regroupe (`JOURNAL_ROWS_SCANNED`). */
  truncated: boolean
  /** Le curseur reçu n'était plus valable : la liste repart du début. */
  restarted: boolean
  nextCursor: string | null
}

/** Un appel d'une conversation (AC7, AC10), rang compris depuis le premier appel visible. */
export type JournalCall = {
  id: number
  rank: number
  ts: string
  /** Le nom de l'outil sans préfixe : `context`, `read`, `call`… */
  tool: string
  target: string | null
  teamName: string | null
  /** Libellé du compte, s'il est lisible par l'appelant. */
  accountLabel: string | null
  durationMs: number | null
  isError: boolean
  error: string | null
  args: JournalArgs
  /**
   * Appel sur l'espace personnel d'une autre personne, lu par qui n'en est pas l'auteur (D44, M14) :
   * `args` nul, `target` coupée à `private/<handle>` (`perso/<handle>` pour une ligne d'avant D107), `error` réduite à son code ; absent sinon.
   */
  hidden?: boolean
}

export type ConversationDetail = {
  summary: ConversationSummary
  calls: JournalCall[]
  nextCursor: string | null
}
