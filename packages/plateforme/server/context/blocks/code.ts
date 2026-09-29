// Bloc 1 de `context` : le code `ctx` et la consigne de le repasser (H27), puis ce que le routage a
// trouvé pour la phrase (E03-S02) : la procédure servie et les autres candidats, ou les candidats avec
// une consigne qui dépend de la demande (H37). Repris de la maquette
// (`mcp-test/src/proto/services/context.ts` l. 67-89) : lignes servies, candidats toujours visibles,
// refus de deviner ; retiré : la consigne unique « Ask the user which procedure they mean » (H37).
// E05-S12 (retour 2, AC-9, AC-10) : les règles de l'espace, entre la consigne du code et la ligne du routage.
// Repris d'Oto (`oto_mcp/capabilities/orgs/instructions.py`) : l'idée d'un texte de règles servi à l'agent ;
// retiré : un guide à lire d'abord, modifiable par organisation (architecture § 10) — ici une section fixe.
import { SERVED_RULES } from "../../../schemas"
import { clip, MAX_TARGET_CHARS } from "../../journal"
import { formatScore, type Candidate, type RequestKind } from "../../routing"
import type { ContextBlock } from "../engine"

/**
 * « Règles Oto » (E05-S12, AC-9, AC-10, HN-E05S12-7, -8) : le texte de la story, mot pour mot, que JB peut
 * encore corriger ici seulement ; `<p>` devient le préfixe de l'organisation, rien d'autre ne varie. Sans
 * lui, l'assistant ne lit nulle part comment l'espace fonctionne (la notice n'est plus servie, § 10). E05-S13
 * (AC-16) : l'en-tête vient de `SERVED_RULES`, que l'écran relit ; exporté pour le test qui compte ses règles contre
 * leur traduction à l'écran.
 */
export const WORKSPACE_RULES = `${SERVED_RULES.title}
- Six tools: <p>_context (first, once per conversation), <p>_find, <p>_read, <p>_call, <p>_write, <p>_feedback. Every tool but <p>_context needs the ctx above.
- Usual order: context, then find to locate, read to learn (a content, or the contract of a function), call or write to act, feedback when a tool, a procedure or an instruction was unclear, missing or wrong.
- Every content has a path (e.g. <team>/<page>) and a kind: page (text in blocks), table (rows, through <p>_call table.rows, table.aggregate and table.write), procedure (steps to follow, each call in a call block) or context (the sections below: already served, read one only when it says it was cut).
- Spaces: the organisation's contents sit at the root, a team's under its folder (<team>/...), yours under private/<handle>/, served to you only.
- Access is set per content, for the organisation, a team or a person: read, write or manage. A refusal says who to ask: never work around it.
- <p>_write saves a draft; publish: true makes it live. To edit, pass base_revision = the revision you read.
- A renamed or moved content keeps its old path: it still leads there.
- In a text, [[path]] or [[path|title]] links to another content.
- A function that sends, deletes or pays first returns a summary and does nothing: show it, get the user's explicit yes, then call again with confirm: true.
- When a request matches a procedure, its steps come right after this part: follow them in order. Otherwise search, and ask the user rather than guess.
- <p>_read with path journal shows what was done, call by call: trust it over memory.
- Never invent a path, a figure or a result: read it, or say you could not.`

/** La section des règles pour l'organisation de préfixe `prefix`. */
export function workspaceRules(prefix: string): string {
  return WORKSPACE_RULES.replaceAll("<p>", prefix)
}

type CodeBlockInput = {
  prefix: string
  code: string
  phrase?: string
  /** Candidats montrés, triés ; `null` : le routage n'a pas abouti (AC18, N30). */
  candidates: readonly Candidate[] | null
  served: Candidate | null
  /** `requestKind(phrase)` ; `null` sans phrase. */
  kind: RequestKind | null
}

function candidateList(candidates: readonly Candidate[]): string {
  return candidates.map((candidate) => `${candidate.path} (${formatScore(candidate.score)})`).join(", ")
}

/**
 * Sans étapes servies, la consigne qui suit les candidats, selon le genre de la demande (E11-S04, AC-b3,
 * HN-E11S04-6) : une action fait choisir ; une question, une demande « comment » ou polie ne suit aucune
 * procédure d'elle-même et propose en choix tous les candidats montrés, jamais le premier seul.
 */
function unmatchedInstruction(prefix: string, kind: RequestKind | null): string {
  const offer = "offer the user all the candidates above as choices"
  if (kind === "how") return `It asks how to do something: ${offer}, read the one they pick with ${prefix}_read and explain its steps; run nothing unless the user asks.`
  if (kind === "request") return `It asks for an action: ${offer}, and run only the one they pick, after their yes.`
  if (kind === "data") {
    return `It is a question: answer it without changing data, searching with ${prefix}_find, ${prefix}_read or ${prefix}_call table.rows; then ${offer}, and run one only if they pick it.`
  }
  return "Ask the user which one to run; do not guess."
}

/** La ligne du routage (AC7, AC8, AC18) : servie, candidats et consigne, rien, ou routage en panne. */
function routingLine({ prefix, phrase, candidates, served, kind }: CodeBlockInput & { phrase: string }): string {
  // Phrase reprise, bornée comme la cible du journal (N4).
  const request = `Request « ${clip(phrase, MAX_TARGET_CHARS)} »`
  const search = `${prefix}_find can search pages, tables and functions.`
  if (candidates === null) return `${request}: no procedure could be matched right now. ${search}`
  if (served) {
    const others = candidates.filter((candidate) => candidate.path !== served.path)
    const tail = others.length > 0 ? ` Other candidates: ${candidateList(others)}.` : ""
    const how = kind === "how" ? " It asks how: explain these steps, and run them only if the user asks." : ""
    return `${request} matches ${served.path} (score ${formatScore(served.score)}): its steps follow.${tail}${how}`
  }
  if (candidates.length > 0) return `${request}: no clear match. Candidates: ${candidateList(candidates)}. ${unmatchedInstruction(prefix, kind)}`
  const question = `It is a question: search with ${prefix}_find, ${prefix}_read or ${prefix}_call table.rows and answer it`
  return kind === "data" ? `${request}: no procedure matches. ${question}.` : `${request}: no procedure matches. Say so instead of guessing; ${search}`
}

export function codeBlock(input: CodeBlockInput): ContextBlock {
  const { prefix, code, phrase } = input
  const lines = [
    `ctx: ${code}`,
    `Pass this ctx to every ${prefix}_ tool. If a tool answers "context has changed", call ${prefix}_context again with the same request, then retry that call.`,
    workspaceRules(prefix),
    "## This request",
    phrase
      ? routingLine({ ...input, phrase })
      : `No request given: call ${prefix}_context again with the user's request as phrase to get the matching procedure.`,
  ]
  return { name: "code", text: lines.join("\n") }
}
