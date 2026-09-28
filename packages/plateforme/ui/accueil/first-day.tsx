// L'accueil du premier jour (E05-S09, partie b, AC-b1) : une phrase, là où l'accueil aurait posé côte à côte
// deux façons de dire « il n'y a rien » sans dire par quoi commencer. Server Component. Porté d'oto-frontend
// (`accueil/first-day.tsx`). Repris : « Rien n'a encore tourné », aucun geste (le geste utile est ailleurs,
// et la phrase le nomme). Changé : la phrase parle de l'assistant de la personne et nomme « Brancher un
// assistant », toujours à côté, au lieu d'un agent d'Oto et du « + » du rail qui créait une équipe ; elle
// tient l'onglet « Activités » de l'îlot principal au lieu d'un îlot à elle, l'onglet « Contexte » restant
// ouvert dès le premier jour (E05-S11, AC-12, HN-E05S11-11).
import { EmptyState } from "../ds/react/empty-state"
import { PREMIER_JOUR } from "./libelles"

export function FirstDay() {
  return <EmptyState title={PREMIER_JOUR.rien}>{PREMIER_JOUR.texte}</EmptyState>
}
