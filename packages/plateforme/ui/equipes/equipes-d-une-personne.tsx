"use client"

// La cellule « Équipes » d'une personne, et le groupe « Ses équipes » que partagent ses menus (E05-S03, AC13 ;
// porté par E05-S09 partie d1). Porté d'oto-frontend (`member-actions.tsx`, `MemberTeamsCell`,
// `itemsDeSesEquipes`, `useBascule`, `EchecDeLaBascule`) : deux puces au plus sur une ligne, un « +n » qui
// ouvre le menu, un « + » nommé « Régler les équipes de … » ; une seule liste d'items pour les deux
// déclencheurs et le « ⋯ » ; cocher garde le menu ouvert (`keepOpen`) ; l'échec d'une bascule se dit sous
// son déclencheur, jamais dans le menu, qui n'a pas de fente pour un message. Changé : une case par équipe
// que qui regarde compose (toutes pour l'administrateur, les siennes pour un responsable, H72), les autres
// équipes de la personne cochées et inertes ; l'envoi par l'API du paquet (`POST` et `DELETE
// teams/<id>/members`), puis la relecture. Retiré : « Tout le monde » automatique (architecture § 4),
// `ZoneNonServie`. E05-S11 (retour 8, AC-21) : les deux déclencheurs du menu à cases prennent le bord arrondi
// des listes de choix (`oto-scope`), le menu reste le même.
import { Plus } from "@phosphor-icons/react/dist/csr/Plus"
import { teamMemberSchema } from "../../schemas"
import { AnimatedIcon } from "../ds/react/icon"
import { DropdownMenu, type MenuItem } from "../ds/react/overlays"
import { Tag } from "../ds/react/tag"
import { useGeste } from "./gestes"
import { PERSONNES, pluriel } from "./libelles"
import type { LigneDeMembre } from "./lignes-des-personnes"
import type { Moi } from "./types"

/** Une équipe de l'organisation, telle que les menus la proposent. */
export type EquipeProposee = { id: string; nom: string }

/** Deux puces : les noms d'équipes sont longs, la troisième poussait le « + » hors de la colonne (mesure d'oto-frontend). */
const PUCES_VISIBLES = 2

/** Les équipes que qui regarde compose : toutes pour l'administrateur, celles qu'il dirige pour un responsable (H72). */
export function equipesComposables(toutes: readonly EquipeProposee[] | null, moi: Moi): EquipeProposee[] {
  return (toutes ?? []).filter((equipe) => moi.estAdmin || moi.equipesDirigees.includes(equipe.id))
}

/** Le groupe « Ses équipes » : une case par équipe composée, cochée si la personne en est ; ses autres équipes, cochées et inertes. */
export function itemsDeSesEquipes(membre: LigneDeMembre, composables: readonly EquipeProposee[], basculer: (equipe: EquipeProposee) => void, enCours: boolean): MenuItem[] {
  const siennes = new Set(membre.equipes.map((equipe) => equipe.id))
  const composees = new Set(composables.map((equipe) => equipe.id))
  const cases: MenuItem[] = composables.map((equipe) => ({
    label: equipe.nom,
    checked: siennes.has(equipe.id),
    keepOpen: true,
    disabled: enCours,
    onSelect: () => basculer(equipe),
  }))
  const inertes: MenuItem[] = membre.equipes.filter((equipe) => !composees.has(equipe.id)).map((equipe) => ({ label: equipe.nom, checked: true, disabled: true }))
  return [{ group: "Ses équipes" }, ...cases, ...inertes]
}

/**
 * Ajouter la personne à une équipe, ou l'en retirer, selon qu'elle en est. `apresUnDepart`, s'il est donné,
 * suit chaque succès : retirer la troisième équipe emporte le « +n » et son menu ouvert à la relecture, et le
 * focus qui y était va à l'ancre du tableau ; un déclencheur resté en place garde le sien (`replierLeFocusSur`).
 */
export function useBascule(membre: LigneDeMembre, apresUnDepart?: () => void) {
  const geste = useGeste()
  const suites = { succes: apresUnDepart }
  const basculer = (equipe: EquipeProposee) => {
    if (membre.equipes.some((sienne) => sienne.id === equipe.id)) {
      geste.envoyer({ methode: "DELETE", ressource: `teams/${equipe.id}/members/${membre.id}` }, undefined, suites)
      return
    }
    const saisie = teamMemberSchema.safeParse({ userId: membre.id })
    if (saisie.success) geste.envoyer({ methode: "POST", ressource: `teams/${equipe.id}/members`, corps: saisie.data }, undefined, suites)
  }
  return { ...geste, basculer }
}

/** L'échec d'une bascule, sous son déclencheur : `role="alert"` l'annonce sans déplacer le focus. */
export function EchecDuGeste({ erreur }: { erreur: string }) {
  if (!erreur) return null
  return (
    <span role="alert" className="oto-field-error">
      {erreur}
    </span>
  )
}

/** Les puces des premières équipes, ou « Aucune », un mot plutôt qu'une cellule blanche. */
function PucesDesEquipes({ equipes }: { equipes: LigneDeMembre["equipes"] }) {
  if (equipes.length === 0) return <span className="oto-caption">{PERSONNES.aucune}</span>
  return equipes.slice(0, PUCES_VISIBLES).map((equipe) => <Tag key={equipe.id}>{equipe.nom}</Tag>)
}

type EquipesDUnePersonneProps = {
  membre: LigneDeMembre
  toutes: readonly EquipeProposee[] | null
  moi: Moi
  /** Le repli du focus du tableau, quand la relecture emporte le « +n » où il était. */
  apresUnDepart: () => void
}

export function EquipesDUnePersonne({ membre, toutes, moi, apresUnDepart }: EquipesDUnePersonneProps) {
  const { basculer, erreur, enCours } = useBascule(membre, apresUnDepart)
  const composables = equipesComposables(toutes, moi)
  const cachees = Math.max(0, membre.equipes.length - PUCES_VISIBLES)
  const items = itemsDeSesEquipes(membre, composables, basculer, enCours)
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-1">
        <PucesDesEquipes equipes={membre.equipes} />
        {cachees > 0 && (
          <DropdownMenu
            align="start"
            trigger={
              <button type="button" className="oto-scope" aria-label={`Et ${pluriel(cachees, "autre équipe", "autres équipes")} de ${membre.nom}`}>
                +{cachees}
              </button>
            }
            items={items}
          />
        )}
        {composables.length > 0 && (
          <DropdownMenu
            align="start"
            trigger={
              <button type="button" className="oto-scope" data-icon-only="" aria-label={`Régler les équipes de ${membre.nom}`}>
                <AnimatedIcon as={Plus} size="xs" />
              </button>
            }
            items={items}
          />
        )}
      </span>
      <EchecDuGeste erreur={erreur} />
    </span>
  )
}
