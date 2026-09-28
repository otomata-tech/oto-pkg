// Ressource `rules` de l'API du paquet (E05-S03, AC17) : poser ou remplacer une règle sur un nœud,
// la retirer. Adaptateur mince : la validation, les droits et l'écriture sont dans `server/rules.ts`.
import { setNodeRuleSchema } from "../schemas"
import { removeRule, setNodeRule } from "../server/rules"
import type { ResourceRoutes } from "./handler"
import { idOrNull } from "./ids"

export const rulesRoutes: ResourceRoutes = {
  POST: {
    params: 0,
    target: ({ body }) => {
      const parsed = setNodeRuleSchema.safeParse(body)
      return parsed.success ? parsed.data.path : null
    },
    async handle({ db, identity, body }) {
      const { data, target, teamId } = await setNodeRule(db, identity, body)
      return { status: data.created ? 201 : 200, data: { rule: data }, journal: { target, teamId } }
    },
  },
  DELETE: {
    params: 1,
    target: ({ params }) => idOrNull(params[0]),
    async handle({ db, identity, params }) {
      const { data, target, teamId } = await removeRule(db, identity, params[0])
      return { status: 200, data: { rule: data }, journal: { target, teamId } }
    },
  },
}
