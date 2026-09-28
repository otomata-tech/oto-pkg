// Ressource `platform-access` de l'API du paquet (E05-S03, AC18, fiche D2) : l'administrateur révoque
// un accès de l'équipe plateforme par `platform-access/<id>/revoke`. Adaptateur mince : les droits
// et l'écriture sont dans `server/members.ts`.
import { revokePlatformAccess } from "../server/members"
import type { ResourceRoutes } from "./handler"
import { idOrNull } from "./ids"

export const platformAccessRoutes: ResourceRoutes = {
  POST: {
    params: 2,
    fixed: { 1: "revoke" },
    target: ({ params }) => idOrNull(params[0]),
    async handle({ db, identity, params }) {
      const { data, target, teamId } = await revokePlatformAccess(db, identity, params[0])
      return { status: 200, data: { access: data }, journal: { target, teamId } }
    },
  },
}
