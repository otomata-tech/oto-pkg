/**
 * Ce que les commandes à connexion d'administration (`db prepare`, `accounts secret`) n'écrivent jamais : le mot de
 * passe de l'URL et toute valeur secrète qu'elles tiennent. Sans ce module partagé, chaque commande recopierait le
 * masque et la lecture du mot de passe.
 */

/**
 * Remplace toute valeur secrète d'un texte à écrire.
 * @param {unknown} text
 * @param {(string | null | undefined)[]} secrets
 */
export function mask(text, secrets) {
  return secrets.filter(Boolean).reduce((masked, secret) => masked.split(secret).join('***'), String(text))
}

/**
 * Le mot de passe d'une URL de connexion, `null` sans lui ou sur une URL illisible.
 * @param {string} dbUrl
 * @returns {string | null}
 */
export function urlPassword(dbUrl) {
  try {
    return decodeURIComponent(new URL(dbUrl).password) || null
  } catch {
    return null
  }
}
