// Ressource `feedback` de l'API du paquet (E08-S09, AC13) : `PATCH feedback/<ticket>` change l'état
// d'un retour depuis l'écran « Retours ». Adaptateur mince : validation, droit (`handlesFeedback`) et
// écriture sont dans `server/feedback.ts`, que le MCP admin appelle aussi (E08-S06). Sans elle, les
// gestes de l'écran n'ont pas de porte d'écriture.
import { ticketSchema } from "../schemas"
import { setFeedbackState } from "../server/feedback"
import type { ResourceRoutes } from "./handler"

export const feedbackRoutes: ResourceRoutes = {
  PATCH: {
    params: 1,
    // La cible du journal est le ticket de l'adresse s'il en a la forme, refus compris (H07).
    target: ({ params }) => (ticketSchema.safeParse(params[0]).success ? params[0] : null),
    async handle({ db, identity, params, body }) {
      // Les deux champs lus tels quels : le service les valide (`feedbackStateChangeSchema`).
      const { state, resolution }: { state?: unknown; resolution?: unknown } = typeof body === "object" && body !== null ? body : {}
      const { ticket } = await setFeedbackState(db, identity, { ticket: params[0], state, resolution })
      return { status: 200, data: ticket, journal: { target: ticket.ticket } }
    },
  },
}
