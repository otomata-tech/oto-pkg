// Lignes du journal regroupées et montrées (E05-S05, AC3, AC8) : fonctions pures, sans base, que
// partagent l'écran `/journal` et `read journal`. Sans ce module, les deux portes regrouperaient et
// masqueraient chacune à leur façon, et un secret montré par l'une le serait sans que l'autre le voie.
// Ce qu'un lecteur autre que l'auteur ne reçoit pas d'un appel sur l'espace personnel d'autrui (D44, M14),
// ni d'un chemin de cet espace nommé par un message d'erreur (D52, M14b), y est décidé aussi, pour ces deux
// portes et pour l'usage (E08-S09).
//
// Repris d'Oto (`oto_mcp/calllog.py` l. 66-139) : les coupes à 300 caractères par valeur et à 500 pour
// l'erreur, la valeur au-delà de six niveaux convertie en texte puis coupée. Retiré : l'empreinte HMAC
// (« [masked] » suffit à la lecture) et la déclaration des secrets par outil (le masquage par nom de
// clé est celui d'E03-S01, `maskSecretArgs`, rejoué ici).
import type { JournalArgs } from "../schemas"
import { PLATFORM_ERROR_CODES, type PlatformErrorCode } from "./errors"
import type { Identity } from "./identity"
import { clip, cut, MASK_DEPTH, MAX_ERROR_CHARS, maskSecretArgs } from "./journal"

/** Une valeur d'argument montrée : 300 caractères, puis « … » (AC8). */
export const MAX_ARG_CHARS = 300

/** Les colonnes d'une ligne que le regroupement lit. */
export type JournalRow = {
  id: number
  ts: string
  user_id: string | null
  team_id: string | null
  ctx: string | null
  tool: string | null
  target: string | null
  is_error: boolean
  host: string | null
  user_agent: string | null
}

/**
 * Une conversation regroupée, avant les noms et la procédure servie. `contextTarget` : la cible de
 * l'appel `context` visible (procédure servie, sinon la phrase, nulle sans phrase), `undefined` sans
 * appel `context` visible.
 */
export type ConversationGroup = {
  ctx: string
  startedAt: string
  lastAt: string
  userId: string | null
  host: string | null
  contextTarget: string | null | undefined
  calls: number
  errors: number
}

/** `demo_context` → `context` : le nom préfixé (HN-E05S05-6), la forme nue acceptée aussi. */
export function bareTool(tool: string | null, prefix: string): string {
  const name = tool ?? ""
  return name.startsWith(`${prefix}_`) ? name.slice(prefix.length + 1) : name
}

const instant = (ts: string) => Date.parse(ts)

/** Les lignes d'une conversation, dans l'ordre où elles ont été écrites (id croissant, HN-E05S05-10). */
function groupOf(ctx: string, lines: JournalRow[], prefix: string): ConversationGroup {
  const ordered = [...lines].sort((a, b) => a.id - b.id)
  const byTime = [...ordered].sort((a, b) => instant(a.ts) - instant(b.ts))
  const context = ordered.find((line) => bareTool(line.tool, prefix) === "context")
  return {
    ctx,
    startedAt: byTime[0].ts,
    lastAt: byTime[byTime.length - 1].ts,
    userId: ordered[0].user_id,
    // L'hôte : la signature `client@version` du premier appel qui en porte une, sinon son agent (H29).
    host: ordered.find((line) => line.host)?.host ?? ordered.find((line) => line.user_agent)?.user_agent ?? null,
    contextTarget: context ? context.target : undefined,
    calls: ordered.length,
    errors: ordered.filter((line) => line.is_error).length,
  }
}

/**
 * Les conversations des lignes lues (AC3) : une par code `ctx`, les lignes sans `ctx` écartées, le
 * dernier appel le plus récent d'abord (puis le code, pour un ordre stable d'une page à l'autre).
 */
export function groupConversations(rows: readonly JournalRow[], prefix: string): ConversationGroup[] {
  const byCtx = new Map<string, JournalRow[]>()
  for (const row of rows) {
    if (!row.ctx) continue
    const lines = byCtx.get(row.ctx)
    if (lines) lines.push(row)
    else byCtx.set(row.ctx, [row])
  }
  return [...byCtx]
    .map(([ctx, lines]) => groupOf(ctx, lines, prefix))
    .sort((a, b) => instant(b.lastAt) - instant(a.lastAt) || a.ctx.localeCompare(b.ctx))
}

function cutValue(text: string): string {
  return text.length > MAX_ARG_CHARS ? `${clip(text, MAX_ARG_CHARS)}…` : text
}

