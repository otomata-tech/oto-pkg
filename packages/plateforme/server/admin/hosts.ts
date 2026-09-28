// Adresses d'une organisation (E08-S02, AC18 ; fiche D14 B) : rattacher ou retirer un hôte de
// `org_domains`, réservé au staff qui administre l'organisation, décidé avant l'écriture (N23). Une
// adresse change l'organisation servie, à l'écran comme à `/api/mcp` : sans ce module, seul
// l'outillage rattacherait une adresse après la création.
//
// Repris d'Oto (`org_store/orgs.py` l. 107-123) : une adresse normalisée, une forme invalide refusée ;
// retiré : la marque dérivée du tenant.
//
// Face SQL (E01-S10, lot d2) : chaque opération dans une transaction (`inTransaction`, `members.ts`) ;
// une adresse prise pendant l'écriture se lit par `on conflict do nothing` sans ligne, jamais par un
// `23505` rattrapé, qui perdrait la transaction (`supabase-patterns.md § Couplage à Supabase (ADR-012)`).
import { hostOpSchema } from "../../schemas"
import type { PlatformDb } from "../db"
import { boundedList, changedMeanwhile, inTransaction, invalidInput, isPlatformError, PlatformError } from "../errors"
import { resolveOrg, type Identity } from "../identity"
import { requireStaffAdmin } from "./context"

export function addressTaken(host: string): PlatformError {
  return new PlatformError("conflict", `Address ${host} already opens another organisation.`)
}

/** Les adresses d'une organisation (`org_domains`), toutes en une lecture, par nom. */
export async function orgHosts(db: PlatformDb, orgId: string): Promise<string[]> {
  const rows = await inTransaction(db, "orgHosts: org_domains", (sql) => sql<{ host: string }[]>`
    select host from platform.org_domains where org_id = ${orgId} order by host`)
  return rows.map((row) => row.host)
}

/** L'organisation servie à cette adresse, ou `null` (`org_by_host`, lisible de tout jeton). */
export async function orgOfHost(db: PlatformDb, host: string): Promise<{ id: string } | null> {
  try {
    return await resolveOrg(db, host)
  } catch (failure) {
    if (isPlatformError(failure) && failure.code === "unknown_org") return null
    throw failure
  }
}

/** Le refus d'une adresse déjà servie, par cette organisation ou par une autre ; `null` si elle est libre. */
async function hostConflict(db: PlatformDb, identity: Identity, host: string): Promise<PlatformError | null> {
  const owner = await orgOfHost(db, host)
  if (!owner) return null
  if (owner.id !== identity.org.id) return addressTaken(host)
  return new PlatformError("conflict", `${host} is already an address of ${identity.org.slug}.`)
}

/** Rattache une adresse (AC18) ; prise entre la lecture et l'écriture, elle est refusée de même. */
export async function addHost(db: PlatformDb, identity: Identity, input: unknown): Promise<{ host: string }> {
  const parsed = hostOpSchema.pick({ host: true }).safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  requireStaffAdmin(identity, "add_host")
  const { host } = parsed.data
  return inTransaction(db, "addHost: org_domains insert", async (sql) => {
    const taken = await hostConflict(db, identity, host)
    if (taken) throw taken
    const inserted = await sql`insert into platform.org_domains (host, org_id) values (${host}, ${identity.org.id}) on conflict do nothing returning host`
    if (inserted.length === 0) throw (await hostConflict(db, identity, host)) ?? addressTaken(host)
    return { host }
  })
}

/**
 * Retire une adresse, en deux temps (AC18) : les adresses de l'organisation sont lues d'abord, et une
 * adresse qui n'est pas à elle est refusée en les nommant, jamais lue dans « aucune ligne supprimée ».
 */
export async function removeHost(
  db: PlatformDb,
  identity: Identity,
  input: unknown,
): Promise<{ host: string; remaining: string[]; removed: boolean }> {
  const parsed = hostOpSchema.pick({ host: true, confirm: true }).safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  requireStaffAdmin(identity, "remove_host")
  const { host, confirm } = parsed.data
  return inTransaction(db, "removeHost: org_domains delete", async (sql) => {
    const hosts = await orgHosts(db, identity.org.id)
    if (!hosts.includes(host)) {
      throw new PlatformError("not_found", `${host} is not an address of ${identity.org.slug}. Its addresses: ${boundedList(hosts) || "none"}.`)
    }
    const remaining = hosts.filter((candidate) => candidate !== host)
    if (confirm !== true) return { host, remaining, removed: false }
    const deleted = await sql`delete from platform.org_domains where host = ${host} and org_id = ${identity.org.id} returning host`
    if (deleted.length === 0) {
      throw changedMeanwhile(
        "removeHost",
        host,
        `The addresses of ${identity.org.slug} changed meanwhile: read them again with admin_org {"op": "get"} and retry.`,
      )
    }
    return { host, remaining, removed: true }
  })
}
