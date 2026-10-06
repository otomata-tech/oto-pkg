// Connecteur témoin `notion` (`connecteurs-et-comptes.md`, prise des connecteurs) : une fonction, écrite à la main au
// contrat `defineFunction`, fidèle à sa description du dépôt `connectors` (`connectors/notion/connector.yaml` :
// `api_version`, `base_url`, `auth: bearer`, `timeout_s`, table `errors`, fonction `search_workspace`). Sans elle,
// rien ne prouve qu'un connecteur réel court dans le paquet, son secret déchiffré à l'appel. La fabrique de ce dépôt
// générera ce même contrat et la remplacera : la forme reste celle de la description.
import * as z from "zod/v4"
import { defineFunction } from "../../catalog/define"
import { isJsonObject } from "../../json"
import { PlatformError } from "../../errors"
import { requestJson, type ConnectorApi } from "../http"

/** L'API de Notion, telle que la description la donne ; chaque requête porte `Notion-Version`. */
export const NOTION_API: ConnectorApi = {
  label: "Notion",
  baseUrl: "https://api.notion.com/v1",
  timeoutMs: 60_000,
  headers: { "Notion-Version": "2025-09-03" },
  errors: [
    { status: 400, code: "invalid_arguments", message: "Notion rejected the request as invalid: check the arguments." },
    { status: 401, code: "upstream_error", message: "Notion rejected the integration token: check that it is valid." },
    { status: 403, code: "upstream_error", message: "The integration lacks the capability for this action on this resource." },
    { status: 404, code: "not_found", message: "Notion object not found, or not shared with the integration." },
    { status: 409, code: "conflict", message: "Notion saw a conflicting edit: retry." },
    { status: 429, code: "rate_limited", message: "Notion request rate exceeded: retry later." },
    { status: [500, 502, 503, 504], code: "upstream_error", message: "Notion is temporarily unavailable: retry later." },
  ],
}

/** Une ligne de résultat : ce qu'il faut pour citer et rouvrir une page ou une base, jamais ses propriétés entières. */
type SearchHit = { object: string; id: string; title: string; url: string | null }

const text = (value: unknown): string | null => (typeof value === "string" ? value : null)

/** Le texte d'un tableau de texte riche de Notion (`[{ plain_text }]`). */
function plainText(value: unknown): string {
  return Array.isArray(value) ? value.map((part) => (isJsonObject(part) ? (text(part.plain_text) ?? "") : "")).join("") : ""
}

/** Titre d'une page (sa propriété de type `title`) ou d'une base (`title`). */
function titleOf(result: Record<string, unknown>): string {
  if (Array.isArray(result.title)) return plainText(result.title)
  const properties = isJsonObject(result.properties) ? Object.values(result.properties) : []
  const title = properties.find((property) => isJsonObject(property) && property.type === "title")
  return isJsonObject(title) ? plainText(title.title) : ""
}

function hitOf(result: unknown): SearchHit | null {
  if (!isJsonObject(result) || typeof result.id !== "string") return null
  return { object: text(result.object) ?? "unknown", id: result.id, title: titleOf(result), url: text(result.url) }
}

export const notionSearchWorkspace = defineFunction({
  name: "notion.search_workspace",
  connector: "notion",
  class: "read",
  origin: "connecteur",
  description:
    "Search the pages and databases shared with the integration, one page of results at a time (at most 100). The integration sees only what was shared with it in Notion: an empty result with an empty query and no filter means nothing is shared, not that the workspace is empty. Databases come back as data_source objects. Pass next_cursor as start_cursor to read the next page.",
  schema: z.strictObject({
    query: z.string().max(1000).optional().describe("Text to match; empty lists everything the integration can see."),
    filter: z
      .strictObject({ value: z.enum(["page", "data_source"]), property: z.literal("object") })
      .optional()
      .describe("Restrict to pages or to databases (data_source)."),
    sort: z
      .strictObject({ direction: z.enum(["ascending", "descending"]), timestamp: z.literal("last_edited_time") })
      .optional()
      .describe("Sort by last edit; omit for relevance."),
    start_cursor: z.string().max(500).optional().describe("next_cursor of the previous page."),
  }),
  examples: [
    { query: "roadmap", filter: { value: "page", property: "object" }, sort: { direction: "descending", timestamp: "last_edited_time" } },
    { query: "" },
  ],
  refusals: [
    "Invalid arguments: an unknown key, or a filter or sort value that is not listed, named in the refusal.",
    "No notion account you can use, a simulated one, or one without its secret: the refusal says whom to ask.",
    "Notion rejected the integration token or lacks a capability (upstream_error): ask whoever manages the account.",
    "Notion request rate exceeded (rate_limited) or Notion unavailable (upstream_error): retry later.",
  ],
  run: async (context, args) => {
    const answer = await requestJson(NOTION_API, context.credential, {
      method: "POST",
      path: "/search",
      body: { query: args.query, filter: args.filter, sort: args.sort, start_cursor: args.start_cursor },
    })
    if (!isJsonObject(answer) || !Array.isArray(answer.results)) {
      console.error("[platform] notion.search_workspace: answer without results")
      throw new PlatformError("upstream_error", "Notion sent an unexpected answer. Retry later.")
    }
    const hits = answer.results.map(hitOf).filter((hit) => hit !== null)
    const cursor = answer.has_more === true ? text(answer.next_cursor) : null
    const lines = hits.map((hit) => `- ${hit.object} « ${hit.title || "Untitled"} » · id ${hit.id}${hit.url ? ` · ${hit.url}` : ""}`)
    const head =
      hits.length === 0
        ? "Nothing found among the pages and databases shared with the integration."
        : `${hits.length} result${hits.length === 1 ? "" : "s"} shared with the integration:`
    const more = cursor ? [`More results: call again with start_cursor: "${cursor}".`] : []
    return {
      text: [head, ...lines, ...more].join("\n"),
      data: { results: hits, next_cursor: cursor, has_more: cursor !== null },
    }
  },
})
