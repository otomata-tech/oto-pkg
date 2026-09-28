// Ressource `trash` de l'API du paquet (E05-S10, AC-b11) : `POST trash` met un nœud et son sous-arbre à la
// corbeille, `GET trash` liste ce que la personne peut en gérer, `POST trash/restore` le restaure.
// Adaptateur mince : validation, droits, purge et écritures sont dans `server/nodes/trash.ts`. Sans elle,
// l'écran « Corbeille » et « Supprimer » (partie b2) n'ont pas de porte.
import { nodePathBodySchema } from "../schemas"
import { listTrash, restoreNode, trashNode } from "../server/nodes/trash"
import type { ResourceRoutes } from "./handler"

function pathTarget({ body }: { body: unknown }): string | null {
  const parsed = nodePathBodySchema.safeParse(body)
  return parsed.success ? parsed.data.path : null
}

export const trashRoutes: ResourceRoutes = {
  GET: {
    params: 0,
    async handle({ db, identity }) {
      return { status: 200, data: { items: await listTrash(db, identity) } }
    },
  },
  POST: [
    {
      params: 0,
      target: pathTarget,
      async handle({ db, identity, body }) {
        const { data, target, teamId } = await trashNode(db, identity, body)
        return { status: 200, data, journal: { target, teamId } }
      },
    },
    {
      params: 1,
      fixed: { 0: "restore" },
      target: pathTarget,
      async handle({ db, identity, body }) {
        const { data, target, teamId } = await restoreNode(db, identity, body)
        return { status: 200, data, journal: { target, teamId } }
      },
    },
  ],
}