/** Chaque valeur coupée ; au-delà de `depth` niveaux, le reste devient un texte coupé. */
function trimmed(value: unknown, depth: number): JournalArgs {
  if (typeof value === "string") return cutValue(value)
  if (value === null || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value !== "object") return cutValue(String(value))
  if (depth === 0) return cutValue(JSON.stringify(value))
  if (Array.isArray(value)) return value.map((item) => trimmed(item, depth - 1))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimmed(item, depth - 1)]))
}

type TruncatedArgs = { _truncated: true; head: string }

function isTruncated(value: unknown): value is TruncatedArgs {
  return typeof value === "object" && value !== null && "_truncated" in value && value._truncated === true && "head" in value && typeof value.head === "string"
}

/**
 * Les arguments d'un appel tels que l'écran et `read` les montrent (AC8) : masqués par la fonction
 * d'E03-S01 (H07 : `key` seule reste lisible) à toute profondeur, puis chaque valeur coupée à 300
 * caractères ; au-delà de six niveaux, la valeur est convertie en texte, ses clés secrètes déjà
 * masquées (HN-E05S05-20), puis coupée. Des arguments stockés tronqués (`{ _truncated, head }`,
 * masqués avant la coupe par l'écrivain) montrent leur `head` coupé.
 */
export function displayArgs(value: unknown): JournalArgs {
  if (isTruncated(value)) return { _truncated: true, head: cutValue(value.head) }
  return trimmed(maskSecretArgs(value, Number.POSITIVE_INFINITY), MASK_DEPTH)
}

/** L'erreur d'un appel, coupée à `MAX_ERROR_CHARS` comme à l'écriture (AC7) ; `null` sans erreur. */
export function displayError(text: string | null): string | null {
  return text === null ? null : cut(text, MAX_ERROR_CHARS)
}

// -------------------------------------------------------- L'espace personnel d'autrui (D44, M14)

/** Qui lit le journal : la personne, et le `handle` de son espace personnel (`private/<handle>`, H61) s'il en a un. */
export type JournalReader = { userId: string; handle: string | null }

export function journalReader(identity: Identity): JournalReader {
  return { userId: identity.user.id, handle: identity.member.profile.handle ?? null }
}

/**
 * Le dossier des espaces personnels (H61), puis son ancien nom (D107) : une ligne écrite avant D107 le
 * nomme `perso/`, et un appelant l'écrit encore, ancien chemin qui mène au nouveau (alias) ; les deux se
 * coupent. Tous deux commencent par `p`, que cherche `nextFolder`.
 */
const SPACE_FOLDERS = ["private/", "perso/"] as const
type SpaceFolder = (typeof SPACE_FOLDERS)[number]
/** Un chemin tient en 200 caractères (`nodePathSchema`) : la lecture d'un `handle` s'y borne. */
const PATH_CHARS = 200

/** Le dossier d'espace qui commence à `at` dans `text`, sinon `null` (deux comparaisons bornées). */
function folderAt(text: string, at: number): SpaceFolder | null {
  return SPACE_FOLDERS.find((folder) => text.startsWith(folder, at)) ?? null
}

/**
 * Le prochain début d'un dossier d'espace à partir de `from`, sinon -1 : un `indexOf("p")` qui avance
 * toujours, chaque `p` comparé aux deux dossiers, en temps linéaire (`security-patterns.md § Validation
 * des inputs`), là où deux `indexOf` relancés à chaque tour reliraient la fin du texte.
 */
function nextFolder(text: string, from: number): number {
  for (let at = text.indexOf("p", from); at >= 0; at = text.indexOf("p", at + 1)) if (folderAt(text, at)) return at
  return -1
}

/**
 * L'espace personnel d'un texte qui est `private/<handle>` (ou `perso/<handle>`) ou un chemin dessous :
 * son dossier tel qu'écrit et son `handle`, sinon `null`. Texte du client : lecture ancrée, bornée à la
 * longueur d'un chemin (`security-patterns.md § Validation des inputs`).
 */
function spaceOf(text: string): { folder: SpaceFolder; handle: string } | null {
  const value = text.trimStart()
  const folder = folderAt(value, 0)
  if (folder === null) return null
  const handle = /^[^/\s"\\]+/.exec(value.slice(folder.length, PATH_CHARS))?.[0]
  return handle === undefined ? null : { folder, handle }
}

function handleOf(text: string): string | null {
  return spaceOf(text)?.handle ?? null
}

const listed = (handle: string | null): string[] => (handle === null ? [] : [handle])

/** Les `handle` des chaînes d'un texte JSON coupé qui commencent par un dossier d'espace, par un parcours à la main (`nextFolder`). */
function quotedHandles(text: string): string[] {
  const handles: string[] = []
  for (let at = nextFolder(text, 0); at >= 0; at = nextFolder(text, at + 1)) {
    if (at > 0 && text[at - 1] === '"') handles.push(...listed(handleOf(text.slice(at, at + PATH_CHARS))))
  }
  return handles
}

/** Les `handle` que nomment des arguments stockés : chaque chaîne, à toute profondeur, clés comprises ; le texte d'arguments tronqués. */
function handlesIn(value: unknown): string[] {
  if (isTruncated(value)) return quotedHandles(value.head)
  if (typeof value === "string") return listed(handleOf(value))
  if (value === null || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, item]) => [...listed(handleOf(key)), ...handlesIn(item)])
}

