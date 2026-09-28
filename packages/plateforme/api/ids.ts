// La cible d'une ligne de journal quand le service échoue (H07) : l'identifiant de la requête s'il
// est lisible, sinon rien. Partagé par les ressources d'E05-S03, qui adressent toutes un UUID.
import * as z from "zod/v4"

const idSchema = z.uuid()

export function idOrNull(value: unknown): string | null {
  const parsed = idSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
