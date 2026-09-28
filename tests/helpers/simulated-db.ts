// Base simulée des tests de service (E01-S07, HN-E01S07-5) : le sous-ensemble du client supabase-js
// que `server/` utilise, sur des tables en mémoire. Chaque filtre de la requête s'applique, aucune
// règle d'accès : c'est PostgREST sans RLS, et une ligne interdite revient dès qu'elle répond aux
// filtres. Un service qui filtre ou refuse le prouve donc lui-même
// (`security-patterns.md § Droits dans le service`). Comme PostgREST, une lecture rend au plus
// `SERVER_MAX_ROWS` lignes, sans erreur au-delà. Un opérateur non couvert lève, jamais un filtre
// ignoré en silence : l'étendre ici quand un service en utilise un nouveau. `calls` garde chaque
// requête, dans l'ordre où elle part : l'espion des refus sans écriture.
//
// Repris de `tests/unit/identity.test.ts` (`memoryDb`) : des tables en mémoire dont les filtres
// s'appliquent. Ajouté : les opérateurs, les écritures, les RPC par gestionnaires, l'espion.
import type { PlatformDb } from "../../packages/plateforme/server/db"

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

type FilterOp = "eq" | "in" | "is" | "gt" | "gte" | "not.is"
type WriteOp = "insert" | "update" | "delete"

export type SimulatedFilter = { column: string; op: FilterOp; value: unknown }

export type SimulatedCall =
  | { kind: "table"; table: string; op: "select" | WriteOp; filters: SimulatedFilter[]; values?: unknown }
  | { kind: "rpc"; name: string; args: Record<string, unknown> }
  | { kind: "auth"; name: string; args: unknown }

export type SimulatedError = { code: string; message?: string }

/** Gestionnaire d'une fonction : rend ses données, comme PostgREST les rendrait. */
export type RpcHandler = (args: Record<string, unknown>, tables: Tables) => unknown

export type SimulatedDbOptions = {
  tables?: Tables
  rpc?: Record<string, RpcHandler>
  /** Réponse de `auth.signInWithOtp` ; sans elle, un envoi réussi. */
  auth?: { signInWithOtp?: (args: unknown) => { data?: unknown; error: unknown } }
  /** Erreur de base rendue à la requête qu'elle vise (`57014`, `23505`…) ; `null` : la requête passe. */
  fail?: (call: SimulatedCall) => SimulatedError | null
  /**
   * Ce qu'une autre requête change juste avant celle-ci, sur les tables de la base (E01-S07c) : une
   * cible retirée entre la lecture d'un service et son écriture, qui ne rend alors aucune ligne.
   */
  meanwhile?: (call: SimulatedCall, tables: Tables) => void
  /**
   * Valeurs posées par la base à l'insertion (E03-S03 : `id`, `revision`, dates d'un bloc ; E03-S04 : `sim_outbox.id`, `status`) : la ligne
   * écrite est celle que rend `defaults(table, ligne envoyée)`. Sans elle, la ligne est écrite telle quelle.
   */
  defaults?: (table: string, row: Row) => Row
}

export type SimulatedDb = { db: PlatformDb; calls: SimulatedCall[] }

/**
 * `max_rows` du serveur (`supabase/config.toml`, défaut de Supabase) : une lecture en rend au plus
 * autant, tronquée sans erreur. Tenu ici à part de `READ_PAGE_ROWS` (`server/errors.ts`) : un écart
 * entre la taille de page du paquet et le serveur fait échouer la lecture par pages d'AC12
 * (HN-E01S07-24).
 */
const SERVER_MAX_ROWS = 1000

type Result = { data: unknown; error: SimulatedError | null }

type Context = { tables: Tables; calls: SimulatedCall[]; options: SimulatedDbOptions }

