// Le code `ctx` (ADR-002 § 2, H27) : émis par `context`, exigé par les cinq autres outils,
// invalidé quand un des Contextes qu'il a servis change de contenu (E11-S03). C'est le levier
// mesuré 9 fois sur 9 au banc (un champ requis dont la valeur vient d'un de nos outils) : sans ce
// module, rien ne force le modèle à relire le contexte à chaque conversation.
//
// Repris de la maquette (`mcp-test/src/proto/services/ctx.ts` l. 12-66) : alphabet de Crockford,
// deux essais sur collision, forme vérifiée avant la base, messages. Ajouté : le contrôle de
// l'organisation du code (N13). Retiré : `ProtoError` (→ `PlatformError`, H04).
//
// Face SQL (E01-S10, partie e1a) : chaque opération tient en une transaction (`db.tx`), sous
// l'appelant de la session.
import { randomInt } from "node:crypto"
import { CTX_PATTERN } from "../schemas"
import { expectedContextPaths } from "./context/blocks/contexts"
import type { Json } from "./database"
import type { PlatformDb } from "./db"
import { boundedList, fromDatabaseError, inTransaction, PlatformError } from "./errors"
import type { Identity } from "./identity"
import { samePublishedContent } from "./nodes/diff"
import { snapshotBlocks } from "./nodes/store"
import type { Tx } from "./sql"

/** Base 32 de Crockford : ni I, L, O, U ; lisible et recopiable par un modèle. */
export const CTX_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export function newCtxCode(): string {
  const pick = () => Array.from({ length: 4 }, () => CTX_ALPHABET[randomInt(CTX_ALPHABET.length)]).join("")
  return `${pick()}-${pick()}`
}

export function missingCtxMessage(prefix: string): string {
  return `Missing or unknown ctx. Call ${prefix}_context first and pass its ctx code.`
}

/**
 * Le refus d'un code périmé (H27) ; `paths` : les Contextes changés depuis son émission, dans l'ordre des parties,
 * bornés (E11-S03, AC-a5). Sans chemin : un code émis avant la 1.0.1, dont la ligne ne les garde pas.
 */
export function staleCtxMessage(prefix: string, paths: readonly string[] = []): string {
  const changed = paths.length > 0 ? ` (${boundedList(paths)})` : ""
  return `context has changed${changed}: call ${prefix}_context again with the same request, then retry this call.`
}

/** Un Contexte publié à l'un des chemins attendus : son nœud et sa révision (≥ 1). */
type PublishedContext = { id: string; path: string; revision: number }

/**
 * Les Contextes publiés aux chemins attendus de la personne, lus sous l'appelant sans filtre de niveaux
 * (HN-E11S03-7) : l'émission et la garde voient la même chose, un droit changé sans révision n'invalide rien.
 */
function publishedContexts(sql: Tx, identity: Identity, paths: readonly string[]) {
  return sql<PublishedContext[]>`
    select id, path, revision from platform.nodes
     where org_id = ${identity.org.id} and kind = 'context' and status = 'published' and revision >= 1 and path = any(${paths})`
}

/** Ce que garde la ligne `ctx` (AC-a1) : `{<chemin>: <révision>}`, une clé par chemin attendu, 0 sans Contexte publié. */
function keptRevisions(paths: readonly string[], published: readonly PublishedContext[]): Record<string, number> {
  const revisions = new Map(published.map((node) => [node.path, node.revision]))
  return Object.fromEntries(paths.map((path) => [path, revisions.get(path) ?? 0]))
}

/**
 * Les chemins gardés par le code dont le contenu servi a changé (AC-a2 à AC-a4), dans l'ordre de `paths` : un
 * Contexte apparu, retiré, ou republié à un contenu différent ; une republication à l'identique ne compte pas
 * (H28) : les instantanés ne sont lus que pour une clé dont la révision diffère (AC-a8). Un chemin que le code
 * ne garde pas, ou qui n'est plus attendu (équipe rejointe ou quittée), ne compte pas (HN-E11S03-7).
 */
async function changedContexts(sql: Tx, kept: Record<string, unknown>, paths: readonly string[], published: readonly PublishedContext[]): Promise<string[]> {
  const byPath = new Map(published.map((node) => [node.path, node]))
  const differing = paths.filter((path) => path in kept && kept[path] !== (byPath.get(path)?.revision ?? 0))
  const republished = differing.flatMap((path) => {
    const node = byPath.get(path)
    const before = kept[path]
    return node && typeof before === "number" && before >= 1 ? [{ path, node, before }] : []
  })
  if (republished.length === 0) return differing
  const ids = republished.map(({ node }) => node.id)
  const revisions = republished.flatMap(({ node, before }) => [before, node.revision])
  const rows = await sql<{ node_id: string; revision: number; blocks: Json }[]>`
    select node_id, revision, blocks from platform.node_versions where node_id = any(${ids}) and revision = any(${revisions})`
  const snapshot = (id: string, revision: number) => rows.find((row) => row.node_id === id && row.revision === revision)
  const same = new Set(
    republished.flatMap(({ path, node, before }) => {
      const [old, now] = [snapshot(node.id, before), snapshot(node.id, node.revision)]
      return old && now && samePublishedContent(snapshotBlocks(old.blocks), snapshotBlocks(now.blocks)) ? [path] : []
    }),
  )
  return differing.filter((path) => !same.has(path))
}

