// @vitest-environment node
// Les messages de Zod chez un hôte : `zod` se déclare sans effet de bord, et l'empaqueteur d'un hôte en production
// retire l'instruction qui installe ses messages anglais ; tout refus de saisie disait alors « Invalid input ».
// Ici la configuration est vidée comme le fait cet empaquetage, puis rétablie par `ensureZodMessages`.
import * as z from "zod/v4"
import { afterEach, describe, expect, it } from "vitest"
import { ensureZodMessages } from "../../../packages/plateforme/schemas/zod-messages"

const schema = z.object({ ops: z.array(z.strictObject({ op: z.enum(["append", "add_section"]) })) })
const messages = () => {
  const refused = schema.safeParse({ ops: [{ op: "zz", content: "x" }] })
  return refused.success ? [] : refused.error.issues.map((issue) => issue.message)
}

afterEach(() => {
  z.config(z.locales.en())
})

describe("ensureZodMessages", () => {
  it("should restore the messages of Zod when a host bundle left them unset", () => {
    z.config({ localeError: undefined })
    expect(messages()).toEqual(["Invalid input", "Invalid input"])
    ensureZodMessages()
    expect(messages()).toEqual(['Invalid option: expected one of "append"|"add_section"', 'Unrecognized key: "content"'])
  })
})