const isOthers = (reader: JournalReader, handle: string | null): handle is string => handle !== null && handle !== reader.handle

/**
 * La cible d'une ligne pour son lecteur : coupée à `private/<handle>` (`perso/<handle>`, le dossier tel
 * qu'écrit) quand elle vise l'espace personnel d'une autre personne et que le lecteur n'est pas l'auteur
 * de la ligne, sinon telle quelle.
 */
export function targetFor(reader: JournalReader, author: string | null, target: string): string {
  const space = author === reader.userId ? null : spaceOf(target)
  return space !== null && isOthers(reader, space.handle) ? `${space.folder}${space.handle}` : target
}

/** Un caractère d'un chemin (`NODE_PATH_PATTERN`, `/` compris) : `private/` qui en suit un est plus bas dans un chemin, pas un espace personnel. */
const PATH_CHAR = /[a-z0-9_/]/
/** Un caractère du mot d'un texte libre : ni blanc, ni `"`, ni `\` (la classe du `handle` de `handleOf`, plus `/`). */
const WORD_CHAR = /[^\s"\\]/
/** Ce qui nomme : lettre, chiffre ou `_` ; la ponctuation qui finit le mot (`,`, `.`, `»`) n'est pas du chemin. */
const NAMING_CHAR = /[\p{L}\p{N}_]/u

/** Ce qu'on coupe d'un message : de `from` à `to` ; la recherche reprend à `next`, après la ponctuation gardée. */
type PathCut = { from: number; to: number; next: number }

/**
 * Le chemin sous l'espace personnel d'autrui qui commence à `at` : un dossier d'espace en tête d'un mot,
 * un `handle` qui n'est pas celui du lecteur (`spaceOf`, `isOthers`), puis la suite du mot ; `null` sans
 * rien dessous.
 */
function othersPath(reader: JournalReader, text: string, at: number): PathCut | null {
  if (at > 0 && PATH_CHAR.test(text[at - 1])) return null
  const space = spaceOf(text.slice(at, at + PATH_CHARS))
  if (space === null || !isOthers(reader, space.handle)) return null
  const from = at + space.folder.length + space.handle.length
  let next = from
  while (next < text.length && WORD_CHAR.test(text[next])) next++
  let to = next
  while (to > from && !NAMING_CHAR.test(text[to - 1])) to--
  return to > from ? { from, to, next } : null
}

/**
 * Le message d'erreur d'une ligne pour son lecteur (D52, M14b) : chaque chemin `private/<handle>/…` (ou
 * `perso/<handle>/…`) d'un espace personnel qui n'est pas le sien coupé à son espace, comme la cible
 * (D44) ; entier pour l'auteur de la ligne. Texte du client : un parcours à la main (`nextFolder`,
 * boucles), en temps linéaire (`security-patterns.md § Validation des inputs`).
 */
export function errorFor(reader: JournalReader, author: string | null, text: string | null): string | null {
  if (text === null || author === reader.userId) return text
  let shown = ""
  let kept = 0
  let at = nextFolder(text, 0)
  while (at >= 0) {
    const cut = othersPath(reader, text, at)
    if (cut) {
      shown += text.slice(kept, cut.from)
      kept = cut.to
    }
    at = nextFolder(text, cut ? cut.next : at + 1)
  }
  return shown + text.slice(kept)
}

/**
 * Les arguments et le message d'erreur d'une ligne ne sont pas servis à son lecteur : il n'en est pas
 * l'auteur, et la ligne vise l'espace personnel d'une autre personne par sa cible, ou par l'un de ses
 * arguments (un appel refusé avant son service n'a pas de cible, un `call` a pour cible sa fonction).
 */
export function hidesContent(reader: JournalReader, line: { user_id: string | null; target: string | null }, args: unknown): boolean {
  if (line.user_id === reader.userId) return false
  if (line.target !== null && isOthers(reader, handleOf(line.target))) return true
  return handlesIn(args).some((handle) => isOthers(reader, handle))
}

/**
 * Le code d'une erreur journalisée (« <code>: <message> », `journalError`), sans son message : un code
 * de la liste fermée H04 (`unavailable_in_v1` compris) ; `null` pour tout autre texte.
 */
export function errorCode(text: string | null): PlatformErrorCode | null {
  return text === null ? null : (PLATFORM_ERROR_CODES.find((code) => text.startsWith(`${code}:`)) ?? null)
}
