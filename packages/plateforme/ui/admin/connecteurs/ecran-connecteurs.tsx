// « Connecteurs » du tableau de bord (E08-S03, AC4 à AC7, AC12) : les connecteurs activables et leur
// état, qu'on active ou désactive ; les comptes simulés de l'organisation, qu'on crée ou désactive.
// Server Component : les gestes sont les `ActionPlateforme` d'E05-S03, la question d'une désactivation
// composée ici depuis son impact ; seul le formulaire de création est un îlot client.
//
// Porté d'oto-frontend (`components/connecteurs/liste-connecteurs.tsx` l. 196-234, 405-432, 480-511, et la
// capture de `/connectors`), E05-S09 partie d2. Repris : l'en-tête, deux colonnes, l'îlot des connecteurs au
// compte dans son en-tête, une ligne par connecteur (`RowList`, `Row`) sous le glyphe de prise, l'état au
// bout de la ligne, en texte et jamais par la couleur seule, des états vides qui disent la vérité ; en annexe, l'îlot où
// l'on ajoute. Retiré : replis des connexions, pagination, compteurs, états des sondes (`broken`, `noKey`,
// `overQuota`, `stepLeft` : V2), marques d'outils, liens vers une page de connecteur, pile de clés, toolbox
// (architecture § 10).
import { Plug } from "@phosphor-icons/react/dist/ssr/Plug"
import { limitReached, type AccountMode, type AccountView, type DeactivationImpact, type OrgConnector, type OrgLimitsView } from "../../../schemas"
import type { Resultat } from "../../api/resultat"
import { ActionPlateforme } from "../../components/action-plateforme"
import { EmptyState } from "../../ds/react/empty-state"
import { Icon } from "../../ds/react/icon"
import { Row, RowList } from "../../ds/react/row-list"
import { TwoColumns } from "../../ds/react/two-columns"
import { dateLisible } from "../../format/dates"
import { LimiteAtteinte } from "../../limites/limite-atteinte"
import { EnTeteDAdministration } from "../en-tete"
import { ErreurDeLecture } from "../../components/erreur-de-lecture"
import { Chargement, Ilot } from "../ilot"
import { questionDeDesactivation, questionDeDesactivationDuCompte } from "../textes"
import type { FilDeLEcran, LienDeLAdministration } from "../types"
import { CreationDeCompte } from "./creation-de-compte"

/** Ce que la page lit pour l'écran : le catalogue et son état, l'impact de chaque désactivation possible, les comptes, les équipes. */
export type DonneesDesConnecteurs = {
  connectors: OrgConnector[]
  /** Par connecteur actif : ce que sa désactivation arrête (AC5). */
  impacts: Partial<Record<string, DeactivationImpact>>
  accounts: AccountView[]
  options: { teams: { id: string; name: string }[] }
  /** Les capacités de l'organisation (`orgLimitsView`, E12-S02) ; absentes : aucune activation grisée. */
  limites?: OrgLimitsView
}

export type EcranConnecteursProps = {
  resultat: Resultat<DonneesDesConnecteurs>
  Lien: LienDeLAdministration
  /** L'adresse de l'écran dans l'hôte : « Réessayer » d'une lecture en échec y ramène. */
  ici: string
  /** Le fil de l'en-tête : les adresses que l'hôte donne au rail et le droit de la personne ; sans lui, pas de fil. */
  fil?: FilDeLEcran
}

/** Les titres des deux listes : le focus y va quand un geste emporte sa ligne. */
const ANCRE_DES_CONNECTEURS = "admin-connecteurs"
const ANCRE_DES_COMPTES = "admin-comptes"

const MODES: Record<AccountMode, string> = { simule: "simulé", sandbox: "bac à sable", reel: "réel" }
const ETATS: Record<AccountView["status"], string> = { active: "actif", disabled: "désactivé", error: "en erreur" }

