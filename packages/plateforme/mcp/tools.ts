// Les six outils, calculés par organisation à chaque requête (ADR-002, H22 à H25) : le préfixe
// (`acme_`) et le nom affiché de l'organisation entrent dans les noms, titres et descriptions ; le
// reste est figé. Surface figée dès qu'un host a lu la liste : une description ne change que pour
// s'allonger d'un domaine (ADR-002 § 1).
//
// Repris de la maquette (`mcp-test/src/proto/mcp/tools.ts` l. 20-82) : `prerequisite`, titres,
// `toolKey`, instructions en une phrase, noms calculés par organisation. Retiré :
// `readOnlyHint: false` sur `context` et `destructiveHint: true` sur `call` (H23), « ask the user
// which one they mean » (H37), exemples `sellsy` fixes (H25).
import { UPLOAD_RULE } from "../schemas/uploads"
import { workDomains } from "../server/context/blocks/org"
import { cut } from "../server/journal"
import { inputSchemas, toInputSchema } from "./schemas"

export const TOOL_KEYS = ["context", "find", "read", "call", "write", "feedback"] as const
export type ToolKey = (typeof TOOL_KEYS)[number]

export type ToolOrg = { prefix: string; name: string; domains: string | null }

type Annotations = { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean }

export type ToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: Annotations
  _meta: { securitySchemes: { type: "oauth2" }[] }
}

/** Bornes du nom et des domaines dans les descriptions, pour tenir sous 1 000 caractères (N14). */
const MAX_NAME_CHARS = 60
const MAX_DOMAINS_CHARS = 100

/** À la dernière « , » qui tient, sinon coupé net (AC7). */
function cutDomains(domains: string): string {
  if (domains.length <= MAX_DOMAINS_CHARS) return domains
  const end = domains.lastIndexOf(", ", MAX_DOMAINS_CHARS)
  return end > 0 ? domains.slice(0, end) : cut(domains, MAX_DOMAINS_CHARS)
}

/** Nom et domaines tels que les servent titres, descriptions et instructions (AC7). */
export function displayOrg(org: ToolOrg): { name: string; domains: string | null } {
  const domains = workDomains(org)
  return { name: cut(org.name, MAX_NAME_CHARS), domains: domains ? cutDomains(domains) : null }
}

/** Première phrase des cinq outils autres que `context` : le prérequis, en consigne impérative. */
export function prerequisite(prefix: string): string {
  return `Requires the ctx code from ${prefix}_context; call it first.`
}

/** Une phrase, qui porte aussi la borne (N7) : claude.ai ne montre jamais les instructions. */
export function serverInstructions(org: ToolOrg): string {
  const { name } = displayOrg(org)
  const p = org.prefix
  return `${name} workspace: for any request about ${name}'s work, call ${p}_context first, with the user's request as phrase, because every other ${p}_ tool requires the ctx code it returns.`
}

function contextDescription(org: ToolOrg): string {
  const { name, domains } = displayOrg(org)
  const p = org.prefix
  const scope = domains ? `Loads your work context at ${name} (${domains})` : `Loads your work context at ${name}`
  return `${scope} and routes the user's request to the right procedure; call it first in every conversation, before any other ${p}_ tool. Pass phrase = the user's request, verbatim. Returns the ctx code that every other ${p}_ tool requires, the steps of the matching procedure when the match is clear, who you work for, the rules of ${name}, what's new, and the useful procedures and documents. When it returns candidates instead of steps, follow the instruction that comes with them. If a tool later answers "context has changed", call ${p}_context again with the same request, then retry that call. Call it only when the request concerns ${name}'s work. Otherwise do not call it.`
}

