// `PATCH admin/flags` du tableau de bord (E08-S03, AC8, AC10) : basculer un drapeau déclaré par le
// paquet. Adaptateur mince : la validation (`flagToggleSchema`), le nom déclaré, le droit
// (`isOrgAdmin`) et l'écriture gardée sont dans `setFlag` d'E08-S04.
import { flagToggleSchema } from "../../schemas"
import { setFlag } from "../../server/flags"
import type { Route } from "../handler"

export const flagRoute: Route = {
  params: 1,
  fixed: { 0: "flags" },
  target: ({ body }) => {
    const parsed = flagToggleSchema.safeParse(body)
    return parsed.success ? `flags/${parsed.data.name}` : null
  },
  async handle({ db, identity, body }) {
    const { data, target } = await setFlag(db, identity, body)
    return { status: 200, data: { flag: data }, journal: { target } }
  },
}
