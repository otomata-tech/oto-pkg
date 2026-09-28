import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense, use } from "react"
import { z } from "zod"
import { journalFiltersSchema, USEFUL_PROCEDURES_SHOWN } from "@otomata_tech/oto_platform/schemas"
import {
  connectAddress,
  isPlatformError,
  lastConnections,
  listActivities,
  loadNode,
  previewContext,
  usefulProcedures,
  type Identity,
  type LastConnection,
  type PlatformDb,
} from "@otomata_tech/oto_platform/server"
import {
  cheminDuContexte,
  EcranDAccueil,
  EcranDAccueilChargement,
  ONGLETS_DE_L_ACCUEIL,
  resultatDe,
  type DerniereConnexion,
  type DonneesDeLAccueil,
  type DonneesDuContexteServi,
  type EcranDAccueilProps,
  type OngletDeLAccueil,
} from "@otomata_tech/oto_platform/ui"
import { getPlatformIdentitySafely, getRequestOrigin, type PlatformSession } from "@/lib/plateforme/session"

// L'accueil (E05-S09, partie b ; E05-S12, lot B) : le salut, la recherche, les activités de la semaine
// (le journal par gestes), « Brancher un assistant » et les procédures utiles à droite. La page revérifie la session, hors de tout `try` (le layout
// n'est pas une frontière, `nextjs-patterns.md § Layouts`), puis lit les services du paquet avec le jeton
// de la session, en parallèle, chacun par `resultatDe` : une lecture en échec se dit dans son îlot, et
// l'écran reste ouvert. La session est celle de l'hôte, Supabase ou OIDC (E01-S11 b, AC-b6).
//
// E05-S11 (lot c, AC-12 à AC-14) : l'onglet de l'îlot principal est dans l'adresse (`?onglet=`) ; ouvert sur
// « Contexte », la page lit aussi ce que `context` servirait (`previewContext` sans phrase), puis chaque
// Contexte servi par son chemin (`loadNode`), dont le niveau de la personne, décidé par le service, choisit
// l'éditeur ou la lecture. Aucune de ces lectures sur « Activités ».
//
// E05-S12 (lot B) : les activités de la semaine (`listActivities`, le journal par gestes) au lieu des
// conversations, qui restent à `/journal`, et les procédures utiles de l'îlot de droite (`usefulProcedures`).
export const metadata: Metadata = {
  title: "Accueil",
  robots: { index: false },
}

const ECHEC = { error: "Une erreur est survenue. Réessayez." } as const

/** La semaine du journal : la période par défaut de `/journal`, celle que « Tout le journal » ouvre. */
const PERIODE = journalFiltersSchema.parse({}).periode

/** L'onglet de l'adresse ; une valeur inconnue ouvre « Activités » (le premier). */
const accueilSearchSchema = z.object({ onglet: z.enum(ONGLETS_DE_L_ACCUEIL).catch(ONGLETS_DE_L_ACCUEIL[0]) })

/** L'adresse d'un onglet : « Activités » est l'accueil nu. */
const hrefDOnglet = (onglet: OngletDeLAccueil) => (onglet === ONGLETS_DE_L_ACCUEIL[0] ? "/" : `/?${new URLSearchParams({ onglet })}`)

/** Les adresses de l'hôte que l'écran ouvre, et son lien. */
const NAVIGATION: Omit<EcranDAccueilProps, "donnees" | "onglet"> = {
  Lien: Link,
  hrefDuJournal: "/journal",
  hrefDeConversation: (code) => `/journal?${new URLSearchParams({ conversation: code })}`,
  hrefDesGuides: "/connect",
  prefixeDesPages: "/n/",
  hrefDOnglet,
  hrefDuProfil: "/profil",
}

type Parametres = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Les noms des services adaptés à l'écran, comme sur `/connect`. */
function connexionsDe(connexions: LastConnection[]): DerniereConnexion[] {
  return connexions.map(({ family, signature, at }) => ({ famille: family, signature, date: at }))
}

