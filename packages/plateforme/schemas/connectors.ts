// Schémas des services connecteurs (E04-S01) : activer ou désactiver un connecteur, lister ses
// comptes utilisables, créer et désactiver un compte. Sans ce fichier, `activateConnector`,
// `listUsableAccounts`, `createAccount` et `disableAccount` n'auraient pas de validation partagée,
// que les écrans d'E08-S03 reprendront (forms-patterns.md § Principe, H02). `zod/v4`, comme tout
// schemas/ (P1). Les arguments des fonctions `mail.*` restent dans `server/connectors/simulated/`.
import * as z from "zod/v4"

/** La contrainte de `connector_activations.connector` (E01-S06). */
const CONNECTOR_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/

const ACCOUNT_MODES = ["simule", "sandbox", "reel"] as const

const ACCOUNT_OWNER_KINDS = ["org", "team", "user"] as const

const connectorNameSchema = z
  .string()
  .trim()
  .regex(CONNECTOR_NAME_PATTERN, "Connector: lowercase letters, digits and _, starting with a letter, 40 characters max, e.g. mail")

/** Libellé rogné, 1 à 80 caractères ; unique sans casse dans l'organisation (index d'E01-S06, N12). */
const accountLabelSchema = z.string().trim().min(1).max(80)

/** `simule` seulement en V1 (H85) : `sandbox` et `reel` arrivent avec le service connecteurs. */
const accountModeSchema = z.enum(ACCOUNT_MODES)

export type AccountMode = z.infer<typeof accountModeSchema>

/** Le connecteur visé : l'activer, le désactiver, lister ses comptes utilisables. */
export const connectorRefSchema = z.object({ connector: connectorNameSchema })

/**
 * `team_id` est exigé pour un compte d'équipe et refusé ailleurs. Un compte personnel est celui de
 * la personne qui le crée : aucun champ ne désigne quelqu'un d'autre (N15). Une porte qui reçoit un
 * slug d'équipe (MCP admin, E08-S06) le résout en `team_id` avant d'appeler le service.
 */
export const createAccountSchema = z
  .object({
    connector: connectorNameSchema,
    owner_kind: z.enum(ACCOUNT_OWNER_KINDS),
    team_id: z.uuid().optional(),
    label: accountLabelSchema,
    mode: accountModeSchema.default("simule"),
  })
  .superRefine((account, context) => {
    if (account.owner_kind === "team" && !account.team_id) {
      context.addIssue({ code: "custom", path: ["team_id"], message: "team_id is required for a team account" })
    }
    if (account.owner_kind !== "team" && account.team_id) {
      context.addIssue({ code: "custom", path: ["team_id"], message: "team_id is only for a team account" })
    }
  })

export const disableAccountSchema = z.object({ account_id: z.uuid() })

/**
 * Un connecteur activable et son état dans l'organisation, tel que le rend `listConnectorsForOrg`
 * (E04-S01) et que le voient l'écran « Connecteurs » (E08-S03) et le MCP admin (E08-S06). Ici, et non
 * dans `server/` : l'écran, qui n'importe pas `server/`, le reçoit tel quel (H02, H03).
 */
export type OrgConnector = {
  connector: string
  state: "active" | "inactive"
  /** Actif : depuis quand ; inactif : `null`. */
  activatedAt: string | null
  /** Actif : qui l'a activé, nommé par `member_directory` (`null` hors de l'annuaire) ; inactif : `null`. */
  activatedBy: { userId: string; name: string | null } | null
  /** `class` : celle du catalogue (`FunctionClass` de `server/catalog/define.ts`), que ce type redit. */
  functions: { name: string; class: "read" | "write" | "sensitive" }[]
}

/**
 * Ce que coûte la désactivation d'un connecteur (E08-S03, AC5 ; repris par `admin_connector`, E08-S06) :
 * ses fonctions, les chemins des procédures publiées qui l'appellent dans un bloc `call` publié, et le
 * nombre de ses comptes, les uns et les autres comptés parmi ceux que l'appelant voit (H123).
 */
export type DeactivationImpact = { functions: string[]; procedures: string[]; accounts: number }

/**
 * Un compte de l'organisation, désactivé compris (E08-S03, AC6) : jamais de secret. Le propriétaire se
 * dit dans la langue de la porte (H05) : l'écran l'écrit en français, d'après son genre et le nom de
 * son équipe.
 */
export type AccountView = {
  id: string
  label: string
  connector: string
  owner: { kind: "org" | "team" | "user"; teamName?: string }
  mode: AccountMode
  status: "active" | "disabled" | "error"
}
