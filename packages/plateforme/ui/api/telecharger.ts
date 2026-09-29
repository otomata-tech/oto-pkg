// Un fichier rendu par un export (E10-S01, AC-a5, AC-b6) : `{ filename, content }` que le service compose, que le
// navigateur télécharge par un `Blob` et un lien cliqué, sans rien stocker. Sans lui, « Télécharger en .md » et
// « Télécharger en .csv » n'auraient pas de fichier à donner.

/** Un fichier composé par le service. */
export type FichierRendu = { filename: string; content: string }

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
