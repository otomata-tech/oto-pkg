// « Brancher un assistant » (E02-S04, FR-CONN-04, `mcp-patterns.md § 9`) : pour l'organisation de
// l'adresse, quoi coller dans quel assistant et quel geste faire ensuite, des prompts à essayer et la
// dernière connexion de chaque assistant. Server Component : seules les copies sont des îlots client.
// Prompts et connexions arrivent en `resultat` (portage § 4) ; l'adresse, les noms et les guides ne
// lisent pas la base et restent affichés quand une lecture échoue (AC8).
//
// Porté d'oto-frontend (`src/components/accueil/branchement-ia.tsx` et la grammaire de ses écrans,
// `src/routes/settings.profile.lazy.tsx`) : l'en-tête d'écran (`ScreenHeader`), un îlot par rubrique
// (`Island`, `IslandHead` et son `h2`, `IslandBody`), l'adresse visible et copiable dès la page, lue
// entière (`LienCopiable`, porté en `ValeurCopiable`), la colonne d'un écran qui se lit
// (`.oto-content-max[data-width="document"]`). Retiré : la carte de l'accueil et son dialogue (l'aparté
// de la partie b), le tutoriel « Bientôt » (→ trois guides réels), l'état « Aucun client branché » que
// rien ne servait (→ dernières connexions du journal), `lucide-react`.
import type { ReactNode } from "react"
import { Robot } from "@phosphor-icons/react/dist/ssr/Robot"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { Icon } from "../ds/react/icon"
import { Island, IslandBody, IslandHead } from "../ds/react/island"
import { ScreenHeader } from "../ds/react/screen-header"
import { Skeleton } from "../ds/react/skeleton"
import { dateLisible } from "../format/dates"
import type { AdresseDeConnexion, DerniereConnexion, ExempleDePrompt } from "./types"
import { ValeurCopiable } from "./valeur-copiable"

type EcranConnexionProps = {
  adresse: AdresseDeConnexion
  /** Les procédures publiées lisibles, dans l'ordre de `prompts/list` ; les cinq premières sont montrées (AC6). */
  prompts: Resultat<ExempleDePrompt[]>
  /** Une ligne par famille d'assistants, de la plus récente à la plus ancienne (AC7). */
  connexions: Resultat<DerniereConnexion[]>
  Lien: LienDeLHote
  /** L'adresse de la page dans l'hôte : « Réessayer » d'une lecture en échec y ramène. */
  ici: string
}

/** P37 : au-delà, la section deviendrait la liste des procédures. */
const PROMPTS_MONTRES = 5

const TITRE = "Brancher un assistant"
const NOTE = "oto-caption"
const CODE = "oto-mono break-words"
// Des marqueurs de liste, donc pas de flex : un `li` devenu élément flex peut perdre son numéro.
const ETAPES = "list-decimal space-y-3 ps-6"
const ETAPE_COPIABLE = "space-y-2"

/** Un îlot de l'écran, nommé par son titre : une rubrique, un `h2`. */
function Rubrique({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <Island aria-label={titre}>
      <IslandHead>
        <h2>{titre}</h2>
      </IslandHead>
      <IslandBody className="flex flex-col gap-3">{children}</IslandBody>
    </Island>
  )
}

type GuideProps = { adresse: AdresseDeConnexion }

// Les trois guides (AC3 à AC5), aux gestes mesurés sur les bancs (`mcp-patterns.md § 8`, § 9,
// HN-E02S04-6) ; ils ne lisent pas la base.
function GuideClaudeAi({ adresse: { url, nom, phrase } }: GuideProps) {
  return (
    <Rubrique titre="claude.ai et Claude Desktop">
      <ol className={ETAPES}>
        <li>{"Dans claude.ai, ouvrez Paramètres → Connecteurs, puis ajoutez un connecteur personnalisé."}</li>
        <li>
          {`Nom : ${nom} ; adresse : `}
          <code className={CODE}>{url}</code>.
        </li>
        <li>{`Connectez-vous avec votre compte ${nom}, puis cliquez sur « Autoriser ».`}</li>
        <li>
          {"Sur la fiche du connecteur, menu ⋯ → « Actualiser la liste d'outils ». Refaites ce geste après chaque mise à jour annoncée."}
        </li>
        <li className={ETAPE_COPIABLE}>
          <p>{"Ajoutez cette phrase à vos préférences personnelles de claude.ai :"}</p>
          <ValeurCopiable valeur={phrase} cible="la phrase de préférences" />
          {/* Mesuré : nommer un connecteur quand on en a plusieurs du même genre capte les demandes des autres (§ 9). */}
          <p>{"Vous avez plusieurs connecteurs d'organisation ? N'ajoutez pas cette phrase : elle attirerait les demandes des autres."}</p>
        </li>
        <li>{"Rechargez la page, attendez quelques secondes, puis ouvrez une nouvelle conversation."}</li>
      </ol>
    </Rubrique>
  )
}

