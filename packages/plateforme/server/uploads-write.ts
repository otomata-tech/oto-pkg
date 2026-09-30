// Ce qu'un envoi par lien décide et écrit (E10-S02 lot f : AC-f1, AC-f6 à AC-f8 ; ADR-018 § 4) : la destination,
// décidée à l'émission du lien et relue à l'envoi par les mêmes contrôles ; le contenu, contrôlé (type par l'extension
// du nom, UTF-8 strict, CSV) ; l'écriture par les services d'écran et de `write` (`writeNode`, `storeFile`,
// `importRows`), qui relisent chacun leur droit, jamais recopié du ticket. Sans lui, un fichier déposé par lien
// n'arriverait nulle part. Fichier à part de `uploads.ts` (borne de 300 lignes).
import {
  detectSeparator,
  parseCsv,
  readPageMarkdown,
  type UploadDone,
  type UploadKind,
  type UploadMode,
  type WriteOpBody,
} from "../schemas"
import { fileSizeText } from "../schemas/files"
import { ACCESS_LEVELS, requireNodeLevel } from "./access"
import type { PlatformDb } from "./db"
import { isPlatformError, PlatformError } from "./errors"
import { admittedType, checkSize, requireStore, storeFile } from "./files/service"
import type { Identity } from "./identity"
import { findNode, unknownNode } from "./nodes/lookup"
import { lastSegment } from "./nodes/segments"
import { loadBlocks, loadDraft } from "./nodes/store"
import type { WriteOrigin } from "./nodes/write-result"
import { importRows, inferredHeader, requireCreation } from "./tables/import"
import type { ToolOutput } from "./tool-output"

/** Un ticket consommé (AC-f5) : la personne et son e-mail dans `members`, le `ctx` de l'appel, la destination. */
export type UploadTicket = {
  userId: string
  email: string | null
  ctx: string | null
  kind: UploadKind
  mode: UploadMode
  path: string
  name: string | null
  title: string | null
  summary: string | null
  key: string | null
  baseRevision: number | null
  publish: boolean | null
}

/** Ce qu'un envoi a écrit : le texte que lit `curl` (AC-f8) et les mêmes éléments en champs. */
export type UploadResult = { text: string; data: UploadDone }

/** La destination d'un envoi (AC-f1) : son chemin, son type, son mode, et la révision lue hors création. */
type Target = Pick<UploadTicket, "kind" | "mode" | "path" | "baseRevision">

const NOT_UTF8 = "the file is not UTF-8; convert it first (iconv -f WINDOWS-1252 -t UTF-8, or Get-Content -Encoding Default | Set-Content -Encoding UTF8)"

const KIND_LABELS: Record<string, string> = { page: "page", procedure: "procedure", context: "context page", table: "table" }

/**
 * La destination décidée (AC-f1, AC-f6) : une création, le chemin libre, le parent visible et son écriture, sous les
 * règles de chemin de `write` ; sinon le nœud visible, du genre du type (`page` pour `file` et `md`, `table` pour
 * `csv`), son écriture, et `base_revision` égale à sa révision. Rend le chemin courant ; chaque refus précède toute
 * écriture. Le même contrôle à l'émission du lien et à l'envoi : ce qui a changé entre les deux fait échouer l'envoi.
 */
export async function checkDestination(db: PlatformDb, identity: Identity, target: Target): Promise<string> {
  if (target.mode === "create") {
    // Lu à l'appel : `write` relit le registre, qui importe ce module (précédent : `createTable` de `tables/import.ts`).
    const { checkPath } = await import("./nodes/write")
    checkPath(identity, target.path)
    await requireCreation({ db, identity }, target.path)
    return target.path
  }
  const found = await findNode(db, identity, target.path)
  if (!found) throw unknownNode(target.path, identity.org.prefix)
  const { node } = found
  const wanted = target.kind === "csv" ? "table" : "page"
  if (node.kind !== wanted) {
    const what = target.kind === "csv" ? "a CSV is imported into a table" : "a file or a markdown file goes into a page"
    throw new PlatformError("invalid_arguments", `${node.path} is a ${KIND_LABELS[node.kind] ?? node.kind}: ${what}.`)
  }
  if (found.level < ACCESS_LEVELS.write) await requireNodeLevel(db, identity, { id: node.id, path: node.path }, "write")
  if (target.baseRevision !== node.revision) {
    throw new PlatformError(
      "stale_revision",
      `stale revision: ${node.path} is at revision ${node.revision}, not ${target.baseRevision ?? "none"}. Nothing was written. Read it again, then ask for a new link with base_revision ${node.revision}.`,
      { revision: node.revision },
    )
  }
  return node.path
}

