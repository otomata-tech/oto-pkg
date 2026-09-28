// Les libellés français de l'écran de nœud (E05-S02) : natures, statuts, formes des blocs, et les
// phrases propres aux gestes de l'écran (AC9 à AC18, AC21). Tout autre refus prend le texte de
// `messageDErreur` (`ui/api/messages.ts`), jamais une seconde table.
import type { NodeKind, NodeView } from "../../schemas"
import type { AccessLevelName } from "../../schemas"
import { nLignes } from "../tableau/libelles"

export const NATURES: Record<NodeKind, string> = {
  page: "Page",
  procedure: "Procédure",
  context: "Contexte",
  table: "Tableau",
}

export const INTROUVABLE = "Cette page n'existe pas ou ne vous est pas partagée."
export const PAGE_VIDE = "Cette page n'a pas encore de contenu."
export const ARBRE_TRONQUE = "L'arbre n'affiche que les 5 000 premiers nœuds."

/** Les mots de l'écran porté d'oto-frontend (E05-S09, partie c1) : en-tête, états, accès, sous-pages. */
export const ECRAN = {
  /** Le titre d'un écran qui n'a pas de nœud à nommer (lecture en échec). */
  page: "Page",
  introuvable: "Page introuvable",
  echec: "Ce contenu n'a pas pu être chargé",
  chargement: "Chargement de la page…",
  allerATouLeMonde: "Aller à Tout le monde",
  /** Le périmètre et le verbe qui dit qu'on peut le changer, en un seul bouton (oto-frontend). */
  partager: (espace: string) => `Partager · ${espace}`,
  panneauDePartage: (espace: string) => `Partager — ${espace}`,
  voirLaVersionPubliee: "Voir la version publiée",
  versionPubliee: (revision: number) => `Version publiée (révision ${revision}).`,
  revenirAuBrouillon: "Revenir au brouillon",
  rangeAilleurs: "rangé ailleurs",
} as const

/** Le nom d'une nature dans un résumé compté (« 2 pages · 1 procédure »), au pluriel du français. */
const NOMS_DE_NATURE: Record<NodeKind, { un: string; plusieurs: string }> = {
  page: { un: "page", plusieurs: "pages" },
  procedure: { un: "procédure", plusieurs: "procédures" },
  context: { un: "contexte", plusieurs: "contextes" },
  table: { un: "tableau", plusieurs: "tableaux" },
}

/** Le résumé compté d'une liste de nœuds, par nature, dans l'ordre d'apparition : calculé, jamais écrit à la main. */
export function resumeCompte(genres: readonly NodeKind[]): string {
  const comptes = new Map<NodeKind, number>()
  for (const genre of genres) comptes.set(genre, (comptes.get(genre) ?? 0) + 1)
  return [...comptes].map(([genre, nombre]) => `${nombre} ${nombre > 1 ? NOMS_DE_NATURE[genre].plusieurs : NOMS_DE_NATURE[genre].un}`).join(" · ")
}

/** Les formes qu'écrit l'écran (E05-S10, AC-a2 : un seul niveau de titre), leur libellé et le nom du champ ouvert (AC10). */
export const FORMES = {
  texte: { libelle: "Texte", champ: "ce texte" },
  titre: { libelle: "Titre", champ: "ce titre" },
  puces: { libelle: "Liste à puces", champ: "cette liste" },
  numerotee: { libelle: "Liste numérotée", champ: "cette liste numérotée" },
  cases: { libelle: "Liste à cocher", champ: "cette liste à cocher" },
  citation: { libelle: "Citation", champ: "cette citation" },
  code: { libelle: "Code", champ: "ce code" },
} as const

/** Les phrases de l'éditeur (AC9 à AC15, AC18). */
export const EDITEUR = {
  // E05-S13 (AC-21) : le geste d'une page vide dit ce qu'on fait, pas ce qu'est un bloc.
  premierBloc: "Commencer à écrire",
  lectureSeule: "Ce bloc se modifie par votre assistant.",
  enregistrement: "Enregistrement…",
  enregistre: "Brouillon enregistré.",
  supprime: "Bloc supprimé.",
  conflitAReglerDAbord: "Réglez d'abord le bloc en conflit.",
  refuse: "Vous n'avez pas le droit de modifier cette page. Votre texte est toujours là : copiez-le avant de quitter l'écran.",
  disparu: "Ce bloc ou cette page n'existe plus. Votre texte est toujours là : copiez-le avant de recharger.",
  tropGrand: "Ce bloc est trop long, ou la page est pleine : découpez le texte ou placez-le dans une autre page.",
  reseau: "La requête n'a pas abouti. Réessayez dans un instant : votre texte est toujours là.",
  pageChangee: "La page a changé pendant que vous écriviez : réessayez.",
  blocChange: "Ce bloc a changé pendant que vous écriviez. Votre texte n'a pas été enregistré : composez le texte final à partir de la version enregistrée.",
  blocEncoreChange: "Le bloc a encore changé.",
  blocSupprimeAilleurs: "Ce bloc a été supprimé du brouillon pendant que vous écriviez.",
  blocGarde: "Ce bloc a été modifié pendant que vous le supprimiez : il est gardé.",
  abandonner: "Abandonner votre texte et garder la version enregistrée ?",
  annulerLesModifications: "Annuler les modifications du bloc",
} as const

