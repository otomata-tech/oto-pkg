// Garde « objet JSON » de `server/` (M10, doublon relevé par E08-S04) : une colonne `jsonb`
// (`orgs.brand`, `orgs.flags`, `members.profile`, `sim_outbox.payload`) peut porter `null`, un
// tableau, une chaîne ou un nombre ; ses champs ne se lisent qu'après cette garde. Sans ce module,
// chaque lecteur d'une telle colonne recopiait la même garde.

/** Vrai pour un objet JSON, jamais pour `null` ni pour un tableau : ses champs se lisent alors par clé. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
