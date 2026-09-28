// Le code `ctx` (ADR-002 § 2, H27) : émis par `context`, exigé par les cinq autres outils,
// invalidé quand `orgs.rules_version` change. C'est le levier mesuré 9 fois sur 9 au banc (un champ
// requis dont la valeur vient d'un de nos outils) : sans ce module, rien ne force le modèle à
// relire le contexte à chaque conversation.
//
// Repris de la maquette (`mcp-test/src/proto/services/ctx.ts` l. 12-66) : alphabet de Crockford,
// deux essais sur collision, forme vérifiée avant la base, messages. Ajouté : le contrôle de
// l'organisation du code (N13). Retiré : `ProtoError` (→ `PlatformError`, H04).
//
// Face SQL (E01-S10, partie e1a) : chaque opération tient en une transaction (`db.tx`), sous
// l'appelant de la session.
import { randomInt } from "node:crypto"
import { CTX_PATTERN } from "../schemas"
import type { PlatformDb } from "./db"
import { fromDatabaseError, inTransaction, PlatformError } from "./errors"
import type { Identity } from "./identity"

/** Base 32 de Crockford : ni I, L, O, U ; lisible et recopiable par un modèle. */
export const CTX_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export function newCtxCode(): string {
  const pick = () => Array.from({ length: 4 }, () => CTX_ALPHABET[randomInt(CTX_ALPHABET.length)]).join("")
  return `${pick()}-${pick()}`
}

export function missingCtxMessage(prefix: string): string {
  return `Missing or unknown ctx. Call ${prefix}_context first and pass its ctx code.`
}

export function staleCtxMessage(prefix: string): string {
  return `context has changed: call ${prefix}_context again with the same request, then retry this call.`
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
 * Crée le code de la conversation, à la version des règles lue maintenant, sous RLS, en une
 * transaction. Un code déjà pris n'est pas écrit (`on conflict do nothing`) : l'essai suivant en tire
 * un autre, sans erreur qui arrêterait la transaction.
 */
export async function issueCtx(
  db: PlatformDb,
  identity: Identity,
  request: { host: string | null; userAgent: string | null },
): Promise<string> {
  return inTransaction(db, "issueCtx", async (sql) => {
    const [org] = await sql<{ rules_version: number }[]>`select rules_version from platform.orgs where id = ${identity.org.id}`.catch((error) => {
      throw fromDatabaseError(error, "issueCtx: orgs")
    })
    // L'organisation de l'identité, que la RLS ne montrerait plus : ce que rendait `.single()` sans ligne.
    if (!org) throw new PlatformError("not_found", "Not found.")
    // 32^8 codes : une collision est improbable, deux de suite impossibles en pratique.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const code = newCtxCode()
      const inserted = await sql`insert into platform.ctx (code, org_id, user_id, rules_version, host, user_agent)
                                 values (${code}, ${identity.org.id}, ${identity.user.id}, ${org.rules_version}, ${request.host}, ${request.userAgent})
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
 * autre personne ou émis sur une autre organisation (`ctx_missing`, N13), ou émis sous d'autres
 * règles (`ctx_stale`). Rend le code normalisé et la signature du host qu'il porte (AC19).
 */
export async function requireCtx(
  db: PlatformDb,
  identity: Identity,
  raw: unknown,
): Promise<{ code: string; host: string | null }> {
  const prefix = identity.org.prefix
  // Forme vérifiée avant la base : un code mal formé, de 100 000 caractères au besoin, ne coûte aucune
  // requête et reçoit la consigne d'appeler context.
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  if (!CTX_PATTERN.test(code)) throw new PlatformError("ctx_missing", missingCtxMessage(prefix))

  return inTransaction(db, "requireCtx", async (sql) => {
    // Les deux lectures partent ensemble ; leurs refus se décident dans l'ordre : le code, puis sa version.
    const [ctx, org] = await Promise.allSettled([
      sql<{ user_id: string; org_id: string; rules_version: number; host: string | null }[]>`select user_id, org_id, rules_version, host
                                                                                              from platform.ctx where code = ${code}`,
      sql<{ rules_version: number }[]>`select rules_version from platform.orgs where id = ${identity.org.id}`,
    ])
    if (ctx.status === "rejected") throw fromDatabaseError(ctx.reason, "requireCtx: ctx")
    const [row] = ctx.value
    if (!row || row.user_id !== identity.user.id || row.org_id !== identity.org.id) {
      throw new PlatformError("ctx_missing", missingCtxMessage(prefix))
    }
    if (org.status === "rejected") throw fromDatabaseError(org.reason, "requireCtx: orgs")
    // L'organisation de l'identité, que la RLS ne montrerait plus : ce que rendait `.single()` sans ligne.
    const [current] = org.value
    if (!current) throw new PlatformError("not_found", "Not found.")
    if (row.rules_version !== current.rules_version) throw new PlatformError("ctx_stale", staleCtxMessage(prefix))
    return { code, host: row.host }
  })
}
