// Client HTTP des connecteurs réels (`connecteurs-et-comptes.md`, H85) : une requête JSON vers l'API d'un tiers, le
// secret du compte en en-tête d'authentification, les en-têtes constants du connecteur, un délai, et la table
// d'erreurs du connecteur traduite en `PlatformError`. Sans lui, chaque connecteur recopierait l'appel, le délai et
// la traduction des statuts ; la fabrique du dépôt `connectors` en reprendra la forme (`auth`, `errors`,
// `timeout_s` de la description). Le secret ne sort jamais d'ici : ni dans un message, ni dans un log, ni comme cause
// d'une erreur ; aucun en-tête n'est journalisé.
import { readBounded } from "../bounded-read"
import { PlatformError, type PlatformErrorCode } from "../errors"

/** Une réponse plus grosse ne se lit pas : le résultat d'un outil tient de toute façon en 45 000 caractères. */
const MAX_ANSWER_BYTES = 4 * 1024 * 1024

/** Une ligne de la table d'erreurs d'un connecteur : le statut du tiers, le code et le message servis. */
export type ApiError = { status: number | readonly number[]; code: PlatformErrorCode; message: string }

/** L'API d'un tiers, telle que sa description la donne. */
export type ConnectorApi = {
  /** Le nom du tiers dans les messages : « Notion ». */
  label: string
  /** Adresse de base, sans barre finale : `https://api.notion.com/v1`. */
  baseUrl: string
  timeoutMs: number
  /** En-têtes constants (version de l'API) ; jamais le secret, posé par le client. */
  headers: Readonly<Record<string, string>>
  errors: readonly ApiError[]
}

export type ApiRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  /** Chemin sous `baseUrl`, barre initiale comprise : `/search`. */
  path: string
  /** Corps JSON ; une clé à `undefined` n'est pas envoyée. */
  body?: Record<string, unknown>
}

/** Ce qu'il faut à `fetch` ici : tests et hôte passent la leur. */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>

function errorOf(api: ConnectorApi, status: number): PlatformError {
  const known = api.errors.find((error) => (typeof error.status === "number" ? error.status === status : error.status.includes(status)))
  if (known) return new PlatformError(known.code, known.message)
  return new PlatformError("upstream_error", `${api.label} answered with an unexpected status (${status}). Retry later.`)
}

/** Une panne de `fetch` (réseau, délai) : une erreur neuve, sans cause, qui n'emporte ni la requête ni le jeton. */
function unreachable(api: ConnectorApi, error: unknown): PlatformError {
  const name = error instanceof Error ? error.name : "unknown"
  console.error(`[platform] connector ${api.label}: request failed (${name})`)
  if (name === "TimeoutError") {
    return new PlatformError("upstream_error", `${api.label} did not answer within ${Math.round(api.timeoutMs / 1000)} s. Retry later.`)
  }
  return new PlatformError("upstream_error", `${api.label} could not be reached. Retry later.`)
}

/**
 * Envoie la requête au tiers avec `Authorization: Bearer <secret>` et rend le JSON de sa réponse. Refus : sans secret,
 * `internal` (le compte réel en a un, `runCall` l'a vérifié) ; statut hors 2xx, celui de la table d'erreurs du
 * connecteur, sinon `upstream_error` ; panne, délai dépassé, réponse trop grosse ou illisible : `upstream_error`.
 */
export async function requestJson(api: ConnectorApi, credential: string | undefined, request: ApiRequest, send: Fetch = fetch): Promise<unknown> {
  if (!credential) {
    console.error(`[platform] connector ${api.label}: called without the secret of a live account`)
    throw new PlatformError("internal", "Internal error.")
  }
  const headers: Record<string, string> = { accept: "application/json", ...api.headers, authorization: `Bearer ${credential}` }
  if (request.body) headers["content-type"] = "application/json"
  let answer: Response
  try {
    answer = await send(`${api.baseUrl}${request.path}`, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(api.timeoutMs),
    })
  } catch (error) {
    throw unreachable(api, error)
  }
  if (!answer.ok) {
    await answer.body?.cancel()
    console.error(`[platform] connector ${api.label}: status ${answer.status}`)
    throw errorOf(api, answer.status)
  }
  let bytes: Uint8Array | null
  try {
    bytes = answer.body ? await readBounded(answer.body, MAX_ANSWER_BYTES, () => null) : new Uint8Array()
  } catch (error) {
    // Le délai court jusqu'à la fin de la lecture du corps.
    throw unreachable(api, error)
  }
  if (bytes === null) throw new PlatformError("upstream_error", `${api.label} sent an answer too large to read. Narrow the request.`)
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    console.error(`[platform] connector ${api.label}: answer is not JSON`)
    throw new PlatformError("upstream_error", `${api.label} sent an unreadable answer. Retry later.`)
  }
}
