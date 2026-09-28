// Moteur de blocs de `context` (H30, ADR-002 § 7) : des blocs ordonnés par priorité dans un budget
// de caractères, coupés par la fin. Sans lui, un Contexte trop long (E03-S08) dépasserait ce que
// les hosts lisent en entier.
//
// Repris de la maquette (`mcp-test/src/proto/services/context.ts` l. 11-61) : réserve de la ligne
// finale, coupe à la ligne, blocs suivants omis et nommés. Repris d'Oto
// (`oto_mcp/capabilities/agent_context.py`) : un bloc au corps vide est omis ; le poids en caractères
// de chaque bloc, pour l'aperçu (« on mesure, on n'ampute pas », l. 44-52). Retiré d'Oto : notice,
// toolbox, projets et `run_*` (architecture § 10).

import { SERVED_BUDGET } from "../../schemas"

/** 5 000 tokens ≈ 20 000 caractères, arbitrage du doc fonctionnel (coût sur l'abonnement). */
export const CONTEXT_BUDGET = 20_000

/** Place gardée pour la ligne finale qui nomme les blocs omis. */
const NOTICE_RESERVE = 240

const DAY_MS = 86_400_000

export type ContextBlock = {
  name: string
  text: string
  /**
   * Remplaçant d'un bloc qui ne tient pas (N2) : un bloc qui en a un n'est jamais coupé. La procédure
   * servie y met un pointeur vers `read` (E03-S02, AC9).
   */
  fallback?: string
  /**
   * Déjà coupé à sa taille nominale (H30, E03-S08 N6) : rapporté `cut` même quand le budget le garde
   * entier. Sans lui, l'aperçu d'E05-S04 dirait « complet » d'un Contexte tronqué.
   */
  cut?: boolean
  /** Chemin du nœud Contexte d'où vient le bloc (E03-S08), recopié dans le rapport pour l'écran d'E05-S04. */
  path?: string
  /**
   * Caractères de la tête d'une partie de Contexte (E05-S12, AC-4) : en-tête, ligne de faits, connecteurs.
   * Sans lui, l'écran ne saurait où finit ce que l'assistant lit toujours et où commence le Contexte écrit.
   */
  head?: number
}

/** Ce que le moteur a fait d'un bloc : gardé entier, coupé, remplacé par son `fallback`, omis. */
export type BlockStatus = "full" | "cut" | "replaced" | "omitted"

/**
 * Une ligne du rapport (E03-S08, AC8) : `chars` = caractères du bloc tel qu'inclus, 0 s'il est omis ;
 * `head` = la part de sa tête incluse (E05-S12, AC-4), 0 pour un bloc sans tête. `renderContext` le pose
 * toujours ; optionnel au type pour les doublures d'écran écrites avant lui (HN-E05S12-A1).
 */
export type BlockReport = { name: string; chars: number; status: BlockStatus; path: string | null; head?: number }

/** Le début de `text` qui tient en `max` caractères, coupé à une fin de ligne ; `""` si rien ne tient. */
export function linesThatFit(text: string, max: number): string {
  if (text.length <= max) return text
  if (max <= 0) return ""
  const end = text.lastIndexOf("\n", max)
  return end === -1 ? "" : text.slice(0, end)
}

/**
 * Un bloc borné à sa taille nominale (H30, E03-S08 N6) : coupé à la dernière ligne entière qui tient,
 * sa première ligne (son titre) gardée, et marqué `cut`. Le moteur coupe ensuite par le budget total.
 */
export function withinSize(block: ContextBlock, size: number): ContextBlock {
  if (block.text.length <= size) return block
  return { ...block, text: linesThatFit(block.text, size), cut: true }
}

/**
 * L'instant d'il y a `days` jours (ISO) : la borne des lectures datées des blocs (E03-S08 : nouveautés
 * sans conversation antérieure, usage des procédures utiles, documents récents).
 */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

