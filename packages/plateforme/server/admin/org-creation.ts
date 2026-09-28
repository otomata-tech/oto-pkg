// Point d'extension de la création d'une organisation (E09-S02, fiche D24) : ce qui est propre à
// l'application hôte (sous-domaines d'une cellule, hébergement) vit chez elle, jamais dans le paquet ;
// sa route le passe à `handleAdminMcp` comme `verifyToken`. Ce module demande à l'application ses
// adresses, les contrôle comme la première adresse d'une création, et lui rend la main une fois
// l'organisation créée ; `createOrg` (`orgs.ts`) l'appelle. À part d'`orgs.ts`, qui passerait sinon
// la borne de lignes d'ESLint. Sans point branché, la création reste celle d'E08-S02.
import * as z from "zod/v4"
import { hostSchema } from "../../schemas"
import type { PlatformDb } from "../db"
import { isPlatformError, PlatformError } from "../errors"
import { addressTaken, orgOfHost } from "./hosts"

/** Une ligne de statut que rend l'application pour une adresse, après la création (AC4). */
export type AddressSetup = { host: string; status: string; line: string }

/** Le point de création que branche l'hôte ; `createOrg` décide tout ce qui est à lui avant de l'appeler. */
export type OrgCreationHook = {
  /**
   * Les adresses que l'application ajoute à la nouvelle organisation, demandées aux deux temps, après
   * les contrôles du service ; lever `PlatformError("invalid_arguments", …)` refuse la création avec
   * ce texte, toute autre exception devient une panne sans son message.
   */
  addresses(input: { slug: string; hosts: string[] }): string[] | Promise<string[]>
  /** Appelé une fois `create_org` réussi, avec toutes les adresses créées : une ligne de statut par adresse. */
  created(input: { slug: string; hosts: string[] }): Promise<AddressSetup[]>
}

/** Les adresses d'une création quand l'application en ajoute (AC2) : toutes, dans l'ordre, et les siennes. */
export type CreationAddresses = { hosts: string[]; added: string[] }

/** Le refus de la première adresse déjà servie par une organisation (`org_by_host`), dans l'ordre ; `null` si toutes sont libres. */
export async function takenAddress(db: PlatformDb, hosts: readonly string[]): Promise<PlatformError | null> {
  for (const address of hosts) if (await orgOfHost(db, address)) return addressTaken(address)
  return null
}

/** Une exception de l'application, servie comme une panne sans son message (H04, AC3). */
function hookFailure(step: string): PlatformError {
  // Ni son message ni sa pile : ils peuvent porter ce que l'application seule doit voir (HN-E09S02-9).
  console.error(`[platform] createOrg: the organisation creation hook failed (${step})`)
  return new PlatformError("internal", "Internal error.")
}

const HOST_LIST = z.array(hostSchema)

/**
 * Les adresses que l'application ajoute (AC2, AC3, AC6), demandées une fois les contrôles du service
 * passés : son refus `invalid_arguments` passe tel quel ; chaque adresse rendue repasse `hostSchema`,
 * doublons retirés, puis le contrôle d'adresse prise, avant toute écriture.
 */
export async function applicationAddresses(
  db: PlatformDb,
  hook: OrgCreationHook,
  slug: string,
  passed: readonly string[],
): Promise<CreationAddresses> {
  let returned: unknown
  try {
    returned = await hook.addresses({ slug, hosts: [...passed] })
  } catch (failure) {
    if (isPlatformError(failure) && failure.code === "invalid_arguments") throw failure
    throw hookFailure("addresses")
  }
  const parsed = HOST_LIST.safeParse(returned)
  if (!parsed.success) throw hookFailure("addresses")
  const added = [...new Set(parsed.data)].filter((address) => !passed.includes(address))
  const taken = await takenAddress(db, added)
  if (taken) throw taken
  return { hosts: [...passed, ...added], added }
}

const SETUP_LINES = z.array(z.object({ host: z.string(), status: z.string(), line: z.string() }))

/**
 * Ce que l'application a fait des adresses créées (AC4) ; `null` quand elle a échoué (AC5) :
 * l'organisation reste créée, et ce qu'elle a levé n'est ni servi ni journalisé.
 */
export async function setupAddresses(hook: OrgCreationHook, slug: string, hosts: readonly string[]): Promise<AddressSetup[] | null> {
  try {
    const parsed = SETUP_LINES.safeParse(await hook.created({ slug, hosts: [...hosts] }))
    if (parsed.success) return parsed.data
    console.error(`[platform] createOrg: ${slug} created, the creation hook gave no status line per address`)
  } catch {
    console.error(`[platform] createOrg: ${slug} created, the creation hook could not finish setting up its addresses`)
  }
  return null
}
