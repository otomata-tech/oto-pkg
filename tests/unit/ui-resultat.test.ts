import { afterEach, describe, expect, it, vi } from "vitest"
import { PlatformError } from "@otomata_tech/oto_platform/server"
import { resultatDe } from "@otomata_tech/oto_platform/ui"

// L'adaptateur des pages vers la prop `resultat` (E05-S03, AC2) : il lit le code et la raison sur
// l'erreur, jamais son texte.

afterEach(() => {
  vi.restoreAllMocks()
})

describe("resultatDe", () => {
  it("should wrap a success as data", async () => {
    expect(await resultatDe(Promise.resolve([1, 2]))).toEqual({ data: [1, 2] })
  })

  it("should give a coded refusal with a reason the text of messageDErreur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const refus = new PlatformError("conflict", "Ada is the last administrator of Acme.", { reason: "last_admin" })

    expect(await resultatDe(Promise.reject(refus))).toEqual({
      error: "C'est le dernier administrateur de l'organisation : nommez-en un autre avant.",
    })
  })

  it("should give a coded refusal without a reason the text of its code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await resultatDe(Promise.reject(new PlatformError("forbidden", "Only administrators.")))).toEqual({
      error: "Vous n'avez pas le droit de faire cela.",
    })
  })

  it("should give any other failure the generic message, never its own text, and log it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})

    const resultat = await resultatDe(Promise.reject(new Error("relation platform.secret_table does not exist")))

    expect(resultat).toEqual({ error: "Une erreur est survenue. Réessayez." })
    expect(log).toHaveBeenCalled()
  })

  it("should give an unknown code the generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await resultatDe(Promise.reject({ code: "ECONNRESET", message: "socket hang up" }))).toEqual({
      error: "Une erreur est survenue. Réessayez.",
    })
  })
})
