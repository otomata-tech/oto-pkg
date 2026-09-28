// La copie dans le presse-papiers des écrans du paquet (E05-S02), extraite de `ValeurCopiable`
// (E02-S04) à sa deuxième occurrence, « Copier mon texte » (`coding-standards.md § DRY`). Sans elle,
// chaque copie réécrivait le même essai, et une copie ratée pouvait s'annoncer « copiée ».
// Porté d'oto-frontend (`save-status.tsx`, `copyText`) : l'échec rendu, jamais avalé en silence.

/** Ce que dit un bouton de copie quand le presse-papiers la refuse : le texte reste à sélectionner. */
export const COPIE_IMPOSSIBLE = "Copie impossible : sélectionnez le texte."

/**
 * Écrit `texte` dans le presse-papiers ; `false` quand il est refusé ou absent (permission, contexte
 * non sécurisé) : l'appelant le dit, et le texte reste sélectionnable à l'écran.
 */
export async function copierLeTexte(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte)
    return true
  } catch {
    return false
  }
}
