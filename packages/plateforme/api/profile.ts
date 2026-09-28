// Ressource `profile` de l'API du paquet (E05-S04, AC13) : `PATCH profile` écrit la fiche de la
// personne (nom, langue) depuis « Ma fiche ». Adaptateur mince : la validation (`profilePatchSchema`),
// le refus d'un appelant sans fiche et l'écriture sont dans `updateProfile` (`server/members.ts`). Sans
// lui, une personne ne peut pas écrire sa fiche : l'API n'a aucune autre porte vers
// `update_my_profile`, la seule écriture qui ne touche que sa propre fiche.
import { updateProfile } from "../server/members"
import type { ResourceRoutes } from "./handler"

export const profileRoutes: ResourceRoutes = {
  // Sans `target` : un refus n'a pas de cible au journal, la route ne connaît pas l'identité (H07).
  PATCH: {
    params: 0,
    async handle({ db, identity, body }) {
      const { data, target } = await updateProfile(db, identity, body)
      return { status: 200, data, journal: { target } }
    },
  },
}
