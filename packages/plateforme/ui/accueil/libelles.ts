// Les mots de l'accueil (E05-S09, partie b) : ceux d'oto-frontend (`src/components/accueil/`), adaptés à la
// plateforme (des assistants branchés, pas des agents d'Oto). Constantes du paquet, jamais un texte venu du
// service (`portage-ecrans.md § 4`) ; une seule table, lue par l'écran et ses îlots.
import type { ActivityVerb, NodeKind } from "../../schemas"

export const ACCUEIL = {
  bonjour: (nom: string | null) => (nom ? `Bonjour ${nom}` : "Bonjour"),
  chercher: "Chercher",
  chargement: "Chargement de l'accueil…",
  /** L'îlot principal, sans onglets (E11-S10, AC-e3). */
  ilot: "Activités",
} as const

/** L'îlot « Activités » : ce qui est arrivé aux contenus, lu au journal (E05-S12, AC-13). */
export const ACTIVITES = {
  toutLeJournal: "Tout le journal",
  vous: "Vous",
  aujourdhui: "Aujourd'hui",
  hier: "Hier",
  rien: "Aucune activité cette semaine",
  rienTexte: "Ce qui est créé, modifié, publié ou lancé, à l'écran comme par un assistant, s'écrira ici.",
  /** Plusieurs gestes regroupés (AC-14) : lu « 3 fois », montré « ×3 ». */
  fois: (nombre: number) => `×${nombre}`,
  foisLu: (nombre: number) => `${nombre} fois`,
  /** Des lignes à revoir parmi les lignes supprimées (E11-S02, AC-h3). */
  dontARevoir: (nombre: number) => `, dont ${nombre} à revoir`,
} as const

/** Ce qui est arrivé, par verbe du service : à la troisième personne, et après « Vous » (AC-13). */
export const VERBES_DES_ACTIVITES: Record<ActivityVerb, { il: string; vous: string }> = {
  created: { il: "a créé", vous: "avez créé" },
  edited: { il: "a modifié", vous: "avez modifié" },
  published: { il: "a publié", vous: "avez publié" },
  moved: { il: "a déplacé", vous: "avez déplacé" },
  duplicated: { il: "a dupliqué", vous: "avez dupliqué" },
  trashed: { il: "a mis à la corbeille", vous: "avez mis à la corbeille" },
  restored: { il: "a restauré", vous: "avez restauré" },
  wrote_rows: { il: "a écrit dans", vous: "avez écrit dans" },
  reviewed: { il: "a tranché une revue dans", vous: "avez tranché une revue dans" },
  ran: { il: "a lancé", vous: "avez lancé" },
  deleted_rows: { il: "a supprimé des lignes dans", vous: "avez supprimé des lignes dans" },
}

/** La nature d'un contenu, avec son article ; une nature inconnue ne se nomme pas (le chemin suit seul). */
export const NATURES_DES_ACTIVITES: Record<NodeKind, string> = {
  page: "la page",
  table: "le tableau",
  procedure: "la procédure",
  context: "le Contexte",
}

/** L'îlot « Procédures les plus utilisées » (E05-S12, AC-18) : celles du bloc servi par `context`, dans son ordre. */
export const PROCEDURES_UTILES = {
  titre: "Procédures les plus utilisées",
  rien: "Aucune procédure publiée",
} as const

/** L'aparté « Brancher mon Claude, ChatGPT ou Mistral » (E02-S04, E11-S09) : l'état et la fenêtre du guide. */
export const BRANCHEMENT = {
  brancher: "Brancher",
  fermer: "Fermer",
  aucun: "Aucun assistant branché",
  derniere: (famille: string, date: string) => `${famille} · dernière connexion le ${date}`,
} as const

export const PREMIER_JOUR = {
  rien: "Rien n'a encore tourné",
  texte:
    "Votre assistant lit vos pages, suit vos procédures et appelle vos outils, dans la limite de vos droits. Branchez-le d'abord : « Brancher mon Claude, ChatGPT ou Mistral » vous guide pas à pas.",
} as const
