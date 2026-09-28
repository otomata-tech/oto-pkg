// Ressource `tables` de l'API du paquet (E07-S03, AC11 à AC13 ; HN-E07S03-3) : `POST tables/review`,
// la décision d'une personne dans la file de revue d'un tableau. Adaptateur mince : validation, droits
// et écriture gardée sont dans `server/tables/review.ts`. La ligne de journal (H07) prend la cible et
// l'équipe que rend le service : le chemin courant du tableau et son équipe propriétaire. Sans elle,
// l'écran n'a pas de porte pour décider, et `table.write` refuse les états de décision (P10).
import { reviewDecisionSchema } from "../schemas"
import { decideReview } from "../server/tables/review"
import type { ResourceRoutes } from "./handler"

export const tablesRoutes: ResourceRoutes = {
  POST: {
    params: 1,
    fixed: { 0: "review" },
    // Refus : le tableau demandé, s'il est bien formé ; décision prise : son chemin courant, rendu par le service (H07).
    target: ({ body }) => {
      const parsed = reviewDecisionSchema.safeParse(body)
      return parsed.success ? parsed.data.table : null
    },
    async handle({ db, identity, body }) {
      const { outcome, target, teamId } = await decideReview(db, identity, body)
      return { status: 200, data: outcome, journal: { target, teamId } }
    },
  },
}
