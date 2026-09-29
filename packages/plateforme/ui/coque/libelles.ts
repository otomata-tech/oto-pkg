// Les mots du rail (E05-S09, partie a) : ceux d'oto-frontend (`src/components/coque/`), et ceux des
// écrans de la plateforme qu'il range dans ses menus (HN-E05S09-1). Une seule table, lue par la coque.
// Aucun tiret cadratin (E05-S11, AC-18) : le titre d'un Contexte est `titreDeContexte` (« Contexte · … »).

export const RAIL = {
  accueil: "Accueil",
  arbreEnPanne: "L'arbre n'a pas pu être chargé",
  /** Le bouton qui ouvre le rail en tiroir sous 768 px (fiche D90 B). */
  menu: "Menu",
  /** L'écran de la corbeille (E05-S10, AC-b11), au menu du compte (E05-S11, AC-e22). */
  corbeille: "Corbeille",
  /** L'écran des connecteurs, au pied du rail pour qui administre (E05-S11, AC-32). */
  connecteurs: "Connecteurs",
} as const

/** Le menu de l'entreprise (AC-a4) : deux groupes d'oto-frontend, les écrans de la plateforme rangés dessous (E05-S11, AC-33). */
export const ENTREPRISE = {
  suivi: "Suivi de l’entreprise",
  reglages: "Réglages de l’entreprise",
  usage: "Usage",
  journal: "Journal",
  retours: "Retours",
  organisation: "Organisation",
  equipes: "Équipes & accès",
} as const

/** Le menu du compte, ouvert par l'engrenage du pied : Contexte, Profil, « Brancher mon Claude, ChatGPT ou Mistral », Corbeille, puis Déconnexion (E05-S11, AC-6, AC-e22 ; E11-S09, AC-14). */
export const COMPTE = {
  /** La vue « Contexte », en tête du menu du compte (E11-S10, AC-e1). */
  contexte: "Contexte",
  profil: "Profil",
  brancher: "Brancher mon Claude, ChatGPT ou Mistral",
  deconnexion: "Déconnexion",
  anonyme: "Mon compte",
} as const

/**
 * Ce qu'on crée depuis un « + » (AC-a4), dans chaque section, Privé comprise (E05-S11, AC-34). Depuis
 * E05-S10 (partie b, AC-b3), sans dialogue : le nœud naît avec ces valeurs, puis sa page s'ouvre ; le titre
 * et le résumé s'écrivent en place.
 */
export const CREATION = {
  page: "Une page",
  tableau: "Un tableau",
  procedure: "Une procédure",
  /** Le titre d'un nœud neuf, celui qu'oto-frontend pose (`TITRE_D_UNE_PAGE_NEUVE`) et que le rail montre d'un nom vide. */
  sansTitre: "Sans titre",
  /**
   * Le résumé d'un nœud neuf, selon son genre (E05-S11, retour 21, AC-e21) : le service en exige un (1 à 200
   * caractères) ; il se réécrit en place (HN-E05S10b-2).
   */
  resumeParDefaut: { page: "Résumé de la page à compléter.", table: "Résumé du tableau à compléter.", procedure: "Résumé de la procédure à compléter." },
  /** La colonne clé d'un tableau neuf, sa seule colonne (texte). */
  cle: "nom",
  enCours: "Création…",
  tropProfond: "Cet endroit est trop profond pour y créer un contenu : choisissez un parent plus haut.",
  aucuneAdresse: "Les adresses d'un contenu sans titre sont toutes prises à cet endroit : créez-le ailleurs.",
} as const

/**
 * Déplacer depuis le rail (E05-S10, AC-b7) : glisser-déposer, ou « Déplacer » du « ⋯ » ; la confirmation
 * quand le déplacement change qui voit le contenu, lue sur l'aperçu du service (partie b2), avec les mots des
 * niveaux de « Partager ». Ranger entre frères (AC-b9) : glisser entre deux lignes, « Monter », « Descendre ».
 */
export const DEPLACEMENT_RAIL = {
  action: "Déplacer",
  titre: (nom: string) => `Déplacer « ${nom} »`,
  confirmer: (nom: string) => `Déplacer « ${nom} » ?`,
  quitte: (avant: string, apres: string) => `Il quitte ${avant} pour ${apres}.`,
  gagnent: (noms: string) => `Gagnent l'accès : ${noms}.`,
  perdent: (noms: string) => `Perdent l'accès : ${noms}.`,
  changent: (noms: string) => `Leur accès change : ${noms}.`,
  etAutres: (noms: string, reste: number) => `${noms} et ${reste} ${reste > 1 ? "autres" : "autre"}`,
  proprietaireSeul: "Personne ne gagne ni ne perd l'accès, mais son propriétaire change : il prend celui de sa nouvelle place.",
  sousContenus: (nombre: number) => (nombre > 1 ? `Ses ${nombre} sous-contenus le suivent.` : "Son sous-contenu le suit."),
  geste: "Déplacer",
  enCours: "Déplacement…",
  /** Le refus de l'aperçu qui a sa phrase : le nœud ou sa destination ne sont plus visibles, le rail se relit. */
  refusDeLImpact: { not_found: "Ce contenu ou sa destination n'est plus visible." },
  monter: "Monter",
  descendre: "Descendre",
  rangement: "Rangement…",
  range: (nom: string) => `« ${nom} » a changé de place.`,
  /** Les refus de `nodes/position` qui ont leur phrase (HN-E05S10e-11 : ranger exige la gestion). */
  refusDuRangement: {
    forbidden: "Ranger ce contenu vous est refusé : il faut sa gestion.",
    not_found: "Ce contenu ou son voisin n'est plus visible.",
  },
} as const

/** Les gestes du « ⋯ » d'une ligne (E05-S10, partie b2) : « Dupliquer » (AC-b10), « Supprimer » (AC-b11). */
export const GESTES_DU_RAIL = {
  dupliquer: "Dupliquer",
  duplicationEnCours: "Duplication…",
  supprimer: "Supprimer",
  confirmerLaSuppression: (nom: string) => `Supprimer « ${nom} » ?`,
  corbeille: "Il va à la corbeille : il disparaît du rail, des recherches et des assistants. La Corbeille le restaure à sa place jusqu'à sa purge.",
  partentAvec: (nombre: number) => (nombre > 1 ? `Ses ${nombre} sous-contenus partent avec lui.` : "Son sous-contenu part avec lui."),
  suppressionEnCours: "Suppression…",
  supprime: (nom: string) => `« ${nom} » est à la corbeille.`,
} as const

/** La palette (AC-a7) : ses rubriques, et ce qu'elle dit quand elle ne trouve rien. */
export const PALETTE = {
  placeholder: "Chercher une page, un tableau, une procédure…",
  allerA: "Aller à",
  // Le Contexte de chaque espace, sous « Équipes », comme dans oto-frontend.
  contextes: "Équipes",
  pages: "Pages",
  tableaux: "Tableaux",
  procedures: "Procédures",
  contenu: "Dans le contenu",
  rienTrouve: "Rien de ce nom dans vos pages.",
  arbreAbsent: "Vos pages ne sont pas chargées : seuls les écrans sont proposés ici.",
  recherche: "Recherche dans le contenu…",
  rechercheEnPanne: "La recherche dans le contenu n’a pas répondu. Les titres restent cherchables.",
  plusDeResultats: (nombre: number) =>
    nombre > 1 ? `${nombre} autres pages contiennent ces mots : précisez la recherche.` : "Une autre page contient ces mots : précisez la recherche.",
} as const
