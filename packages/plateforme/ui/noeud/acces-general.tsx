"use client"

// « Accès général » du panneau « Partager » (E05-S10, AC-b13 ; ADR-014) : toute l'organisation, à un niveau
// (« Peut lire », « Peut modifier », « Accès complet » pour l'administrateur), ou seulement les personnes
// ajoutées ; lu dans `general` de `listNodeRules`, changé par `POST /api/plateforme/nodes/access` (le service
// décide : la gestion du nœud, l'administrateur pour l'accès complet, jamais dans Privé). Ce que l'espace donne
// déjà se dit à côté : dans Tout le monde chaque membre lit, l'équipe propriétaire modifie. Sans lui, l'accès
// général se lisait sans se changer (HN-E05S10b-6). Un fichier à lui : `partage-du-noeud.tsx` touchait la borne
// de 300 lignes.
import { useState, type ReactNode } from "react"
import { ACCESS_LEVEL_NAMES, generalAccessSchema, type AccessLevelName, type NodeRulesView } from "../../schemas"
import type { MessagesDuGeste } from "../api/messages"
import { Select, type SelectOption } from "../ds/react/select"
import { GlypheDePortee, type PorteeDEspace } from "./glyphes"
import { ACCES_GENERAL, NIVEAUX_D_ACCES, PARTAGE, REFUS_DE_L_ACCES_GENERAL } from "./libelles"

/** Le geste d'un choix : la route, le corps validé par le schéma de l'API, l'annonce, les refus propres ; `true` s'il a abouti. */
type EnvoyerLAcces = (envoi: { methode: "POST"; ressource: string; corps: unknown }, annonce: string, refus: MessagesDuGeste) => Promise<boolean>

type Choix = "organisation" | "restricted"

/** Les niveaux qu'on donne à toute l'organisation : jamais « aucun » ; l'accès complet à l'administrateur (D4), ou déjà là. */
function niveauxOuverts(gestionAccordable: boolean, courant: AccessLevelName | null): AccessLevelName[] {
  return ACCESS_LEVEL_NAMES.filter((niveau) => niveau !== "none" && (niveau !== "manage" || gestionAccordable || courant === "manage")).reverse()
}

function optionsDuNiveau(niveaux: readonly AccessLevelName[]): SelectOption[] {
  return niveaux.map((niveau) => ({ value: niveau, label: NIVEAUX_D_ACCES[niveau] }))
}

function Ligne({ portee, children }: { portee: PorteeDEspace; children: ReactNode }) {
  return (
    <div className="oto-pop-row">
      <span className="oto-avatar" data-size="sm" aria-hidden="true">
        <GlypheDePortee portee={portee} />
      </span>
      {children}
    </div>
  )
}

type AccesGeneralProps = {
  noeud: NodeRulesView
  nomOrganisation: string
  gere: boolean
  gestionAccordable: boolean
  envoyer: EnvoyerLAcces
  enCours: boolean
}

/** Ce qui se lit sans se changer : sans l'accès complet, ou dans Privé (le service refuse, ADR-014 § 2). */
function AccesGeneralLu({ noeud, nomOrganisation, gere }: Pick<AccesGeneralProps, "noeud" | "nomOrganisation" | "gere">) {
  const { owner } = noeud
  const general = noeud.general ?? null
  if (owner.kind === "user") {
    return (
      <>
        <Ligne portee="private">
          <span>{PARTAGE.ajoutesSeulement}</span>
        </Ligne>
        {owner.userName && <p className="oto-caption">{PARTAGE.detailPerso(owner.userName)}</p>}
        {gere && <p className="oto-caption">{ACCES_GENERAL.prive}</p>}
      </>
    )
  }
  if (general || owner.kind === "org") {
    return (
      <Ligne portee="all">
        <span>{PARTAGE.toutLeMonde(nomOrganisation)}</span>
        <span className="oto-pop-meta">{NIVEAUX_D_ACCES[general?.level ?? "read"]}</span>
      </Ligne>
    )
  }
  return (
    <>
      <Ligne portee="equipe">
        <span>{PARTAGE.equipeEtAjoutes(owner.teamName ?? "")}</span>
      </Ligne>
      <p className="oto-caption">{PARTAGE.detailEquipe}</p>
    </>
  )
}

