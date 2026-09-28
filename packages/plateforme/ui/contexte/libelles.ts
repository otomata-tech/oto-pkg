// Les libellés français d'un Contexte (E05-S04, AC10 à AC12 ; P39) : qui le reçoit, les noms des blocs de l'aperçu,
// les lignes servies traduites (E05-S13), la publication d'un Contexte (« Ma fiche » : Profil, E05-S11). Tout autre
// refus prend le texte de `messageDErreur` (`ui/api/messages.ts`), jamais une seconde table.
//
// Repris d'oto-frontend (`contexte/annexes-du-contexte.tsx`) : « À quoi sert cette page », une phrase de
// cloisonnement par grain, jamais le nom d'un collègue. Retiré : « déposé dans les instructions du
// serveur MCP » (architecture § 10), l'aide servie (`help`).
import type { TeamView } from "../../schemas"
import { PERSO, SECTION_PERSO, TOUT_LE_MONDE } from "../arbre/depuis-l-arbre"
import { nombreLisible } from "../format/nombres"
import { estUnContexte } from "./parties-du-contexte"

/** Les équipes de l'organisation (`listTeams`) : le nom d'un Contexte d'équipe. */
export type EquipesNommees = readonly Pick<TeamView, "slug" | "name">[]

/**
 * La portée d'un Contexte, par son chemin (P39) : `contexte`, `<équipe>/contexte`, `private/<handle>/contexte` ;
 * `private-d-autrui` : le Contexte Perso d'une autre personne, qui l'a partagé, servi à elle seule.
 */
export type Portee = { genre: "all" } | { genre: "equipe"; nom: string } | { genre: "private" } | { genre: "private-d-autrui" }

/** La portée d'un Contexte par son chemin (P39) ; une équipe se nomme par `listTeams`, sinon par son slug. */
export function porteeDe(chemin: string, equipes: EquipesNommees): Portee {
  if (chemin === "contexte") return { genre: "all" }
  // `private` seul : la partie du Privé d'une personne sans `handle` (E05-S12, AC-3).
  if (chemin === PERSO || chemin.startsWith(`${PERSO}/`)) return { genre: "private" }
  const slug = chemin.split("/")[0]
  return { genre: "equipe", nom: equipes.find((equipe) => equipe.slug === slug)?.name ?? slug }
}

/**
 * « À quoi sert cette page » (E05-S13, retour 9, AC-17 ; D128) : deux phrases dans un seul style, qui le reçoit par sa
 * portée, puis comment il s'écrit ; sans « Reçu par », ni recharge, ni cloisonnement en pied.
 */
export const ANNEXES = {
  titre: "À quoi sert cette page",
  /** La seconde phrase (HN-E05S13-16) : la fin de l'introduction d'oto-frontend, seule gardée. */
  ecriture: "Vous l'écrivez comme n'importe quelle page.",
} as const

/**
 * La première phrase, par portée (D128, textes de JB) ; le Privé d'une autre personne, au même modèle : le lire ou
 * l'écrire ne le fait pas recevoir (HN-E05S04-22).
 */
export function aQuoiSert(portee: Portee): string {
  if (portee.genre === "all") return "Ce que les assistants de tous les membres de l'organisation lisent à chaque conversation."
  if (portee.genre === "equipe") return `Ce que les assistants des membres de l'équipe ${portee.nom} lisent à chaque conversation.`
  if (portee.genre === "private") return "Ce que votre assistant lit à chaque conversation ; vous seul le recevez."
  return "Ce que l'assistant de la personne de cet espace lit à chaque conversation ; elle seule le reçoit."
}

/**
 * Les blocs de `context` qui ne sont pas un Contexte, par leur nom servi (E03-S08) ; un nom inconnu se montre
 * tel quel (AC12). E05-S12 (D109, AC-6, AC-11, AC-20) : le bloc `code` porte les règles de l'espace ; les faits
 * de la personne, de l'organisation et des équipes ouvrent la partie de leur Contexte.
 */
export const NOMS_DES_BLOCS: Readonly<Record<string, string>> = {
  code: "Règles Oto",
  news: "Nouveautés",
  procedures: "Procédures utiles",
  "recent content": "Contenus récents",
}

/**
 * Le nom d'un bloc servi (AC12) : la partie d'un Contexte, reconnue à son `name` (le chemin de son Contexte,
 * servi ou non, E05-S12 AC-6), nommée par sa portée (l'équipe par son nom ; le Privé servi est celui de la
 * personne) ; les autres par leur nom servi traduit, un nom inconnu tel quel. Lu par l'encart d'un Contexte et
 * par la vue « Contexte » de l'accueil (E05-S11, AC-13).
 */
export function nomDuBloc(bloc: { name: string }, equipes: EquipesNommees): string {
  if (!estUnContexte(bloc.name)) return NOMS_DES_BLOCS[bloc.name] ?? bloc.name
  const portee = porteeDe(bloc.name, equipes)
  if (portee.genre === "equipe") return `Contexte : équipe ${portee.nom}`
  return `Contexte : ${portee.genre === "all" ? TOUT_LE_MONDE : SECTION_PERSO}`
}

/**
 * L'encart d'un Contexte (E05-S11, AC-9, retour 4 de JB) : ce que lit l'agent, dans l'ordre. E05-S13 (retour 7, AC-13) :
 * sans taille, état, note des versions ni total ; « Ordre de lecture » ne reste que le nom accessible de la liste.
 */