type Query = {
  op: "select" | WriteOp
  started: boolean
  values?: Row | Row[]
  /** Colonnes rendues ; `null` : une écriture sans `select()`, qui ne rend rien. */
  columns: string[] | "*" | null
  filters: SimulatedFilter[]
  orders: { column: string; ascending: boolean }[]
  limit: number | null
  cardinality: "many" | "single" | "maybeSingle"
  /** Ressources liées embarquées par le `select` (`teams(name)`), rendues à côté des colonnes. */
  embeds?: Embed[]
  /** `like(colonne, "préfixe%")` (E01-S07c) : préfixes, échappements retirés. */
  likes?: { column: string; prefix: string }[]
  /** `select(…, { count: "exact" })` (E07-S01) : la réponse porte aussi le nombre de lignes filtrées. */
  count?: boolean
  /** `head: true` : le nombre seul, aucune ligne rendue (`data` nul, comme PostgREST). */
  head?: boolean
  /** Jointure interne `relation!inner(colonnes)` (E03-S08) : filtrée par `relation.colonne`. */
  inner?: Embed
}

/**
 * Embarquements plusieurs-à-un que `server/` pose (E01-S07 partie B) : la ressource liée, sa table et
 * la clé étrangère qui la désigne, comme PostgREST les résout. Un autre embarquement lève.
 */
const LINKS: Record<string, Record<string, { column: string; table: string }>> = {
  accounts: { teams: { column: "owner_team_id", table: "teams" } },
  sim_outbox: { accounts: { column: "account_id", table: "accounts" } },
  // Organisations où l'appelant agit (E08-S02, `listOrgs`) : par ses lignes `members` et ses accès.
  members: { orgs: { column: "org_id", table: "orgs" } },
  platform_grants: { orgs: { column: "org_id", table: "orgs" } },
  node_versions: { nodes: { column: "node_id", table: "nodes" } },
  // Blocs `call` publiés des procédures, joints à leur nœud (E08-S03, `deactivationImpact`).
  blocks: { nodes: { column: "node_id", table: "nodes" } },
}

type Embed = { relation: string; column: string; table: string; columns: string[] }

/** `relation(colonnes)` dans un `select`. */
const EMBED = /([a-z_][a-z0-9_]*)\(([^()]*)\)/g

/** `, relation!inner(colonnes)` en fin de `select` (E03-S08, nouveautés) : une jointure interne. */
const INNER_EMBED = /,\s*([a-z_][a-z0-9_]*)!inner\(([^()]*)\)\s*$/

function unsupported(what: string): never {
  throw new Error(`simulatedDb: ${what} is not supported; extend tests/helpers/simulated-db.ts`)
}

// Lus par `await`, `expect` et l'affichage d'un échec : ils rendent `undefined` au lieu de lever.
const INTROSPECTION = new Set(["then", "toJSON", "asymmetricMatch", "nodeType", "$$typeof", "constructor"])

/** Refuse tout membre que le double ne connaît pas : un opérateur non couvert lève. */
function strict<T extends object>(target: T, name: string): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property === "symbol" || property in object) return Reflect.get(object, property, receiver)
      if (INTROSPECTION.has(property) || property.startsWith("@@") || property.startsWith("__")) return undefined
      return unsupported(`${name}.${property}`)
    },
  })
}

function columnsOf(select: string): string[] | "*" {
  if (select.includes("(")) return tableColumnsOf(select)
  const parts = select.split(",").map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "*")) return "*"
  for (const part of parts) {
    if (!/^[a-z_][a-z0-9_]*$/.test(part)) unsupported(`select "${part}" (embedding, alias or cast)`)
  }
  return parts
}

/** Les colonnes de la table d'un `select` qui embarque ; ses embarquements se lisent par `embedsOf`. */
function tableColumnsOf(select: string): string[] {
  const rest = select.replace(EMBED, "")
  const columns = rest.includes("(") ? "*" : columnsOf(rest)
  if (columns === "*") return unsupported(`select "${select}" (nested embedding, or no column of the table)`)
  return columns
}

