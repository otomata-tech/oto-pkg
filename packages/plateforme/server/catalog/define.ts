// Forme commune d'une fonction du catalogue derrière `call` (H80, H81). Fichier à part du registre :
// les sources de fonctions (`table.*` E07-S01, `mail` simulé E04-S01, ERP E08-S05) en ont besoin, et
// le registre les importe ; sans lui, l'import serait circulaire.
//
// Repris de la maquette (`mcp-test/src/proto/functions/define.ts` l. 8-45) : classe, contrat,
// exemples, refus, `strictObject`. Ajouté : l'origine (H80) et la suite proposée (`next`, H87).
import type * as z from "zod/v4"
import type { ResolvedAccount } from "../connectors/resolution"
import type { PlatformDb } from "../db"
import type { Identity } from "../identity"

/** read : lecture ; write : écriture ; sensitive : envoie, supprime ou paie → deux temps (H86). */
export type FunctionClass = "read" | "write" | "sensitive"

/** paquet : native ; erp : inscrite par l'hôte ; service_connecteurs : connecteur distant (V2). */
export type FunctionOrigin = "paquet" | "erp" | "service_connecteurs"

export type FunctionContext = {
  db: PlatformDb
  identity: Identity
  /** Jeton vérifié de l'appelant (E08-S05, NH4), posé pour une fonction de l'ERP seule (NH19) : elle construit sur lui son client de l'ERP. */
  accessToken?: string
  /** Compte résolu (H83) d'une fonction de connecteur ; absent pour une fonction native ou ERP (E04-S01). */
  account?: ResolvedAccount
  /** Code `ctx` de l'appel (E03-S04, N9) : la provenance d'une écriture faite par un assistant (ADR-011 § 2). */
  ctx?: string | null
  /** Client MCP de la conversation (`ctx.host`, `nom@version`), rangé dans la provenance d'une écriture (E11-S01, AC-d2) ; absent sans lui. */
  host?: string | null
  /** Origine de l'adresse appelée (`https://acme.oto.cx`) : lien d'un écran cité par un refus (E07-S02, AC17). */
  origin?: string
}

/** Récapitulatif d'une fonction sensible, montré avant l'accord : texte et données en champs (H26). */
export type FunctionSummary = { text: string; data?: Record<string, unknown> }

export type FunctionOutput = {
  text: string
  data?: Record<string, unknown>
  /** Fonctions proposées ensuite ; les sensibles en sont retirées à la mise en forme (H87). */
  next?: string[]
  teamId?: string | null
}

/** Un schéma d'arguments strict : une clé inconnue (« filters » pour « filter ») est refusée. */
type StrictSchema = z.ZodObject<z.core.$ZodShape, z.core.$strict>

/**
 * Contrôle propre à la fonction (E03-S06, R13), rejoué à la publication d'une procédure sur les
 * arguments d'un bloc `call` que son schéma accepte hors espaces réservés : `args` tels qu'écrits, un
 * espace réservé compris ; `isPlaceholder(chemin)` dit si la valeur à ce chemin en est un (règle 4,
 * `isPlaceholderValue`), jamais contrôlée. Rend les problèmes, en anglais et sans emplacement ; `[]`
 * sans problème. Contexte : la base et l'identité de qui publie, ou d'un simple lecteur de la procédure
 * (contrôle de l'écran, `checkProcedure`, dès le niveau 1) : `checkArgs` décide lui-même, par
 * `access.ts`, de ce qu'il lit et de ce que ses problèmes en montrent (`security-patterns.md § Droits
 * dans le service`).
 */
type CheckArgs = (
  context: Pick<FunctionContext, "db" | "identity">,
  args: Readonly<Record<string, unknown>>,
  isPlaceholder: (path: readonly PropertyKey[]) => boolean,
) => Promise<string[]>

export type CatalogFunction = {
  name: string
  connector: string
  class: FunctionClass
  origin: FunctionOrigin
  /** Anglais, première phrase = ce qu'elle fait. */
  description: string
  schema: StrictSchema
  examples: Record<string, unknown>[]
  refusals: string[]
  next?: string[]
  run: (context: FunctionContext, args: never) => Promise<FunctionOutput>
  /** Fonctions sensibles : récapitulatif nominatif montré avant l'accord, sans rien exécuter. */
  summarize?: (context: FunctionContext, args: never) => Promise<FunctionSummary>
  checkArgs?: CheckArgs
}

/** Fonction typée par son schéma, effacée au type commun du catalogue. */
export function defineFunction<S extends StrictSchema>(fn: {
  name: string
  connector: string
  class: FunctionClass
  origin: FunctionOrigin
  description: string
  schema: S
  examples: z.input<S>[]
  refusals: string[]
  next?: string[]
  run: (context: FunctionContext, args: z.output<S>) => Promise<FunctionOutput>
  summarize?: (context: FunctionContext, args: z.output<S>) => Promise<FunctionSummary>
  checkArgs?: CheckArgs
}): CatalogFunction {
  // `run` et `summarize` reçoivent des arguments déjà validés par `schema` : leur type précis
  // s'efface ici au type commun du catalogue (`never`, jamais appelé sans validation).
  return fn as unknown as CatalogFunction
}
