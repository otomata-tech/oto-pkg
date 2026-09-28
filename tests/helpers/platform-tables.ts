// Tables et fonctions du schéma `platform` telles que la base les porte (E09-S04, AC14 ; E09-S05) : lues
// dans le catalogue (`information_schema`) par la connexion d'administration des tests
// (`PLATFORM_ADMIN_DATABASE_URL`), sur le projet comme sur un Postgres nu. Jusqu'à E01-S10 f2, elles se
// lisaient dans la spécification OpenAPI de PostgREST, que `platform` quitte avec le Data API. Une seule
// lecture pour la garde de complétude de l'export-import et pour la suite d'isolation. Tests seulement.
//
// Et telles que les migrations du paquet les posent (E09-S05, `packagePolicies`) : tables, colonnes,
// RLS, policies et privilèges d'`authenticated`, lus sans base comme `check:migrations` lit le SQL.
import fs from "fs"
import path from "path"
import { clean, splitStatements } from "../../packages/plateforme/cli/migrations-check.mjs"
import { platformAdminSql } from "./admin-sql"

export type PlatformTable = {
  /** Colonnes, dans l'ordre de la table. */
  columns: string[]
  /** Colonnes de la clé primaire, dans l'ordre de la table. */
  primaryKey: string[]
  /** Colonnes non nulles. */
  required: string[]
}

