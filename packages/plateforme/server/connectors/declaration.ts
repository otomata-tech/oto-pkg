// La déclaration des connecteurs décrits par l'hôte (`connecteurs-et-comptes.md` § Moteur des connecteurs décrits) :
// l'hôte passe à `registerConnectors` les définitions des connecteurs qu'il utilise, partagés (sortie de la fabrique du
// dépôt `connectors`) ou propres ; le paquet n'en contient aucun. Chaque définition est contrôlée, son schéma compilé,
// puis ses fonctions entrent au catalogue de `call` avec l'origine `connecteur`, exécutées par le moteur (`engine.ts`).
// La liste `platform.connectors` en est tenue : le nom d'un connecteur déclaré s'y ajoute à son premier usage
// (`keepDeclaredConnector`), jamais retiré. Sans ce module, un connecteur réel ne s'ajouterait qu'en code du paquet.
import { compileJsonArguments, checkArguments, type JsonSchemaArguments } from "../catalog/arguments"
import { declaredConnector, declaredConnectors, replaceDeclaredConnectors, type DeclaredConnector } from "../catalog/connector-source"
import { contractNames } from "../catalog/contracts"
import type { CatalogFunction, FunctionContext } from "../catalog/define"
import { CatalogRegistrationError } from "../catalog/erp"
import { catalogFunctions, looksLikeFunction } from "../catalog/registry"
import { issuesText, PlatformError } from "../errors"
import { isJsonObject } from "../json"
import type { Tx } from "../sql"
import type { ConnectorDefinition, ConnectorFunctionDefinition } from "./definition"
import { describedSummary, errorTable, runDescribed, type DescribedCall, type PreparedFunction } from "./engine"

/** La contrainte de `platform.connectors.name`. */
const CONNECTOR_NAME = /^[a-z][a-z0-9_]{0,39}$/
const HEADER_NAME = /^[A-Za-z0-9-]+$/
const LABEL_MAX = 80
const NAME_MAX = 64
const DESCRIPTION_MAX = 1000
const TIMEOUT_MAX_MS = 300_000
const CLASSES = ["read", "write", "sensitive"]
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
const QUERY_ARRAYS = ["repeat", "brackets", "comma"]

const namespaceOf = (name: string): string => name.split(".")[0]
const isPositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0

/** Ce que l'authentification déclarée donne au moteur, ou le problème qui la refuse. */
function authProblem(definition: ConnectorDefinition): { header: string; prefix: string; field: string } | string {
  const auth: Record<string, unknown> = { ...definition.auth }
  const field = auth.kind === "bearer" ? auth.token : auth.kind === "api_key" ? auth.key : undefined
  if (typeof field !== "string") {
    return `${definition.name}: auth ${String(auth.kind)} is not supported; the package runs bearer and api_key over a single credential field.`
  }
  const only = definition.credential
  if (!Array.isArray(only) || only.length !== 1 || only[0]?.name !== field) {
    return `${definition.name}: credential must be the single field that auth names (${field}): an account holds one secret.`
  }
  if (auth.kind === "bearer") return { header: "authorization", prefix: "Bearer ", field }
  if (typeof auth.header !== "string" || !HEADER_NAME.test(auth.header)) return `${definition.name}: auth api_key needs a header name.`
  if (auth.prefix !== undefined && typeof auth.prefix !== "string") return `${definition.name}: auth api_key prefix must be text.`
  return { header: auth.header.toLowerCase(), prefix: auth.prefix ?? "", field }
}

/** Le problème du connecteur lui-même (hors fonctions), dans l'ordre de ses champs ; `null` : aucun. */
function connectorProblem(definition: ConnectorDefinition, reserved: ReadonlySet<string>, seen: ReadonlySet<string>): string | null {
  const { name } = definition
  if (typeof name !== "string" || !CONNECTOR_NAME.test(name)) {
    return `Invalid connector name ${JSON.stringify(String(name))}: lowercase ASCII letters, digits and _, starting with a letter, 40 characters at most.`
  }
  if (reserved.has(name)) return `Connector ${name}: the namespace is already served by another source.`
  if (seen.has(name)) return `Duplicate connector ${name} in registerConnectors.`
  if (typeof definition.label !== "string" || !definition.label.trim() || definition.label.length > LABEL_MAX) return `${name}: label must be 1 to ${LABEL_MAX} characters.`
  if (!isPositiveInteger(definition.timeoutMs) || definition.timeoutMs > TIMEOUT_MAX_MS) return `${name}: timeoutMs must be 1 to ${TIMEOUT_MAX_MS}.`
  if (definition.queryArrays !== undefined && !QUERY_ARRAYS.includes(definition.queryArrays)) return `${name}: queryArrays must be repeat, brackets or comma.`
  if (Object.values(definition.headers ?? {}).some((value) => typeof value !== "string")) return `${name}: constant headers must be text.`
  const limit = definition.rateLimit
  if (limit !== undefined && !(isPositiveInteger(limit.requests) && isPositiveInteger(limit.intervalMs))) {
    return `${name}: rateLimit needs positive integers requests and intervalMs.`
  }
  const errors = Array.isArray(definition.errors) ? definition.errors : null
  const statusOk = (status: unknown) => isPositiveInteger(status) || (Array.isArray(status) && status.length > 0 && status.every(isPositiveInteger))
  if (!errors || errors.some((error) => !statusOk(error?.status) || typeof error.code !== "string" || typeof error.message !== "string")) {
    return `${name}: errors must list {status, code, message}.`
  }
  if (!Array.isArray(definition.functions) || definition.functions.length === 0) return `${name}: needs at least one function.`
  return null
}

