// Les formes de l'écran « Brancher un assistant » (E02-S04), redéfinies ici : `ui/` ne lit pas
// `server/`, la page de l'hôte adapte les noms anglais des services.

/** Ce que l'écran fait copier, pour l'organisation de l'adresse. */
export type AdresseDeConnexion = {
  /** L'adresse du serveur MCP de l'organisation (`https://acme.oto.cx/api/mcp`). */
  url: string
  /** Le nom recommandé du connecteur : le nom de l'organisation. */
  nom: string
  /** Le nom du serveur pour Claude Code : le préfixe de l'organisation. */
  nomCli: string
  /** La phrase des préférences personnelles de claude.ai. */
  phrase: string
}

/** Un prompt à essayer : le titre d'une procédure, le message que `prompts/get` envoie (P37). */
export type ExempleDePrompt = { titre: string }

/** La dernière connexion d'une famille d'assistants, lue au journal (`initialize`, H29). */
export type DerniereConnexion = {
  famille: string
  /** `client_name@version` de l'`initialize`. */
  signature: string
  /** ISO 8601. */
  date: string
}
