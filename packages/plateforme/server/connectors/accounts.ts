// Comptes de connecteurs (H67, H85, FR-ADMIN-02, FR-ADMIN-03) : créer un compte, simulé ou réel selon son
// connecteur, lister les comptes qu'une personne peut utiliser, désactiver, poser le secret d'un compte réel ; et la
// lecture commune aux résolutions (équipe porteuse, compte) et au bloc `team`. Sans ce module, aucun compte ne se
// pose hors de l'outillage. Aucun secret n'est rendu (NFR-ADMIN-01) : chaque requête liste ses colonnes,
// `secret_ciphertext` n'est pas accordée en lecture à `authenticated`, et le chiffré ne se lit que par
// `platform.account_secret`, pour l'appel au tiers (`accountCiphertext`). Chaque droit et chaque
// filtre se décident ici, avant la requête, par `access.ts` (E01-S07 AC23) : la RLS n'est qu'un
// garde-fou. Face SQL (E01-S10, lot d1) : chaque lecture ou écriture dans une transaction `db.tx`, les
// décisions d'`access.ts` et l'annuaire hors d'elle.
//
// Repris d'Oto (`docs\roles-and-resolution.md`) : un libellé déjà pris est refusé. Retiré : compte par
// défaut `is_default`, paliers tenant et plateforme (architecture § 10).
import {
  ACCESS_LEVEL_NAMES,
  connectorRefSchema,
  createAccountSchema,
  disableAccountSchema,
  type AccessLevelName,
  type AccountMode,
  type AccountView,
} from "../../schemas"
import { accountSecretSchema } from "../../schemas/connectors"
import {
  ACCESS_LEVELS,
  accountLevel,
  accountLevels,
  administrators,
  describeOwner,
  isOrgAdmin,
  leadsTeam,
  type AccessLevel,
  type Owner,
} from "../access"
import { catalogFunctions } from "../catalog/registry"
import type { PlatformDb } from "../db"
import { leadNames, leadWord, memberDirectory, teamsWithLeads } from "../directory"
import { fromDatabaseError, inTransaction, invalidInput, isPlatformError, isUniqueViolation, PlatformError } from "../errors"
import type { Identity } from "../identity"
import type { Tx } from "../sql"
import { declaredConnector } from "../catalog/connector-source"
import { requireActivable } from "./activations"
import { keepDeclaredConnector } from "./declaration"
import { executeDescribed, nonEmpty, valueAt } from "./engine"
import { accountMode, isSimulatedConnector, modeLabel } from "./modes"
import { decryptSecret, encryptSecret } from "./vault"

/** Niveau sur un compte tel que le lit le modèle : 1 lecture, 2 écriture, 3 gestion (H65) ; les noms d'`ACCESS_LEVEL_NAMES`. */
export type LevelName = Exclude<AccessLevelName, "none">

/** Propriétaire d'un compte, décrit comme le lit le modèle : « team Ventes », « organisation », « personal ». */
export type AccountOwner = Owner & { description: string }

/** Un compte tel que les services le rendent : jamais de secret. */
export type AccountSummary = { id: string; label: string; connector: string; mode: AccountMode; owner: AccountOwner }

/** Un compte visible de la personne, avec son état et son niveau : ce que lisent les résolutions. */
export type ConnectorAccount = AccountSummary & { status: string; level: AccessLevel }

/** Un compte lu, et le nom de son équipe propriétaire (`team_name`, sous RLS : `null` quand elle ne se lit pas). */
type AccountRow = {
  id: string
  label: string
  connector: string
  mode: string
  status: string
  owner_kind: string
  owner_team_id: string | null
  owner_user_id: string | null
  team_name: string | null
}

/**
 * Les comptes de l'organisation : ceux d'un connecteur, un seul par son identifiant, ou tous (un filtre
 * absent, `null`, ne retient rien). Colonnes listées, jamais `secret_ciphertext`, que la base n'accorde
 * pas à `authenticated`.
 */