/**
 * Ce que lit la vue « Contexte » (AC-13, AC-14) : l'aperçu, puis, en parallèle, chaque Contexte qu'il sert,
 * par son chemin ; le service décide du niveau (H123), la page ne décide rien. L'aperçu ne sert que des
 * Contextes que la personne lit : une lecture refusée depuis est une lecture en échec, dite dans sa partie.
 */
async function lireLeContexte(db: PlatformDb, identity: Identity): Promise<DonneesDuContexteServi> {
  const apercu = await resultatDe(previewContext(db, identity, {}))
  // Le Contexte de chaque partie, servi ou non : un Contexte écrivable montre son éditeur même en brouillon
  // (E05-S12, AC-7, HN-E05S12-C2).
  const chemins = apercu.data ? [...new Set(apercu.data.blocks.flatMap((bloc) => cheminDuContexte(bloc) ?? []))] : []
  // Un Contexte absent ou hors de portée (`not_found`) n'est pas une panne : omis, sa partie garde sa tête sans
  // alerte ; tout autre échec se dit (HN-E05S12-C10).
  const lus = await Promise.all(
    chemins.map((path) =>
      resultatDe(loadNode(db, identity, { path }).catch((erreur: unknown) => (isPlatformError(erreur) && erreur.code === "not_found" ? null : Promise.reject(erreur)))),
    ),
  )
  return {
    apercu,
    contextes: Object.fromEntries(
      chemins.flatMap((chemin, rang): [string, DonneesDuContexteServi["contextes"][string]][] => {
        const lu = lus[rang]
        if (lu.error !== undefined) return [[chemin, lu]]
        return lu.data === null ? [] : [[chemin, { data: lu.data }]]
      }),
    ),
    // Les Contextes d'équipe servis sont ceux des équipes de la personne (E03-S08) : l'identité les nomme.
    equipes: identity.teams,
    nomOrganisation: identity.org.name,
  }
}

async function lire({ identity, session }: { identity: Identity; session: PlatformSession }, origine: string, onglet: OngletDeLAccueil): Promise<DonneesDeLAccueil> {
  const [activites, connexions, procedures, contexte] = await Promise.all([
    resultatDe(listActivities(session.db, identity, { periodDays: PERIODE })),
    resultatDe(lastConnections(session.db, identity).then(connexionsDe)),
    resultatDe(usefulProcedures(session.db, identity, USEFUL_PROCEDURES_SHOWN)),
    onglet === "contexte" ? lireLeContexte(session.db, identity) : undefined,
  ])
  return {
    nom: identity.member.profile.name || identity.user.name || null,
    moi: identity.user.id,
    activites,
    adresse: connectAddress(identity, origine).url,
    connexions,
    procedures,
    contexte,
  }
}

/** L'accueil lu, sous son `<Suspense>` : le chargement paraît pendant les lectures. */
function AccueilLu({ lecture, onglet }: { lecture: Promise<DonneesDeLAccueil>; onglet: OngletDeLAccueil }) {
  return <EcranDAccueil donnees={{ data: use(lecture) }} onglet={onglet} {...NAVIGATION} />
}

export default async function AccueilPage({ searchParams }: Parametres) {
  const identite = await getPlatformIdentitySafely("accueil")
  if (identite?.error?.code === "unauthenticated") redirect("/login")
  if (identite?.error) redirect("/aucune-organisation")
  const { onglet } = accueilSearchSchema.parse(await searchParams)
  // Une panne de la résolution de l'identité : l'écran la dit une fois, avec « Réessayer ».
  if (!identite) return <EcranDAccueil donnees={ECHEC} onglet={onglet} {...NAVIGATION} />
  // L'identité vient de l'hôte de la requête : sans hôte, elle n'aurait pas été résolue (comme `/connect`).
  const origine = await getRequestOrigin()
  if (!origine) redirect("/aucune-organisation")
  return (
    <Suspense fallback={<EcranDAccueilChargement />}>
      <AccueilLu lecture={lire(identite.data, origine, onglet)} onglet={onglet} />
    </Suspense>
  )
}
