// La définition d'un connecteur décrit, telle que l'hôte la déclare au paquet (`registerConnectors`,
// `connecteurs-et-comptes.md` § Moteur des connecteurs décrits) : des données structurelles, sans code, que le moteur
// exécute. Le paquet ne dépend d'aucun dépôt de connecteurs : ce type est le sien, de même forme que la sortie de la
// fabrique du dépôt `connectors` (`ts/src/types.ts`), qu'un hôte lui passe telle quelle ; un connecteur propre à
// l'hôte s'écrit à la main dans cette même forme. Ce qui n'y figure pas (version, modes, quota, exposition) est
// ignoré. Aucun secret ici : `auth` nomme un champ de `credential`, la valeur vient du compte à l'appel.

export type ConnectorFunctionClass = "read" | "write" | "sensitive"

export type ConnectorHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/** Un JSON Schema 2020-12, validé tel quel et servi tel quel par `read`. */
export type ConnectorJsonSchema = { readonly [key: string]: unknown }

export type ConnectorJsonValue = string | number | boolean | null | readonly ConnectorJsonValue[] | { readonly [key: string]: ConnectorJsonValue }

/** Un champ du secret d'un compte ; le paquet n'en garde qu'un, le secret du compte. */
export type ConnectorCredentialField = { readonly name: string; readonly label: string; readonly secret: boolean }

/**
 * L'authentification : `bearer` et `api_key` s'exécutent ; toute autre sorte (`basic`, `oauth2_*`, `none`) se
 * déclare mais est refusée nommément par `registerConnectors`.
 */
export type ConnectorAuth =
  | { readonly kind: "bearer"; readonly token: string }
  | { readonly kind: "api_key"; readonly header: string; readonly prefix?: string; readonly key: string }
  | { readonly kind: string }

/** Une ligne de la table d'erreurs : statut du tiers, refus nommé, message en anglais. */
export type ConnectorApiError = {
  readonly status: number | readonly number[]
  readonly code: string
  readonly message: string
  readonly retryable?: boolean
}

/** Un refus propre à une fonction : `when` est un statut HTTP (il surcharge la table) ou une condition (contrôle). */
export type ConnectorRefusal = { readonly code: string; readonly when: number | string; readonly message: string }

export type ConnectorExample = { readonly title: string; readonly input: { readonly [argument: string]: unknown } }

/** Nom côté API → nom de l'argument. */
export type ConnectorArgumentMap = { readonly [apiName: string]: string }

export type ConnectorRequest = {
  readonly method: ConnectorHttpMethod
  /** Relatif à `baseUrl`, avec des `{param}` listés dans `pathParams`. */
  readonly path: string
  readonly pathParams: readonly string[]
  readonly query: ConnectorArgumentMap
  /** Corps JSON, quelle que soit la méthode. */
  readonly body: ConnectorArgumentMap
  readonly headers: ConnectorArgumentMap
  readonly constants?: {
    readonly query?: { readonly [apiName: string]: string | number | boolean }
    readonly body?: { readonly [apiName: string]: ConnectorJsonValue }
    readonly headers?: { readonly [header: string]: string }
  }
  /** Argument → `json` : sérialisé en chaîne avant d'être placé. */
  readonly encode?: { readonly [argument: string]: "json" }
}

/** Suivie quand l'agent passe `all_pages` : `next` (chemin pointé de la réponse) va dans `requestParam`. */
export type ConnectorPagination = {
  readonly kind: "cursor" | "page"
  readonly requestParam: string
  readonly next: string
  readonly more?: string
  readonly maxPages: number
}

export type ConnectorOutput = {
  readonly items?: string
  readonly strip?: readonly string[]
  readonly projection?: readonly string[]
}

/** Contrôle des arguments avant l'appel : rien n'est envoyé s'il échoue. */
export type ConnectorCheck = {
  readonly kind: string
  readonly refusal: string
  readonly items: string
  readonly fields: readonly [string, string]
}

/** Contrôle de la réponse : le refus nommé au lieu de la réponse s'il échoue. */
export type ConnectorExpectation = { readonly kind: string; readonly refusal: string; readonly path: string }

export type ConnectorFunctionDefinition = {
  /** `<connecteur>.<fonction>`. */
  readonly name: string
  readonly connector: string
  readonly class: ConnectorFunctionClass
  readonly description: string
  /** Racine `type: object`, `additionalProperties: false`. */
  readonly schema: ConnectorJsonSchema
  readonly examples: readonly ConnectorExample[]
  readonly refusals: readonly ConnectorRefusal[]
  readonly checks?: readonly ConnectorCheck[]
  readonly expect?: readonly ConnectorExpectation[]
  readonly request: ConnectorRequest
  readonly pagination?: ConnectorPagination
  readonly output?: ConnectorOutput
  /** Gabarit du récapitulatif d'une fonction sensible, avec des `{argument}`. */
  readonly confirm?: { readonly summary: string }
}

export type ConnectorDefinition = {
  readonly name: string
  readonly label: string
  readonly baseUrl?: string
  readonly auth: ConnectorAuth
  readonly credential: readonly ConnectorCredentialField[]
  readonly timeoutMs: number
  readonly queryArrays?: "repeat" | "brackets" | "comma"
  /** En-têtes constants de toute requête ; jamais l'en-tête d'authentification. */
  readonly headers?: { readonly [header: string]: string }
  /** Débit maximal du tiers, par compte : `requests` par fenêtre de `intervalMs`. */
  readonly rateLimit?: { readonly requests: number; readonly intervalMs: number }
  readonly errors: readonly ConnectorApiError[]
  /** Une lecture sans argument requis, appelée avec `{}` ; chaque chemin de `nonEmpty` doit être non vide. */
  readonly probe?: { readonly function: string; readonly nonEmpty: readonly string[] }
  readonly functions: readonly ConnectorFunctionDefinition[]
}
