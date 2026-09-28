// Mode d'un compte de connecteur (H85) tel que le modèle le lit, et la garde du simulé. Fichier à
// part : la ligne du bloc `team` (`lines.ts`) et le connecteur `mail` simulé en ont besoin, et
// `simulated/mail.ts`, importé par le catalogue, ne peut dépendre des services qui lisent le
// catalogue (l'import serait circulaire).
import type { AccountMode } from "../../schemas"
import { PlatformError } from "../errors"

/** simule → simulated, sandbox → sandbox, reel → live (N8). */
const MODE_LABELS: Record<AccountMode, string> = { simule: "simulated", sandbox: "sandbox", reel: "live" }

/** Mode lu en base (colonne texte sous contrainte `check`) ; une valeur inconnue compte comme réelle. */
export function accountMode(value: string): AccountMode {
  return value === "simule" || value === "sandbox" ? value : "reel"
}

export function modeLabel(mode: AccountMode): string {
  return MODE_LABELS[mode]
}

/**
 * En V1, un connecteur ne court que sur un compte simulé (H85) : un compte réel ou de bac à sable,
 * posé par l'outillage, est refusé avant toute écriture. Même texte que le refus de `call`
 * (E03-S04, AC12).
 */
export function requireSimulated(account: { label: string; mode: AccountMode }): void {
  if (account.mode === "simule") return
  throw new PlatformError(
    "unavailable_in_v1",
    `Account « ${account.label} » is a ${modeLabel(account.mode)} account (mode ${account.mode}): live execution arrives with the connector service in V2. Nothing was sent.`,
  )
}