/** Les noms d'en-têtes qu'une fonction pose, du connecteur à ses arguments, sans casse. */
function headerNames(definition: ConnectorDefinition, fn: ConnectorFunctionDefinition): string[] {
  return [...Object.keys(definition.headers ?? {}), ...Object.keys(fn.request.constants?.headers ?? {}), ...Object.keys(fn.request.headers)].map((header) =>
    header.toLowerCase(),
  )
}

/** Le type JSON Schema d'un argument (`type`), en liste. */
function typesOf(property: unknown): unknown[] {
  if (!isJsonObject(property)) return []
  return Array.isArray(property.type) ? property.type : [property.type]
}

/** Le problème de la requête d'une fonction ; `null` : aucun. */
function requestProblem(definition: ConnectorDefinition, fn: ConnectorFunctionDefinition, authHeader: string): string | null {
  const spec = fn.request
  if (!isJsonObject(spec) || !METHODS.includes(spec.method) || typeof spec.path !== "string" || !spec.path.startsWith("/")) {
    return `${fn.name}: request needs a method (GET, POST, PUT, PATCH, DELETE) and a path starting with /.`
  }
  if (!isJsonObject(spec.query) || !isJsonObject(spec.body) || !isJsonObject(spec.headers) || !Array.isArray(spec.pathParams)) {
    return `${fn.name}: request needs pathParams, query, body and headers.`
  }
  const properties = isJsonObject(fn.schema.properties) ? fn.schema.properties : {}
  const inPath = [...spec.path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])
  const placed = [...inPath, ...Object.values(spec.query), ...Object.values(spec.body), ...Object.values(spec.headers)]
  const unknown = placed.find((argument) => !Object.hasOwn(properties, argument))
  if (unknown !== undefined) return `${fn.name}: request places ${unknown}, which the schema does not declare.`
  const unlisted = inPath.find((argument) => !spec.pathParams.includes(argument))
  if (unlisted !== undefined) return `${fn.name}: path parameter ${unlisted} is not in pathParams.`
  if (headerNames(definition, fn).includes(authHeader)) return `${fn.name}: a constant or argument header would replace the authentication header ${authHeader}.`
  const encoded = Object.entries(spec.encode ?? {})
  const badEncode = encoded.find(([argument, how]) => how !== "json" || !placed.includes(argument))
  if (badEncode) return `${fn.name}: encode ${badEncode[0]} must be json, on a placed argument.`
  for (const argument of Object.values(spec.query)) {
    if (spec.encode?.[argument] === "json") continue
    const types = typesOf(properties[argument])
    if (types.includes("object")) return `${fn.name}: object argument ${argument} in the query needs encode json.`
    if (types.includes("array") && definition.queryArrays === undefined) return `${fn.name}: list argument ${argument} in the query needs the connector's queryArrays.`
  }
  return null
}

/** L'argument qui porte le curseur (`requestParam`, nom côté API en query ou en corps), ou le problème. */
function cursorArgument(fn: ConnectorFunctionDefinition): string | null | { problem: string } {
  const pagination = fn.pagination
  if (pagination === undefined) return null
  if (!["cursor", "page"].includes(pagination.kind) || typeof pagination.next !== "string" || !isPositiveInteger(pagination.maxPages)) {
    return { problem: `${fn.name}: pagination needs kind cursor or page, next and a positive maxPages.` }
  }
  const argument = fn.request.query[pagination.requestParam] ?? fn.request.body[pagination.requestParam]
  return argument ?? { problem: `${fn.name}: pagination requestParam ${pagination.requestParam} is neither a query nor a body parameter.` }
}

