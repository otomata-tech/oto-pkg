// Ressource `cell` de l'API du paquet (E08-S04, AC12) : l'état de la cellule, réservé à l'équipe
// plateforme. Adaptateur mince : le rôle, la base et les variables sont lus par `server/cell.ts`.
// La porte la sert hors de sa table de dispatch, avant l'identité par l'adresse et sans journal (NH11).
import { cellStatus } from "../server/cell"
import type { PlatformDb } from "../server/db"

export const cellRoutes = {
  GET: {
    async handle({ db }: { db: PlatformDb }) {
      return { status: 200, data: await cellStatus(db) }
    },
  },
}
