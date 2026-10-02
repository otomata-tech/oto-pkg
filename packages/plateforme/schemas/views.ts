// Vues du widget dans la conversation (story widgets-dans-la-conversation, lot 1) : le serveur nomme la
// vue d'un résultat (`structuredContent.view.kind`), le widget routeur (`widgets/`) rend le composant de ce
// nom. Ici, et non dans `server/` ni dans `widgets/`, pour que les deux lisent la même liste fermée.
import type { Theme } from "./brand"

/**
 * `table` : des lignes de tableau (`table.rows`) ; `record` : une ligne seule (`table.rows` d'une ligne,
 * `table.claim` d'une ligne réservée) ; `page` : les blocs d'une page ou d'une procédure lue par `read`.
 */
export const PACKAGE_VIEWS = ["table", "record", "page"] as const

export type ViewKind = (typeof PACKAGE_VIEWS)[number]

/** Ce que porte `structuredContent.view` : la vue et le thème `.oto` sous lequel la rendre. */
export type ServedView = { kind: ViewKind; theme: Theme }