export const APERCU_DU_CONTEXTE = {
  titre: "Voici ce que votre agent va lire",
  legende: "Ordre de lecture",
  ceContexte: "(ce contexte)",
  echec: "L'aperçu n'a pas pu être calculé.",
} as const

/** La vue « Contexte » de l'accueil (E05-S11, AC-13 à AC-15) : les parties du texte servi, empilées, sans chiffres (E05-S13). */
export const CONTEXTE_SERVI = {
  omise: "Cette partie ne tient pas dans le budget : l'assistant ne la lit pas.",
  profil: "Modifier dans Profil",
  fin: "Fin du texte",
} as const

/** « page », « tableau » : la nature d'un contenu récent servi (`page`, `table`) ; une autre, telle que servie. */
const NATURES: Readonly<Record<string, string>> = { page: "page", table: "tableau" }

/** Accordé au nombre : « 1 procédure », « 3 procédures ». */
function accorde(nombre: number, singulier: string, pluriel: string): string {
  return `${nombreLisible(nombre)} ${nombre > 1 ? pluriel : singulier}`
}

/**
 * Les lignes servies dites en français (E05-S13, retour 8, AC-14, AC-15 ; HN-E05S13-12) ; le texte servi ne change
 * pas. Les dates arrivent lisibles (`dateLisible`), les noms de blocs traduits (`nomDuBloc`).
 */
export const LIGNES_SERVIES = {
  procedures: (nombre: number) => accorde(nombre, "procédure", "procédures"),
  aucuneProcedure: "Aucune procédure publiée.",
  autresProcedures: (nombre: number) => `… et ${accorde(nombre, "autre", "autres")}, que l'assistant trouve par la recherche.`,
  depuis: (date: string) => `Depuis le ${date}`,
  version: (revision: number, date: string) => `version ${revision}, publiée le ${date}`,
  connecteur: (nom: string, date: string) => `Connecteur ${nom} activé le ${date}`,
  rienDeNouveau: "Rien de nouveau.",
  recent: (nature: string, date: string) => `${NATURES[nature] ?? nature}, ${date}`,
  children: "Rangés sous ce contexte",
  linked: "Pages citées",
  suite: "La suite de ce contexte est lue à la demande.",
  nonCharge: "Non chargé : l'assistant le lira à la demande.",
  coupe: (nom: string) => `${nom} (coupé)`,
  autres: (nombre: number) => accorde(nombre, "autre", "autres"),
  budget: (noms: string) => `Budget atteint : l'assistant ne lit pas ${noms}.`,
} as const

/**
 * « Règles Oto » en français (HN-E05S13-14) : une phrase par règle de `WORKSPACE_RULES` (`server/context/blocks/code.ts`),
 * dans le même ordre, sans les noms d'outils ; servies en anglais, inchangées. Un test compte les deux listes.
 */
export const REGLES_OTO: readonly string[] = [
  "Six outils : le contexte (d'abord, une fois par conversation), la recherche, la lecture, l'appel, l'écriture et le retour. Tous, sauf le contexte, demandent le code de la conversation.",
  "L'ordre habituel : le contexte, puis la recherche pour trouver, la lecture pour apprendre (un contenu, ou le contrat d'une fonction), l'appel ou l'écriture pour agir, et un retour quand un outil, une procédure ou une consigne était flou, manquant ou faux.",
  "Chaque contenu a un chemin (par exemple <équipe>/<page>) et une nature : page (du texte en blocs), tableau (des lignes, lues, agrégées et écrites par des fonctions), procédure (des étapes à suivre, chaque appel dans un bloc d'appel) ou contexte (les parties de ce texte : déjà servies, relues seulement quand elles disent avoir été coupées).",
  "Les espaces : les contenus de l'organisation sont à la racine, ceux d'une équipe sous son dossier (<équipe>/…), les vôtres sous private/<identifiant>/, servis à vous seul.",
  "Les droits se règlent contenu par contenu, pour l'organisation, une équipe ou une personne : lire, écrire ou gérer. Un refus dit à qui demander : ne jamais le contourner.",
  "L'écriture enregistre un brouillon ; la publication le met en ligne. Pour modifier, l'assistant repart de la version qu'il a lue.",
  "Un contenu renommé ou déplacé garde son ancien chemin : il y mène toujours.",
  "Dans un texte, [[chemin]] ou [[chemin|titre]] renvoie à un autre contenu.",
  "Une fonction qui envoie, supprime ou paie rend d'abord un récapitulatif sans rien faire : l'assistant le montre, obtient votre accord explicite, puis relance l'appel en le confirmant.",
  "Quand une demande correspond à une procédure, ses étapes suivent cette partie : l'assistant les suit dans l'ordre. Sinon il cherche, et vous demande plutôt que de deviner.",
  "Le journal montre ce qui a été fait, appel par appel : il fait foi, plus que la mémoire.",
  "Ne jamais inventer un chemin, un chiffre ni un résultat : le lire, ou dire qu'on n'a pas pu.",
]

/** La publication d'un Contexte (AC11, HN-E05S04-10). */
export const PUBLICATION_DU_CONTEXTE = {
  recharge: "Les conversations en cours rechargeront le contexte.",
  question: "Publier un contexte vide ? Le modèle ne recevra plus rien de ce contexte.",
  confirmer: "Publier quand même",
} as const
