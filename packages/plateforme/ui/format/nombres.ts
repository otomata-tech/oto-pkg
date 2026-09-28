// Les nombres des écrans du paquet (E08-S09) : `fr-FR` (`datetime-patterns.md § Nombres`), formateurs
// construits une fois, au chargement du module. Sans lui, les chiffres clés et la table des fonctions
// de l'usage formateraient chacun leurs taux.
const NOMBRE = new Intl.NumberFormat("fr-FR")
const POURCENTAGE = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 })
const SCORE = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** « 1 234 ». */
export function nombreLisible(valeur: number): string {
  return NOMBRE.format(valeur)
}

/** « 12,5 % » : la part sur le total ; `undefined` sans total (aucun appel), l'écran dit « — ». */
export function tauxLisible(part: number, total: number): string | undefined {
  return total > 0 ? POURCENTAGE.format(part / total) : undefined
}

/** « 0,82 » : un score de routage à deux décimales (E05-S04, AC8 ; `formatScore` de la maquette). */
export function scoreLisible(score: number): string {
  return SCORE.format(score)
}
