// @vitest-environment node
// Coffre du paquet (stories prise-des-connecteurs, AC6, AC7, et comptes-a-plusieurs-champs) : le format de
// `cli/vault.mjs`, lu par le serveur (`server/connectors/vault.ts`) et par la commande `oto-platform accounts secret`.
// Format v2 : un objet de champs, l'identifiant de la clé, données associées = compte et colonne ; le v1 (un secret brut)
// reste lisible. Clés et secrets tirés à l'exécution, jamais en littéral (`testing-strategy.md § Anti-patterns`).
import { createCipheriv, randomBytes, randomUUID } from "crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { mergeCredential, parseVaultKey, vaultKeyId } from "../../packages/plateforme/cli/vault.mjs"
import { decryptCredential, decryptToken, encryptCredential, encryptToken } from "../../packages/plateforme/server/connectors/vault"
import { PlatformError } from "../../packages/plateforme/server/errors"
import { PlatformConfigError } from "../../packages/plateforme/server/sql"
import { loggedText } from "../helpers/logs"

const key = () => randomBytes(32).toString("base64")
const secret = () => `token-${randomBytes(12).toString("hex")}`

/** Un chiffré au format v1, tel que la 1.5.0 l'écrivait avant les champs multiples : un secret brut, données associées = le compte. */
function sealV1(base64Key: string, account: string, value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(base64Key, "base64"), iv, { authTagLength: 16 })
  cipher.setAAD(Buffer.from(account, "utf8"))
  const sealed = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), sealed.toString("base64url")].join(":")
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("connector vault", () => {
  it("should give back the fields of the account they were sealed for, in a v2 ciphertext naming its key (AC6)", () => {
    const env = { PLATFORM_VAULT_KEY: key() }
    const account = randomUUID()
    const fields = { api_id: secret(), api_token: secret() }
    const sealed = encryptCredential(account, fields, env)
    expect(sealed.split(":").slice(0, 2)).toEqual(["v2", vaultKeyId(parseVaultKey(env.PLATFORM_VAULT_KEY))])
    expect([sealed.includes(fields.api_id), sealed.includes(fields.api_token)]).toEqual([false, false])
    expect(decryptCredential(account, sealed, env)).toEqual({ fields })
    // Un vecteur neuf à chaque chiffrement.
    expect(encryptCredential(account, fields, env)).not.toBe(sealed)
  })

  it("should still read a v1 secret as a single unnamed value", () => {
    const env = { PLATFORM_VAULT_KEY: key() }
    const account = randomUUID()
    const value = secret()
    expect(decryptCredential(account, sealV1(env.PLATFORM_VAULT_KEY, account, value), env)).toEqual({ single: value })
  })

  it("should refuse a ciphertext presented for another account, another column or under another key, without logging it (AC6)", () => {
    const env = { PLATFORM_VAULT_KEY: key() }
    const account = randomUUID()
    const value = secret()
    const sealed = encryptCredential(account, { api_key: value }, env)
    const token = encryptToken(account, value, env)
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const internal = new PlatformError("internal", "Internal error.")
    expect(() => decryptCredential(randomUUID(), sealed, env)).toThrow(internal)
    expect(() => decryptCredential(account, sealed, { PLATFORM_VAULT_KEY: key() })).toThrow(internal)
    // Le jeton chiffré pour sa colonne ne s'ouvre pas comme un secret, ni l'inverse.
    expect(() => decryptCredential(account, token, env)).toThrow(internal)
    expect(() => decryptToken(account, sealed, env)).toThrow(internal)
    expect(decryptToken(account, token, env)).toBe(value)
    expect(() => decryptCredential(account, sealed.replace(/^v2:/, "v9:"), env)).toThrow(PlatformError)
    expect(loggedText(errors)).not.toContain(sealed.split(":")[4])
    expect(loggedText(errors)).not.toContain(value)
  })

  it("should keep an absent field, erase a null or empty one, and replace the others", () => {
    expect(mergeCredential({ a: "1", b: "2", c: "3" }, { b: null, c: "", d: "4", a: "5" })).toEqual({ a: "5", d: "4" })
  })

  it.each([
    ["missing", undefined],
    ["not base64 of 32 bytes", randomBytes(16).toString("base64")],
  ])("should throw PlatformConfigError naming the variable when the key is %s, only when used (AC7)", (_case, value) => {
    const env = { PLATFORM_VAULT_KEY: value }
    expect(() => encryptCredential(randomUUID(), { api_key: secret() }, env)).toThrow(PlatformConfigError)
    expect(() => encryptCredential(randomUUID(), { api_key: secret() }, env)).toThrow(/PLATFORM_VAULT_KEY/)
    expect(() => decryptCredential(randomUUID(), "v2:a:b:c:d", env)).toThrow(PlatformConfigError)
  })
})
