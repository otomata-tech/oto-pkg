import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { journalFiltersSchema, type JournalFilters } from "@otomata_tech/oto_platform/schemas"
import { getConversation, listConversations, listMembers, listTeams, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"
import { EcranDuJournal, resultatDe, type EcranDuJournalProps, type ParametresDuJournal } from "@otomata_tech/oto_platform/ui"
import { getPlatformIdentitySafely } from "@/lib/plateforme/session"

// « Journal » (E05-S05) : les conversations que la personne voit (H74, portée décidée par le service
// du paquet), filtrées par l'adresse, et le détail d'une conversation. La page lit les services avec
// le jeton de la session ; l'écran n'écrit rien.
export const metadata: Metadata = {
  title: "Journal",
  robots: { index: false },
}

const ECHEC = { error: "Une erreur est survenue. Réessayez." } as const

/** L'adresse du journal avec ces paramètres ; un paramètre absent n'y est pas écrit. */
function hrefDuJournal(parametres: ParametresDuJournal): string {
  const recherche = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(parametres)) if (valeur) recherche.set(cle, valeur)
  const texte = recherche.toString()
  return texte ? `/journal?${texte}` : "/journal"
}

/** La page d'un nœud (E05-S02) : la procédure servie d'une conversation y mène (AC3). */
const hrefDuNoeud = (chemin: string) => `/n/${chemin}`

type Donnees = Pick<EcranDuJournalProps, "resultat" | "conversation" | "equipes" | "personnes">

async function lire(db: PlatformDb, identity: Identity, filtres: JournalFilters): Promise<Donnees> {
  const liste = { periodDays: filtres.periode, teamId: filtres.equipe, userId: filtres.personne, errorsOnly: filtres.erreurs === "1", cursor: filtres.curseur }
  const [resultat, conversation, equipes, personnes] = await Promise.all([
    resultatDe(listConversations(db, identity, liste)),
    filtres.conversation ? resultatDe(getConversation(db, identity, filtres.conversation, { cursor: filtres.appels })) : undefined,
    resultatDe(listTeams(db, identity)),
    resultatDe(listMembers(db, identity)),
  ])
  return { resultat, conversation, equipes, personnes }
}

/** Une panne de la résolution de l'identité : chaque lecture se dit en échec, avec « Réessayer » (AC2). */
function enPanne(filtres: JournalFilters): Donnees {
  return { resultat: ECHEC, conversation: filtres.conversation ? ECHEC : undefined, equipes: ECHEC, personnes: ECHEC }
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // La session et l'appartenance se revérifient ici, hors de tout `try` : le layout n'est pas une
  // frontière (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`).
  const identite = await getPlatformIdentitySafely("journal")
  if (identite?.error?.code === "unauthenticated") redirect("/login")
  if (identite?.error) redirect("/aucune-organisation")

  // Aucune valeur de l'adresse ne va brute à un service : une valeur illisible retombe sur son défaut (AC4).
  const filtres = journalFiltersSchema.parse(await searchParams)
  const donnees = identite ? await lire(identite.data.session.db, identite.data.identity, filtres) : enPanne(filtres)
  return <EcranDuJournal {...donnees} filtres={filtres} Lien={Link} hrefDuJournal={hrefDuJournal} hrefDuNoeud={hrefDuNoeud} />
}
