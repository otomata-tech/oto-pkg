import { cache } from "react"
import { listTeams, visibleTree, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"

// Les lectures que le layout `(dashboard)` (le rail) et la page d'un nœud font toutes deux, une fois par
// rendu (`cache` de React : une mémoire par requête, jamais d'une requête à l'autre, H70). Sans elles, chaque
// affichage d'un nœud lisait deux fois l'arbre visible et les équipes (E05-S10, partie c, AC-c1). Les services
// restent ceux du paquet, qui décident les droits (H123) ; le client et l'identité sont ceux de la requête,
// les mêmes objets pour le layout et la page (`getPlatformIdentity`, `session.ts`).

/** L'arbre visible de la personne (`visibleTree`), lu une fois par rendu. */
export const lireLArbre = cache((db: PlatformDb, identity: Identity) => visibleTree(db, identity))

/** Les équipes de l'organisation (`listTeams`), lues une fois par rendu. */
export const lireLesEquipes = cache((db: PlatformDb, identity: Identity) => listTeams(db, identity))
