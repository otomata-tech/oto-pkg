// Le seul formateur des résultats d'outils (H26, ADR-002 § 4). Même texte dans les deux canaux :
// Claude Code ne montre au modèle que `structuredContent`, claude.ai et ChatGPT le texte
// (mcp-patterns.md § 4) ; les données vont en plus en champs (F7) ; tout résultat tient en
// 45 000 caractères, ce que Claude Code transmet entier (mesure 3).
//
// Repris de la maquette (`mcp-test/src/proto/result.ts` l. 6-23) : la frontière entre refus
// actionnable (texte lu par le modèle) et panne (cachée). Retiré : `structuredContent: { text }` seul.
import { MAX_DATA_CHARS, MAX_RESULT_CHARS, serializedLength, type ToolOutput } from "../server/tool-output"

// Définis dans `server/tool-output.ts`, que `read` lit pour paginer : server/ n'importe pas mcp/
// (architecture § 3, E03-S03 N36). Réexportés, valeurs inchangées.
export { MAX_DATA_CHARS, MAX_RESULT_CHARS }

const DEFAULT_CONTINUATION = "Ask for a smaller part: one section, a filter or the next page."
const ERROR_CUT_NOTICE = "\n\n[Message cut at 45,000 characters.]"

type TextContent = { type: "text"; text: string }

export type ToolResult = {
  content: TextContent[]
  structuredContent?: Record<string, unknown>
  isError?: true
}

/**
 * Le début de `text` dont la sérialisation tient en `budget` caractères, coupé à la dernière fin
 * de ligne qui tient ; une première ligne trop longue à elle seule est coupée au caractère (N17).
 */
function cutText(text: string, budget: number): string {
  const lines = text.split("\n")
  let used = 0
  let kept = 0
  for (const line of lines) {
    const cost = serializedLength(line) + (kept > 0 ? 2 : 0) // `\n` sérialisé : deux caractères
    if (used + cost > budget) break
    used += cost
    kept += 1
  }
  if (kept > 0) return lines.slice(0, kept).join("\n")
  let head = ""
  for (const char of lines[0]) {
    // Par point de code : une paire de substitution n'est jamais coupée en deux.
    const cost = serializedLength(char)
    if (used + cost > budget) break
    used += cost
    head += char
  }
  return head
}

function dataFields(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {}
  const size = JSON.stringify(data).length
  if (size <= MAX_DATA_CHARS) return data
  console.error(`[platform] mcp: result data omitted (${size} characters, max ${MAX_DATA_CHARS})`)
  return { data_omitted: true }
}

/**
 * `content` = `[{ type: "text", text }]` et `structuredContent` = `{ ...data, text, next_actions }`,
 * le même texte dans les deux. `next_actions` ne propose jamais une fonction sensible. Au-delà de
 * 45 000 caractères sérialisés, le texte est coupé à la ligne et dit comment lire la suite.
 */
export function formatResult(output: ToolOutput, isSensitive: (name: string) => boolean): ToolResult {
  const data = dataFields(output.data)
  const nextActions = (output.nextActions ?? []).filter((name) => !isSensitive(name))
  const whole = { ...data, text: output.text, next_actions: nextActions }
  if (JSON.stringify(whole).length <= MAX_RESULT_CHARS) {
    return { content: [{ type: "text", text: output.text }], structuredContent: whole }
  }
  const notice = `\n\n[Result cut at 45,000 characters. ${output.continuation ?? DEFAULT_CONTINUATION}]`
  const frame = JSON.stringify({ ...data, text: notice, next_actions: nextActions, truncated: true }).length
  const text = cutText(output.text, MAX_RESULT_CHARS - frame) + notice
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...data, text, next_actions: nextActions, truncated: true },
  }
}

/**
 * Refus ou panne : texte seul, sans `structuredContent`, sous le même plafond qu'un résultat
 * (mcp-patterns.md § 4) : un refus plus long n'atteindrait pas le modèle sur Claude Code.
 */
export function formatError(message: string): ToolResult {
  const text =
    serializedLength(message) <= MAX_RESULT_CHARS
      ? message
      : cutText(message, MAX_RESULT_CHARS - serializedLength(ERROR_CUT_NOTICE)) + ERROR_CUT_NOTICE
  return { isError: true, content: [{ type: "text", text }] }
}
