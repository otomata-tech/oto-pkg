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

const DECIMALE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

/**
 * « 12,5 Mo », « 340 Ko », « 12 octets » : la taille d'un fichier joint, en multiples de 1 024 (E10-S02, AC-b2), et ses
 * limites dites avant le choix (AC-b4). Sans lui, la carte d'un fichier et le dialogue de dépôt diraient des octets.
 */
export function tailleLisible(octets: number): string {
  if (octets < 1024) return `${NOMBRE.format(octets)} ${octets > 1 ? "octets" : "octet"}`
  const unites = ["Ko", "Mo", "Go"]
  let valeur = octets / 1024
  let rang = 0
  while (valeur >= 1024 && rang < unites.length - 1) {
    valeur /= 1024
    rang += 1
  }
  return `${DECIMALE.format(valeur)} ${unites[rang]}`
}