/** Les embarquements d'un `select` sur `table`, chacun connu de `LINKS` et à colonnes nommées. */
function embedsOf(table: string, select: string): Embed[] {
  return [...select.matchAll(EMBED)].map(([, relation, inner]) => {
    const link = LINKS[table]?.[relation]
    if (!link) return unsupported(`embedding ${relation}(…) on ${table}`)
    const columns = columnsOf(inner)
    if (columns === "*") return unsupported(`embedding ${relation}(*) on ${table}`)
    return { relation, ...link, columns }
  })
}

/** Chaque ressource embarquée d'une ligne : la ligne liée par sa clé, projetée, ou `null`. */
function embedded(tables: Tables, row: Row, embeds: readonly Embed[]): Row {
  return Object.fromEntries(
    embeds.map(({ relation, column, table, columns }) => {
      const linked = (tables[table] ?? []).find((candidate) => row[column] != null && candidate.id === row[column])
      return [relation, linked ? project(linked, columns) : null]
    }),
  )
}

/** L'embarquement interne d'un `select` sur `table` (E03-S08), connu de `LINKS` et à colonnes nommées. */
function innerEmbedOf(table: string, relation: string, inner: string): Embed {
  const link = LINKS[table]?.[relation]
  if (!link) return unsupported(`embedding ${relation}!inner(…) on ${table}`)
  const columns = columnsOf(inner)
  if (columns === "*") return unsupported(`embedding ${relation}!inner(*) on ${table}`)
  return { relation, ...link, columns }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  // PostgREST lit la valeur d'un filtre au type de sa colonne : `gt.1000` sur un entier compare des
  // nombres. `readPages` passe la clé lue en texte (comptes des retours par pages, E08-S09).
  if (typeof a === "number" && typeof b === "string" && /^-?\d+$/.test(b)) return a - Number(b)
  const [left, right] = [String(a), String(b)]
  return left < right ? -1 : left > right ? 1 : 0
}

function matches(row: Row, filter: SimulatedFilter): boolean {
  // `data->>colonne` (E07-S02) : le champ JSON en texte, comparé comme une colonne.
  if (filter.column.includes("->>")) return matches({ value: pathText(row, filter.column) }, { ...filter, column: "value" })
  const value = row[filter.column] ?? null
  // Opérateurs ajoutés après E01-S07 (E05-S05 : `lt`, `lte`, `or`), lus dans `ADDED_OPS`.
  const added = ADDED_OPS[filter.op]
  if (added) return added(row, filter, value)
  if (filter.op === "is") return value === filter.value
  if (filter.op === "not.is") return value !== filter.value
  // SQL : une comparaison à NULL n'est jamais vraie.
  if (value === null) return false
  switch (filter.op) {
    case "eq":
      return value === filter.value
    case "in":
      return Array.isArray(filter.value) && filter.value.includes(value)
    case "gt":
      return compare(value, filter.value) > 0
    case "gte":
      return compare(value, filter.value) >= 0
  }
}

/**
 * `colonne->>champ` (E07-S02) : le champ d'un objet JSON en texte, comme PostgREST le lit (`->>`) ;
 * `null` sans objet ou sans champ. La file de travail filtre ainsi l'état d'une ligne (`data->>statut`).
 */
function pathText(row: Row, path: string): string | null {
  const [column, field] = path.split("->>")
  const json = row[column]
  const value = json !== null && typeof json === "object" && !Array.isArray(json) ? Reflect.get(json, field) : undefined
  if (value === undefined || value === null) return null
  return typeof value === "object" ? JSON.stringify(value) : String(value)
}

/** Ordre de Postgres : NULL en dernier en croissant, en premier en décroissant. */
function sorted(rows: Row[], orders: Query["orders"]): Row[] {
  const nullable = (a: unknown, b: unknown) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : compare(a, b))
  return [...rows].sort((a, b) => {
    for (const { column, ascending } of orders) {
      const order = nullable(a[column], b[column])
      if (order !== 0) return ascending ? order : -order
    }
    return 0
  })
}

function project(row: Row, columns: string[] | "*"): Row {
  const picked = columns === "*" ? row : Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))
  return structuredClone(picked)
}