/** Les phrases de la publication (AC17) : son refus faute du niveau gestion. */
export const PUBLICATION = {
  refusee: "Vous n'avez pas le niveau gestion sur cette page.",
} as const

/** Les phrases du titre et du résumé (AC16). */
export const EN_TETE = {
  titreInvalide: "Le titre compte de 1 à 200 caractères.",
  resumeInvalide: "Le résumé compte de 1 à 200 caractères.",
  enregistre: "Titre et résumé enregistrés dans le brouillon.",
  changeAilleurs: "Le titre ou le résumé a changé pendant que vous écriviez.",
  aRenvoyer: "Le brouillon a changé pendant l'enregistrement : enregistrez de nouveau.",
} as const

/** Le genre que l'écran montre et écrit (E05-S04) : celui du brouillon s'il en change, sinon celui du nœud. */
export function genreDuNoeud(vue: Pick<NodeView, "kind" | "draft">): NodeKind {
  return vue.draft?.kind ?? vue.kind
}

/**
 * La phrase qui tient lieu de « Publier » au niveau écriture (AC8) : à qui revient la publication,
 * selon le propriétaire effectif (H63, H66 : l'administrateur gère partout sauf dans un espace personnel).
 */
export function phraseDePublication(proprietaire: NodeView["owner"], nomOrganisation: string): string {
  if (proprietaire.kind === "team" && proprietaire.leadName) {
    return `La publication revient au responsable de l'équipe ${proprietaire.teamName ?? ""} (${proprietaire.leadName}) ou à un administrateur.`
  }
  if (proprietaire.kind === "user") return `La publication revient à ${proprietaire.userName ?? "son propriétaire"}.`
  return `La publication revient aux administrateurs de ${nomOrganisation}.`
}

/** Les phrases du déplacement (AC20, AC21) ; tout autre refus prend le texte de `messageDErreur`. */
export const DEPLACEMENT = {
  choisir: "Choisissez un parent",
  nouveauChemin: (chemin: string) => `Nouveau chemin : ${chemin}`,
  alias: (chemin: string) => `L'ancien chemin ${chemin} restera valable : les liens et les assistants qui l'emploient seront redirigés.`,
  sousPages: (nombre: number) => (nombre > 1 ? `Ses ${nombre} sous-pages suivent.` : "Sa sous-page suit."),
  proprietaire: "Sans propriétaire propre, la page prendra celui de sa nouvelle place.",
  refuse: "Ce déplacement vous est refusé : il faut la gestion de la page et l'écriture sous le nouveau parent.",
  parentDisparu: "Ce parent n'existe plus ou ne vous est plus partagé.",
  // E05-S13 (AC-20) : plus de bouton « Déplacer » en tête de page, le rail déplace ; l'envoi du formulaire reste.
  envoyer: "Déplacer ici",
  annuler: "Annuler",
  nouveauParent: "Nouveau parent",
} as const

/** Les natures au masculin dans « modifié … » : un Contexte, un tableau (E05-S10, AC-a7). */
const AU_MASCULIN: ReadonlySet<NodeKind> = new Set(["context", "table"])

/**
 * La ligne sous le titre (E05-S10, AC-a7) : « modifiée <quand>, par <qui> », une moitié inconnue se tait ;
 * `null` sans l'une ni l'autre. Le type, l'état, la révision et le propriétaire passent dans son infobulle.
 */
export function modifieeDuNoeud(noeud: Pick<NodeView, "kind">, modifiee: { quand?: string; qui?: string | null }): string | null {
  if (!modifiee.quand && !modifiee.qui) return null
  const accord = AU_MASCULIN.has(noeud.kind) ? "modifié" : "modifiée"
  const quand = modifiee.quand ? ` ${modifiee.quand}` : ""
  const qui = modifiee.qui ? `${quand ? "," : ""} par ${modifiee.qui}` : ""
  return `${accord}${quand}${qui}`
}