function pluriel(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`
}

function etat(connecteur: OrgConnector): string {
  if (connecteur.state !== "active") return "Inactif"
  const qui = connecteur.activatedBy?.name
  return `Actif depuis le ${dateLisible(connecteur.activatedAt) ?? "?"}${qui ? ` (${qui})` : ""}`
}

/** L'activation d'un connecteur inactif : grisée au plafond de `connectors_max` (E12-S02), avec le lien de l'hôte (écran réservé aux administrateurs). */
function Activation({ nom, ressource, limites }: { nom: string; ressource: string; limites: OrgLimitsView | undefined }) {
  if (limites?.connectors && limitReached(limites.connectors)) {
    return <LimiteAtteinte libelle="Activer" nom="connectors_max" etat={limites.connectors} lien={limites.raiseUrl} />
  }
  // Réversible : sans question (N5).
  return <ActionPlateforme libelle="Activer" nomAccessible={`Activer ${nom}`} requete={{ methode: "POST", ressource, corps: {} }} ancre={ANCRE_DES_CONNECTEURS} />
}

type LigneDeConnecteurProps = { connecteur: OrgConnector; impact: DeactivationImpact | undefined; limites: OrgLimitsView | undefined }

function LigneDeConnecteur({ connecteur, impact, limites }: LigneDeConnecteurProps) {
  const nom = connecteur.connector
  const fonctions = connecteur.functions.map((fonction) => fonction.name)
  const ressource = `admin/connectors/${encodeURIComponent(nom)}/activation`
  // `flex-wrap` : la question d'une désactivation, ou un refus, passe sous la ligne au lieu de l'écraser.
  return (
    <Row className="flex-wrap gap-3" lead={<Icon as={Plug} size="sm" />}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{nom}</span>
        <span className="oto-caption">{`${pluriel(fonctions.length, "fonction", "fonctions")} : ${fonctions.join(", ")}`}</span>
      </div>
      <span className="oto-caption">{etat(connecteur)}</span>
      {connecteur.state === "active" ? (
        <ActionPlateforme
          libelle="Désactiver"
          nomAccessible={`Désactiver ${nom}`}
          requete={{ methode: "DELETE", ressource }}
          confirmation={{ question: questionDeDesactivation(nom, impact), libelleConfirmer: "Désactiver" }}
          ancre={ANCRE_DES_CONNECTEURS}
        />
      ) : (
        <Activation nom={nom} ressource={ressource} limites={limites} />
      )}
    </Row>
  )
}

type ConnecteursProps = { connecteurs: OrgConnector[]; impacts: DonneesDesConnecteurs["impacts"]; limites: OrgLimitsView | undefined }

function Connecteurs({ connecteurs, impacts, limites }: ConnecteursProps) {
  return (
    <Ilot id={ANCRE_DES_CONNECTEURS} titre="Connecteurs" compte={pluriel(connecteurs.length, "connecteur activable", "connecteurs activables")}>
      <div className="flex flex-col gap-3">
        <p className="oto-caption">Les fonctions de tableau (table.*) et celles de l&apos;application sont toujours actives : elles ne s&apos;activent pas.</p>
        <RowList rules empty={<EmptyState compact title="Aucun connecteur à activer dans cette version de la plateforme." />}>
          {connecteurs.map((connecteur) => (
            <LigneDeConnecteur key={connecteur.connector} connecteur={connecteur} impact={impacts[connecteur.connector]} limites={limites} />
          ))}
        </RowList>
      </div>
    </Ilot>
  )
}

/** Le propriétaire décrit en français (H05) : l'organisation, l'équipe nommée, ou un compte personnel. */
function proprietaire(owner: AccountView["owner"]): string {
  if (owner.kind === "team") return `équipe ${owner.teamName ?? "inconnue"}`
  return owner.kind === "org" ? "organisation" : "personnel"
}

function LigneDeCompte({ compte }: { compte: AccountView }) {
  return (
    <Row className="flex-wrap gap-3">
      <span className="min-w-0 flex-1">{[compte.label, compte.connector, proprietaire(compte.owner), MODES[compte.mode], ETATS[compte.status]].join(" · ")}</span>
      {compte.status !== "disabled" && (
        <ActionPlateforme
          libelle="Désactiver"
          nomAccessible={`Désactiver le compte ${compte.label}`}
          requete={{ methode: "POST", ressource: `admin/accounts/${encodeURIComponent(compte.id)}/disable`, corps: {} }}
          confirmation={{ question: questionDeDesactivationDuCompte(compte.label), libelleConfirmer: "Désactiver" }}
          ancre={ANCRE_DES_COMPTES}
        />
      )}
    </Row>
  )
}

type ComptesProps = { comptes: AccountView[]; connecteurs: string[]; equipes: DonneesDesConnecteurs["options"]["teams"] }

/** Les annexes : les comptes simulés, puis l'îlot où l'on en crée un. */
function Comptes({ comptes, connecteurs, equipes }: ComptesProps) {
  return (
    <>
      <Ilot id={ANCRE_DES_COMPTES} titre="Comptes simulés" compte={pluriel(comptes.length, "compte", "comptes")}>
        <RowList rules empty={<EmptyState compact>Aucun compte. Créez un compte simulé pour qu&apos;une procédure puisse appeler un connecteur.</EmptyState>}>
          {comptes.map((compte) => (
            <LigneDeCompte key={compte.id} compte={compte} />
          ))}
        </RowList>
      </Ilot>
      <Ilot id="admin-creer-un-compte" titre="Créer un compte">
        {connecteurs.length === 0 ? (
          <p>Aucun connecteur ne demande de compte dans cette version de la plateforme.</p>
        ) : (
          <CreationDeCompte connecteurs={connecteurs} equipes={equipes} />
        )}
      </Ilot>
    </>
  )
}

function Donnees({ donnees }: { donnees: DonneesDesConnecteurs }) {
  const connecteurs = donnees.connectors.map((connecteur) => connecteur.connector)
  return (
    <TwoColumns aside={<Comptes comptes={donnees.accounts} connecteurs={connecteurs} equipes={donnees.options.teams} />}>
      <Connecteurs connecteurs={donnees.connectors} impacts={donnees.impacts} limites={donnees.limites} />
    </TwoColumns>
  )
}

export function EcranConnecteurs({ resultat, Lien, ici, fil }: EcranConnecteursProps) {
  // Une lecture nourrit les îlots : son échec, ou la réserve d'un non-administrateur (AC1), se dit une fois.
  return (
    <>
      <EnTeteDAdministration courant="connecteurs" fil={fil} titre="Connecteurs" glyphe={Plug} />
      {resultat.error !== undefined ? <ErreurDeLecture message={resultat.error} href={ici} Lien={Lien} /> : <Donnees donnees={resultat.data} />}
    </>
  )
}

/** L'état de chargement, rendu par le `loading.tsx` de l'hôte (AC12). */
export function EcranConnecteursChargement() {
  return <Chargement texte="Chargement des connecteurs…" />
}