/** Un texte en UTF-8 strict, BOM de tête retiré (AC-f7) ; un octet invalide : le refus qui dit comment convertir. */
function utf8(bytes: Uint8Array): string {
  try {
    // `fatal` : un octet invalide lève ; le BOM de tête est retiré (`ignoreBOM` faux par défaut).
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new PlatformError("invalid_arguments", NOT_UTF8)
  }
}

/** `writeNode`, lu à l'appel : `write` relit le registre, qui importe ce module. */
async function write(db: PlatformDb, identity: Identity, body: Record<string, unknown>, origin: WriteOrigin): Promise<ToolOutput> {
  const { writeNode } = await import("./nodes/write")
  return writeNode(db, identity, body, origin)
}

/** La publication demandée par le ticket, sinon le défaut de `write` (publier, fiche D135). */
const publishOf = (ticket: UploadTicket) => (ticket.publish === null ? {} : { publish: ticket.publish })

/** L'état qu'une écriture de `write` rend : chemin, révision, publiée ou gardée en brouillon (`has_draft`). */
function writtenOf(output: ToolOutput, path: string): Omit<UploadDone, "url"> {
  const data = output.data ?? {}
  return {
    path: typeof data.path === "string" ? data.path : path,
    revision: typeof data.revision === "number" ? data.revision : 0,
    status: data.has_draft === true ? "draft" : "published",
    ...(typeof data.kept_as_text === "number" && data.kept_as_text > 0 ? { kept_as_text: data.kept_as_text } : {}),
  }
}

/** Le dernier bloc du document que `write` modifiera (brouillon ouvert, sinon publié) : un fichier joint va après lui. */
async function lastBlock(db: PlatformDb, nodeId: string): Promise<string | null> {
  const draft = await loadDraft(db, nodeId)
  return (await loadBlocks(db, nodeId, draft ? "draft" : "published")).at(-1)?.id ?? null
}

/**
 * Un fichier (AC-f8) : stockage, type et taille d'abord ; `create` crée la page en brouillon, puis la ligne `files` et l'objet
 * (`storeFile`), puis un bloc `file` à la fin de la page, écrit sous la révision du ticket (HN-E10S02-71) et publié selon
 * `publish`. Un échec du stockage laisse la page créée en brouillon, et le dit.
 */
async function writeFile(db: PlatformDb, identity: Identity, ticket: UploadTicket, bytes: Uint8Array): Promise<Omit<UploadDone, "url">> {
  const name = ticket.name ?? ""
  // Le stockage retiré depuis le lien, le type et la taille : refusés avant la page d'une création.
  requireStore()
  checkSize(name, admittedType(name), bytes.byteLength)
  const origin: WriteOrigin = { kind: "agent", ctx: ticket.ctx }
  let path = ticket.path
  if (ticket.mode === "create") {
    const created = await write(db, identity, { path, kind: "page", title: ticket.title, summary: ticket.summary, publish: false }, origin)
    path = writtenOf(created, path).path
  }
  const found = await findNode(db, identity, path)
  if (!found) throw unknownNode(path, identity.org.prefix)
  const stored = await storeFile(db, identity, { nodeId: found.node.id, name, bytes }).catch((error: unknown) => {
    if (ticket.mode !== "create" || !isPlatformError(error)) throw error
    throw new PlatformError(error.code, `${error.message} The page ${path} was created as an unpublished draft.`, error.details)
  })
  const after = await lastBlock(db, found.node.id)
  const input = { type: "file" as const, data: { file_id: stored.id, name: stored.name, size: stored.size, mime: stored.mime } }
  const op: WriteOpBody = { op: "insert_after", ...(after ? { block: after } : {}), input }
  const base = ticket.mode === "create" ? 0 : ticket.baseRevision
  const output = await write(db, identity, { path, base_revision: base, ops: [op], ...publishOf(ticket) }, origin)
  return { ...writtenOf(output, path), file: { id: stored.id, name: stored.name, size: stored.size } }
}

/**
 * Un `.md` (AC-f7, AC-f8) : UTF-8 strict, `\r\n` et `\r` ramenés à `\n`, son titre `#` retiré du corps comme à l'import
 * d'E10-S01 (`readPageMarkdown`) ; `create` crée la page de ses blocs, `replace` remplace tout le corps, en mode tolérant,
 * sans borne de section, sous la provenance de l'assistant (`origin.file`, `writeNode`).
 */