function asRows(values: Row | Row[] | undefined): Row[] {
  const list = values === undefined ? [] : Array.isArray(values) ? values : [values]
  return list.map((value) => structuredClone(value))
}

/** Les lignes que la requête lit ou touche, écriture faite. */
function run(rows: Row[], query: Query): Row[] {
  const matched = () => rows.filter((row) => query.filters.every((filter) => matches(row, filter)))
  switch (query.op) {
    case "select":
      return matched()
    case "insert": {
      const inserted = asRows(query.values)
      rows.push(...inserted)
      return inserted
    }
    case "update": {
      const updated = matched()
      const [values] = asRows(query.values)
      for (const row of updated) Object.assign(row, structuredClone(values))
      return updated
    }
    case "delete": {
      const removed = matched()
      for (const row of removed) rows.splice(rows.indexOf(row), 1)
      return removed
    }
  }
}

function shaped(data: Row[] | null, cardinality: Query["cardinality"]): Result {
  if (data === null || cardinality === "many") return { data, error: null }
  if (cardinality === "single" && data.length !== 1) {
    return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }
  }
  if (data.length > 1) return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple rows returned" } }
  return { data: data[0] ?? null, error: null }
}

/**
 * Une colonne d'identifiant (`id`, `*_id` : uuid ou entier) : PostgREST refuse une chaîne vide en
 * `22P02` avant d'exécuter la requête (vu en E03-S03 : une pagination par clé partait de `gt("id", "")`,
 * passée sur cette base simulée, qui compare des chaînes, et refusée par le projet).
 */
const IDENTIFIER = /^(id|.+_id)$/

function emptyIdentifier(filters: SimulatedFilter[]): boolean {
  return filters.some((filter) => IDENTIFIER.test(filter.column) && (filter.value === "" || (Array.isArray(filter.value) && filter.value.includes(""))))
}

/**
 * Les lignes d'une jointure interne (E03-S08) : chaque ligne et sa ligne liée, dont les colonnes se
 * filtrent et se trient sous leur nom `relation.colonne` ; une ligne sans ligne liée est écartée, comme
 * PostgREST le fait d'un `!inner`.
 */
function innerRows(tables: Tables, table: string, query: Query, inner: Embed): Row[] {
  const joined = (tables[table] ?? []).flatMap((row) => {
    const linked = (tables[inner.table] ?? []).find((candidate) => row[inner.column] != null && candidate.id === row[inner.column])
    if (!linked) return []
    const flat: Row = { ...row, ...Object.fromEntries(Object.entries(linked).map(([key, value]) => [`${inner.relation}.${key}`, value])) }
    return query.filters.every((filter) => matches(flat, filter)) ? [flat] : []
  })
  const bound = Math.min(query.limit ?? SERVER_MAX_ROWS, SERVER_MAX_ROWS)
  return sorted(joined, query.orders)
    .slice(0, bound)
    .map((flat) => ({
      ...project(flat, query.columns ?? "*"),
      [inner.relation]: Object.fromEntries(inner.columns.map((name) => [name, flat[`${inner.relation}.${name}`] ?? null])),
    }))
}

function execute(context: Context, table: string, query: Query): Result {
  const call: SimulatedCall = { kind: "table", table, op: query.op, filters: [...query.filters] }
  // Un comptage se lit `count: true` dans l'espion (E07-S01) : un refus « sans lecture des lignes » s'y voit.
  if (query.count) Object.assign(call, { count: true })
  if (query.values !== undefined) call.values = structuredClone(query.values)
  context.calls.push(call)
  context.options.meanwhile?.(call, context.tables)
  const failure = context.options.fail?.(call)
  if (failure) return { data: null, error: failure }
  if (emptyIdentifier(query.filters)) return { data: null, error: { code: "22P02", message: "invalid input syntax" } }
  const { defaults } = context.options
  if (query.op === "insert" && defaults) query.values = asRows(query.values).map((row) => defaults(table, row))
  if (query.inner) return shaped(innerRows(context.tables, table, query, query.inner), query.cardinality)
  const rows = (context.tables[table] ??= [])
  if (query.count) return counted(run(rows, query), query)
  const bound = query.op === "select" ? Math.min(query.limit ?? SERVER_MAX_ROWS, SERVER_MAX_ROWS) : (query.limit ?? undefined)
  const affected = sorted(run(rows, query), query.orders).slice(0, bound)
  const { embeds, columns } = query
  if (embeds && embeds.length > 0 && columns !== null) {
    return shaped(affected.map((row) => ({ ...project(row, columns), ...embedded(context.tables, row, embeds) })), query.cardinality)
  }
  return shaped(query.columns === null ? null : affected.map((row) => project(row, query.columns ?? "*")), query.cardinality)
}

