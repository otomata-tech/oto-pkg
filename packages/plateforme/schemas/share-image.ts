// L'image de partage d'une adresse (E11-S21) : ce que `shareImageData` (`server/`) lit sans session et que
// `ImageDePartage` (`ui/`) dessine. Ici parce que `ui/` n'importe pas `server/` : sans ce type, l'une des deux faces
// recopierait la forme de l'autre.
import type { Theme } from "./brand"

/**
 * L'organisation de l'adresse (`null` : aucune, l'image dit « Oto ») et le contenu d'un lien public (`null` : l'image
 * générique de l'organisation). `logo` : l'image du logo en adresse `data:` (PNG ou JPEG), lue par le serveur ; `null`
 * sans logo lisible, l'initiale le remplace.
 */
export type ShareImageData = {
  org: { name: string; theme: Theme; logo: string | null } | null
  page: { title: string; summary: string } | null
}