/**
 * `created_at` du dernier `ctx` de la personne dans l'organisation, ou `null` (E03-S08, AC2, N1) : la
 * borne des nouveautés, lue avant l'émission du code suivant. `org_id` et `user_id` sont posés dans la
 * requête : `ctx_select_member` ouvre à tout membre les `ctx` de son organisation. L'instant est rendu
 * par `to_json`, dans l'écriture qu'avait la lecture de PostgREST (à la microseconde, `+00:00`) : une
 * `Date` du pilote perdrait les microsecondes de la borne.
 */
export async function lastCtxAt(db: PlatformDb, identity: Identity): Promise<string | null> {
  // `at`, pas `created_at` : l'`order by` range alors la colonne de la table, pas son texte JSON.
  const [row] = await inTransaction(db, "lastCtxAt: ctx", (sql) => sql<{ at: string }[]>`select to_json(created_at) as at from platform.ctx
                                     where org_id = ${identity.org.id} and user_id = ${identity.user.id}
                                     order by created_at desc limit 1`)
  return row?.at ?? null
}

/**
 * Crée le code de la conversation, sous RLS, en une transaction : la version des règles (comptée, plus lue
 * par la garde, HN-E11S03-3) et la révision publiée de chaque Contexte attendu (E11-S03, AC-a1), lues
 * ensemble maintenant. Un code déjà pris n'est pas écrit (`on conflict do nothing`) : l'essai suivant en
 * tire un autre, sans erreur qui arrêterait la transaction.
 */
export async function issueCtx(
  db: PlatformDb,
  identity: Identity,
  request: { host: string | null; userAgent: string | null },
): Promise<string> {
  const paths = expectedContextPaths(identity)
  return inTransaction(db, "issueCtx", async (sql) => {
    const [[org], published] = await Promise.all([
      sql<{ rules_version: number }[]>`select rules_version from platform.orgs where id = ${identity.org.id}`.catch((error) => {
        throw fromDatabaseError(error, "issueCtx: orgs")
      }),
      publishedContexts(sql, identity, paths).catch((error) => {
        throw fromDatabaseError(error, "issueCtx: nodes")
      }),
    ])
    // L'organisation de l'identité, que la RLS ne montrerait plus : ce que rendait `.single()` sans ligne.
    if (!org) throw new PlatformError("not_found", "Not found.")
    const contexts = keptRevisions(paths, published)
    // 32^8 codes : une collision est improbable, deux de suite impossibles en pratique.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const code = newCtxCode()
      const inserted = await sql`insert into platform.ctx (code, org_id, user_id, rules_version, contexts, host, user_agent)
                                 values (${code}, ${identity.org.id}, ${identity.user.id}, ${org.rules_version}, ${sql.json(contexts)}, ${request.host}, ${request.userAgent})
                                 on conflict (code) do nothing`.catch((error) => {
        throw fromDatabaseError(error, "issueCtx: ctx")
      })
      if (inserted.count > 0) return code
    }
    console.error("[platform] issueCtx: two ctx code collisions in a row")
    throw new PlatformError("internal", "Internal error.")
  })
}

/**
 * Garde des cinq outils autres que `context`. Refuse un code absent, mal formé, inconnu, d'une
 * autre personne ou émis sur une autre organisation (`ctx_missing`, N13), ou dont un Contexte gardé a
 * changé de contenu servi depuis l'émission (`ctx_stale`, E11-S03, ADR-002 § 2), sauf `staleAllowed`
 * (`feedback`, HN-E11S03-1 : un retour sur la panne n'exige pas de relire le contexte). Rend le code
 * normalisé et la signature du host qu'il porte (AC19).
 */
export async function requireCtx(
  db: PlatformDb,
  identity: Identity,
  raw: unknown,
  options: { staleAllowed?: boolean } = {},
): Promise<{ code: string; host: string | null }> {
  const prefix = identity.org.prefix
  // Forme vérifiée avant la base : un code mal formé, de 100 000 caractères au besoin, ne coûte aucune
  // requête et reçoit la consigne d'appeler context.
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  if (!CTX_PATTERN.test(code)) throw new PlatformError("ctx_missing", missingCtxMessage(prefix))
  const paths = expectedContextPaths(identity)

  return inTransaction(db, "requireCtx", async (sql) => {
    // Les deux lectures partent ensemble (AC-a8) ; leurs refus se décident dans l'ordre : le code, puis ses Contextes.
    const [ctx, current] = await Promise.allSettled([
      sql<{ user_id: string; org_id: string; contexts: Record<string, unknown> | null; host: string | null }[]>`
        select user_id, org_id, contexts, host from platform.ctx where code = ${code}`,
      options.staleAllowed ? Promise.resolve([]) : publishedContexts(sql, identity, paths),
    ])
    if (ctx.status === "rejected") throw fromDatabaseError(ctx.reason, "requireCtx: ctx")
    const [row] = ctx.value
    if (!row || row.user_id !== identity.user.id || row.org_id !== identity.org.id) {
      throw new PlatformError("ctx_missing", missingCtxMessage(prefix))
    }
    if (options.staleAllowed) return { code, host: row.host }
    if (current.status === "rejected") throw fromDatabaseError(current.reason, "requireCtx: nodes")
    // Émis avant la 1.0.1 : la ligne ne dit pas quels Contextes elle a servis (AC-a5, HN-E11S03-4).
    if (row.contexts === null) throw new PlatformError("ctx_stale", staleCtxMessage(prefix))
    const changed = await changedContexts(sql, row.contexts, paths, current.value)
    if (changed.length > 0) throw new PlatformError("ctx_stale", staleCtxMessage(prefix, changed))
    return { code, host: row.host }
  })
}