function noOptions(name: string, options: unknown): void {
  if (options !== undefined) unsupported(`${name} options`)
}

/** Le filtre ajouté par E01-S07c : chaque préfixe de `like` porté (`not` passe par les filtres, E03-S02). */
function extraMatches(row: Row, query: Query): boolean {
  return (query.likes ?? []).every(({ column, prefix }) => {
    const value = row[column]
    return typeof value === "string" && value.startsWith(prefix)
  })
}

/** `like` : un préfixe littéral suivi de `%` seulement, `\` échappant `\`, `%` et `_` (`server/teams.ts`). */
function likePrefix(pattern: string): string {
  const literal = /^((?:\\[\\%_]|[^\\%_])*)%$/.exec(pattern)
  if (!literal) return unsupported(`like("${pattern}") other than a literal prefix`)
  return literal[1].replace(/\\([\\%_])/g, "$1")
}

/**
 * Une lecture filtrée par `like` (E01-S07c), lue comme toute autre lecture sur les seules lignes qui
 * remplissent ce filtre ; une écriture avec `like` lève.
 */
function executeExtended(context: Context, table: string, query: Query): Result {
  if (query.op !== "select") return unsupported(`${query.op} with like()`)
  const view = (context.tables[table] ?? []).filter((row) => extraMatches(row, query))
  return execute({ ...context, tables: { ...context.tables, [table]: view } }, table, query)
}

type RpcPaging = { used: boolean; filters: SimulatedFilter[]; orders: Query["orders"]; limit: number | null }

/** Les lignes d'une fonction lue par pages (`readPages`) : filtres, ordre et borne, 1 000 au plus comme PostgREST. */
function pageOf(data: unknown, paging: RpcPaging): Row[] {
  if (!Array.isArray(data)) return unsupported("paging a function that returns no rows")
  const kept = data.filter((row: Row) => paging.filters.every((filter) => matches(row, filter)))
  return sorted(kept, paging.orders).slice(0, Math.min(paging.limit ?? SERVER_MAX_ROWS, SERVER_MAX_ROWS))
}

/** `{ count: "exact", head? }` seulement (E07-S01) : un autre comptage ou une autre option lève. */
function countOptions(options: unknown): { count: true; head: boolean } | null {
  if (options === null || typeof options !== "object" || !("count" in options)) return null
  const others = Object.keys(options).filter((key) => key !== "count" && key !== "head")
  if (options.count !== "exact" || others.length > 0) return unsupported(`select options ${JSON.stringify(options)}`)
  return { count: true, head: "head" in options && options.head === true }
}

/**
 * Réponse d'un comptage (E07-S01) : `count` = toutes les lignes filtrées, sans la borne de
 * `SERVER_MAX_ROWS` (le comptage de PostgREST porte sur la requête entière) ; lignes rendues sous la
 * borne, aucune avec `head`.
 */
function counted(matched: Row[], query: Query): Result & { count: number } {
  const bound = Math.min(query.limit ?? SERVER_MAX_ROWS, SERVER_MAX_ROWS)
  const data = query.head ? null : sorted(matched, query.orders).slice(0, bound).map((row) => project(row, query.columns ?? "*"))
  return { data, error: null, count: matched.length }
}

