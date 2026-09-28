// L'onglet « Membres » (E05-S03, AC4 à AC9 ; porté sur oto-frontend par E05-S09 partie d1) : les tuiles qui
// filtrent, la recherche, puis le tableau des personnes, où chaque invitation en attente est une ligne.
// Server Component : il lit les données reçues, les cherche, filtre et trie selon l'adresse de l'hôte, et ne
// passe aux îlots que des données et des adresses. Porté d'oto-frontend (`members-table.tsx`, `MembersTable`) :
// un seul conteneur, cible du repli du focus hors de la tabulation ; les tuiles en tête. Changé : une lecture
// dont dépendent les invitations (elles-mêmes, ou les équipes qui les nomment) se dit par son alerte, et le
// tableau montre alors les membres seuls, sans tuile d'invitations (on ne sait pas), jamais « Équipe
// inconnue » (AC2). Retiré : TanStack Query et `useMe` (qui regarde est servi par la page).
import type { MemberView, ReglagesDesListes, TeamView } from "../../schemas"
import type { Resultat } from "../api/resultat"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { lignesDesPersonnes, type InvitationsLues } from "./lignes-des-personnes"
import { OutilsDesPersonnes } from "./outils-des-personnes"
import { TableauDesPersonnes } from "./tableau-des-personnes"
import type { InvitationEnAttente, Moi, Navigation, OptionsDInvitation } from "./types"

/** Le conteneur de l'onglet, qui reçoit le focus quand un geste emporte son déclencheur. */
export const ANCRE_DES_PERSONNES = "equipes-personnes"

export type OngletMembresProps = {
  nomOrganisation: string
  moi: Moi
  membres: Resultat<MemberView[]>
  invitations: Resultat<InvitationEnAttente[]>
  optionsDInvitation: Resultat<OptionsDInvitation | null>
  equipes: Resultat<TeamView[]>
  reglages: ReglagesDesListes
  navigation: Navigation
  /** L'adresse de l'onglet sous d'autres réglages ; un réglage absent y prend son défaut. */
  adresseAvec: (reglages: Partial<ReglagesDesListes>) => string
}

/** « /equipes?onglet=membres&sens=desc » : le chemin et ses paramètres, auxquels la recherche ajoute `q`. */
function decouper(adresse: string): { chemin: string; parametres: [string, string][] } {
  const [chemin, requete = ""] = adresse.split("?")
  return { chemin, parametres: [...new URLSearchParams(requete)] }
}

/** Les lectures en échec de l'onglet, autres que la liste des membres : chacune se dit, avec « Réessayer ». */
function echecsDe({ optionsDInvitation, invitations, equipes }: Pick<OngletMembresProps, "optionsDInvitation" | "invitations" | "equipes">) {
  const lectures = [
    { cle: "options", message: optionsDInvitation.error },
    { cle: "invitations", message: invitations.error },
    { cle: "equipes", message: equipes.error },
  ]
  return lectures.filter((lecture): lecture is { cle: string; message: string } => lecture.message !== undefined)
}

export function OngletMembres(props: OngletMembresProps) {
  const { nomOrganisation, moi, membres, invitations, equipes, reglages, navigation, adresseAvec } = props
  if (membres.error !== undefined) return <ErreurDeLecture message={membres.error} href={navigation.ici} Lien={navigation.Lien} />
  const lues: InvitationsLues | null =
    invitations.error === undefined && equipes.error === undefined
      ? { invitations: invitations.data, nomsDesEquipes: new Map(equipes.data.map((equipe) => [equipe.id, equipe.name])) }
      : null
  return (
    <div id={ANCRE_DES_PERSONNES} tabIndex={-1} className="flex flex-col gap-4">
      <OutilsDesPersonnes
        nomOrganisation={nomOrganisation}
        personnes={membres.data.length}
        invitations={lues ? lues.invitations.length : null}
        filtre={reglages.filtre}
        q={reglages.q}
        adresses={{
          tous: adresseAvec({ ...reglages, filtre: undefined }),
          invitations: adresseAvec({ ...reglages, filtre: "invitations" }),
          recherche: decouper(adresseAvec({ ...reglages, q: "" })),
        }}
      />
      {echecsDe(props).map((lecture) => (
        <ErreurDeLecture key={lecture.cle} message={lecture.message} href={navigation.ici} Lien={navigation.Lien} />
      ))}
      <TableauDesPersonnes
        lignes={lignesDesPersonnes(membres.data, lues, moi, reglages)}
        moi={moi}
        nomOrganisation={nomOrganisation}
        toutes={equipes.error === undefined ? equipes.data.map((equipe) => ({ id: equipe.id, nom: equipe.name })) : null}
        sens={reglages.sens}
        adresses={{ asc: adresseAvec({ ...reglages, sens: "asc" }), desc: adresseAvec({ ...reglages, sens: "desc" }), sansFiltre: adresseAvec({ sens: reglages.sens }) }}
        filtrePose={reglages.q !== "" || reglages.filtre !== undefined}
        ancre={ANCRE_DES_PERSONNES}
      />
    </div>
  )
}
