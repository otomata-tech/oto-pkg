// Ressource `tables` de l'API du paquet (E07-S03, AC11 à AC13 ; HN-E07S03-3) : `POST tables/review`,
// la décision d'une personne dans la file de revue d'un tableau. Adaptateur mince : validation, droits
// et écriture gardée sont dans `server/tables/review.ts`. La ligne de journal (H07) prend la cible et
// l'équipe que rend le service : le chemin courant du tableau et son équipe propriétaire. Sans elle,
// l'écran n'a pas de porte pour décider, et `table.write` refuse les états de décision (P10).
// E10-S01 : `POST tables/import` (AC-b3 à AC-b5, AC-b7), un lot de lignes d'un CSV, par `importRows`, le service de
// `table.import` ; `GET tables/export?path=` (AC-b6), le `.csv` d'un tableau. Les deux `POST` se départagent par
// leur segment fixe.
import { reviewDecisionSchema, tableImportBodySchema } from "../schemas"
import { exportTable } from "../server/tables/export"
import { importLot } from "../server/tables/import"
import { decideReview } from "../server/tables/review"
import type { ResourceRoutes } from "./handler"

export const tablesRoutes: ResourceRoutes = {
  GET: {
    params: 1,
    fixed: { 0: "export" },
    // Une lecture : aucune ligne de journal (HN-E10S01-18).
    async handle({ db, identity, request }) {
      return { status: 200, data: await exportTable(db, identity, Object.fromEntries(new URL(request.url).searchParams)) }
    },
  },
  POST: [
    {
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
    {
      params: 1,
      fixed: { 0: "import" },
      // Refus : le tableau demandé, s'il est bien formé ; lot écrit : son chemin, rendu par le service (H07).
      target: ({ body }) => {
        const parsed = tableImportBodySchema.safeParse(body)
        return parsed.success ? parsed.data.table : null
      },
      async handle({ db, identity, body, origin }) {
        const { data, target, teamId } = await importLot({ db, identity, origin }, body)
        return { status: 200, data, journal: { target, teamId } }
      },
    },
  ],
}