function tableQuery(context: Context, table: string) {
  const query: Query = {
    op: "select",
    started: false,
    columns: null,
    filters: [],
    orders: [],
    limit: null,
    cardinality: "many",
  }
  const start = (op: Query["op"], values?: Row | Row[]) => {
    if (query.started) unsupported(`${op} after ${query.op}`)
    Object.assign(query, { op, values, started: true })
  }
  const filter = (op: FilterOp) => (column: string, value: unknown) => {
    if (op === "in" && !Array.isArray(value)) unsupported(`in("${column}") without an array`)
    query.filters.push({ column, op, value })
    return builder
  }
  // Un opérateur ajouté par E05-S05 : `FilterOp` d'E01-S07 ne s'élargit pas sans retirer sa ligne, il y
  // entre donc par assertion, et `matches` le lit dans `ADDED_OPS`.
  const addedFilter = (op: "lt" | "lte") => (column: string, value: unknown) => {
    query.filters.push({ column, op: op as string as FilterOp, value })
    return builder
  }
  const builder = strict(
    {
      select(columns = "*", options?: unknown) {
        // Un comptage (`count: "exact"`, E07-S01) : mêmes filtres, le nombre en plus des lignes.
        const counting = countOptions(options)
        if (counting) {
          Object.assign(query, counting)
          if (!query.started) start("select")
          query.columns = columnsOf(columns)
          return builder
        }
        noOptions("select", options)
        if (!query.started) start("select")
        const inner = INNER_EMBED.exec(columns)
        if (inner) {
          query.inner = innerEmbedOf(table, inner[1], inner[2])
          query.columns = columnsOf(columns.slice(0, inner.index))
          return builder
        }
        query.embeds = embedsOf(table, columns)
        query.columns = columnsOf(columns)
        return builder
      },
      insert(values: Row | Row[], options?: unknown) {
        noOptions("insert", options)
        start("insert", values)
        return builder
      },
      update(values: Row, options?: unknown) {
        noOptions("update", options)
        start("update", values)
        return builder
      },
      delete(options?: unknown) {
        noOptions("delete", options)
        start("delete")
        return builder
      },
      // `upsert(ligne, { onConflict })` (E08-S03, `activateConnector`) : la mise à jour de la ligne de même
      // clé, sinon une insertion ; l'espion la voit sous l'une ou l'autre. Une autre option lève.
      upsert(values: Row, options: { onConflict: string }) {
        const { onConflict, ...others } = options
        if (Object.keys(others).length > 0) unsupported(`upsert options ${Object.keys(others).join(", ")}`)
        const keys = onConflict.split(",").map((key) => key.trim())
        const existing = (context.tables[table] ?? []).some((row) => keys.every((key) => row[key] === values[key]))
        start(existing ? "update" : "insert", values)
        if (existing) for (const key of keys) query.filters.push({ column: key, op: "eq", value: values[key] })
        return builder
      },
      like(column: string, pattern: string) {
        query.likes = [...(query.likes ?? []), { column, prefix: likePrefix(pattern) }]
        return builder
      },
      eq: filter("eq"),
      in: filter("in"),
      is: filter("is"),
      gt: filter("gt"),
      gte: filter("gte"),
      // Bornes d'une clé et union de la portée (E05-S05, lecture du journal) : `or` au premier niveau seulement.
      lt: addedFilter("lt"),
      lte: addedFilter("lte"),
      or(expression: string, options?: unknown) {
        noOptions("or", options)
        query.filters.push(orFilter(expression))
        return builder
      },
      // `not(colonne, "is", null)` seulement : la colonne n'est pas nulle (bonus d'usage, E03-S02).
      not(column: string, operator: string, value: unknown) {
        if (operator !== "is") unsupported(`not("${column}", "${operator}")`)
        query.filters.push({ column, op: "not.is", value })
        return builder
      },
      order(column: string, options: { ascending?: boolean } = {}) {
        const { ascending, ...rest } = options
        if (Object.keys(rest).length > 0) unsupported(`order options ${Object.keys(rest).join(", ")}`)
        query.orders.push({ column, ascending: ascending ?? true })
        return builder
      },
      limit(count: number, options?: unknown) {
        noOptions("limit", options)
        query.limit = count
        return builder
      },
      single() {
        query.cardinality = "single"
        return builder
      },
      maybeSingle() {
        query.cardinality = "maybeSingle"
        return builder
      },
      then<T1 = Result, T2 = never>(
        onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
        onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ): Promise<T1 | T2> {
        if (!query.started) {
          start("select")
          query.columns = "*"
        }
        if (query.likes) {
          return Promise.resolve()
            .then(() => executeExtended(context, table, query))
            .then(onFulfilled, onRejected)
        }
        return Promise.resolve()
          .then(() => execute(context, table, query))
          .then(onFulfilled, onRejected)
      },
    },
    `from("${table}")`,
  )
  return builder
}

