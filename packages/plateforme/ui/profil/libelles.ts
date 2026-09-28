// Les libellés de la page « Profil » (E05-S11, AC-3) : repris de « Ma fiche » (E05-S04, retirée
// par E05-S11) et d'oto-frontend (`settings/profile-identity.tsx`, `language-preference.tsx`) ; les langues
// nommées dans leur propre langue. En V1, la langue règle celle dans laquelle l'assistant répond, jamais celle
// des écrans (fiche D107 : lot g sorti de la V1), et l'écran le dit.
import { PROFILE_TEXT_MAX, type Language } from "../../schemas"

export const PROFIL = {
  titre: "Profil",
  description: "Votre nom, la langue dans laquelle l'assistant vous répond, et la couleur de votre application.",
  chargement: "Chargement de votre profil",
  vous: "Vous",
  prenom: "Prénom",
  nom: "Nom",
  tropLong: `${PROFILE_TEXT_MAX} caractères au plus.`,
  preferences: "Langue et couleur",
  langue: "Langue",
  /** « Celle de l'organisation », et ce qu'elle vaut aujourd'hui. */
  langueDeLOrganisation: (langue: string) => `Celle de l'organisation (${langue})`,
  langues: { fr: "Français", en: "English" } satisfies Record<Language, string>,
  aideDeLaLangue: "La langue dans laquelle l'assistant vous répond. Les écrans restent en français.",
  couleur: "Couleur",
  couleurDeLOrganisation: "Celle de l'organisation",
  aideDeLaCouleur: "La couleur de votre application ; celle de l'organisation tant que vous n'en choisissez pas.",
  enregistrer: "Enregistrer",
  enregistrement: "Enregistrement…",
  enregistre: "Profil enregistré.",
} as const
