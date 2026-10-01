// Les messages de Zod, installés par un appel et non par l'import. `zod` se déclare sans effet de bord
// (`sideEffects: false`) : l'empaqueteur d'un hôte en production saute le module de `zod/v4` dont la seule instruction
// propre installe les messages anglais, et tout refus de saisie dit alors « Invalid input », sans nommer ni la valeur
// attendue ni la clé inconnue. Ce paquet se déclare lui aussi sans effet de bord : un import seul serait retiré de
// même, d'où une fonction, appelée par chaque porte à l'entrée d'une requête.
import * as z from "zod/v4"

/** Installe les messages anglais de Zod ; sans effet quand ils le sont déjà. */
export function ensureZodMessages(): void {
  if (z.config().localeError) return
  z.config(z.locales.en())
}