function rpcCall(context: Context, name: string, args: Record<string, unknown> = {}, options?: unknown) {
  noOptions("rpc", options)
  // Une fonction lue par pages (`readPages`, E01-S07c) : `order`, `gt` et `limit` sur ses lignes.
  const paging: RpcPaging = { used: false, filters: [], orders: [], limit: null }
  return strict(
    {
      order(column: string, orderOptions?: unknown) {
        noOptions("rpc order", orderOptions)
        paging.used = true
        paging.orders.push({ column, ascending: true })
        return this
      },
      gt(column: string, value: unknown) {
        paging.used = true
        paging.filters.push({ column, op: "gt", value })
        return this
      },
      limit(count: number, limitOptions?: unknown) {
        noOptions("rpc limit", limitOptions)
        paging.used = true
        paging.limit = count
        return this
      },
      then<T1 = Result, T2 = never>(
        onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
        onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ): Promise<T1 | T2> {
        return Promise.resolve()
          .then((): Result => {
            const call: SimulatedCall = { kind: "rpc", name, args: structuredClone(args) }
            context.calls.push(call)
            const failure = context.options.fail?.(call)
            if (failure) return { data: null, error: failure }
            const handler = context.options.rpc?.[name]
            if (!handler) return unsupported(`rpc("${name}") without a handler`)
            if (paging.used) return { data: pageOf(structuredClone(handler(args, context.tables)), paging), error: null }
            return { data: structuredClone(handler(args, context.tables)), error: null }
          })
          // Comme PostgREST, une fonction rend 1 000 lignes au plus, lue par pages ou non (E01-S07c).
          .then((result): Result => (Array.isArray(result.data) ? { ...result, data: result.data.slice(0, SERVER_MAX_ROWS) } : result))
          .then(onFulfilled, onRejected)
      },
    },
    `rpc("${name}")`,
  )
}

/** Une page seule, que `readPages` lit : ordre et borne sans effet. */
type OnePage = PromiseLike<{ data: unknown; error: unknown }> & { order(column: string): OnePage; limit(count: number): OnePage }

/**
 * La réponse d'une fonction lue par pages (`readPages`, `server/errors.ts`) dans un double écrit à la
 * main avant la base simulée (E01-S07c) : une seule page ; `order` et `limit` sans effet, `gt` (page
 * suivante) lève. La factorisation de ces doubles (M02) les remplace par la base simulée.
 */
export function onePage(result: { data: unknown; error: unknown }): OnePage {
  const page: OnePage = strict(
    {
      order: () => page,
      limit: () => page,
      then<T1 = typeof result, T2 = never>(
        onFulfilled?: ((value: typeof result) => T1 | PromiseLike<T1>) | null,
        onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ): Promise<T1 | T2> {
        return Promise.resolve(result).then(onFulfilled, onRejected)
      },
    },
    "onePage",
  )
  return page
}

/**
 * Tables vivantes d'une base simulée, que ses écritures modifient (E03-S03) : un test d'écriture y lit
 * l'état laissé, et un `fail` y pose une écriture concurrente. Clé : `calls`, propre à chaque base.
 * Tenues hors de `SimulatedDb`, ce fichier ne recevant que des lignes ajoutées.
 */
