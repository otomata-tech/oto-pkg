// Ce que rend un service servi par un outil MCP (N16). Sans ce fichier, les services de server/
// importeraient un type de mcp/, contre le sens des dépendances entre faces (architecture § 3).

/**
 * Plafond d'un résultat, mesuré sur `structuredContent` sérialisé (banc E04, mesure 3) : `read`
 * pagine sous lui (E03-S03, N36), le formateur de `mcp/result.ts` coupe au-delà en dernier rempart.
 */
export const MAX_RESULT_CHARS = 45_000

/** Plafond des données en champs d'un résultat ; au-delà, le formateur les omet. */
export const MAX_DATA_CHARS = 20_000

/**
 * Caractères d'un texte une fois sérialisé en JSON, guillemets exclus : la mesure du plafond (H26),
 * partagée par le formateur (`mcp/result.ts`) et la pagination de `read` (E03-S03).
 */
export function serializedLength(text: string): number {
  return JSON.stringify(text).length - 2
}

export type ToolOutput = {
  /** Ce que le modèle lit, servi à l'identique en texte et en `structuredContent.text` (H26). */
  text: string
  /** Données en champs de `structuredContent` (ids, lignes, dates), en plus du texte. */
  data?: Record<string, unknown>
  /** Noms de fonctions ou d'outils proposés ensuite ; les fonctions sensibles en sont retirées. */
  nextActions?: string[]
  /** Comment lire la suite d'un résultat coupé à 45 000 caractères (curseur, section). */
  continuation?: string
  /** Pour le journal : fonction, chemin ou phrase touchés. */
  target?: string | null
  /** Pour le journal : équipe sous laquelle l'appel a couru. */
  teamId?: string | null
  /** Pour le journal : compte de connecteur sur lequel `call` a couru (E03-S04), nul pour une fonction sans compte. */
  accountId?: string | null
  /** Pour le journal : code `ctx` émis par `context`. */
  ctx?: string
  /** Pour le journal : signature du host (`client_name@version`) portée par le `ctx`. */
  host?: string | null
}
