// Faits de la personne dans `context` (H31, réduit par P39 à l'identité et à la langue : ton, signature et
// préférences s'écrivent dans le Contexte Privé, E03-S08). Repris de la maquette
// (`mcp-test/src/proto/services/context.ts` l. 102-113) ; retiré : ton et préférences. E05-S12 (D109) : plus
// de bloc « You work for », une ligne de faits en tête de la partie Privé (`contexts.ts`).
import type { Language } from "../../../schemas"
import type { Identity, MemberRole } from "../../identity"
import { preferredLanguage } from "../../language"

const ROLES: Record<MemberRole, string> = {
  admin: "administrator of",
  member: "member of",
}

function teamsLine(identity: Identity): string {
  if (identity.teams.length === 0) return "Teams: none."
  // E05-S13 (fiche D128) : plus d'équipe par défaut, seul « (lead) » marque une équipe.
  const teams = identity.teams.map((team) => (team.role === "lead" ? `${team.name} (lead)` : team.name))
  return `Teams: ${teams.join(", ")}.`
}

/** La langue de réponse, nommée pour le modèle. */
const LANGUAGES: Record<Language, string> = {
  fr: "French",
  en: "English",
}

/**
 * La ligne de faits de la partie Privé (E05-S12, AC-1, HN-E05S12-1) : nom, handle, rôle, équipes marquées,
 * puis la langue de réponse effective (E05-S11, AC-37 : profil, organisation, français), en une ligne.
 */
export function personFacts(identity: Identity): string {
  const { user, member, org } = identity
  const handle = member.profile.handle ? ` (${member.profile.handle})` : ""
  return `You: ${user.name}${handle}, ${ROLES[member.role]} ${org.name}. ${teamsLine(identity)} Reply in ${LANGUAGES[preferredLanguage(identity)]} unless the user writes in another language.`
}
