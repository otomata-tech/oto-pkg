// « Drapeaux » du tableau de bord (E08-S03, AC8, AC12) : les drapeaux que déclare le paquet (registre
// d'E08-S04, vide en V1), leur état pour l'organisation et le geste qui les bascule, sans question (un
// drapeau se rebascule). Un drapeau posé en base mais non déclaré n'est pas servi (`listFlags`). Server
// Component : les gestes sont les `ActionPlateforme` d'E05-S03.
//
// Absent d'oto-frontend, qui n'a pas de drapeaux par organisation : écrit d'après ADR-006 § 7 et H107, puis
// recopié sur la grammaire de ses écrans de réglages (E05-S09 partie d2) : l'en-tête et son fil, un îlot, une
// ligne par drapeau (`RowList`, `Row`), l'état en `Badge` qui dit en texte ce que la teinte double, le vide en
// `EmptyState`.
import { Flag } from "@phosphor-icons/react/dist/ssr/Flag"
import type { FlagView } from "../../../schemas"
import type { Resultat } from "../../api/resultat"
import { ActionPlateforme } from "../../components/action-plateforme"
import { EmptyState } from "../../ds/react/empty-state"
import { Badge } from "../../ds/react/primitives"
import { Row, RowList } from "../../ds/react/row-list"
import { EnTeteDAdministration } from "../en-tete"
import { ErreurDeLecture } from "../../components/erreur-de-lecture"
import { Chargement, Ilot } from "../ilot"
import { MESSAGES_DES_DRAPEAUX } from "../textes"
import type { FilDeLEcran, LienDeLAdministration } from "../types"

export type EcranDrapeauxProps = {
  resultat: Resultat<FlagView[]>
  Lien: LienDeLAdministration
  /** L'adresse de l'écran dans l'hôte : « Réessayer » d'une lecture en échec y ramène. */
  ici: string
  /** Le fil de l'en-tête : les adresses que l'hôte donne au rail et le droit de la personne ; sans lui, pas de fil. */
  fil?: FilDeLEcran
}

/** Le titre de la liste : le focus y va quand un geste emporte sa ligne. */
const ANCRE_DES_DRAPEAUX = "admin-drapeaux"

function LigneDeDrapeau({ drapeau }: { drapeau: FlagView }) {
  const geste = drapeau.enabled ? "Désactiver" : "Activer"
  // `flex-wrap` : un refus du geste s'affiche sous lui, et la ligne passe alors à la suivante.
  return (
    <Row className="flex-wrap gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="oto-mono">{drapeau.name}</span>
        <span className="oto-caption">{drapeau.description}</span>
      </div>
      <Badge tone={drapeau.enabled ? "ok" : "idle"}>{drapeau.enabled ? "Activé" : "Désactivé"}</Badge>
      <ActionPlateforme
        libelle={geste}
        nomAccessible={`${geste} ${drapeau.name}`}
        requete={{ methode: "PATCH", ressource: "admin/flags", corps: { name: drapeau.name, enabled: !drapeau.enabled } }}
        ancre={ANCRE_DES_DRAPEAUX}
        messages={MESSAGES_DES_DRAPEAUX}
      />
    </Row>
  )
}

function Drapeaux({ drapeaux }: { drapeaux: FlagView[] }) {
  return (
    <Ilot id={ANCRE_DES_DRAPEAUX} titre="Drapeaux de l'organisation">
      <RowList rules empty={<EmptyState title="Aucun drapeau n'est déclaré par cette version de la plateforme." />}>
        {drapeaux.map((drapeau) => (
          <LigneDeDrapeau key={drapeau.name} drapeau={drapeau} />
        ))}
      </RowList>
    </Ilot>
  )
}

export function EcranDrapeaux({ resultat, Lien, ici, fil }: EcranDrapeauxProps) {
  return (
    <>
      <EnTeteDAdministration courant="drapeaux" fil={fil} titre="Drapeaux" glyphe={Flag} />
      {resultat.error !== undefined ? <ErreurDeLecture message={resultat.error} href={ici} Lien={Lien} /> : <Drapeaux drapeaux={resultat.data} />}
    </>
  )
}

/** L'état de chargement, rendu par le `loading.tsx` de l'hôte (AC12). */
export function EcranDrapeauxChargement() {
  return <Chargement texte="Chargement des drapeaux…" />
}
