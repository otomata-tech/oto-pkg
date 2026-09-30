// Les mots du formulaire de dépôt (E10-S02 lot f, AC-f15). Une seule table, lue par l'écran et son îlot ; les bornes
// viennent de `schemas/` (`portage-ecrans.md § 6`).
import { UPLOAD_BYTES_MAX, UPLOAD_TTL_MINUTES, type UploadKind, type UploadMode } from "../../schemas"
import { tailleLisible } from "../format/nombres"

export const DEPOT = {
  titre: "Déposer un fichier",
  description: `Le fichier part directement à la destination que l'assistant a préparée. Ce lien sert une fois, pendant ${UPLOAD_TTL_MINUTES} minutes.`,
  ilot: "Le dépôt",
  impossible: "Dépôt impossible",
  destination: "Destination",
  depot: "Dépôt",
  fichier: "Fichier",
  valable: "Valable jusqu'à",
  genres: {
    file: "un fichier joint à une page",
    md: "une page tirée d'un fichier Markdown",
    csv: "les lignes d'un CSV importées dans un tableau",
  } satisfies Record<UploadKind, string>,
  modes: {
    create: "création",
    attach: "ajout à la fin de la page",
    replace: "remplacement de tout le contenu",
    merge: "fusion sur la clé du tableau",
  } satisfies Record<UploadMode, string>,
  /** Ce que la zone dit avant la sélection (`uploads-patterns.md § Côté composant`). */
  limites: (genre: UploadKind) => `${tailleLisible(UPLOAD_BYTES_MAX)} au plus${genre === "file" ? "" : ", encodé en UTF-8"}.`,
  envoi: "Dépôt en cours…",
  depose: (chemin: string) => `Déposé dans ${chemin}. Revenez à la conversation : l'assistant relira la destination.`,
  /** Ce qui remplace la zone après un refus qui a servi le lien : un nouvel essai serait refusé. */
  clos: "Ce lien ne peut plus servir : demandez-en un nouveau à l'assistant.",
} as const

/** Les refus du dépôt qui ont leur phrase ; les autres, la table commune (`messageDErreur`). */
export const REFUS_DU_DEPOT = {
  not_found: "Ce lien de dépôt est inconnu, déjà utilisé, expiré, ou demandé par une autre personne. Demandez un nouveau lien à l'assistant.",
  too_large: `Le fichier dépasse ${tailleLisible(UPLOAD_BYTES_MAX)} : joignez-le depuis la page.`,
  invalid_arguments: "Ce fichier ne convient pas à cette destination : son type, son encodage (UTF-8) ou ses lignes. Le lien est utilisé : demandez-en un nouveau à l'assistant.",
  stale_revision: "La destination a changé depuis le lien. Le lien est utilisé : demandez-en un nouveau à l'assistant.",
  conflict: "La destination n'est plus libre, ou le stockage n'a pas répondu. Le lien est utilisé : demandez-en un nouveau à l'assistant.",
  forbidden: "Vous ne pouvez plus écrire à cette destination.",
  not_enabled: "Les fichiers ne sont pas activés sur cette plateforme.",
} as const