function accountRows(sql: Tx, orgId: string, only: { connector?: string; id?: string } = {}) {
  return sql<AccountRow[]>`
    select a.id, a.label, a.connector, a.mode, a.status, a.owner_kind, a.owner_team_id, a.owner_user_id, t.name as team_name
      from platform.accounts a left join platform.teams t on t.id = a.owner_team_id
     where a.org_id = ${orgId}
       and a.connector = coalesce(${only.connector ?? null}, a.connector)
       and a.id = coalesce(${only.id ?? null}::uuid, a.id)`
}

/** Niveau d'un compte visible (1 au moins) : `read`, `write` ou `manage`, le nom de son rang (N34). */
export function levelName(level: AccessLevel): LevelName {
  const name = ACCESS_LEVEL_NAMES[level]
  return name === "none" ? "read" : name
}

function accountOwner(row: AccountRow): AccountOwner {
  if (row.owner_kind === "team") {
    return { kind: "team", teamId: row.owner_team_id, userId: null, description: `team ${row.team_name ?? "?"}` }
  }
  if (row.owner_kind === "user") return { kind: "user", teamId: null, userId: row.owner_user_id, description: "personal" }
  return { kind: "org", teamId: null, userId: null, description: "organisation" }
}

function summary(row: AccountRow): AccountSummary {
  return { id: row.id, label: row.label, connector: row.connector, mode: accountMode(row.mode), owner: accountOwner(row) }
}

/**
 * Les comptes du connecteur que la personne voit (niveau 1 au moins), tous états, avec son niveau
 * sur chacun, triés par libellé. Les niveaux se lisent en un lot (`accountLevels`,
 * database-patterns.md § N+1 Queries).
 */
export async function connectorAccounts(db: PlatformDb, identity: Identity, connector: string): Promise<ConnectorAccount[]> {
  const rows = await inTransaction(db, "connectorAccounts: accounts", (sql) => accountRows(sql, identity.org.id, { connector }))
  const levels = await accountLevels(db, identity, rows.map((row) => row.id))
  return (
    rows
      .map((row) => ({ ...summary(row), status: row.status, level: levels.get(row.id) ?? ACCESS_LEVELS.none }))
      // Niveau 0 : un compte que la personne ne voit pas n'est ni servi, ni retenu, ni nommé (H83).
      .filter((account) => account.level >= ACCESS_LEVELS.read)
      .sort((a, b) => a.label.localeCompare(b.label, "fr"))
  )
}

/**
 * Qui crée quoi (AC5, AC7), décidé avant l'insertion : un administrateur (`isOrgAdmin`), des comptes
 * d'organisation et d'équipe ; chaque responsable (`leadsTeam`, E05-S13 : une équipe peut en avoir
 * plusieurs), ceux de son équipe ; chacun, son propre compte personnel (N15).
 */
async function requireCreationRight(db: PlatformDb, identity: Identity, account: { owner_kind: string; team_id?: string }): Promise<void> {
  if (account.owner_kind === "user") return
  const isAdmin = isOrgAdmin(identity)
  if (account.owner_kind === "org") {
    if (isAdmin) return
    const who = administrators(identity, await memberDirectory(db, identity.org.id))
    throw new PlatformError("forbidden", `Creating an organisation account is reserved to ${who}.`)
  }
  // `createAccountSchema` exige `team_id` pour un compte d'équipe et le refuse avec son message ;
  // TypeScript ne le sait pas, ce cas est une erreur de câblage.
  if (!account.team_id) {
    console.error("[platform] createAccount: team account without team_id after validation")
    throw new PlatformError("internal", "Internal error.")
  }
  const teamId = account.team_id
  const [team] = await inTransaction(db, "createAccount: teams", (sql) => teamsWithLeads(sql, identity.org.id, teamId))
  if (!team) throw new PlatformError("invalid_arguments", `Unknown team ${account.team_id} in ${identity.org.name}.`)
  if (isAdmin || leadsTeam(identity, account.team_id)) return
  const directory = await memberDirectory(db, identity.org.id)
  const names = leadNames(team.leads, (userId) => directory.find((person) => person.userId === userId)?.name)
  const leads = names.length > 0 ? `its ${leadWord(names.length)} (${names.join(", ")}) and ` : ""
  throw new PlatformError("forbidden", `Creating an account for team ${team.name} is reserved to ${leads}${administrators(identity, directory)}.`)
}