const LIVE_TABLES = new WeakMap<SimulatedCall[], Tables>()

export function liveTables(simulated: SimulatedDb): Tables {
  const tables = LIVE_TABLES.get(simulated.calls)
  if (!tables) throw new Error("liveTables: not a simulated database")
  return tables
}

/**
 * Une base simulée sur une copie de `tables` : chaque appel repart de ses propres tables, que les
 * écritures modifient.
 */
export function simulatedDb(options: SimulatedDbOptions = {}): SimulatedDb {
  const context: Context = { tables: structuredClone(options.tables ?? {}), calls: [], options }
  const auth = strict(
    {
      async signInWithOtp(args: unknown) {
        context.calls.push({ kind: "auth", name: "signInWithOtp", args: structuredClone(args) })
        return options.auth?.signInWithOtp?.(args) ?? { data: { user: null, session: null }, error: null }
      },
    },
    "auth",
  )
  const db = strict(
    {
      from: (table: string) => tableQuery(context, table),
      rpc: (name: string, args?: Record<string, unknown>, rpcOptions?: unknown) => rpcCall(context, name, args, rpcOptions),
      auth,
    },
    "db",
  )
  LIVE_TABLES.set(context.calls, context.tables)
  // Le double ne couvre que le sous-ensemble du client que `server/` utilise : le type complet de
  // supabase-js n'a pas de sens ici.
  return { db: db as unknown as PlatformDb, calls: context.calls }
}

// ------------------------------------------------------------------ Opérateurs ajoutés (E05-S05)
// `lt` et `lte` bornent une clé (lecture du journal par pages, fenêtre gelée) ; `or` porte la portée
// du journal (« ses lignes, ou celles des équipes qu'on mène », H74) : des conditions `colonne.op.valeur`
// au premier niveau, sans `and(…)` imbriqué ni `not.` (un tel filtre lève, jamais ignoré).

type AddedMatch = (row: Row, filter: SimulatedFilter, value: unknown) => boolean

const ADDED_OPS: Partial<Record<string, AddedMatch>> = {
  lt: (_row, filter, value) => value !== null && compare(value, filter.value) < 0,
  lte: (_row, filter, value) => value !== null && compare(value, filter.value) <= 0,
  or: (row, filter) => Array.isArray(filter.value) && filter.value.some((condition: SimulatedFilter) => matches(row, condition)),
}

/** Les conditions d'un `or` : séparées par les virgules hors parenthèses (`in.(a,b)` en garde une). */
function orParts(expression: string): string[] {
  const parts = [""]
  let depth = 0
  for (const char of expression) {
    if (char === "," && depth === 0) {
      parts.push("")
      continue
    }
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    parts[parts.length - 1] += char
  }
  return parts
}

const OR_CONDITION = /^([a-z_][a-z0-9_]*)\.(eq|in|is|gt|gte|lt|lte)\.(.+)$/

/** La valeur d'une condition, comme PostgREST la lit : liste pour `in`, `null` ou booléen pour `is`, nombre pour une borne. */
function orValue(op: string, raw: string): unknown {
  if (op === "in") return raw.replace(/^\(|\)$/g, "").split(",")
  if (op === "is") return raw === "null" ? null : raw === "true"
  return ["gt", "gte", "lt", "lte"].includes(op) && /^-?\d+$/.test(raw) ? Number(raw) : raw
}

function orFilter(expression: string): SimulatedFilter {
  const conditions = orParts(expression).map((part) => {
    const match = OR_CONDITION.exec(part)
    if (!match) return unsupported(`or condition "${part}"`)
    const [, column, op, raw] = match
    // L'expression ne garde que les opérateurs connus de `matches` et d'`ADDED_OPS` : le texte lu en est un.
    return { column, op: op as FilterOp, value: orValue(op, raw) }
  })
  // Même assertion que `addedFilter` : l'opérateur ajouté n'est pas dans `FilterOp` d'E01-S07.
  return { column: "or", op: "or" as string as FilterOp, value: conditions }
}
