// Un fichier rendu par un export (E10-S01, AC-a5, AC-b6) : `{ filename, content }` que le service compose, que le
// navigateur télécharge par un `Blob` et un lien cliqué, sans rien stocker. Sans lui, « Télécharger en .md » et
// « Télécharger en .csv » n'auraient pas de fichier à donner. E11-S05 (lot c) : l'appel de l'export publié et son
// téléchargement vivent ici, pour le « ⋯ » du rail et le bouton de l'en-tête d'un nœud (deux occurrences).
import { appelerPlateforme, type ErreurPlateforme } from "./client"

/** Un fichier composé par le service. */
export type FichierRendu = { filename: string; content: string }

/** Les deux formats d'un export : le `.csv` d'un tableau, le `.md` d'une page, d'une procédure ou d'un Contexte. */
export type FormatDExport = "csv" | "md"

const TYPES: Record<FormatDExport, string> = { csv: "text/csv;charset=utf-8", md: "text/markdown;charset=utf-8" }

/** Le téléchargement d'un fichier : un lien d'un `Blob`, cliqué, puis retiré et son adresse révoquée. */
export function telecharger(fichier: FichierRendu, type: string): void {
  const adresse = URL.createObjectURL(new Blob([fichier.content], { type }))
  const lien = document.createElement("a")
  lien.href = adresse
  lien.download = fichier.filename
  document.body.append(lien)
  lien.click()
  lien.remove()
  URL.revokeObjectURL(adresse)
}

/** Un fichier déjà composé (la page publique, E11-S05 lot d), téléchargé au type de son format. */
export function telechargerLeFichier(fichier: FichierRendu, format: FormatDExport): void {
  telecharger(fichier, TYPES[format])
}

/**
 * L'export publié d'un nœud (E10-S01) : `GET tables/export` pour un `.csv`, `GET nodes/export` pour un `.md`, puis son
 * téléchargement ; un refus du service revient tel quel, et aucun fichier ne part.
 */
export async function telechargerLExport(chemin: string, format: FormatDExport): Promise<{ fichier: FichierRendu; erreur?: never } | { fichier?: never; erreur: ErreurPlateforme }> {
  const ressource = `${format === "csv" ? "tables" : "nodes"}/export?path=${encodeURIComponent(chemin)}`
  const reponse = await appelerPlateforme<FichierRendu>({ methode: "GET", ressource })
  if (reponse.erreur) return { erreur: reponse.erreur }
  telechargerLeFichier(reponse.data, format)
  return { fichier: reponse.data }
}
