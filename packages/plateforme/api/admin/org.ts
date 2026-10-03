// `PATCH admin/org` du tableau de bord (E08-S03, AC3, AC10) et la vue de l'écran « Organisation »
// (AC2), que la page de l'hôte lit aussi. Adaptateur mince : les droits et l'écriture sont dans
// `updateOrg` (E08-S02) ; la route restreint les champs (`orgSettingsFormSchema`), la marque passant
// par `PATCH brand`. La vue est composée ici, non dans `server/` : les six noms d'outils viennent de
// la face `mcp/` (`TOOL_KEYS`), que `server/` n'importe pas (architecture § 3).
import { TOOL_KEYS } from "../../mcp/tools"
import { orgSettingsFormSchema, type OrgView } from "../../schemas"
import { getOrg, updateOrg } from "../../server/admin/orgs"
import { setOpenEntry } from "../../server/open-entry"
import type { PlatformDb } from "../../server/db"
import { invalidInput } from "../../server/errors"
import type { Identity } from "../../server/identity"
import { loadStoredRouting } from "../../server/routing"
import type { Route } from "../handler"

/**
 * L'écran « Organisation » de l'identité (AC2) : la fiche de `getOrg`, les six outils nommés par le
 * préfixe (ADR-002 § 3) et le routage tel qu'il est posé (`null` : jamais réglé). Réservée à qui
 * administre l'organisation, décidé par l'appelant avant elle (la page par `isOrgAdmin`, la route par
 * `updateOrg`) : elle ne décide aucun droit, et pour un autre `getOrg` lirait avant de refuser.
 */
export async function readOrgView(db: PlatformDb, identity: Identity): Promise<OrgView> {
  const [sheet, routing] = await Promise.all([getOrg(db, identity), loadStoredRouting(db, identity.org.id)])
  return {
    name: sheet.name,
    slug: sheet.slug,
    prefix: sheet.prefix,
    tools: TOOL_KEYS.map((key) => `${sheet.prefix}_${key}`),
    hosts: sheet.hosts,
    domains: sheet.domains ?? "",
    routing,
    contact: sheet.contact,
  }
}

export const orgRoute: Route = {
  params: 1,
  fixed: { 0: "org" },
  target: () => "org",
  async handle({ db, identity, body }) {
    const parsed = orgSettingsFormSchema.safeParse(body)
    if (!parsed.success) throw invalidInput(parsed.error)
    await updateOrg(db, identity, parsed.data)
    return { status: 200, data: { org: await readOrgView(db, identity) }, journal: { target: "org" } }
  },
}

/** `PATCH admin/open-entry` : l'entrée sans invitation de l'organisation ; droits et validation dans `setOpenEntry`. */
export const openEntryRoute: Route = {
  params: 1,
  fixed: { 0: "open-entry" },
  target: () => "open-entry",
  async handle({ db, identity, body }) {
    const { data, target, teamId } = await setOpenEntry(db, identity, body)
    return { status: 200, data: { open_entry: data }, journal: { target, teamId } }
  },
}