function GuideChatGpt({ adresse: { url, nom } }: GuideProps) {
  return (
    <Rubrique titre="ChatGPT">
      <ol className={ETAPES}>
        <li>{"Activez le mode développeur dans les paramètres de ChatGPT."}</li>
        <li>
          {`Créez un connecteur : nom ${nom}, adresse `}
          <code className={CODE}>{url}</code>
          {", authentification OAuth."}
        </li>
        <li>{`Connectez-vous avec votre compte ${nom}, puis cliquez sur « Autoriser ».`}</li>
        <li>{"Sur la fiche du connecteur, cliquez sur « Actualiser » : sans ce geste, aucun outil n'apparaît."}</li>
        <li>{`Dans une nouvelle conversation, sélectionnez le connecteur (@${nom}) la première fois.`}</li>
      </ol>
      <p className={NOTE}>
        {"Aucune phrase à ajouter dans ChatGPT. Si plusieurs comptes sont connectés au même connecteur, ChatGPT utilise le compte principal."}
      </p>
    </Rubrique>
  )
}

function GuideClaudeCode({ adresse: { url, nomCli } }: GuideProps) {
  return (
    <Rubrique titre="Claude Code">
      <ol className={ETAPES}>
        <li className={ETAPE_COPIABLE}>
          <ValeurCopiable valeur={`claude mcp add --transport http ${nomCli} ${url}`} cible="la commande d'ajout du serveur" />
        </li>
        <li className={ETAPE_COPIABLE}>
          <ValeurCopiable valeur={`claude mcp login ${nomCli}`} cible="la commande de connexion" />
          <p>{"Dans un terminal interactif : le navigateur s'ouvre pour la connexion et l'autorisation."}</p>
        </li>
        <li>
          {"Ouvrez une nouvelle session ; la commande "}
          <code className={CODE}>/mcp</code>
          {" montre l'état du serveur."}
        </li>
      </ol>
    </Rubrique>
  )
}

type Relecture = Pick<EcranConnexionProps, "Lien" | "ici">

function PromptsAEssayer({ prompts, Lien, ici }: Relecture & { prompts: EcranConnexionProps["prompts"] }) {
  if (prompts.error !== undefined) return <ErreurDeLecture message={prompts.error} href={ici} Lien={Lien} />
  if (prompts.data.length === 0) {
    return <p>{"Aucune procédure publiée pour l'instant. Essayez : « Qu'est-ce que je peux te demander ici ? »"}</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {prompts.data.slice(0, PROMPTS_MONTRES).map(({ titre }, rang) => (
        // Deux procédures peuvent porter le même titre : le rang départage.
        <li key={rang}>
          <ValeurCopiable valeur={titre} cible={`le prompt « ${titre} »`} />
        </li>
      ))}
    </ul>
  )
}

function VosConnexions({ connexions, nom, Lien, ici }: Relecture & { connexions: EcranConnexionProps["connexions"]; nom: string }) {
  if (connexions.error !== undefined) return <ErreurDeLecture message={connexions.error} href={ici} Lien={Lien} />
  if (connexions.data.length === 0) {
    return <p>{`Aucun assistant ne s'est encore connecté à ${nom} avec votre compte.`}</p>
  }
  return (
    <ul className="flex flex-col gap-1">
      {connexions.data.map(({ famille, signature, date }) => (
        <li key={famille}>
          <span className="font-medium">{famille}</span>
          {` : dernière connexion le ${dateLisible(date) ?? "?"} `}
          <code className={`${CODE} text-mute`}>{`(${signature})`}</code>
        </li>
      ))}
    </ul>
  )
}

export function EcranConnexion({ adresse, prompts, connexions, Lien, ici }: EcranConnexionProps) {
  return (
    <>
      <ScreenHeader title={TITRE} icon={<Icon as={Robot} size="md" />} />
      <div className="oto-content-max flex flex-col gap-3" data-width="document">
        <p className="text-mute">
          {`Ajoutez ${adresse.nom} à votre assistant : il se connectera avec votre compte et agira dans la limite de vos droits.`}
        </p>
        <Rubrique titre="Adresse du serveur">
          <ValeurCopiable valeur={adresse.url} cible="l'adresse du serveur" />
          <p className={NOTE}>
            {"Une adresse par organisation : si vous travaillez pour plusieurs organisations, ajoutez un connecteur pour chacune."}
          </p>
        </Rubrique>
        <Rubrique titre="Nom du connecteur">
          <ValeurCopiable valeur={adresse.nom} cible="le nom du connecteur" />
          <p className={NOTE}>{"Donnez ce nom au connecteur : c'est lui que l'assistant voit."}</p>
        </Rubrique>
        <GuideClaudeAi adresse={adresse} />
        <GuideChatGpt adresse={adresse} />
        <GuideClaudeCode adresse={adresse} />
        <Rubrique titre="À essayer">
          <PromptsAEssayer prompts={prompts} Lien={Lien} ici={ici} />
        </Rubrique>
        <Rubrique titre="Vos connexions">
          <VosConnexions connexions={connexions} nom={adresse.nom} Lien={Lien} ici={ici} />
        </Rubrique>
      </div>
    </>
  )
}

/** L'état de chargement, rendu par le `loading.tsx` de l'hôte (AC8) : l'en-tête et des îlots en attente. */
export function EcranConnexionChargement() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="oto-sr-only">Chargement de la page de branchement…</span>
      <Skeleton width="16rem" height="1.75rem" />
      <Skeleton shape="card" />
      <Skeleton shape="card" />
      <Skeleton shape="card" />
    </div>
  )
}
