// @vitest-environment node
// Témoin `notion.search_workspace` (story prise-des-connecteurs, AC18) : la requête qu'il envoie, fidèle à sa
// description (`connectors : connectors/notion/connector.yaml`), et ce qu'il rend ; `fetch` simulé, aucun réseau, un
// jeton tiré à l'exécution.
import { randomBytes } from "crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { FunctionContext } from "../../packages/plateforme/server/catalog/define"
import type { Fetch } from "../../packages/plateforme/server/connectors/http"
import { notionSearchWorkspace } from "../../packages/plateforme/server/connectors/notion/search-workspace"
import type { PlatformError } from "../../packages/plateforme/server/errors"

const page = {
  object: "page",
  id: "1f2e3d4c-5b6a-7988-1f2e-3d4c5b6a7988",
  url: "https://www.notion.so/Roadmap-1f2e3d4c5b6a79881f2e3d4c5b6a7988",
  properties: { Name: { type: "title", title: [{ plain_text: "Road" }, { plain_text: "map" }] }, Status: { type: "select" } },
}
const source = { object: "data_source", id: "2a3b4c5d-6e7f-8091-2a3b-4c5d6e7f8091", url: null, title: [{ plain_text: "Tasks" }] }

/**
 * La fonction appelée comme `runCall` l'appelle : arguments validés par son schéma, contexte réduit à ce qu'elle lit,
 * le secret du compte réel. Le type commun du catalogue efface ses arguments en `never` (`defineFunction`), et un
 * contexte complet (base, identité) ne sert pas ici : d'où les deux assertions.
 */
const search = (credential: string, args: Record<string, unknown>) =>
  notionSearchWorkspace.run({ credential } as FunctionContext, notionSearchWorkspace.schema.parse(args) as never)

function stubFetch(body: unknown, status = 200) {
  const send = vi.fn<Fetch>(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal("fetch", send)
  return send
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("notion.search_workspace", () => {
  it("should POST /search with the Notion-Version header, the bearer token and the given keys only (AC18)", async () => {
    const credential = `ntn_${randomBytes(12).toString("hex")}`
    const send = stubFetch({ object: "list", results: [], next_cursor: null, has_more: false })
    await search(credential, { query: "roadmap", filter: { value: "page", property: "object" } })
    const [url, init] = send.mock.calls[0]
    const headers = new Headers(init.headers)
    expect({ url, method: init.method, version: headers.get("notion-version"), authorization: headers.get("authorization") }).toEqual({
      url: "https://api.notion.com/v1/search",
      method: "POST",
      version: "2025-09-03",
      authorization: `Bearer ${credential}`,
    })
    expect(JSON.parse(String(init.body))).toEqual({ query: "roadmap", filter: { value: "page", property: "object" } })
  })

  it("should list each page or database by type, title, id and address, and give the next cursor (AC18)", async () => {
    stubFetch({ object: "list", results: [page, source], next_cursor: "cursor-2", has_more: true })
    const output = await search("t", {})
    expect(output.text).toBe(
      [
        "2 results shared with the integration:",
        `- page « Roadmap » · id ${page.id} · ${page.url}`,
        `- data_source « Tasks » · id ${source.id}`,
        'More results: call again with start_cursor: "cursor-2".',
      ].join("\n"),
    )
    expect(output.data).toEqual({
      results: [
        { object: "page", id: page.id, title: "Roadmap", url: page.url },
        { object: "data_source", id: source.id, title: "Tasks", url: null },
      ],
      next_cursor: "cursor-2",
      has_more: true,
    })
  })

  it("should refuse a key that the description does not declare", () => {
    expect(notionSearchWorkspace.schema.safeParse({ query: "x", page_size: 10 }).success).toBe(false)
  })

  it("should serve a 401 of Notion as upstream_error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    stubFetch({ object: "error", status: 401 }, 401)
    const error = await search("t", {}).then(
      () => null,
      (reason: PlatformError) => reason,
    )
    expect({ code: error?.code, message: error?.message }).toEqual({
      code: "upstream_error",
      message: "Notion rejected the integration token: check that it is valid.",
    })
  })
})
