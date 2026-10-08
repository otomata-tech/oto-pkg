// Le secret et les réglages d'un compte réel (`connecteurs-et-comptes.md` § Comptes à plusieurs champs et réglages) :
// la saisie par qui gère le compte (`setAccountSecret`, de l'écran Connecteurs ou d'un service), qui fusionne avec ce
// qui est posé ; le compte ouvert pour un appel (`liveCredential`, lu par `runCall`) ; la sonde (`probeAccount`). Les
// champs sont contrôlés contre la déclaration du connecteur, chiffrés ensemble (`vault.ts`) ; les réglages restent en
// clair ; le jeton d'un échange est chiffré à part (`token_ciphertext`), pour qu'un renouvellement n'écrase jamais une
// saisie. Sans ce module, un compte ne porterait qu'un jeton posé par l'outillage. Rien du secret n'est jamais rendu,
// ni par un résultat, ni par un refus, ni par un log.
import { mergeCredential } from "../../cli/vault.mjs"
import { disableAccountSchema, type AccountMode, type ConnectorAccountForm } from "../../schemas"
import { accountSecretSchema } from "../../schemas/connectors"
import { describeOwner } from "../access"
import { declaredConnector, declaredConnectors, type DeclaredConnector } from "../catalog/connector-source"
import type { PlatformDb } from "../db"
import { inTransaction, invalidInput, isPlatformError, PlatformError } from "../errors"
import type { Identity } from "../identity"
import { accountOwner, managedAccount, summary, type AccountOwner, type AccountSummary } from "./accounts"
import { requiredFields, type AccountCredential, type StoredToken, type TokenStore } from "./auth"
import { executeDescribed, nonEmpty, valueAt } from "./engine"
import { accountMode } from "./modes"
import { accountSettings, settingValueProblem } from "./settings"
import { decryptCredential, decryptToken, encryptCredential, encryptToken, type OpenedCredential } from "./vault"

/** Ce que l'appel lit d'un compte résolu pour l'ouvrir. */
type CallAccount = { id: string; label: string; mode: AccountMode; owner: AccountOwner }

/** Le chiffré du secret, les réglages, les champs posés et la version de la dernière saisie d'un compte. */
type SecretRow = { secret: string | null; settings: Record<string, string>; secret_fields: string[]; secret_updated_at: string | null }

function secretRow(db: PlatformDb, service: string, id: string): Promise<SecretRow | undefined> {
  return inTransaction(db, `${service}: account_secret`, (sql) => sql<SecretRow[]>`
    select platform.account_secret(${id}) as secret, a.settings, a.secret_fields, to_json(a.secret_updated_at) #>> '{}' as secret_updated_at
      from platform.accounts a where a.id = ${id}`).then(([row]) => row)
}

/** Le connecteur déclaré d'un compte réel ; un connecteur que l'hôte ne déclare plus n'a ni champs ni réglages. */
function declaredOf(connector: string): DeclaredConnector {
  const declared = declaredConnector(connector)
  if (!declared) throw new PlatformError("invalid_arguments", `Connector ${connector} is not declared by this application: its accounts have no fields to set.`)
  return declared
}

/** Les champs d'un secret ouvert ; un secret v1 (un seul champ) se range sous le dernier champ qu'exige l'authentification. */
function fieldsOf(declared: DeclaredConnector, opened: OpenedCredential): Record<string, string> {
  if ("fields" in opened) return opened.fields
  return { [requiredFields(declared.auth).at(-1) ?? declared.definition.credential[0].name]: opened.single }
}

/** Les réglages saisis, contrôlés contre la déclaration ; une adresse perd son `/` final. */
function checkedSettings(declared: DeclaredConnector, given: Record<string, string | null>): Record<string, string | null> {
  const settings = declared.definition.settings ?? []
  const checked: Record<string, string | null> = {}
  for (const [name, raw] of Object.entries(given)) {
    const setting = settings.find((candidate) => candidate.name === name)
    if (!setting) throw new PlatformError("invalid_arguments", `Unknown setting ${name} of ${declared.definition.name}: its settings are ${settings.map((item) => item.name).join(", ") || "none"}.`)
    const value = raw === null || raw === "" ? null : setting.type === "url" ? raw.replace(/\/+$/, "") : raw
    const problem = value === null ? null : settingValueProblem(setting, value)
    if (problem) throw new PlatformError("invalid_arguments", `Setting ${setting.label} ${problem}.`)
    checked[name] = value
  }
  return checked
}