/**
 * Le mode qu'un compte du connecteur admet (H85) : `simule` pour un connecteur simulé, `reel` pour un connecteur
 * réel (son secret se pose ensuite, `setAccountSecret`) ; `sandbox` n'est pas encore admis.
 */
function requireCreatableMode(connector: string, mode: AccountMode): void {
  if (isSimulatedConnector(connector)) {
    if (mode === "simule") return
    throw new PlatformError(
      "unavailable_in_v1",
      `${connector} is simulated in this version: its accounts are simulated, a ${modeLabel(mode)} account is not available. Create it with mode simule.`,
    )
  }
  if (mode === "reel") return
  if (mode === "sandbox") {
    throw new PlatformError("unavailable_in_v1", `Sandbox accounts are not available yet. Create a live account of ${connector} with mode reel.`)
  }
  throw new PlatformError("invalid_arguments", `${connector} is a live connector: its accounts are live, never simulated. Create it with mode reel.`)
}

/**
 * Crée un compte pour un connecteur activable, actif ou non (N12), au mode que son connecteur admet
 * (`requireCreatableMode`). Le mode est posé explicitement : le défaut de la colonne est `reel`. Un libellé déjà
 * pris dans l'organisation, sans casse, tous connecteurs et comptes invisibles compris, est refusé par l'index
 * unique d'E01-S06 (`23505` → `conflict`).
 */
export async function createAccount(db: PlatformDb, identity: Identity, input: unknown): Promise<AccountSummary> {
  const parsed = createAccountSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const account = parsed.data
  requireActivable(account.connector, catalogFunctions())
  requireCreatableMode(account.connector, account.mode)
  await requireCreationRight(db, identity, account)
  const teamId = account.owner_kind === "team" ? (account.team_id ?? null) : null
  const userId = account.owner_kind === "user" ? identity.user.id : null
  // Une moitié de paire de substitution ne s'écrit jamais telle quelle : U+FFFD.
  const label = account.label.toWellFormed()
  const orgId = identity.org.id
  const row = await db
    .tx(async (sql) => {
      await keepDeclaredConnector(sql, account.connector)
      const [created] = await sql<{ id: string }[]>`
        insert into platform.accounts (org_id, connector, owner_kind, owner_team_id, owner_user_id, label, mode, status)
        values (${orgId}, ${account.connector}, ${account.owner_kind}, ${teamId}, ${userId}, ${label}, ${account.mode}, 'active')
        returning id`
      const [written] = await accountRows(sql, orgId, { id: created.id })
      // Relue dans la transaction qui l'écrit, la ligne ne manque que si sa lecture la refuse : une panne,
      // annulée avec l'insertion, jamais un succès sans compte (M32, revue de d1).
      if (!written) {
        console.error(`[platform] createAccount: account ${created.id} written but not read back`)
        throw new PlatformError("internal", "Internal error.")
      }
      return written
    })
    .catch((error) => {
      if (isUniqueViolation(error)) {
        throw new PlatformError("conflict", `An account labelled ${account.label} already exists in ${identity.org.name}.`)
      }
      throw fromDatabaseError(error, "createAccount: accounts")
    })
  return summary(row)
}

/** État lu en base (colonne texte sous contrainte `check`) ; une valeur inconnue compte comme en erreur. */
function accountStatus(value: string): AccountView["status"] {
  return value === "active" || value === "disabled" ? value : "error"
}

function accountView(row: AccountRow): AccountView {
  const { kind } = accountOwner(row)
  return {
    id: row.id,
    label: row.label,
    connector: row.connector,
    owner: kind === "team" && row.team_name !== null ? { kind, teamName: row.team_name } : { kind },
    mode: accountMode(row.mode),
    status: accountStatus(row.status),
  }
}

/**
 * Les comptes de l'organisation que l'appelant voit, désactivés compris, triés par libellé (E08-S03,
 * AC6, AC11 ; `admin_connector` d'E08-S06) : tous lus, puis filtrés au niveau 1 au moins par
 * `accountLevels`, en un lot, jamais par la RLS (H123) : un compte de niveau 0 n'est ni servi ni nommé.
 */
