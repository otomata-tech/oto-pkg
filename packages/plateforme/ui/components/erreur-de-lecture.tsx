// Une lecture en échec (E05-S03, AC2 ; `portage-ecrans.md § 4`), le seul composant des écrans du paquet
// (M37) : l'`Alert` du design system en ton d'échec (`role="alert"`), titrée « Chargement impossible » ou
// par la phrase de l'écran, le message de l'adaptateur (`resultatDe`) dessous, et « Réessayer ». Server
// Component, monté aussi par des îlots client (accueil).
//
// Porté d'oto-frontend (`settings/members-table.tsx`, `accueil/agents-et-activites.tsx`,
// `procedure/fiche-procedure.tsx` : `Alert tone="fail"`, « Chargement impossible », `Button` secondaire
// « Réessayer »). Changé : `refetch` de TanStack Query devient le lien de l'hôte vers la même adresse,
// habillé en bouton du design system comme oto-frontend habille son `Link` ; sans lien ni adresse
// (l'accueil), la relecture de la page (`RelireLaPage`).
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { Alert } from "../ds/react/primitives"
import { RelireLaPage } from "./relire-la-page"

const REESSAYER = "Réessayer"

type ErreurDeLectureProps = {
  /** Le message de la lecture (`resultatDe`), déjà dit en français. */
  message: string
  /** La phrase de l'écran, quand elle dit ce qui a échoué (« Le contrôle n'a pas pu être lancé. »). */
  titre?: string
} & ({ href: string; Lien: LienDeLHote } | { href?: undefined; Lien?: undefined })

export function ErreurDeLecture({ message, titre = "Chargement impossible", href, Lien }: ErreurDeLectureProps) {
  const reessayer =
    href !== undefined && Lien ? (
      <Lien href={href} className="oto-btn anim-host" data-variant="secondary" data-size="md" data-press="">
        <span>{REESSAYER}</span>
      </Lien>
    ) : (
      <RelireLaPage>{REESSAYER}</RelireLaPage>
    )
  return (
    <Alert tone="fail" title={titre} actions={reessayer}>
      {message}
    </Alert>
  )
}
