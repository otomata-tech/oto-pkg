// Règles d'une ligne partagées par l'écriture, la file et le contrôle des procédures (E07-S02 ; N19,
// H98, P10) : la clé qui désigne une ligne (`rowKey`) et l'état qu'une écriture ou une libération peut
// poser (`stateRule`). Sans lui, `table.write`, `table.release` et leurs `checkArgs` diraient chacun à
// leur façon quelle clé désigne une ligne et quel état se pose par où.
//
// Repris d'Oto (`datastore/cle_metier.py` l. 29-90) : une clé vide ne désigne aucune ligne. Retiré :
// la clé fournie à l'appel (`key=`), la clé devinée d'une autre colonne.
import { blockKeySchema, type TableHeader } from "../../schemas"
import { ROW_KEY_MAX } from "../../schemas/tables"
import { charCount, formatCount } from "../nodes/document"
import { keyColumn } from "./header"
import { shown, valueProblem } from "./meta"

export const EMPTY_KEY = "key: an empty key designates no row; nothing written."
const CONTROL_KEY = "key: control characters are not allowed in a key."

/** L'écriture décimale d'un nombre (N19) : celle que `keyValue` relit en nombre (E07-S01). */
const DECIMAL = /^-?\d+(\.\d+)?$/

/** Un séparateur d'espace (U+0020, U+00A0, U+2000…) : jamais un caractère de contrôle. */
const SPACE = /\p{Zs}/u

/** Les espaces de bord retirés, par boucle : chaque caractère lu une fois (`security-patterns.md § Validation des inputs`). */
function trimSpaces(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && SPACE.test(text[start])) start++
  while (end > start && SPACE.test(text[end - 1])) end--
  return text.slice(start, end)
}

/** La clé d'une colonne `number` (N19) : un nombre fini, ou son écriture décimale, rangé en texte canonique. */
function numberKey(raw: string | number): { key: string } | { problem: string } {
  const number = typeof raw === "number" ? raw : DECIMAL.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isFinite(number)) return { problem: `key: expected a number, e.g. 12000 (not ${shown(raw)}).` }
  const key = String(number)
  return DECIMAL.test(key) ? { key } : { problem: `key: expected a number written with digits, e.g. 12000 (not ${key}).` }
}

/**
 * La clé qui désigne une ligne (AC7, N19) : espaces de bord retirés avant tout ; vide ou porteuse d'un
 * caractère de contrôle, refusée ; pour une colonne clé `number`, un nombre fini ou son écriture
 * décimale, rangé en texte canonique (`12000`, `"12000"` et `"12000.0"` désignent la même ligne) ;
 * puis 200 caractères au plus, `valueProblem` de la colonne clé et `blockKeySchema` (E01-S06).
 */
export function rowKey(header: TableHeader, raw: string | number): { key: string } | { problem: string } {
  const text = typeof raw === "string" ? trimSpaces(raw) : raw
  if (text === "") return { problem: EMPTY_KEY }
  if (typeof text === "string" && /\p{Cc}/u.test(text)) return { problem: CONTROL_KEY }
  const column = keyColumn(header)
  const typed = column.type === "number" ? numberKey(text) : { key: text }
  if ("problem" in typed) return typed
  if (typeof typed.key !== "string") return { problem: `key: ${valueProblem(column, typed.key) ?? "expected a text"}.` }
  const length = charCount(typed.key)
  if (length > ROW_KEY_MAX) return { problem: `key: a key holds ${ROW_KEY_MAX} characters at most (not ${formatCount(length)} characters).` }
  const problem = column.type === "number" ? null : valueProblem(column, typed.key)
  if (problem !== null) return { problem: `key: ${problem}.` }
  const checked = blockKeySchema.safeParse(typed.key)
  return checked.success ? { key: checked.data } : { problem: `key: ${checked.error.issues[0]?.message ?? "invalid key."}` }
}

/** Pourquoi un état ne se pose pas par une écriture ou une libération (H98, P10). */
export type StateRefusal = "unknown" | "working" | "decision"

/**
 * Ce qu'un état permet (H98, P10, N9) : `null` quand une écriture ou une libération peut le poser ;
 * `unknown` hors des états du cycle ; `working`, l'état de travail, que seule une réservation pose ;
 * `decision`, un état de décision d'une revue, que seule une personne pose (E07-S03), sauf dans un
 * tableau dont la revue laisse l'assistant décider (`agents_may_decide`, E11-S01, AC-e2). Sans cycle, aucun
 * état n'est réservé.
 */
export function stateRule(header: TableHeader, state: string): StateRefusal | null {
  const { lifecycle } = header
  if (!lifecycle) return null
  if (!lifecycle.states.includes(state)) return "unknown"
  if (state === lifecycle.working) return "working"
  const { review } = lifecycle
  return review && !review.agents_may_decide && (state === review.approve || state === review.reject) ? "decision" : null
}

/** Les états qu'une libération pose (AC24) : ceux du cycle, hors état de travail et décisions de la revue. */
export function releaseStates(header: TableHeader): string[] {
  return (header.lifecycle?.states ?? []).filter((state) => stateRule(header, state) === null)
}

/** « « qualifié » and « écarté » » : les deux décisions d'une revue, pour les refus (AC17, AC24). */
export function decisionNames(header: TableHeader): string {
  const review = header.lifecycle?.review
  return review ? `« ${review.approve} » and « ${review.reject} »` : ""
}