/**
 * Pose le secret et les réglages d'un compte réel : réservé à qui le gère (niveau 3, comme `disableAccount`), décidé
 * avant l'écriture. La saisie fusionne avec ce qui est posé : un champ ou un réglage absent est gardé, `null` ou vide
 * l'efface. Champs et réglages sont contrôlés contre la déclaration du connecteur ; les champs sont chiffrés ensemble,
 * et le jeton d'un échange est effacé (il découlait de l'ancienne saisie). Une saisie concurrente entre la lecture et
 * l'écriture est refusée (`stale_revision`). Rien du secret n'est rendu. Refus : inconnu ou invisible (`not_found`),
 * non géré (`forbidden`), compte simulé, connecteur non déclaré, champ ou réglage inconnu ou invalide
 * (`invalid_arguments`).
 */
export async function setAccountSecret(db: PlatformDb, identity: Identity, input: unknown): Promise<AccountSummary> {
  const parsed = accountSecretSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const id = parsed.data.account_id
  const row = await managedAccount(db, identity, id, { service: "setAccountSecret", gesture: "Setting the secret of" })
  if (accountMode(row.mode) === "simule") throw new PlatformError("invalid_arguments", `Account « ${row.label} » is simulated: it has no secret.`)
  const declared = declaredOf(row.connector)
  const fieldNames = declared.definition.credential.map((field) => field.name)
  const secret = parsed.data.input.secret ?? {}
  const unknown = Object.keys(secret).find((name) => !fieldNames.includes(name))
  if (unknown !== undefined) throw new PlatformError("invalid_arguments", `Unknown field ${unknown} of ${row.connector}: its fields are ${fieldNames.join(", ")}.`)
  const settings = checkedSettings(declared, parsed.data.input.settings ?? {})
  const current = await secretRow(db, "setAccountSecret", id)
  const previous = current?.secret ? fieldsOf(declared, decryptCredential(id, current.secret)) : {}
  const fields = mergeCredential(previous, secret)
  const nextSettings = mergeCredential(current?.settings ?? {}, settings)
  const ciphertext = Object.keys(fields).length > 0 ? encryptCredential(id, fields) : null
  const version = current?.secret_updated_at ?? null
  const updated = await inTransaction(db, "setAccountSecret: accounts update", (sql) => sql`
    update platform.accounts
       set secret_ciphertext = ${ciphertext}, secret_fields = ${Object.keys(fields).sort()}::text[], settings = ${sql.json(nextSettings)},
           secret_updated_at = now(), token_ciphertext = null, token_expires_at = null
     where id = ${id} and secret_updated_at is not distinct from ${version}::text::timestamptz
     returning id`)
  // Aucune ligne après la décision : une autre saisie a été écrite depuis la lecture qui fonde la fusion.
  if (updated.length === 0) {
    console.error(`[platform] setAccountSecret: account ${id} changed since its secret was read`)
    throw new PlatformError("stale_revision", `Account « ${row.label} » was changed meanwhile. Reload it and enter its secret again.`)
  }
  return summary(row)
}

/**
 * Le formulaire du compte de chaque connecteur réel déclaré, tiré de sa déclaration : les champs du secret, puis les
 * réglages ; ce que l'écran Connecteurs montre pour créer un compte réel ou en saisir le secret. Sans lecture de base.
 */
export function connectorAccountForms(): ConnectorAccountForm[] {
  return declaredConnectors().map(({ definition }) => ({
    connector: definition.name,
    label: definition.label,
    fields: definition.credential.map(({ name, label, secret }) => ({ name, label, secret })),
    settings: (definition.settings ?? []).map((setting) => (setting.type === "choice" ? { ...setting, choices: [...setting.choices] } : { ...setting })),
  }))
}

/** Le jeton d'un échange, lu et écrit sur la ligne du compte, chiffré à part du secret saisi. */
function tokenStore(db: PlatformDb, accountId: string): TokenStore {
  return {
    async read() {
      const [row] = await inTransaction(db, "tokenStore: account_token", (sql) => sql<{ token: string | null; expires_at: string | null }[]>`
        select platform.account_token(${accountId}) as token, to_json(a.token_expires_at) #>> '{}' as expires_at
          from platform.accounts a where a.id = ${accountId}`)
      return row?.token ? { token: decryptToken(accountId, row.token), expiresAt: row.expires_at ? new Date(row.expires_at) : null } : null
    },
    async write({ token, expiresAt }: StoredToken) {
      const ciphertext = encryptToken(accountId, token)
      await inTransaction(db, "tokenStore: accounts update", (sql) => sql`
        update platform.accounts set token_ciphertext = ${ciphertext}, token_expires_at = ${expiresAt} where id = ${accountId}`)
    },
  }
}