export async function listOrgAccounts(db: PlatformDb, identity: Identity): Promise<AccountView[]> {
  const rows = await inTransaction(db, "listOrgAccounts: accounts", (sql) => accountRows(sql, identity.org.id))
  const levels = await accountLevels(db, identity, rows.map((row) => row.id))
  return rows
    .filter((row) => (levels.get(row.id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read)
    .map(accountView)
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
}

/**
 * Les comptes actifs du connecteur que la personne peut utiliser (AC8) : ceux qu'elle voit
 * (`connectorAccounts`), avec son niveau (`read`, `write`, `manage`), le mode et le propriétaire décrit. Un
 * connecteur inconnu ou natif est refusé comme à la création d'un compte (N35).
 */
export async function listUsableAccounts(
  db: PlatformDb,
  identity: Identity,
  input: unknown,
): Promise<(AccountSummary & { level: LevelName })[]> {
  const parsed = connectorRefSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  requireActivable(parsed.data.connector, catalogFunctions())
  const accounts = await connectorAccounts(db, identity, parsed.data.connector)
  return accounts
    .filter((account) => account.status === "active")
    .map(({ id, label, connector: name, mode, owner, level }) => ({ id, label, connector: name, mode, owner, level: levelName(level) }))
}

/**
 * Le compte nommé, si l'appelant le gère (niveau 3 : responsable d'un compte d'équipe, administrateur d'un compte
 * d'organisation, propriétaire d'un compte personnel), décidé avant toute écriture ou tout appel au tiers. Inconnu ou
 * invisible (niveau 0) : `not_found` ; sous le niveau : `forbidden`, qui dit qui le gère.
 */
async function managedAccount(db: PlatformDb, identity: Identity, id: string, use: { service: string; gesture: string }): Promise<AccountRow> {
  const [row] = await inTransaction(db, `${use.service}: accounts`, (sql) => accountRows(sql, identity.org.id, { id }))
  const level = row ? await accountLevel(db, identity, id) : ACCESS_LEVELS.none
  if (!row || level === ACCESS_LEVELS.none) throw new PlatformError("not_found", `Unknown account ${id}.`)
  if (level < ACCESS_LEVELS.manage) {
    const who = await describeOwner(db, identity, accountOwner(row))
    throw new PlatformError("forbidden", `${use.gesture} « ${row.label} » is reserved to those who manage it: ${who}.`)
  }
  return row
}

/**
 * Désactive un compte (AC9) : réservé à qui le gère (niveau 3 : responsable d'un compte d'équipe,
 * administrateur d'un compte d'organisation, propriétaire d'un compte personnel), décidé avant
 * l'écriture. Inconnu ou invisible (niveau 0) : `not_found`. Déjà désactivé : rien n'est écrit. Une
 * écriture qui ne rend aucune ligne après la décision est un conflit (HN-E01S07-6).
 */
export async function disableAccount(
  db: PlatformDb,
  identity: Identity,
  input: unknown,
): Promise<AccountSummary & { status: "disabled" }> {
  const parsed = disableAccountSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const id = parsed.data.account_id
  const row = await managedAccount(db, identity, id, { service: "disableAccount", gesture: "Disabling" })
  if (row.status !== "disabled") {
    const updated = await inTransaction(
      db,
      "disableAccount: accounts update",
      (sql) => sql`update platform.accounts set status = 'disabled' where id = ${id} returning id`,
    )
    // Aucune ligne après la décision : le compte a changé entre la lecture et l'écriture.
    if (updated.length === 0) {
      console.error(`[platform] disableAccount: no row written for account ${id}`)
      throw new PlatformError("conflict", `Account « ${row.label} » changed meanwhile. Reload it and retry.`)
    }
  }
  return { ...summary(row), status: "disabled" }
}

/**
 * Pose le secret d'un compte réel (H85) : réservé à qui le gère (niveau 3, comme `disableAccount`), décidé avant
 * l'écriture ; chiffré par le coffre du paquet (`vault.ts`) avant d'être écrit. Rien du secret n'est rendu, ni par le
 * résultat ni par un refus. Inconnu ou invisible : `not_found` ; compte simulé : `invalid_arguments`.
 */
export async function setAccountSecret(db: PlatformDb, identity: Identity, input: unknown): Promise<AccountSummary> {
  const parsed = accountSecretSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const id = parsed.data.account_id
  const row = await managedAccount(db, identity, id, { service: "setAccountSecret", gesture: "Setting the secret of" })
  if (accountMode(row.mode) === "simule") throw new PlatformError("invalid_arguments", `Account « ${row.label} » is simulated: it has no secret.`)
  const ciphertext = encryptSecret(id, parsed.data.secret)
  const updated = await inTransaction(
    db,
    "setAccountSecret: accounts update",
    (sql) => sql`update platform.accounts set secret_ciphertext = ${ciphertext} where id = ${id} returning id`,
  )
  // Aucune ligne après la décision : le compte a changé entre la lecture et l'écriture.
  if (updated.length === 0) {
    console.error(`[platform] setAccountSecret: no row written for account ${id}`)
    throw new PlatformError("conflict", `Account « ${row.label} » changed meanwhile. Reload it and retry.`)
  }
  return summary(row)
}

/** Ce que l'appel lit d'un compte résolu pour en tirer le secret. */
type CallAccount = { id: string; label: string; mode: AccountMode; owner: AccountOwner }

/**
 * Le chiffré du secret du compte d'un appel à un connecteur réel (H85), lu par `platform.account_secret`, qui ne le
 * rend qu'à un membre de l'organisation du compte ; `runCall` le déchiffre pour `run` seul. Refus nommés, la fonction
 * non appelée : un compte simulé (un connecteur réel ne court que sur un compte réel) ; un compte réel sans secret.
 */
export async function accountCiphertext(db: PlatformDb, identity: Identity, account: CallAccount, connector: string): Promise<string> {
  if (account.mode === "simule") {
    const who = await describeOwner(db, identity, account.owner)
    throw new PlatformError(
      "not_enabled",
      `Account « ${account.label} » is simulated, but ${connector} is a live connector: it runs on live accounts only. Ask ${who} to connect a live account.`,
    )
  }
  const [row] = await inTransaction(
    db,
    "accountCiphertext: account_secret",
    (sql) => sql<{ secret: string | null }[]>`select platform.account_secret(${account.id}) as secret`,
  )
  if (row?.secret) return row.secret
  const who = await describeOwner(db, identity, account.owner)
  throw new PlatformError("not_enabled", `Account « ${account.label} » has no secret yet. Ask ${who} to set it.`)
}

/** La santé d'un compte selon la sonde de son connecteur : sain, ou non sain et pourquoi, jamais le secret. */
export type AccountHealth = { healthy: true } | { healthy: false; reason: string }

/**
 * Joue la sonde du connecteur déclaré (`probe`) sur un compte : sa fonction de lecture appelée avec `{}`, le secret
 * déchiffré pour ce seul appel, puis chaque chemin de `nonEmpty` exigé non vide dans la réponse. Réservée à qui gère le
 * compte (niveau 3, comme `setAccountSecret`) ; hors `call`, elle n'écrit aucune ligne de journal et ne compte dans
 * aucun quota. Refus : compte inconnu ou non géré ; connecteur sans sonde déclarée (`invalid_arguments`). Un compte
 * simulé ou sans secret, un refus ou une panne du tiers : non sain, avec la raison ; une panne du coffre lève.
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
    const ciphertext = await accountCiphertext(db, identity, account, row.connector)
    const { answers } = await executeDescribed(connector.probe, { credential: decryptSecret(id, ciphertext), accountId: id }, {})
    const missing = paths.find((path) => !nonEmpty(valueAt(answers[0], path)))
    return missing === undefined ? { healthy: true } : { healthy: false, reason: `${connector.definition.label} answered without ${missing}.` }
  } catch (error) {
    if (isPlatformError(error) && error.code !== "internal") return { healthy: false, reason: error.message }
    throw error
  }
}