/** `run` sur une connexion d'administration ouverte pour lui seul, fermée ensuite. */
async function withAdmin<T>(run: (sql: ReturnType<typeof platformAdminSql>) => Promise<T>): Promise<T> {
  const sql = platformAdminSql()
  try {
    return await run(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/**
 * Chaque fonction de `platform`, par nom, avec les noms de ses arguments d'entrée (E09-S05, AC2 : seule
 * `org_by_host` répond à `anon`) ; les surcharges d'un nom réunies, comme `/rpc/<nom>` de PostgREST. Les
 * fonctions de déclencheur, qu'aucun appel n'atteint, n'y sont pas.
 */
export async function platformFunctions(): Promise<Record<string, string[]>> {
  const rows = await withAdmin((sql) =>
    sql<{ name: string; args: string[] }[]>`
      select p.proname as name,
             coalesce(array_agg(distinct a.name) filter (where a.name is not null and a.name <> '' and a.mode in ('i', 'b', 'v')), '{}') as args
        from pg_catalog.pg_proc p
        left join lateral unnest(coalesce(p.proargnames, '{}'), coalesce(p.proargmodes, array_fill('i'::"char", array[coalesce(array_length(p.proargnames, 1), 0)])))
             as a (name, mode) on true
       where p.pronamespace = 'platform'::regnamespace and p.prokind = 'f' and p.prorettype <> 'pg_catalog.trigger'::regtype
       group by p.proname
       order by p.proname`,
  )
  return Object.fromEntries(rows.map((row) => [row.name, [...row.args]]))
}

/** Chaque table et vue de `platform`, par nom, avec ses colonnes, sa clé primaire et ses colonnes non nulles. */
export async function platformTables(): Promise<Record<string, PlatformTable>> {
  const rows = await withAdmin((sql) =>
    sql<{ table_name: string; column_name: string; required: boolean; primary_key: boolean }[]>`
      select c.table_name, c.column_name, c.is_nullable = 'NO' as required,
             exists (select 1
                       from information_schema.table_constraints k
                       join information_schema.key_column_usage u
                         on u.constraint_schema = k.constraint_schema and u.constraint_name = k.constraint_name
                      where k.constraint_type = 'PRIMARY KEY' and k.table_schema = 'platform' and k.table_name = c.table_name
                        and u.column_name = c.column_name) as primary_key
        from information_schema.columns c
       where c.table_schema = 'platform'
       order by c.table_name, c.ordinal_position`,
  )
  const tables: Record<string, PlatformTable> = {}
  for (const row of rows) {
    const table = (tables[row.table_name] ??= { columns: [], primaryKey: [], required: [] })
    table.columns.push(row.column_name)
    if (row.primary_key) table.primaryKey.push(row.column_name)
    if (row.required) table.required.push(row.column_name)
  }
  return tables
}

const MIGRATIONS = path.resolve(__dirname, "../../packages/plateforme/migrations")

/** Une migration du paquet : ses instructions, blancs réduits à une espace. */
export type PackageMigration = { file: string; statements: string[] }

/**
 * Une migration lue comme `check:migrations` la lit : commentaires et littéraux blanchis, coupée aux
 * `;` hors des corps `$$` ; même lecture que `tests/unit/rls-policies.test.ts` (E01-S08).
 */
export function migrationOf(file: string, sql: string): PackageMigration {
  const { text, dollarRanges } = clean(sql)
  const statements: { body: string }[] = splitStatements(text, dollarRanges)
  return { file, statements: statements.map((statement) => statement.body.trim().replace(/\s+/g, " ")) }
}

/** Les migrations de `packages/plateforme/migrations/`, dans l'ordre de leurs fichiers. */
export function packageMigrations(): PackageMigration[] {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => migrationOf(file, fs.readFileSync(path.join(MIGRATIONS, file), "utf8")))
}

/**
 * Une instruction d'une migration du paquet telle qu'elle est écrite, commentaires qui la précèdent
 * compris : la première dont le début, lu comme `check:migrations` le lit, répond à `head` (E01-S13 :
 * les fonctions d'avant, recréées dans `pg_temp` pour comparer ; le remplissage du lexique, rejoué).
 */
export function migrationStatement(file: string, head: RegExp): string {
  const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8")
  const { text, dollarRanges } = clean(sql)
  const statements: { offset: number; body: string }[] = splitStatements(text, dollarRanges)
  const found = statements.find((statement) => head.test(statement.body.trim()))
  if (!found) throw new Error(`${file}: no statement starts like ${head}`)
  return sql.slice(found.offset, found.offset + found.body.length)
}

const COMMANDS = ["select", "insert", "update", "delete"] as const
export type Command = (typeof COMMANDS)[number]

/** Un privilège d'`authenticated` sur une table : sur toute la table, ou sur ces colonnes. */
export type Privilege = { table: boolean; columns: string[] }

/** Une table de `platform` telle que la posent les migrations du paquet, dans leur ordre. */
export type PackageTable = {
  /** Migration qui la crée ; `null` quand une policy ou un privilège la vise sans qu'aucune ne la crée. */
  createdIn: string | null
  columns: string[]
  /** Fabriquées par la base, jamais écrites par un client : `generated always as` (identité ou expression). */
  generated: string[]
  /** Colonnes à défaut (`default`, identité). */
  defaulted: string[]
  rls: boolean
  /** Policies en vigueur après toutes les migrations : un `drop policy` puis un `create policy` du même nom comptent une fois. */
  policies: string[]
  /** Privilèges d'`authenticated` ; révoquer un privilège de table retire aussi ses privilèges de colonne (Postgres). */
  privileges: Record<Command, Privilege>
}

const CREATE_TABLE = /^create table platform\.(\w+) ?\((.*)\)$/i
const ALTER_TABLE = /^alter table (?:only )?platform\.(\w+) (.*)$/i
const ADD_COLUMN = /^add column (?:if not exists )?(.*)$/i
/** Une identité posée à part, comme l'écrit pg_dump (la ligne de base d'E01-S09). */
const ADD_IDENTITY = /^alter column "?(\w+)"? add generated (?:always|by default) as identity\b/i
const ROW_SECURITY = /^(enable|disable) row level security$/i
const CREATE_POLICY = /^create policy (\w+) on platform\.(\w+)\b/i
const DROP_POLICY = /^drop policy (?:if exists )?(\w+) on platform\.(\w+)\b/i
const GRANT = /^(grant|revoke) (.+?) on (.+?) (?:to|from) (.+)$/i
const TABLE_CONSTRAINT = /^(constraint|primary key|unique|check|foreign key|exclude)\b/i

/** Les éléments d'une liste, séparés par les virgules hors parenthèses. */
function topLevel(list: string): string[] {
  const items: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < list.length; at++) {
    if (list[at] === "(") depth += 1
    if (list[at] === ")") depth -= 1
    if (list[at] === "," && depth === 0) {
      items.push(list.slice(start, at).trim())
      start = at + 1
    }
  }
  return [...items, list.slice(start).trim()].filter(Boolean)
}

function emptyTable(): PackageTable {
  const none = (): Privilege => ({ table: false, columns: [] })
  return {
    createdIn: null,
    columns: [],
    generated: [],
    defaulted: [],
    rls: false,
    policies: [],
    privileges: { select: none(), insert: none(), update: none(), delete: none() },
  }
}

/** Une définition de colonne (`nom type …`) ; une contrainte de table n'en est pas une. */
function addColumn(table: PackageTable, definition: string): void {
  if (TABLE_CONSTRAINT.test(definition)) return
  const name = /^"?([a-z_][a-z0-9_]*)"?/i.exec(definition)?.[1]?.toLowerCase()
  if (!name) return
  table.columns.push(name)
  if (/\bgenerated always as\b/i.test(definition)) table.generated.push(name)
  if (/\bdefault\b|\bgenerated always as identity\b/i.test(definition)) table.defaulted.push(name)
}

/** `grant` ou `revoke` à `authenticated` sur des tables de `platform` ; tout autre objet ou rôle est ignoré. */
function applyGrant(statement: string, tables: Record<string, PackageTable>, tableOf: (name: string) => PackageTable): void {
  const [, verb, list, objects, roles] = GRANT.exec(statement) ?? []
  if (!verb || !roles.split(",").some((role) => role.trim().toLowerCase() === "authenticated")) return
  const names = /^all tables in schema platform$/i.test(objects)
    ? Object.keys(tables)
    : topLevel(objects).map((object) => /^(?:table )?platform\.(\w+)$/i.exec(object)?.[1] ?? "")
  if (names.some((name) => !name)) return
  const granted = verb.toLowerCase() === "grant"
  for (const item of topLevel(list)) {
    const [, word = "", columns] = /^(\w+)(?: privileges)? ?(?:\((.*)\))?$/i.exec(item) ?? []
    // pg_dump cite un nom de colonne qui est un mot réservé (`"position"`, ligne de base d'E01-S09).
    const listed = columns === undefined ? null : columns.split(",").map((column) => column.trim().replace(/^"(.*)"$/, "$1").toLowerCase())
    const commands = COMMANDS.filter((command) => word.toLowerCase() === command || word.toLowerCase() === "all")
    for (const name of names) for (const command of commands) setPrivilege(tableOf(name).privileges[command], listed, granted)
  }
}

function setPrivilege(privilege: Privilege, columns: string[] | null, granted: boolean): void {
  if (granted && columns === null) privilege.table = true
  if (granted && columns !== null) privilege.columns = [...new Set([...privilege.columns, ...columns])]
  if (!granted && columns === null) Object.assign(privilege, { table: false, columns: [] })
  if (!granted && columns !== null) privilege.columns = privilege.columns.filter((column) => !columns.includes(column))
}

function readStatement(statement: string, file: string, tables: Record<string, PackageTable>): void {
  const tableOf = (name: string) => (tables[name.toLowerCase()] ??= emptyTable())
  const created = CREATE_TABLE.exec(statement)
  if (created) {
    const table = tableOf(created[1])
    table.createdIn = file
    for (const definition of topLevel(created[2])) addColumn(table, definition)
    return
  }
  const altered = ALTER_TABLE.exec(statement)
  if (altered) {
    const table = tableOf(altered[1])
    const security = ROW_SECURITY.exec(altered[2])
    if (security) table.rls = security[1].toLowerCase() === "enable"
    for (const action of topLevel(altered[2])) {
      const added = ADD_COLUMN.exec(action)
      if (added) addColumn(table, added[1])
      const identity = ADD_IDENTITY.exec(action)
      if (identity) table.generated.push(identity[1].toLowerCase())
      if (identity) table.defaulted.push(identity[1].toLowerCase())
    }
    return
  }
  const policy = CREATE_POLICY.exec(statement) ?? DROP_POLICY.exec(statement)
  if (policy) {
    const table = tableOf(policy[2])
    const others = table.policies.filter((name) => name !== policy[1])
    table.policies = statement.toLowerCase().startsWith("create") ? [...others, policy[1]] : others
    return
  }
  applyGrant(statement, tables, tableOf)
}

/**
 * Chaque table que visent les migrations du paquet (E09-S05, AC1 et AC4) : la migration qui la crée,
 * ses colonnes (celles fabriquées par la base, celles à défaut), sa RLS, ses policies en vigueur et
 * les privilèges d'`authenticated`, lus dans l'ordre des migrations.
 */
export function packagePolicies(migrations: PackageMigration[] = packageMigrations()): Record<string, PackageTable> {
  const tables: Record<string, PackageTable> = {}
  for (const { file, statements } of migrations) for (const statement of statements) readStatement(statement, file, tables)
  return tables
}