/** Le premier champ exigé par l'authentification qui manque, nommé par son libellé ; `null` : aucun. */
function missingField(declared: DeclaredConnector, present: readonly string[]): string | null {
  const name = requiredFields(declared.auth).find((field) => !present.includes(field))
  return name === undefined ? null : (declared.definition.credential.find((field) => field.name === name)?.label ?? name)
}

/**
 * Le compte d'un appel à un connecteur réel déclaré, lu après sa résolution et avant tout récapitulatif ; rend de quoi
 * l'ouvrir pour `run` seul, au dernier moment. Refus nommés, la fonction non appelée (`not_enabled`, qui dit à qui
 * demander) : un compte simulé ; un compte sans secret, ou sans un champ qu'exige l'authentification ; un réglage
 * manquant ou devenu invalide.
 */
export async function liveCredential(db: PlatformDb, identity: Identity, account: CallAccount, connector: string): Promise<() => Promise<AccountCredential>> {
  const who = () => describeOwner(db, identity, account.owner)
  if (account.mode === "simule") {
    throw new PlatformError(
      "not_enabled",
      `Account « ${account.label} » is simulated, but ${connector} is a live connector: it runs on live accounts only. Ask ${await who()} to connect a live account.`,
    )
  }
  const declared = declaredConnector(connector)
  if (!declared) {
    console.error(`[platform] call: live connector ${connector} is not declared`)
    throw new PlatformError("internal", "Internal error.")
  }
  const row = await secretRow(db, "liveCredential", account.id)
  if (!row?.secret) throw new PlatformError("not_enabled", `Account « ${account.label} » has no secret yet. Ask ${await who()} to set it.`)
  const checked = accountSettings(declared.definition, row.settings)
  if ("problem" in checked) {
    throw new PlatformError("not_enabled", `The ${checked.problem.label} setting of account « ${account.label} » ${checked.problem.reason}. Ask ${await who()} to set it.`)
  }
  const refuseMissing = async (present: readonly string[]) => {
    const missing = missingField(declared, present)
    if (missing) throw new PlatformError("not_enabled", `Account « ${account.label} » has no ${missing} yet. Ask ${await who()} to set it.`)
  }
  // Un secret v1 ne dit pas ses champs : il se contrôle une fois ouvert.
  if (row.secret_fields.length > 0) await refuseMissing(row.secret_fields)
  const ciphertext = row.secret
  return async () => {
    const fields = fieldsOf(declared, decryptCredential(account.id, ciphertext))
    await refuseMissing(Object.keys(fields))
    return { fields, settings: checked.settings, tokens: tokenStore(db, account.id) }
  }
}

/** La santé d'un compte selon la sonde de son connecteur : sain, ou non sain et pourquoi, jamais le secret. */
export type AccountHealth = { healthy: true } | { healthy: false; reason: string }

/**
 * Joue la sonde du connecteur déclaré (`probe`) sur un compte : sa fonction de lecture appelée avec `{}`, le compte
 * ouvert pour ce seul appel, puis chaque chemin de `nonEmpty` exigé non vide dans la réponse. Réservée à qui gère le
 * compte (niveau 3, comme `setAccountSecret`) ; hors `call`, elle n'écrit aucune ligne de journal et ne compte dans
 * aucun quota. Refus : compte inconnu ou non géré ; connecteur sans sonde déclarée (`invalid_arguments`). Un compte
 * simulé, sans secret ou mal réglé, un refus ou une panne du tiers : non sain, avec la raison ; une panne du coffre lève.
 */
export async function probeAccount(db: PlatformDb, identity: Identity, input: unknown): Promise<AccountHealth> {
  // La même saisie que la désactivation : le compte visé, par son identifiant.
  const parsed = disableAccountSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const id = parsed.data.account_id
  const row = await managedAccount(db, identity, id, { service: "probeAccount", gesture: "Probing" })
  const connector = declaredConnector(row.connector)
  const paths = connector?.definition.probe?.nonEmpty
  if (!connector?.probe || !paths) throw new PlatformError("invalid_arguments", `Connector ${row.connector} declares no probe.`)
  const account = { id, label: row.label, mode: accountMode(row.mode), owner: accountOwner(row) }
  try {
    const open = await liveCredential(db, identity, account, row.connector)
    const { answers } = await executeDescribed(connector.probe, { credential: await open(), accountId: id }, {})
    const missing = paths.find((path) => !nonEmpty(valueAt(answers[0], path)))
    return missing === undefined ? { healthy: true } : { healthy: false, reason: `${connector.definition.label} answered without ${missing}.` }
  } catch (error) {
    if (isPlatformError(error) && error.code !== "internal") return { healthy: false, reason: error.message }
    throw error
  }
}
