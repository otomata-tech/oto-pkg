// @vitest-environment node
// `oto-platform accounts secret` (story prise-des-connecteurs, AC9) sans base : la commande sur un client simulé.
// Fumée d'un outil d'outillage (`testing-strategy.md § Budget de tests`) : le chiffré écrit s'ouvre au serveur, et
// ni le secret ni la clé ne sont jamais affichés. Clé et secret tirés à l'exécution.
import { randomBytes, randomUUID } from "crypto"
import { describe, expect, it } from "vitest"
import { setAccountSecretCommand } from "../../packages/plateforme/cli/account-secret.mjs"
import { decryptSecret } from "../../packages/plateforme/server/connectors/vault"

type Sent = { text: string; values: unknown[] }

/** Un client postgres.js simulé : la première requête lit le compte (`row`), les suivantes n'en rendent aucune. */
function fakeClient(row: { label: string; connector: string; mode: string } | null) {
  const sent: Sent[] = []
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      sent.push({ text: strings.join("$"), values })
      return sent.length === 1 && row ? [row] : []
    },
    { end: async () => {} },
  )
  return { connect: () => sql, sent }
}

async function run(options: { row: { label: string; connector: string; mode: string } | null; key?: string; secret?: string }) {
  const account = randomUUID()
  const { connect, sent } = fakeClient(options.row)
  const printed: string[] = []
  const env = { PLATFORM_VAULT_KEY: options.key }
  const code = await setAccountSecretCommand({
    dbUrl: "postgresql://admin@db.example.invalid:5432/app",
    account,
    env,
    readSecret: async () => `${options.secret ?? ""}\n`,
    print: (line) => printed.push(line),
    printError: (line) => printed.push(line),
    connect,
  })
  return { code, sent, printed: printed.join("\n"), account, env }
}

describe("oto-platform accounts secret", () => {
  it("should write a ciphertext the server opens for that account, and print neither the secret nor the key (AC9)", async () => {
    const key = randomBytes(32).toString("base64")
    const secret = `ntn_${randomBytes(12).toString("hex")}`
    const done = await run({ row: { label: "Notion Ventes", connector: "notion", mode: "reel" }, key, secret })
    expect(done.code).toBe(0)
    const [, update] = done.sent
    expect(update.text).toContain("update platform.accounts set secret_ciphertext = ")
    const ciphertext = String(update.values[0])
    expect(decryptSecret(done.account, ciphertext, done.env)).toBe(secret)
    expect([done.printed.includes(secret), done.printed.includes(key), done.printed.includes(ciphertext)]).toEqual([false, false, false])
    expect(done.printed).toBe("accounts secret : secret posé pour le compte « Notion Ventes » (notion).")
  })

  it("should exit 1, writing nothing, without the key, for an unknown or simulated account (AC9)", async () => {
    const key = randomBytes(32).toString("base64")
    const missing = await run({ row: { label: "Notion", connector: "notion", mode: "reel" }, secret: "x" })
    expect([missing.code, missing.sent.length, missing.printed]).toEqual([1, 0, "accounts secret : PLATFORM_VAULT_KEY manquante dans l'environnement du serveur de l'hôte"])
    const unknown = await run({ row: null, key, secret: "x" })
    expect([unknown.code, unknown.sent.length]).toEqual([1, 1])
    const simulated = await run({ row: { label: "Mail Ventes", connector: "mail", mode: "simule" }, key, secret: "x" })
    expect([simulated.code, simulated.sent.length, simulated.printed]).toEqual([1, 1, "accounts secret : le compte « Mail Ventes » (mail) est simulé, il n'a pas de secret"])
  })
})
