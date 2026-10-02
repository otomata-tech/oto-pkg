// Vues du widget dans la conversation (story widgets-dans-la-conversation) : le serveur nomme la vue d'un résultat
// (`structuredContent.view.kind`), le widget routeur (`widgets/`) rend le composant de ce nom. Ici, et non dans
// `server/` ni dans `widgets/`, pour que les deux lisent la même liste fermée et la même forme de nom.
import type { Theme } from "./brand"

/**
 * `table` : des lignes de tableau (`table.rows`) ; `record` : une ligne seule (`table.rows` d'une ligne,
 * `table.claim` d'une ligne réservée) ; `page` : les blocs d'une page ou d'une procédure lue par `read`.
 */
export const PACKAGE_VIEWS = ["table", "record", "page"] as const

export type ViewKind = (typeof PACKAGE_VIEWS)[number]

/** Le préfixe d'une vue de l'ERP : `erp:devis` est la vue `devis` que l'hôte a construite et inscrite. */
export const ERP_VIEW_PREFIX = "erp:"

/** Le nom d'une vue de l'ERP (`defineErpFunction`, `oto-platform widgets build`) : celui de son fichier, sans `.tsx`. */
export const VIEW_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

/** Une vue du paquet, ou `erp:<nom>`. */
export type ServedViewKind = ViewKind | `${typeof ERP_VIEW_PREFIX}${string}`

/**
 * Ce que porte `structuredContent.view` : la vue, le thème `.oto` sous lequel la rendre, et le nom de l'outil `call`
 * de l'organisation (`acme_call`), que le widget appelle pour une page suivante ou une vue de l'ERP.
 */
export type ServedView = { kind: ServedViewKind; theme: Theme; call: string }