async function writeMarkdown(db: PlatformDb, identity: Identity, ticket: UploadTicket, bytes: Uint8Array): Promise<Omit<UploadDone, "url">> {
  const page = readPageMarkdown(utf8(bytes), ticket.name ?? `${lastSegment(ticket.path)}.md`)
  if (page.chunks.length === 0) throw new PlatformError("invalid_arguments", "The markdown file holds nothing under its title: nothing was written.")
  // Chaque morceau en tête, du dernier au premier : l'ordre du fichier, en une écriture (`importerUnePage` de l'écran).
  const ops = [...page.chunks].reverse().map((text): WriteOpBody => ({ op: "insert_after", text }))
  const origin: WriteOrigin = { kind: "agent", ctx: ticket.ctx, file: { replace: ticket.mode === "replace" } }
  const body =
    ticket.mode === "create"
      ? { path: ticket.path, kind: "page", title: ticket.title, summary: ticket.summary, ops, ...publishOf(ticket) }
      : { path: ticket.path, base_revision: ticket.baseRevision, ops, ...publishOf(ticket) }
  return writtenOf(await write(db, identity, body, origin), ticket.path)
}

/**
 * Un CSV (AC-f7, AC-f8) : UTF-8 strict, fins de ligne gardées, lu comme `table.import` sans sa borne de 40 000
 * caractères, dans celle de 5 000 lignes (`importRows`) ; `create` crée et publie le tableau, `merge` fusionne sur la
 * clé ; la provenance `import` et « Importé de <nom> ».
 */
async function writeCsv(db: PlatformDb, identity: Identity, ticket: UploadTicket, request: { bytes: Uint8Array; origin: string }): Promise<Omit<UploadDone, "url">> {
  const text = utf8(request.bytes)
  const read = parseCsv(text, detectSeparator(text))
  if ("unclosedQuote" in read) throw new PlatformError("invalid_arguments", `Nothing was written: line ${read.unclosedQuote}: a quote is never closed.`)
  const [headers = [], ...rows] = read.rows
  const header = ticket.mode === "create" ? inferredHeader(headers, rows, ticket.key ?? undefined) : undefined
  const creation = header && ticket.title && ticket.summary ? { create: { title: ticket.title, summary: ticket.summary, header } } : { key: ticket.key ?? undefined }
  const outcome = await importRows(
    { db, identity, ctx: ticket.ctx, origin: request.origin },
    {
      path: ticket.path,
      by: { kind: "agent", ctx: ticket.ctx },
      comment: `Importé de ${ticket.name ?? "upload.link"}`,
      ...creation,
      headers: header ? header.columns.map((column) => column.name) : headers,
      rows,
      lines: read.lines.slice(1),
    },
  )
  const { created, updated, unchanged } = outcome
  return { path: outcome.table.node.path, revision: outcome.table.node.revision, status: "published", rows: { created, updated, unchanged } }
}

/** Le texte brut que lit `curl` (AC-f8) : chemin, révision, état, adresse, et ce que le type ajoute. */
function resultText(done: UploadDone, kind: UploadKind): string {
  const state = done.status === "published" ? "published" : "unpublished draft"
  const rows = done.rows
  return [
    `Uploaded to ${done.path}: revision ${done.revision}, ${state}.`,
    `${kind === "csv" ? "Table" : "Page"}: ${done.url}`,
    ...(done.file ? [`File ${done.file.name} (${fileSizeText(done.file.size)}) attached at the end of the page.`] : []),
    ...(done.kept_as_text ? [`${done.kept_as_text} ${done.kept_as_text === 1 ? "element" : "elements"} kept as text.`] : []),
    ...(rows ? [`${rows.created} row(s) created, ${rows.updated} updated, ${rows.unchanged} unchanged.`] : []),
  ].join("\n")
}

/**
 * Un envoi dont le ticket est servi (AC-f4, étapes 6 à 8) : la destination relue sous l'identité reconstruite du ticket,
 * le contenu contrôlé (corps vide : `invalid_arguments`), puis l'écriture du type. `origin` : l'origine de l'adresse, qui
 * compose l'adresse de la page (« /n/<chemin> » de l'hôte de référence).
 */
export async function writeUpload(db: PlatformDb, identity: Identity, ticket: UploadTicket, request: { bytes: Uint8Array; origin: string }): Promise<UploadResult> {
  await checkDestination(db, identity, ticket)
  if (request.bytes.byteLength === 0) throw new PlatformError("invalid_arguments", "The body is empty: send the file itself (curl --data-binary @<file>).")
  let written: Omit<UploadDone, "url">
  if (ticket.kind === "file") written = await writeFile(db, identity, ticket, request.bytes)
  else if (ticket.kind === "md") written = await writeMarkdown(db, identity, ticket, request.bytes)
  else written = await writeCsv(db, identity, ticket, request)
  const data: UploadDone = { ...written, url: `${request.origin}/n/${written.path}` }
  return { text: resultText(data, ticket.kind), data }
}
