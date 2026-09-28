// Les mots de l'écran « Corbeille » (E05-S10, partie b2, AC-b11). Une seule table, lue par l'écran et son îlot.
import type { TrashItem } from "../../schemas"

export const CORBEILLE = {
  titre: "Corbeille",
  description:
    "Les contenus supprimés restent ici jusqu'à leur purge, puis disparaissent. Restaurer remet un contenu à sa place, avec ce qui était parti avec lui.",
  ilot: "Les contenus à la corbeille",
  vide: "La corbeille est vide.",
  chargement: "Chargement de la corbeille…",
  // E05-S13 (AC-11) : « Purge » ne se comprenait pas ; l'abréviation tient la colonne étroite.
  colonnes: { titre: "Contenu", type: "Type", supprime: "Supprimé le", nombre: "Contenus", purge: "Suppr. définitivement le", geste: "Restaurer" },
  restaurer: "Restaurer",
  restaurerNomme: (titre: string) => `Restaurer « ${titre} »`,
  restauration: "Restauration…",
  /** Ce qui part avec un contenu : lui compris (`count`). */
  nombre: (item: Pick<TrashItem, "count">) => (item.count > 1 ? `${item.count} (avec ${item.count - 1} dessous)` : "1"),
} as const

/** Les refus de la restauration qui ont leur phrase (HN-E05S10e-4 : la gestion du contenu, l'écriture où il revient). */
export const REFUS_DE_RESTAURATION = {
  forbidden: "Restaurer ce contenu vous est refusé : il faut sa gestion, et pouvoir écrire là où il revient.",
  not_found: "Ce contenu n'est plus dans la corbeille : il a été restauré ou purgé.",
} as const
