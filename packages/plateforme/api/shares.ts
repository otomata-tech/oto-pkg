// Ressource `shares` de l'API du paquet (E05-S10 partie d, ADR-013) : `GET shares?path=` rend le lien
// public d'un nœud (accès complet), `GET shares` les liens actifs de l'organisation (administrateur,
// AC-d7), `POST shares` crée ou change le lien d'un nœud (AC-d1), `DELETE shares/<id>` le désactive.
// Adaptateur mince : validation et droits dans `server/shares.ts`. Sans elle, « Partager sur le web » n'a
// pas de porte.
import { shareNodeSchema, sharesQuerySchema } from "../schemas"
import { invalidInput } from "../server/errors"
import { listShares, nodeShare, revokeShare, shareNode } from "../server/shares"
import type { ResourceRoutes } from "./handler"
import { idOrNull } from "./ids"

export const sharesRoutes: ResourceRoutes = {
  GET: {
    params: 0,
    async handle({ db, identity, request }) {
      const parsed = sharesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
      if (!parsed.success) throw invalidInput(parsed.error)
      if (parsed.data.path === undefined) return { status: 200, data: { shares: await listShares(db, identity) } }
      return { status: 200, data: { share: await nodeShare(db, identity, parsed.data.path) } }
    },
  },
  POST: {
    params: 0,
    target: ({ body }) => {
      const parsed = shareNodeSchema.safeParse(body)
      return parsed.success ? parsed.data.path : null
    },
    async handle({ db, identity, body }) {
      const { data, target, teamId } = await shareNode(db, identity, body)
      return { status: data.created ? 201 : 200, data, journal: { target, teamId } }
    },
  },
  DELETE: {
    params: 1,
    target: ({ params }) => idOrNull(params[0]),
    async handle({ db, identity, params }) {
      const { data, target, teamId } = await revokeShare(db, identity, params[0])
      return { status: 200, data, journal: { target, teamId } }
    },
  },
}
