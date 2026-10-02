// @vitest-environment node
// Le formateur unique des résultats (E03-S01, AC20, H26) : même texte dans les deux canaux, données
// en champs, `next_actions` sans fonction sensible, plafond de 45 000 caractères sur la sérialisation.
import { afterEach, describe, expect, it, vi } from "vitest"
import { formatError, formatResult, MAX_DATA_CHARS, MAX_RESULT_CHARS } from "../../packages/plateforme/mcp/result"

const notSensitive = () => false
const DEFAULT_NOTICE = "\n\n[Result cut at 45,000 characters. Ask for a smaller part: one section, a filter or the next page.]"

/** Un texte de `lines` lignes de `width` caractères. */
function longText(lines: number, width: number): string {
  return Array.from({ length: lines }, (_, i) => `${String(i).padStart(5, "0")} ${"x".repeat(width - 6)}`).join("\n")
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("formatResult (AC20)", () => {
  it("should serve the same text in content and structuredContent, data in fields", () => {
    const result = formatResult({ text: "ctx: AAAA-BBBB", data: { ctx: "AAAA-BBBB" }, nextActions: [] }, notSensitive)
    expect(result.content).toEqual([{ type: "text", text: "ctx: AAAA-BBBB" }])
    expect(result.structuredContent).toEqual({ ctx: "AAAA-BBBB", text: "ctx: AAAA-BBBB", next_actions: [] })
    expect(result.structuredContent?.text).toBe(result.content[0].text)
    expect(result.isError).toBeUndefined()
  })

  it("should default next_actions to an empty list", () => {
    expect(formatResult({ text: "ok" }, notSensitive).structuredContent).toEqual({ text: "ok", next_actions: [] })
  })

  it("should never propose a sensitive function in next_actions", () => {
    const sensitive = (name: string) => name === "mail.send_draft"
    const result = formatResult({ text: "ok", nextActions: ["mail.create_draft", "mail.send_draft", "table.rows"] }, sensitive)
    expect(result.structuredContent?.next_actions).toEqual(["mail.create_draft", "table.rows"])
  })

  it("should let text and next_actions win over data fields of the same name", () => {
    const result = formatResult({ text: "real", data: { text: "fake", next_actions: ["x"] } }, notSensitive)
    expect(result.structuredContent).toEqual({ text: "real", next_actions: [] })
  })

  it("should cut a text over 45,000 serialized characters at a line end, with the default continuation", () => {
    const text = longText(1000, 60)
    const result = formatResult({ text, data: { rows: 3 } }, notSensitive)
    const served = result.content[0].text
    expect(served.endsWith(DEFAULT_NOTICE)).toBe(true)
    const kept = served.slice(0, -DEFAULT_NOTICE.length)
    expect(text.startsWith(`${kept}\n`)).toBe(true)
    expect(result.structuredContent).toMatchObject({ rows: 3, text: served, next_actions: [], truncated: true })
    expect(JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(MAX_RESULT_CHARS)
    expect(JSON.stringify(result.structuredContent).length).toBeGreaterThan(MAX_RESULT_CHARS - 100)
  })

  it("should name the continuation given by the service", () => {
    const result = formatResult({ text: longText(1000, 60), continuation: "Call acme_read with cursor c2 for the rest." }, notSensitive)
    expect(result.content[0].text.endsWith("\n\n[Result cut at 45,000 characters. Call acme_read with cursor c2 for the rest.]")).toBe(true)
  })

  it("should count JSON escaping in the cap", () => {
    const text = Array.from({ length: 2000 }, () => `"quoted" \\ ${"é".repeat(10)}`).join("\n")
    const result = formatResult({ text }, notSensitive)
    expect(result.structuredContent?.truncated).toBe(true)
    expect(JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(MAX_RESULT_CHARS)
  })

  it("should cut a single line longer than the cap at the character", () => {
    const result = formatResult({ text: "y".repeat(60_000) }, notSensitive)
    expect(result.content[0].text.startsWith("yyy")).toBe(true)
    expect(JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(MAX_RESULT_CHARS)
  })

  it("should replace data over 20,000 serialized characters with data_omitted", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const data = { rows: "z".repeat(MAX_DATA_CHARS) }
    const result = formatResult({ text: "big", data }, notSensitive)
    expect(result.structuredContent).toEqual({ data_omitted: true, text: "big", next_actions: [] })
    expect(log).toHaveBeenCalledOnce()
  })

  // Story widgets-dans-la-conversation : la vue vit avec les données qu'elle rend.
  it("should serve the widget's view beside the data, and drop it with data over 20,000 characters", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const view = { kind: "table" as const, theme: "lagune" as const }
    expect(formatResult({ text: "rows", data: { rows: [] } }, notSensitive, view).structuredContent).toEqual({ rows: [], view, text: "rows", next_actions: [] })
    expect(formatResult({ text: "big", data: { rows: "z".repeat(MAX_DATA_CHARS) } }, notSensitive, view).structuredContent).toEqual({ data_omitted: true, text: "big", next_actions: [] })
  })
})

describe("formatError (AC20)", () => {
  it("should render an error as text only, without structuredContent", () => {
    expect(formatError("Missing or unknown ctx.")).toEqual({
      isError: true,
      content: [{ type: "text", text: "Missing or unknown ctx." }],
    })
  })

  // Revue du cycle 1 : un refus aussi tient sous le plafond (mcp-patterns.md § 4, mesure 3).
  it("should cap an error message at 45,000 serialized characters, saying it was cut", () => {
    const message = `Invalid arguments for acme_write: ${"ops.1.op: \"bad\"; ".repeat(5000)}`
    const served = formatError(message).content[0].text
    expect(served.endsWith("\n\n[Message cut at 45,000 characters.]")).toBe(true)
    expect(message.startsWith(served.slice(0, -"\n\n[Message cut at 45,000 characters.]".length))).toBe(true)
    expect(JSON.stringify(served).length - 2).toBeLessThanOrEqual(MAX_RESULT_CHARS)
    expect(JSON.stringify(served).length - 2).toBeGreaterThan(MAX_RESULT_CHARS - 100)
  })
})
