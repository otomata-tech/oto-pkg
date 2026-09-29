import type { ConnectAddress } from "@otomata_tech/oto_platform/server"
import type { AdresseDeConnexion } from "@otomata_tech/oto_platform/ui"

// Les noms anglais du service de branchement vers la forme des écrans (E11-S09) : l'accueil, dont la
// fenêtre montre le guide, et `/connect` font copier la même adresse, les mêmes noms, la même phrase.

export function adresseDe({ url, name, cliName, preferenceSentence }: ConnectAddress): AdresseDeConnexion {
  return { url, nom: name, nomCli: cliName, phrase: preferenceSentence }
}
