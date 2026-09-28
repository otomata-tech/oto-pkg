// @vitest-environment node
// Arguments d'un appel tels que l'écran et `read journal` les montrent (E05-S05, AC8, NFR-OBS-01) :
// la fonction de masquage d'E03-S01 rejouée à la lecture, puis les coupes. La coupe de l'erreur est
// jouée par le service (`journal-read.test.ts`, AC7).
import { describe, expect, it } from "vitest"
import { displayArgs } from "../../packages/plateforme/server/journal-rows"

describe("displayArgs (AC8)", () => {
  it("should mask the secret keys at any depth with E03-S01's function, keep key, and cut a value at 300 characters", () => {
    const args = {
      client_secret: "s-1",
      nested: { accessToken: "x", password: "p", Authorization: "Bearer y" },
      api_key: "k-1",
      apiKey: "k-2",
      key: "P-001",
      note: "n".repeat(400),
    }
    expect(displayArgs(args)).toEqual({
      client_secret: "[masked]",
      nested: { accessToken: "[masked]", password: "[masked]", Authorization: "[masked]" },
      api_key: "[masked]",
      apiKey: "[masked]",
      key: "P-001",
      note: `${"n".repeat(300)}…`,
    })
  })

  it("should turn a value beyond six levels into cut text, its secret keys masked, and show the cut head of stored truncated arguments", () => {
    // Au septième niveau, une clé secrète que l'écrivain garde (N29) est masquée avant la conversion en texte.
    const seventh = { secret_key: "s-7", deeper: { password: "p-8" }, note: "x".repeat(400) }
    const deep = { a: { b: { c: { d: { e: { password: "p", f: seventh } } } } } }
    const shown = JSON.stringify({ secret_key: "[masked]", deeper: { password: "[masked]" }, note: "x".repeat(400) })
    expect(displayArgs(deep)).toEqual({ a: { b: { c: { d: { e: { password: "[masked]", f: `${shown.slice(0, 300)}…` } } } } } })

    const head = `{"text":"${"y".repeat(2000)}`
    expect(displayArgs({ _truncated: true, head })).toEqual({ _truncated: true, head: `${head.slice(0, 300)}…` })
  })
})
