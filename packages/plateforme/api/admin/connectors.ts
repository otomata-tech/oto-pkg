// `POST` et `DELETE admin/connectors/<nom>/activation` du tableau de bord (E08-S03, AC5, AC10) :
// activer, désactiver un connecteur. Adaptateur mince : la validation du nom, le droit (`isOrgAdmin`)
// et l'écriture sont dans `activateConnector` et `deactivateConnector` d'E04-S01 ; la réponse est la
// ligne du connecteur telle que la rend `listConnectorsForOrg`.
import { connectorRefSchema } from "../../schemas"
import { activateConnector, deactivateConnector } from "../../server/connectors/activations"
import type { Route } from "../handler"

const ACTIVATION = { 0: "connectors", 2: "activation" } as const

/** La cible du journal : le connecteur nommé par l'adresse, s'il en a la forme. */
function connectorOrNull({ params }: { params: string[] }): string | null {
  const parsed = connectorRefSchema.safeParse({ connector: params[1] })
  return parsed.success ? parsed.data.connector : null
}

export const activationRoute: Route = {
  params: 3,
  fixed: ACTIVATION,
  target: connectorOrNull,
  async handle({ db, identity, params }) {
    const connector = await activateConnector(db, identity, { connector: params[1] })
    return { status: 200, data: { connector }, journal: { target: connector.connector } }
  },
}

export const deactivationRoute: Route = {
  params: 3,
  fixed: ACTIVATION,
  target: connectorOrNull,
  async handle({ db, identity, params }) {
    const connector = await deactivateConnector(db, identity, { connector: params[1] })
    return { status: 200, data: { connector }, journal: { target: connector.connector } }
  },
}
