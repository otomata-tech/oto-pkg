// Ressource `members` de l'API du paquet (E05-S03, AC7 à AC9) : changer le rôle ou l'équipe par
// défaut d'un membre, le retirer. Adaptateur mince : la validation, les droits et l'écriture sont
// dans `server/members.ts`.
import { removeMember, updateMember } from "../server/members"
import type { ResourceRoutes } from "./handler"
import { idOrNull } from "./ids"

export const membersRoutes: ResourceRoutes = {
  PATCH: {
    params: 1,
    target: ({ params }) => idOrNull(params[0]),
    async handle({ db, identity, params, body }) {
      const { data, target, teamId } = await updateMember(db, identity, params[0], body)
      return { status: 200, data: { member: data }, journal: { target, teamId } }
    },
  },
  DELETE: {
    params: 1,
    target: ({ params }) => idOrNull(params[0]),
    async handle({ db, identity, params }) {
      const { data, target, teamId } = await removeMember(db, identity, params[0])
      return { status: 200, data: { member: data }, journal: { target, teamId } }
    },
  },
}