/** Les intitulés de l'infobulle de la ligne sous le titre (AC-a7). */
export const INFOBULLE = { type: "Type", etat: "État", revision: "Révision", lignes: "Lignes", proprietaire: "Propriétaire" } as const

/** Le type, l'état et la révision d'un nœud, puis ses lignes pour un tableau : les lignes de l'infobulle (AC-a7). */
export function detailsDuNoeud(noeud: Pick<NodeView, "kind" | "status" | "revision" | "rowsTotal">): { intitule: string; valeur: string }[] {
  const e = AU_MASCULIN.has(noeud.kind) ? "" : "e"
  const publie = noeud.status === "published"
  const lignes = noeud.kind === "table" && noeud.rowsTotal !== undefined ? [{ intitule: INFOBULLE.lignes, valeur: nLignes(noeud.rowsTotal) }] : []
  return [
    { intitule: INFOBULLE.type, valeur: NATURES[noeud.kind] },
    { intitule: INFOBULLE.etat, valeur: publie ? `Publié${e}` : "Brouillon" },
    { intitule: INFOBULLE.revision, valeur: publie ? String(noeud.revision) : `jamais publié${e}` },
    ...lignes,
  ]
}

/** Les niveaux d'accès dans « Partager » (E05-S10, AC-b5), les mots de Notion ; les niveaux eux-mêmes ne changent pas. */
export const NIVEAUX_D_ACCES: Record<AccessLevelName, string> = {
  none: "Aucun accès",
  read: "Peut lire",
  write: "Peut modifier",
  manage: "Accès complet",
}

/** Les phrases du panneau « Partager » (AC-b5) : ni « règle » ni « niveau » à l'écran. */
export const PARTAGE = {
  ajouter: "Ajouter une personne ou une équipe",
  suggestions: "Personnes et équipes",
  rienTrouve: "Aucune personne ni équipe de ce nom.",
  ontAcces: "Ont accès",
  personneAjoutee: "Personne n'a été ajouté à ce contenu.",
  accesGeneral: "Accès général",
  equipe: (nom: string) => `Équipe ${nom}`,
  vous: "vous",
  accesDe: (nom: string) => `Accès de ${nom}`,
  retirer: "Retirer",
  ajoute: (nom: string) => `${nom} peut lire ce contenu.`,
  change: (nom: string, niveau: string) => `${nom} : ${niveau.toLowerCase()}.`,
  retire: (nom: string) => `${nom} n'a plus d'accès propre à ce contenu.`,
  votreAcces: (niveau: string) => `Votre accès : ${niveau.toLowerCase()}.`,
  reserve: "Seules les personnes qui ont l'accès complet changent le partage.",
  toutLeMonde: (organisation: string) => `Tous les membres de ${organisation}`,
  equipeEtAjoutes: (equipe: string) => `L'équipe ${equipe} et les personnes ajoutées`,
  ajoutesSeulement: "Seulement les personnes ajoutées",
  detailEquipe: "L'équipe peut modifier ; son responsable a l'accès complet.",
  detailPerso: (qui: string) => `${qui} a l'accès complet.`,
  introuvable: INTROUVABLE,
} as const

/** Le bandeau « Contenus liés » (E05-S10, AC-b6) et ses trois rubriques (E05-S11, AC-29, fiche D107). */
export const CONTENUS_LIES = {
  titre: "Contenus liés",
  sousPages: "Sous-pages",
  mentionnes: "Mentionnés",
  mentionneDans: "Mentionné dans",
  sansCible: "sans cible",
  deplace: (vers: string) => `déplacé vers ${vers}`,
  autres: (nombre: number) => (nombre > 1 ? `et ${nombre} autres` : "et 1 autre"),
  chargement: "Lecture des mentions…",
  nMentionnes: (nombre: number) => (nombre > 1 ? `${nombre} mentionnés` : "1 mentionné"),
  nMentionneDans: (nombre: number) => (nombre > 1 ? `mentionné dans ${nombre} contenus` : "mentionné dans 1 contenu"),
} as const

/** Le menu d'un bloc, ouvert par sa poignée (E05-S10, AC-a2). */
export const MENU_DU_BLOC = {
  monter: "Monter",
  descendre: "Descendre",
  style: "Style",
  dupliquer: "Dupliquer",
  supprimer: "Supprimer",
  /** Le nom d'une case d'une liste à cocher, par son texte. */
  case: (texte: string) => `Cocher « ${texte || "élément vide"} »`,
} as const

