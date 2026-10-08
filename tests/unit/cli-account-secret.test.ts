// @vitest-environment node
// `oto-platform accounts secret` (stories prise-des-connecteurs, AC9, et comptes-a-plusieurs-champs) sans base : la
// commande sur un client simulé. Fumée d'un outil d'outillage (`testing-strategy.md § Budget de tests`) : les champs
// lus en JSON sur l'entrée standard et les réglages en `--setting` fusionnent avec ce qui est posé, le chiffré écrit
// s'ouvre au serveur, et ni le secret ni la clé ne sont jamais affichés. Clé et secrets tirés à l'exécution.
import { randomBytes, randomUUID } from "crypto"
import { describe, expect, it } from "vitest"
import { setAccountSecretCommand } from "../../packages/plateforme/cli/account-secret.mjs"
import { decryptCredential, encryptCredential } from "../../packages/plateforme/server/connectors/vault"

type Sent = { text: string; values: unknown[] }
type Row = { label: string; connector: string; mode: string; secret_ciphertext?: string | null; settings?: Record<string, string>; secret_updated_at?: string | null }

/** Un client postgres.js simulé : la première requête lit le compte (`row`), la seconde rend la ligne écrite. */
function fakeClient(row: Row | null) {
  const sent: Sent[] = []
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      sent.push({ text: strings.join("$"), values })
      if (sent.length === 1) return row ? [row] : []
      return [{ id: "x" }]
    },
    { end: async () => {}, json: (value: unknown) => value },
  )
  return { connect: () => sql, sent }
}

async function run(options: { row: Row | null; key?: string; stdin?: string; settings?: string[]; account?: string }) {
  const account = options.account ?? randomUUID()
  const { connect, sent } = fakeClient(options.row)
  const printed: string[] = []
  const env = { PLATFORM_VAULT_KEY: options.key }
  const code = await setAccountSecretCommand({
    dbUrl: "postgresql://admin@db.example.invalid:5432/app",
    account,
    settings: options.settings,
    env,
    readSecret: async () => `${options.stdin ?? ""}\n`,
    print: (line) => printed.push(line),
    printError: (line) => printed.push(line),
    connect,
  })
  return { code, sent, printed: printed.join("\n"), account, env }
}

describe("oto-platform accounts secret", () => {
  it("should merge the JSON fields and the settings into what is set, writing a ciphertext the server opens, printing no secret (AC9)", async () => {
    const key = randomBytes(32).toString("base64")
    const account = randomUUID()
    const kept = `id_${randomBytes(6).toString("hex")}`
    const token = `tok_${randomBytes(12).toString("hex")}`
    const previous = encryptCredential(account, { api_id: kept, old: "x" }, { PLATFORM_VAULT_KEY: key })
    const row = { label: "Standard Ventes", connector: "crm", mode: "reel", secret_ciphertext: previous, settings: { region: "us" }, secret_updated_at: null }
    const done = await run({ row, key, account, stdin: JSON.stringify({ api_token: token, old: null }), settings: ["region=eu", "domain=acme"] })
    expect(done.code).toBe(0)
    const [, update] = done.sent
    expect(update.text).toContain("update platform.accounts")
    expect(update.text).toContain("secret_updated_at is not distinct from")
    const [ciphertext, names, settings] = update.values
    expect(decryptCredential(account, String(ciphertext), done.env)).toEqual({ fields: { api_id: kept, api_token: token } })
    expect([names, settings]).toEqual([["api_id", "api_token"], { region: "eu", domain: "acme" }])
    expect([done.printed.includes(token), done.printed.includes(kept), done.printed.includes(key)]).toEqual([false, false, false])
    expect(done.printed).toBe("accounts secret : secret et réglages posés pour le compte « Standard Ventes » (crm) : champs api_id, api_token.")
  })

  it("should exit 1, writing nothing, without the key, on a malformed input, for an unknown or simulated account (AC9)", async () => {
    const key = randomBytes(32).toString("base64")
    const missing = await run({ row: { label: "Crm", connector: "crm", mode: "reel" }, stdin: '{"api_key":"x"}' })
    expect([missing.code, missing.sent.length, missing.printed]).toEqual([1, 0, "accounts secret : PLATFORM_VAULT_KEY manquante dans l'environnement du serveur de l'hôte"])
    const raw = await run({ row: { label: "Crm", connector: "crm", mode: "reel" }, key, stdin: "a-raw-token" })
    expect([raw.code, raw.sent.length, raw.printed.includes("a-raw-token")]).toEqual([1, 0, false])
    const unknown = await run({ row: null, key, stdin: '{"api_key":"x"}' })
    expect([unknown.code, unknown.sent.length]).toEqual([1, 1])
    const simulated = await run({ row: { label: "Mail Ventes", connector: "mail", mode: "simule" }, key, stdin: '{"api_key":"x"}' })
    expect([simulated.code, simulated.sent.length, simulated.printed]).toEqual([1, 1, "accounts secret : le compte « Mail Ventes » (mail) est simulé, il n'a pas de secret"])
  })
})
