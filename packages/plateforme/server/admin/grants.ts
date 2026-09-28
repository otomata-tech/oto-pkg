// Accès plateforme d'une organisation (E08-S02, AC19 ; fiche D2, H73) : accorder un accès à un
// collègue de l'équipe plateforme, révoquer un accès en cours. L'accès est une ligne datée, avec son
// auteur, révoquée par une date, jamais supprimée. Sans ce module, un collègue n'entrerait dans une
// organisation que par l'outillage.
//
// Repris d'Oto (`db/schema/entitlements.py` l. 18-35) : la ligne datée, son auteur, sa révocation
// datée ; retiré : les droits commerciaux.
//
// Face SQL (E01-S10, lot d2) : l'accès en cours lu, puis l'insertion, dans une transaction
// (`inTransaction`, `members.ts`) ; un accès accordé entre les deux se lit par `on conflict do nothing`
// sans ligne, jamais par un `23505` rattrapé (`supabase-patterns.md § Couplage à Supabase (ADR-012)`).
import { platformAccessSchema } from "../../schemas"
import type { PlatformDb } from "../db"
import { inTransaction, invalidInput, PlatformError } from "../errors"
import type { Identity } from "../identity"
import { listPlatformAccess, revokePlatformAccess } from "../members"
import type { Tx } from "../sql"
import { findStaff, requireStaffAdmin } from "./context"

/** Un accès, sa date en texte comme PostgREST la rendait (`to_json`). */
type GrantRow = { id: string; granted_at: string }

/** L'accès en cours d'une personne à l'organisation : un seul par couple (`uq_platform_grants_open`). */
async function openGrant(sql: Tx, identity: Identity, userId: string): Promise<GrantRow | undefined> {
  const [row] = await sql<GrantRow[]>`
    select id, to_json(granted_at) #>> '{}' as granted_at from platform.platform_grants
     where org_id = ${identity.org.id} and user_id = ${userId} and revoked_at is null`
  return row
}

function alreadyGranted(email: string, identity: Identity, since: string | undefined): PlatformError {
  const date = since ? ` (since ${since.slice(0, 10)})` : ""
  return new PlatformError("conflict", `${email} already has a platform access to ${identity.org.slug}${date}.`)
}

/**
 * Accorde un accès plateforme (AC19, N13) : l'appelant administre l'organisation comme membre de
 * l'équipe plateforme, le destinataire en est, sans accès en cours ; décidés avant l'insertion, la
 * policy `platform_grants_insert_staff` n'en étant que la seconde barrière.
 */
export async function grantAccess(
  db: PlatformDb,
  identity: Identity,
  input: unknown,
): Promise<{ id: string; email: string; grantedAt: string }> {
  const parsed = platformAccessSchema.pick({ email: true, reason: true }).safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  requireStaffAdmin(identity, "grant_access")
  const { email, reason } = parsed.data
  const colleague = await findStaff(db, email)
  return inTransaction(db, "grantAccess: platform_grants", async (sql) => {
    const open = await openGrant(sql, identity, colleague.userId)
    if (open) throw alreadyGranted(email, identity, open.granted_at)
    const [granted] = await sql<GrantRow[]>`
      insert into platform.platform_grants (org_id, user_id, granted_by, reason)
      values (${identity.org.id}, ${colleague.userId}, ${identity.user.id}, ${reason || null})
      on conflict do nothing
      returning id, to_json(granted_at) #>> '{}' as granted_at`
    if (!granted) throw alreadyGranted(email, identity, (await openGrant(sql, identity, colleague.userId))?.granted_at)
    return { id: granted.id, email, grantedAt: granted.granted_at }
  })
}

/**
 * Révoque l'accès en cours d'une personne, en deux temps (AC19) : retrouvé par `listPlatformAccess`,
 * révoqué par `revokePlatformAccess` d'E05-S03, qui décident leur droit (administrateur ou équipe
 * plateforme, fiche D2). Son propre accès se révoque aussi (`own`).
 */
export async function revokeAccess(
  db: PlatformDb,
  identity: Identity,
  input: unknown,
): Promise<{ email: string; grantedAt: string; grantedBy: string | null; own: boolean; revoked: boolean }> {
  const parsed = platformAccessSchema.pick({ email: true, confirm: true }).safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const { email, confirm } = parsed.data
  const { accesses } = await listPlatformAccess(db, identity)
  const access = accesses.find((candidate) => candidate.revokedAt === null && candidate.email?.toLowerCase() === email)
  if (!access) throw new PlatformError("not_found", `${email} has no platform access to ${identity.org.slug} in progress.`)
  const summary = { email, grantedAt: access.grantedAt, grantedBy: access.grantedByName, own: access.userId === identity.user.id }
  if (confirm !== true) return { ...summary, revoked: false }
  await revokePlatformAccess(db, identity, access.id)
  return { ...summary, revoked: true }
}
