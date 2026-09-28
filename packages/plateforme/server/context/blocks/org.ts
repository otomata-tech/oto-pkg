// Faits de l'organisation dans `context` : nom et domaines de travail (H32). Repris de la maquette
// (`mcp-test/src/proto/services/context.ts` l. 115-119) ; retiré : les sections du guide (→ nœuds Contexte,
// E03-S08). E05-S12 (D109) : plus de bloc « Organisation », une ligne de faits en tête de la partie Tout le monde.
// E05-S13 (AC-2, HN-E05S13-1) : les domaines quittent la ligne de faits ; la description de `context` les garde.
import type { IdentityOrg } from "../../identity"

/**
 * Domaines de travail en une ligne (N6) : `settings.domains` est une chaîne libre ; un tableau de
 * chaînes, qui arrive sérialisé par `org_by_host`, est joint par « , ». Vide ou absent → `null`.
 * Lu par la description de `context` (`mcp/tools.ts`).
 */
export function workDomains(org: Pick<IdentityOrg, "domains">): string | null {
  const raw = org.domains?.trim() ?? ""
  if (raw.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        return parsed.map((item) => item.trim()).filter(Boolean).join(", ") || null
      }
    } catch {
      // Pas un tableau JSON : la chaîne est gardée telle quelle.
    }
  }
  return raw || null
}

/** La ligne de faits de la partie Tout le monde (E05-S12, AC-1, D109) : le nom seul (E05-S13, AC-2). */
export function orgFacts(org: IdentityOrg): string {
  return `Organisation: ${org.name}.`
}
