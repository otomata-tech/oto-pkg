// @vitest-environment node
// Coffre du paquet (story prise-des-connecteurs, AC6, AC7) : le format de `cli/vault.mjs`, lu par le serveur
// (`server/connectors/vault.ts`) et par la commande `oto-platform accounts secret`. Clés et secrets tirés à
// l'exécution, jamais en littéral (`testing-strategy.md § Anti-patterns`).
import { randomBytes, randomUUID } from "crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { decryptSecret, encryptSecret } from "../../packages/plateforme/server/connectors/vault"
import { PlatformError } from "../../packages/plateforme/server/errors"
import { PlatformConfigError } from "../../packages/plateforme/server/sql"
import { loggedText } from "../helpers/logs"

const key = () => randomBytes(32).toString("base64")
const secret = () => `token-${randomBytes(12).toString("hex")}`

afterEach(() => {
  vi.restoreAllMocks()
})

describe("connector vault", () => {
  it("should give back the secret of the account it was sealed for, under the same key (AC6)", () => {
    const env = { PLATFORM_VAULT_KEY: key() }
    const account = randomUUID()
    const value = secret()
    const sealed = encryptSecret(account, value, env)
    expect(sealed.startsWith("v1:")).toBe(true)
    expect(sealed).not.toContain(value)
    expect(decryptSecret(account, sealed, env)).toBe(value)
    // Un vecteur neuf à chaque chiffrement.
    expect(encryptSecret(account, value, env)).not.toBe(sealed)
  })

  it("should refuse a ciphertext presented for another account, or under another key, without logging it (AC6)", () => {
    const env = { PLATFORM_VAULT_KEY: key() }
    const account = randomUUID()
    const value = secret()
    const sealed = encryptSecret(account, value, env)
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    for (const [other, otherEnv] of [
      [randomUUID(), env],
      [account, { PLATFORM_VAULT_KEY: key() }],
    ] as const) {
      expect(() => decryptSecret(other, sealed, otherEnv)).toThrow(new PlatformError("internal", "Internal error."))
    }
    expect(() => decryptSecret(account, sealed.replace(/^v1:/, "v9:"), env)).toThrow(PlatformError)
    expect(loggedText(errors)).not.toContain(sealed.split(":")[3])
    expect(loggedText(errors)).not.toContain(value)
  })

  it.each([
    ["missing", undefined],
    ["not base64 of 32 bytes", randomBytes(16).toString("base64")],
  ])("should throw PlatformConfigError naming the variable when the key is %s, only when used (AC7)", (_case, value) => {
    const env = { PLATFORM_VAULT_KEY: value }
    expect(() => encryptSecret(randomUUID(), secret(), env)).toThrow(PlatformConfigError)
    expect(() => encryptSecret(randomUUID(), secret(), env)).toThrow(/PLATFORM_VAULT_KEY/)
    expect(() => decryptSecret(randomUUID(), "v1:a:b:c", env)).toThrow(PlatformConfigError)
  })
})