function descriptions(org: ToolOrg, callExamples: string[]): Record<ToolKey, string> {
  const { name } = displayOrg(org)
  const p = org.prefix
  const req = prerequisite(p)
  const catalog = callExamples.length ? `${name}'s catalog (e.g. ${callExamples.join(", ")})` : `${name}'s catalog`
  return {
    context: contextDescription(org),
    find: `${req} Searches the procedures, pages, tables and functions of ${name} by their words and returns up to three nodes and three functions, each with a score. Use this when ${p}_context matched no procedure, or to locate a page, a table or a function. Do not use to read content (use ${p}_read) or to run a function (use ${p}_call).`,
    read: `${req} Reads a page, a procedure or a table by its path (e.g. ventes/relance_devis), your journal (path journal), or the contract of a function (e.g. table.rows). A long page comes as an outline: then read one section by its title. since_revision returns only what changed; a result cut at 45,000 characters says how to read the rest. Do not use to run a function (use ${p}_call). To read an attached html, md, txt or csv file, give file = the id from its link /api/plateforme/files/<id>.`,
    call: `${req} Runs a function of ${catalog} with arguments checked against its contract; read the contract with ${p}_read, path = the function name, if unsure. A sensitive function (sending, deleting, paying) first returns a summary and does nothing: show it to the user, get their explicit approval, then call again with confirm: true. Never set confirm without that approval. Pass team or account only when a result asks for it or the user names one. Use upload.link ${UPLOAD_RULE}.`,
    write: `${req} Creates or edits a page, a procedure or a table by operations on sections addressed by their title, published at once (publish: false keeps an unpublished draft). Creating needs title and summary; editing needs base_revision = the revision you read (a stale one is refused with the current state). ops items: {op: replace_section | append | add_section | delete_section | replace_text, section: "<title>", text, find (replace_text only), after (add_section only)}. A procedure writes each call in a call block and a table takes a header: read their contracts with ${p}_read, path write.procedure or write.table. Send a long text in parts of about 20,000 characters with append. To change one block, read with refs: true, then use ops {op: replace_block | insert_after | delete_block | move_block, block: "<ref>", text, after_block or section (move_block: after that block, or at the end of that section)}.`,
    feedback: `${req} Reports a friction, a missing capability or a tool error to the ${name} platform team and returns a ticket number. Use this when a tool, a procedure or an instruction was unclear, missing or wrong; set target to the tool, function or path involved. Do not use to send a message to anyone.`,
  }
}

const TITLES: Record<ToolKey, string> = {
  context: "Load work context",
  find: "Find",
  read: "Read",
  call: "Run a function",
  write: "Write a page",
  feedback: "Report a problem",
}

// Honnêtes (H23) : claude.ai range un outil sans `readOnlyHint: true` parmi les outils d'écriture
// et demande « Toujours autoriser » à son premier appel. `call` atteint des API tierces en V2.
const ANNOTATIONS: Record<ToolKey, Annotations> = {
  context: { readOnlyHint: true, openWorldHint: false },
  find: { readOnlyHint: true, openWorldHint: false },
  read: { readOnlyHint: true, openWorldHint: false },
  call: { readOnlyHint: false, openWorldHint: true },
  write: { readOnlyHint: false, openWorldHint: false },
  feedback: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}

export function buildTools(org: ToolOrg, callExamples: string[]): ToolDefinition[] {
  const schemas = inputSchemas(org.prefix)
  const text = descriptions(org, callExamples)
  const { name } = displayOrg(org)
  return TOOL_KEYS.map((key) => ({
    name: toolName(org.prefix, key),
    title: `${name}: ${TITLES[key]}`,
    description: text[key],
    inputSchema: toInputSchema(schemas[key]),
    annotations: ANNOTATIONS[key],
    // Sans cette déclaration, ChatGPT n'affiche jamais « Se connecter » (mcp-patterns.md § 3).
    _meta: { securitySchemes: [{ type: "oauth2" }] },
  }))
}

function toolName(prefix: string, key: ToolKey): string {
  return `${prefix}_${key}`
}

/** `acme_find` → `find` ; tout autre nom, dont ceux d'un autre préfixe → `null`. */
export function toolKey(prefix: string, name: string): ToolKey | null {
  return TOOL_KEYS.find((key) => name === toolName(prefix, key)) ?? null
}
