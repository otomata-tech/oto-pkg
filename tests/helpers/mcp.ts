// Sessions MCP des tests (E03-S01, P2, P28) : un client relié par InMemoryTransport à l'adaptateur
// du paquet, câblé par `resolveMcpRequest` exactement comme la route `/api/mcp`. Les données sont
// celles de `tests/helpers/plateforme.ts` (organisations et personnes jetables).
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { resolveMcpRequest } from "../../packages/plateforme/mcp/handler"
import { installPlatformMcp, serverOptions, type McpDeps } from "../../packages/plateforme/mcp/server"
import { writeJournal } from "../../packages/plateforme/server/journal"

type TextBlock = { type: string; text?: string }

/** Premier bloc texte d'un résultat d'outil. */
function firstText(content: unknown): string {
  const blocks: TextBlock[] = Array.isArray(content) ? content : []
  return blocks[0]?.text ?? ""
}

/** Client MCP connecté à l'adaptateur installé sur `deps` ; `call` préfixe le nom de l'outil. */
export async function connectDeps(deps: McpDeps) {
  const { serverInfo, ...options } = serverOptions(deps.org, { widgets: deps.widgets })
  const server = new McpServer(serverInfo, options)
  installPlatformMcp(server, deps)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "vitest", version: "0.0.0" })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  const prefix = deps.org.prefix

  /** Appel d'un outil par son nom complet (`acme_find`, `delta_find`). */
  async function callNamed(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args })
    return { result, text: firstText(result.content), isError: result.isError === true }
  }

  /** Appel d'un des six outils de l'organisation par sa clé (`context`, `find`…). */
  const call = (tool: string, args: Record<string, unknown> = {}) => callNamed(`${prefix}_${tool}`, args)

  /** Appelle `context` et rend le code lu sur la première ligne. */
  async function openContext(phrase?: string) {
    const opened = await call("context", phrase === undefined ? {} : { phrase })
    const code = /^ctx: (\S+)/.exec(opened.text)?.[1]
    if (!code) throw new Error(`no ctx in: ${opened.text.slice(0, 200)}`)
    return { ...opened, code }
  }

  return {
    client,
    prefix,
    deps,
    journal: deps.journal,
    call,
    callNamed,
    openContext,
    /** Écrit les lignes empilées, comme la tâche `defer` de la route. */
    flush: () => writeJournal(deps.db, deps.journal),
  }
}

export type McpSession = Awaited<ReturnType<typeof connectDeps>>

/**
 * Session d'une personne connectée (`accessToken` de `signIn`) sur l'adresse d'une organisation,
 * résolue par `resolveMcpRequest` comme la route ; `kind` dit si elle en est membre.
 */
export async function connectMcp(
  org: { host: string },
  person: { id: string; email: string; accessToken: string },
  userAgent = "vitest",
) {
  const resolved = await resolveMcpRequest({
    accessToken: person.accessToken,
    claims: { sub: person.id, email: person.email },
    host: org.host,
    origin: `https://${org.host}`,
    userAgent,
  })
  if (resolved.kind === "unknown_org") throw new Error(`no organisation at ${org.host}`)
  return { kind: resolved.kind, ...(await connectDeps(resolved.deps)) }
}