/** Le problème des contrôles (`checks`, `expect`) et du récapitulatif d'une fonction sensible ; `null` : aucun. */
function controlsProblem(fn: ConnectorFunctionDefinition): string | null {
  const codes = fn.refusals.map((refusal) => refusal.code)
  for (const check of fn.checks ?? []) {
    if (check.kind !== "equal_sums" || !codes.includes(check.refusal) || typeof check.items !== "string" || check.fields?.length !== 2) {
      return `${fn.name}: check ${String(check.kind)} is not supported, or names no refusal of the function (equal_sums with items and two fields).`
    }
  }
  for (const expectation of fn.expect ?? []) {
    if (expectation.kind !== "non_empty" || !codes.includes(expectation.refusal) || typeof expectation.path !== "string") {
      return `${fn.name}: expect ${String(expectation.kind)} is not supported, or names no refusal of the function (non_empty with a path).`
    }
  }
  if (fn.class === "sensitive" && (typeof fn.confirm?.summary !== "string" || !fn.confirm.summary.trim())) {
    return `${fn.name}: a sensitive function needs confirm.summary (two-step confirmation).`
  }
  return null
}

/** Le premier problème d'une fonction, puis son schéma compilé ; les examples sont joués contre lui. */
function compiledFunction(definition: ConnectorDefinition, fn: ConnectorFunctionDefinition, seen: ReadonlySet<string>): JsonSchemaArguments | string {
  const { name } = fn
  if (typeof name !== "string" || name.length > NAME_MAX || !looksLikeFunction(name) || namespaceOf(name) !== definition.name || fn.connector !== definition.name) {
    return `Invalid function name ${JSON.stringify(String(name))} in ${definition.name}: expected ${definition.name}.<name> in lowercase ASCII letters, digits and _, ${NAME_MAX} characters at most.`
  }
  if (seen.has(name)) return `Duplicate function ${name} in registerConnectors.`
  if (!CLASSES.includes(fn.class)) return `${name}: class must be read, write or sensitive.`
  if (typeof fn.description !== "string" || !fn.description.trim() || fn.description.length > DESCRIPTION_MAX) return `${name}: description must be 1 to ${DESCRIPTION_MAX} characters.`
  if (!isJsonObject(fn.schema) || fn.schema.type !== "object" || fn.schema.additionalProperties !== false) {
    return `${name}: schema must be a strict object (type object, additionalProperties false): unknown keys are refused, not ignored.`
  }
  if (!Array.isArray(fn.refusals) || fn.refusals.some((refusal) => typeof refusal?.code !== "string" || typeof refusal.message !== "string")) {
    return `${name}: refusals must list {code, when, message}.`
  }
  let schema: JsonSchemaArguments
  try {
    schema = compileJsonArguments(fn.schema)
  } catch (error) {
    return `${name}: schema is not a valid JSON Schema 2020-12 (${error instanceof Error ? error.message : String(error)}).`
  }
  if (!Array.isArray(fn.examples) || fn.examples.length === 0) return `${name}: needs at least one example.`
  for (const [index, example] of fn.examples.entries()) {
    const checked = checkArguments(schema, { ...example?.input })
    if (!checked.success) return `${name}: examples[${index}] does not match the schema (${issuesText(checked.issues)}).`
  }
  return schema
}

/** Les refus que `read` sert : ceux de la fonction, le compte, puis la table du connecteur. */
function refusalLines(definition: ConnectorDefinition, fn: ConnectorFunctionDefinition): string[] {
  return [
    ...fn.refusals.map((refusal) => `${refusal.code}: ${refusal.message}${typeof refusal.when === "number" ? ` (HTTP ${refusal.when})` : ""}`),
    `No ${definition.name} account you can use, or one without its secret: the refusal says whom to ask.`,
    ...definition.errors.map((error) => `${error.code}: ${error.message}`),
  ]
}

/** Le compte de l'appel, résolu par `runCall` pour toute fonction d'origine `connecteur` : sans lui, câblage fautif. */
function describedCall(prepared: PreparedFunction, context: FunctionContext): DescribedCall {
  if (!context.account) {
    console.error(`[platform] call: ${prepared.fn.name} without a resolved account`)
    throw new PlatformError("internal", "Internal error.")
  }
  return { credential: context.credential, accountId: context.account.id }
}

/** Une fonction décrite au contrat du catalogue : origine `connecteur`, exemples sans titre, exécution par le moteur. */
function catalogFunction(prepared: PreparedFunction, schema: JsonSchemaArguments): CatalogFunction {
  const { connector, fn } = prepared
  const summary = fn.confirm?.summary
  return {
    name: fn.name,
    connector: connector.name,
    class: fn.class,
    origin: "connecteur",
    description: fn.description,
    schema,
    examples: fn.examples.map((example) => ({ ...example.input })),
    refusals: refusalLines(connector, fn),
    run: (context, args: Record<string, unknown>) => runDescribed(prepared, describedCall(prepared, context), args),
    summarize: fn.class === "sensitive" && summary !== undefined ? async (_context, args: Record<string, unknown>) => describedSummary(summary, args) : undefined,
  }
}