/** La ligne finale, dans sa réserve : au-delà, les derniers noms sont comptés (« and 3 more »). */
function budgetNotice(omitted: string[], prefix: string): string {
  const notice = (list: string) =>
    `\n\n${SERVED_BUDGET.start}${list}${SERVED_BUDGET.end}${prefix}_find or ${prefix}_read for more.]`
  let text = notice(omitted.join(", "))
  for (let kept = omitted.length - 1; text.length > NOTICE_RESERVE && kept > 0; kept -= 1) {
    text = notice(`${omitted.slice(0, kept).join(", ")}${SERVED_BUDGET.moreStart}${omitted.length - kept}${SERVED_BUDGET.moreEnd}`)
  }
  return text
}

/**
 * Le rapport d'un texte reculé à `kept` caractères (une ligne finale plus longue que sa réserve) :
 * chaque bloc inclus garde la part qui en reste, les blocs étant séparés par une ligne vide.
 */
function recededReport(report: BlockReport[], kept: number): BlockReport[] {
  let start = 0
  return report.map((entry) => {
    if (entry.chars === 0) return entry
    const chars = Math.max(0, Math.min(entry.chars, kept - start))
    start += entry.chars + 2
    if (chars === entry.chars) return entry
    return { ...entry, chars, status: chars === 0 ? "omitted" : "cut", head: Math.min(entry.head ?? 0, chars) }
  })
}

/**
 * Assemble les blocs dans l'ordre tant qu'ils tiennent, séparés par une ligne vide. Le premier
 * qui dépasse est coupé à la dernière ligne qui tient, les suivants sont omis, et une dernière
 * ligne les nomme (« <nom> (cut) » pour le bloc coupé). Un bloc à `fallback` n'est jamais coupé :
 * s'il dépasse, son `fallback` le remplace s'il tient, et l'assemblage continue ; sinon il est omis
 * avec les suivants. Le texte fait au plus `budget`. Le rapport dit, pour chaque bloc non vide, sa
 * taille incluse et ce qu'il est devenu (E03-S08, AC8) : l'aperçu d'E05-S04 le montre.
 */
export function renderContext(blocks: ContextBlock[], budget: number, prefix: string): { text: string; report: BlockReport[] } {
  const room = budget - NOTICE_RESERVE
  let text = ""
  const omitted: string[] = []
  const report: BlockReport[] = []
  const record = (block: ContextBlock, chars: number, status: BlockStatus) =>
    report.push({ name: block.name, chars, status, path: block.path ?? null, head: Math.min(block.head ?? 0, chars) })

  for (const block of blocks.filter((candidate) => candidate.text.trim() !== "")) {
    if (omitted.length > 0) {
      omitted.push(block.name)
      record(block, 0, "omitted")
      continue
    }
    const separator = text ? "\n\n" : ""
    if (text.length + separator.length + block.text.length <= room) {
      text += separator + block.text
      record(block, block.text.length, block.cut ? "cut" : "full")
      continue
    }
    if (block.fallback !== undefined) {
      const fits = text.length + separator.length + block.fallback.length <= room
      if (fits) text += separator + block.fallback
      else omitted.push(block.name)
      record(block, fits ? block.fallback.length : 0, fits ? "replaced" : "omitted")
      continue
    }
    const partial = linesThatFit(block.text, room - text.length - separator.length)
    if (partial.trim()) text += separator + partial
    omitted.push(partial.trim() ? `${block.name}${SERVED_BUDGET.cut}` : block.name)
    record(block, partial.trim() ? partial.length : 0, partial.trim() ? "cut" : "omitted")
  }

  if (omitted.length === 0) return { text, report }
  const notice = budgetNotice(omitted, prefix)
  // Un seul nom plus long que la réserve la dépasserait encore : le texte recule d'autant.
  const kept = linesThatFit(text, budget - notice.length)
  return { text: kept + notice, report: kept.length < text.length ? recededReport(report, kept.length) : report }
}
