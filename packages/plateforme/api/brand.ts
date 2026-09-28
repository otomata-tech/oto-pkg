// Ressource `brand` de l'API du paquet (E09-S01, AC7 à AC11) : `PATCH` enregistre la marque
// complète. Adaptateur mince : la validation, le droit (`isOrgAdmin`) et l'écriture sont dans
// `server/brand.ts`.
import { updateBrand } from "../server/brand"
import type { ResourceRoutes } from "./handler"

export const brandRoutes: ResourceRoutes = {
  PATCH: {
    params: 0,
    target: () => "brand",
    async handle({ db, identity, body }) {
      const { data, target } = await updateBrand(db, identity, body)
      return { status: 200, data, journal: { target } }
    },
  },
}