/** La sonde (`probe`) : une lecture du connecteur, sans argument requis, et des chemins à trouver non vides. */
function probeProblem(definition: ConnectorDefinition): string | null {
  const probe = definition.probe
  if (probe === undefined) return null
  const fn = definition.functions.find((candidate) => candidate.name === probe.function)
  const required = fn && Array.isArray(fn.schema.required) ? fn.schema.required : []
  if (!fn || fn.class !== "read" || required.length > 0 || !Array.isArray(probe.nonEmpty) || probe.nonEmpty.some((path) => typeof path !== "string")) {
    return `${definition.name}: probe must name a read function of the connector without required arguments, and list nonEmpty paths.`
  }
  return null
}

/** Un connecteur contrôlé et préparé ; au premier problème, `CatalogRegistrationError`. */
function declared(definition: ConnectorDefinition, reserved: ReadonlySet<string>, seen: Set<string>): DeclaredConnector {
  const problem = connectorProblem(definition, reserved, seen)
  if (problem) throw new CatalogRegistrationError(problem)
  const { baseUrl } = definition
  if (typeof baseUrl !== "string" || !baseUrl.startsWith("https://") || baseUrl.endsWith("/")) {
    throw new CatalogRegistrationError(`${definition.name}: baseUrl must be an https:// address without a trailing slash.`)
  }
  const auth = authProblem(definition)
  if (typeof auth === "string") throw new CatalogRegistrationError(auth)
  seen.add(definition.name)
  let probe: PreparedFunction | null = null
  const functions = definition.functions.map((fn) => {
    const schema = compiledFunction(definition, fn, seen)
    if (typeof schema === "string") throw new CatalogRegistrationError(schema)
    const cursor = cursorArgument(fn)
    const later = requestProblem(definition, fn, auth.header) ?? (typeof cursor === "object" && cursor !== null ? cursor.problem : null) ?? controlsProblem(fn)
    if (later) throw new CatalogRegistrationError(later)
    seen.add(fn.name)
    const api = { label: definition.label, baseUrl, timeoutMs: definition.timeoutMs, errors: errorTable(definition, fn), rateLimit: definition.rateLimit }
    const prepared: PreparedFunction = { connector: definition, fn, api, auth, cursorArgument: typeof cursor === "string" ? cursor : null }
    if (fn.name === definition.probe?.function) probe = prepared
    return catalogFunction(prepared, schema)
  })
  const problemOfProbe = probeProblem(definition)
  if (problemOfProbe) throw new CatalogRegistrationError(problemOfProbe)
  return { definition, functions, probe }
}

/**
 * Déclare les connecteurs décrits de l'hôte, partagés ou propres (`ConnectorDefinition`), à appeler au montage de
 * chaque route qui monte une porte du paquet, comme `registerFunctions`. Toute la liste est contrôlée d'abord : nom du
 * connecteur (celui de `platform.connectors`), espace de noms libre, doublon, libellé, adresse, délai, authentification
 * (`bearer` ou `api_key`, sur un seul champ de secret), table d'erreurs ; puis chaque fonction : nom, classe,
 * description, schéma strict et compilé (JSON Schema 2020-12), exemples, requête, pagination, contrôles,
 * récapitulatif d'une fonction sensible ; enfin la sonde. Au premier refus, `CatalogRegistrationError` et rien n'est
 * déclaré ; sinon la liste remplace toute la déclaration précédente (un rechargement à chaud ne double rien).
 */
export function registerConnectors(definitions: readonly ConnectorDefinition[]): void {
  const current = new Set(declaredConnectors().flatMap((connector) => connector.functions))
  const others = catalogFunctions().filter((fn) => !current.has(fn))
  const reserved = new Set([...others.map((fn) => fn.name), ...contractNames()].map(namespaceOf))
  const seen = new Set<string>()
  const connectors = definitions.map((definition) => declared(definition, reserved, seen))
  replaceDeclaredConnectors(connectors)
}

/**
 * Tient la liste `platform.connectors` depuis la déclaration : le nom d'un connecteur déclaré et son libellé s'y
 * ajoutent avant la première ligne qui le cite (activation, compte), dans la transaction de cette écriture ; un nom
 * présent ne change pas, et rien n'est jamais retiré. Un connecteur non déclaré (`mail`, natif) n'écrit rien.
 */
export async function keepDeclaredConnector(sql: Tx, name: string): Promise<void> {
  const connector = declaredConnector(name)
  if (!connector) return
  await sql`select platform.declare_connector(${name}, ${connector.definition.label})`
}