/** Le niveau choisi dans un menu, lu dans la liste fermée des niveaux ; `null` pour toute autre valeur. */
const niveauLu = (valeur: string): AccessLevelName | null => ACCESS_LEVEL_NAMES.find((niveau) => niveau === valeur) ?? null

/** Le corps de `POST nodes/access` d'un choix, validé par le schéma que l'API applique ; `null` s'il est refusé. */
function corpsDuChoix(chemin: string, choix: Choix, niveau: AccessLevelName | null): unknown {
  const corps = generalAccessSchema.safeParse(choix === "restricted" ? { path: chemin, access: "restricted" } : { path: chemin, access: "organisation", level: niveau })
  return corps.success ? corps.data : null
}

export function AccesGeneral(props: AccesGeneralProps) {
  const { noeud, nomOrganisation, gere, gestionAccordable, envoyer, enCours } = props
  const general = noeud.general ?? null
  // Le choix se montre tout de suite ; la relecture ou un refus le ramènent à l'état servi.
  const servi: Choix = general ? "organisation" : "restricted"
  const [choisi, setChoisi] = useState<Choix>(servi)
  const [vu, setVu] = useState(servi)
  if (vu !== servi) {
    setVu(servi)
    setChoisi(servi)
  }
  if (!gere || noeud.owner.kind === "user") return <AccesGeneralLu noeud={noeud} nomOrganisation={nomOrganisation} gere={gere} />

  const niveau = general?.level ?? "read"
  const niveaux = niveauxOuverts(gestionAccordable, general?.level ?? null)

  async function poser(choix: Choix, voulu: AccessLevelName | null) {
    const corps = corpsDuChoix(noeud.path, choix, voulu)
    if (corps === null || voulu === null) return
    setChoisi(choix)
    const annonce = choix === "restricted" ? ACCES_GENERAL.restreint : ACCES_GENERAL.ouvert(NIVEAUX_D_ACCES[voulu])
    if (!(await envoyer({ methode: "POST", ressource: "nodes/access", corps }, annonce, REFUS_DE_L_ACCES_GENERAL))) setChoisi(servi)
  }

  // Dans Tout le monde, chaque membre lit déjà (le propriétaire, H66 (3)) : « Peut lire » retire la règle.
  if (noeud.owner.kind === "org") {
    return (
      <>
        <Ligne portee="all">
          <span>{PARTAGE.toutLeMonde(nomOrganisation)}</span>
          <Select size="sm" className="oto-share-level" aria-label={ACCES_GENERAL.niveau} value={niveau} disabled={enCours} options={optionsDuNiveau(niveaux)} onChange={(evenement) => void poser(evenement.target.value === "read" ? "restricted" : "organisation", niveauLu(evenement.target.value))} />
        </Ligne>
        <p className="oto-caption">{ACCES_GENERAL.toutLeMondeLit}</p>
      </>
    )
  }

  const equipe = noeud.owner.teamName ?? ""
  return (
    <>
      <Ligne portee={choisi === "organisation" ? "all" : "equipe"}>
        <Select size="sm" aria-label={ACCES_GENERAL.qui} value={choisi} disabled={enCours} onChange={(evenement) => void poser(evenement.target.value === "organisation" ? "organisation" : "restricted", "read")}>
          <option value="restricted">{PARTAGE.equipeEtAjoutes(equipe)}</option>
          <option value="organisation">{ACCES_GENERAL.toute(nomOrganisation)}</option>
        </Select>
        {choisi === "organisation" && general && (
          <Select size="sm" className="oto-share-level" aria-label={ACCES_GENERAL.niveau} value={niveau} disabled={enCours} options={optionsDuNiveau(niveaux)} onChange={(evenement) => void poser("organisation", niveauLu(evenement.target.value))} />
        )}
      </Ligne>
      <p className="oto-caption">{PARTAGE.detailEquipe}</p>
    </>
  )
}
