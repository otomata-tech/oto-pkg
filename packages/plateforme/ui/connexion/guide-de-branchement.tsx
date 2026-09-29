"use client"

// Le guide de branchement (E11-S09, FR-CONN-04) : un onglet par assistant (claude.ai, ChatGPT, Mistral,
// Claude Code), ses étapes numérotées, le lien vers la page des connecteurs de l'assistant, les valeurs à
// coller et, en dernière étape, trois demandes à essayer. Monté par la fenêtre de l'accueil et par la page
// `/connect` : une seule source, là où deux copies divergeraient. Client pour l'onglet choisi seul ; il ne
// lit pas la base, il reçoit l'adresse et deux lectures en `resultat` (`portage-ecrans.md § 4`).
import { useState } from "react"
import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut"
import type { Resultat } from "../api/resultat"
import { LIEN } from "../components/classes"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { Icon } from "../ds/react/icon"
import { Tabs } from "../ds/react/tabs"
import { ASSISTANTS, ETAPES, EXEMPLES_GENERIQUES, GUIDE, type Assistant, type EtapeDuGuide, type Segment } from "./libelles"
import type { AdresseDeConnexion, DerniereConnexion, ExempleDePrompt } from "./types"
import { ValeurCopiable } from "./valeur-copiable"

type GuideDeBranchementProps = {
  adresse: AdresseDeConnexion
  /** Les procédures utiles, les plus utilisées d'abord : leurs titres sont les demandes à essayer (AC-7). */
  exemples: Resultat<ExempleDePrompt[]>
  /** Les dernières connexions, la plus récente d'abord : sa famille choisit l'onglet ouvert (AC-2). */
  connexions: Resultat<DerniereConnexion[]>
}

const DEMANDES_MONTREES = 3
// Des marqueurs de liste, donc pas de flex : un `li` devenu élément flex peut perdre son numéro.
const LISTE_D_ETAPES = "list-decimal space-y-4 ps-6"
const ONGLETS = ASSISTANTS.map((assistant) => ({ value: assistant, label: assistant }))

/** L'onglet ouvert d'abord : l'assistant de la connexion la plus récente, claude.ai sans connexion connue (HN-E11S09-2). */
function ongletDeDepart(connexions: Resultat<DerniereConnexion[]>): Assistant {
  const famille = connexions.data?.[0]?.famille
  return ASSISTANTS.find((assistant) => assistant === famille) ?? "claude.ai"
}

/** Les titres des procédures d'abord, dans l'ordre reçu, puis les exemples génériques, trois en tout. */
function troisDemandes(exemples: ExempleDePrompt[]): string[] {
  return [...exemples.map(({ titre }) => titre), ...EXEMPLES_GENERIQUES].slice(0, DEMANDES_MONTREES)
}

function Texte({ segments }: { segments: readonly Segment[] }) {
  return segments.map((segment, rang) => (typeof segment === "string" ? segment : <code key={rang} className="oto-mono">{segment.code}</code>))
}

/** Le lien vers la page de l'assistant : un autre site, dans un nouvel onglet, qui se dit dans son nom (AC-8). */
function LienExterne({ href, libelle }: NonNullable<EtapeDuGuide["lien"]>) {
  return (
    <p>
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${LIEN} inline-flex items-center gap-1`}>
        {libelle}
        <Icon as={ArrowSquareOut} size="xs" />
        <span className="oto-sr-only">{GUIDE.nouvelOnglet}</span>
      </a>
    </p>
  )
}

/** Les deux champs du connecteur, en liste de définitions : le nom (ou le préfixe) puis l'adresse. */
function Champs({ adresse, nom }: { adresse: AdresseDeConnexion; nom: "nom" | "nomCli" }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3">
      <dt className="font-medium">{GUIDE.nom}</dt>
      <dd>
        <ValeurCopiable valeur={adresse[nom]} cible={GUIDE.copierNom} />
      </dd>
      <dt className="font-medium">{GUIDE.adresse}</dt>
      <dd>
        <ValeurCopiable valeur={adresse.url} cible={GUIDE.copierAdresse} />
      </dd>
    </dl>
  )
}

/** Les demandes à essayer ; une lecture en échec se dit ici seul, « Réessayer » relit la page. */
function Demandes({ exemples }: { exemples: Resultat<ExempleDePrompt[]> }) {
  if (exemples.error !== undefined) return <ErreurDeLecture message={exemples.error} />
  return (
    <ul className="flex flex-col gap-1">
      {troisDemandes(exemples.data).map((demande, rang) => (
        // Deux procédures peuvent porter le même titre : le rang départage.
        <li key={rang}>
          <ValeurCopiable valeur={demande} cible={GUIDE.copierDemande(demande)} />
        </li>
      ))}
    </ul>
  )
}

function Etape({ etape, adresse, exemples }: { etape: EtapeDuGuide; adresse: AdresseDeConnexion; exemples: GuideDeBranchementProps["exemples"] }) {
  return (
    <li className="space-y-2">
      <p>
        {etape.branche && <strong>{`${GUIDE.branche} `}</strong>}
        <Texte segments={etape.texte(adresse)} />
      </p>
      {etape.lien && <LienExterne {...etape.lien} />}
      {etape.champs && <Champs adresse={adresse} nom={etape.champs.nom} />}
      {etape.copie && <ValeurCopiable valeur={etape.copie.valeur(adresse)} cible={etape.copie.cible} />}
      {etape.branche && <Demandes exemples={exemples} />}
      {etape.note && <p className="oto-caption">{etape.note}</p>}
    </li>
  )
}

function EtapesDe({ assistant, adresse, exemples }: { assistant: Assistant } & Omit<GuideDeBranchementProps, "connexions">) {
  return (
    <ol className={LISTE_D_ETAPES}>
      {ETAPES[assistant].map((etape, rang) => (
        // L'ordre des étapes est fixe : le rang est leur identité.
        <Etape key={rang} etape={etape} adresse={adresse} exemples={exemples} />
      ))}
    </ol>
  )
}

export function GuideDeBranchement({ adresse, exemples, connexions }: GuideDeBranchementProps) {
  const [assistant, setAssistant] = useState<Assistant>(() => ongletDeDepart(connexions))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-mute">{GUIDE.intro(adresse.nom)}</p>
      <Tabs
        tabs={ONGLETS}
        label={GUIDE.onglets}
        value={assistant}
        // `Tabs` rend la valeur en `string` : elle se reconnaît dans la liste, qui l'a fournie.
        onChange={(valeur) => setAssistant(ASSISTANTS.find((cle) => cle === valeur) ?? assistant)}
      >
        <EtapesDe assistant={assistant} adresse={adresse} exemples={exemples} />
      </Tabs>
    </div>
  )
}
