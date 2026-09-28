// Appel d'une Server Action en échec (réseau coupé, déploiement remplacé) sur une page
// d'authentification : même texte que l'échec réseau des écrans du paquet (`ui/api/messages.ts`,
// code `reseau`).
export const SERVEUR_INJOIGNABLE = "La connexion au serveur a échoué. Réessayez."

// Le titre de l'`Alert` d'échec de `/login`, repris d'oto-frontend (`sign-in-form.tsx`) : identifiants
// refusés, lien de l'email refusé, fournisseur refusé ou injoignable (E05-S09, partie d3).
export const CONNEXION_ECHOUEE = "La connexion n'a pas abouti"