/** La publication seule (E05-S10, AC-a6) : ce qui se dit quand elle n'aboutit pas ; le texte reste. */
export const PUBLICATION_SEULE = {
  enregistre: "Enregistré.",
  pageChangee: "La page a changé pendant que vous écriviez : votre texte est gardé, il sera publié à votre prochaine modification.",
  reessayer: "Réessayer",
  contexteVide: "Ce contexte est vide : il n'est pas publié tant que vous ne le confirmez pas.",
} as const

/** « @ » dans un bloc (E05-S10, AC-a9) : la recherche des contenus à citer. */
export const CITER = {
  liste: "Contenus à citer",
  invite: "Tapez au moins deux lettres du contenu à citer.",
  recherche: "Recherche…",
  aucun: "Aucun contenu trouvé.",
  panne: "La recherche n'a pas abouti. Continuez à taper pour réessayer.",
} as const

/**
 * L'accès général dans « Partager » (E05-S10, AC-b13 ; ADR-014) : la règle de toute l'organisation, à un niveau,
 * ou aucune ; ce que l'espace donne déjà se dit à côté (Tout le monde lit, l'équipe modifie).
 */
export const ACCES_GENERAL = {
  qui: "Qui a accès en général",
  niveau: "Niveau de toute l'organisation",
  toute: (organisation: string) => `Toute l'organisation ${organisation}`,
  toutLeMondeLit: "Dans Tout le monde, chaque membre lit au moins ce contenu.",
  prive: "Un contenu de Privé ne s'ouvre pas à toute l'organisation : ajoutez des personnes ou des équipes.",
  ouvert: (niveau: string) => `Toute l'organisation : ${niveau.toLowerCase()}.`,
  restreint: "Accès général : seules les personnes ajoutées et l'espace du contenu.",
} as const

/**
 * Les refus de `POST nodes/access` (ADR-014 § 2 ; `setGeneralAccess`), par code : la table commune ne dit ni
 * l'accès complet réservé, ni Privé, ni le changement venu d'ailleurs.
 */
export const REFUS_DE_L_ACCES_GENERAL = {
  forbidden: "Vous ne pouvez pas changer l'accès général de ce contenu : il faut l'accès complet, et seul un administrateur ouvre l'accès complet à toute l'organisation.",
  invalid_arguments: ACCES_GENERAL.prive,
  conflict: "L'accès général a changé pendant votre geste : fermez puis rouvrez « Partager ».",
} as const

/** « Partager sur le web » (E05-S10, partie d ; ADR-013) : le lien public d'un contenu, pour qui en a l'accès complet. */
export const PARTAGE_WEB = {
  titre: "Partager sur le web",
  explication: "Toute personne qui a le lien lit la dernière version publiée, sans compte ; jamais indexé par un moteur de recherche.",
  /** Ce que copie le bouton : « Copier le lien ». */
  cible: "le lien",
  sousContenus: "Inclure les sous-contenus",
  sousContenusDetail: "Les contenus dessous que vous lisez s'ouvrent aussi depuis la page publique.",
  desactiver: "Désactiver le lien",
  question: "Désactiver ce lien ? Il ne mènera plus à rien ; un nouveau lien aura une autre adresse.",
  chargement: "Lecture du lien public…",
  reessayer: "Réessayer",
  cree: "Lien public créé : copiez-le pour le partager.",
  avecSousContenus: "Les sous-contenus s'ouvrent depuis la page publique.",
  sansSousContenus: "Les sous-contenus ne s'ouvrent plus depuis la page publique.",
  desactive: "Lien désactivé : il ne mène plus à rien.",
} as const

/** Les refus du service propres au partage sur le web (ADR-013 § 2, § 3 ; HN-E05S10e-19), par code. */
export const REFUS_DU_PARTAGE_WEB = {
  invalid_arguments:
    "Ce contenu ne se partage pas sur le web : la racine, Privé, un espace personnel, un Contexte et le dossier d'une équipe restent dans l'organisation. Partagez une page qu'ils contiennent.",
  forbidden: "Vous ne pouvez pas partager ce contenu sur le web : il faut l'accès complet, et un contenu du Privé d'une autre personne ne se partage que par elle.",
  conflict: "Le lien a changé pendant votre geste : fermez puis rouvrez « Partager ».",
} as const
