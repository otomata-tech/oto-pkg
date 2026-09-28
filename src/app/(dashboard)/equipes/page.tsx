import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { equipesListesSchema, equipesSearchSchema, type EquipesTab, type ReglagesDesListes } from "@otomata_tech/oto_platform/schemas"
import {
  invitationOptions,
  isOrgAdmin,
  isPlatformError,
  listInvitations,
  listMembers,
  listTeams,
  type Identity,
  type PlatformDb,
} from "@otomata_tech/oto_platform/server"
import { EcranEquipes, resultatDe, type EcranEquipesProps, type Moi } from "@otomata_tech/oto_platform/ui"
import { getPlatformIdentitySafely } from "@/lib/plateforme/session"

// « Équipes & accès » (E05-S03 ; titre d'E05-S11, AC-33) : membres et équipes (E05-S13, AC-5 : les règles
// d'accès se règlent dans « Partager » de chaque contenu, les accès plateforme depuis la console Oto). La page
// lit les services du paquet avec le jeton de la session ; l'écran envoie ses mutations à
// `/api/plateforme/*` et demande la relecture au fournisseur du layout. Depuis E05-S09 (partie d1), la
// recherche, le filtre et le tri des tableaux sont dans l'adresse (`q`, `filtre`, `tri`, `sens`).
export const metadata: Metadata = {
  title: "Équipes & accès",
  robots: { index: false },
}

const ECHEC = { error: "Une erreur est survenue. Réessayez." } as const

/** L'adresse d'un onglet ; un réglage à sa valeur par défaut n'y est pas écrit. */
function hrefDOnglet(onglet: EquipesTab, reglages: Partial<ReglagesDesListes> = {}): string {
  const recherche = new URLSearchParams({ onglet })
  if (reglages.q) recherche.set("q", reglages.q)
  if (reglages.filtre) recherche.set("filtre", reglages.filtre)
  if (reglages.tri) recherche.set("tri", reglages.tri)
  if (reglages.sens === "desc") recherche.set("sens", "desc")
  return `/equipes?${recherche.toString()}`
}

/** Un simple membre n'invite pas (H72) : son refus devient « pas de formulaire », pas une erreur. */
function optionsOuRien(db: PlatformDb, identity: Identity) {
  return invitationOptions(db, identity).catch((erreur: unknown) => {
    if (isPlatformError(erreur) && erreur.code === "forbidden") return null
    throw erreur
  })
}

type Donnees = Omit<EcranEquipesProps, "onglet" | "reglages" | "Lien" | "hrefDOnglet">

async function lire(db: PlatformDb, identity: Identity): Promise<Donnees> {
  // Administrateur comme pour les services : le rôle, ou l'équipe plateforme avec un accès en cours
  // (HN-E05S03-40, fiche D17).
  const moi: Moi = {
    userId: identity.user.id,
    estAdmin: isOrgAdmin(identity),
    equipesDirigees: identity.teams.filter((equipe) => equipe.role === "lead").map((equipe) => equipe.id),
  }
  const [membres, invitations, optionsDInvitation, equipes] = await Promise.all([
    resultatDe(listMembers(db, identity)),
    resultatDe(listInvitations(db, identity, { state: "pending" })),
    resultatDe(optionsOuRien(db, identity)),
    resultatDe(listTeams(db, identity)),
  ])
  return { nomOrganisation: identity.org.name, moi, membres, invitations, optionsDInvitation, equipes }
}

/** Une panne de la résolution de l'identité : l'écran le dit dans chaque onglet, sans rien proposer (AC2). */
const EN_PANNE: Donnees = {
  nomOrganisation: "l'organisation",
  moi: { userId: "", estAdmin: false, equipesDirigees: [] },
  membres: ECHEC,
  invitations: ECHEC,
  optionsDInvitation: ECHEC,
  equipes: ECHEC,
}

export default async function EquipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // La session et l'appartenance se revérifient ici, hors de tout `try` : le layout n'est pas une
  // frontière (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`).
  const identite = await getPlatformIdentitySafely("equipes")
  if (identite?.error?.code === "unauthenticated") redirect("/login")
  if (identite?.error) redirect("/aucune-organisation")

  const parametres = await searchParams
  const { onglet } = equipesSearchSchema.parse(parametres)
  const reglages = equipesListesSchema.parse(parametres)
  const donnees = identite ? await lire(identite.data.session.db, identite.data.identity) : EN_PANNE
  return <EcranEquipes {...donnees} onglet={onglet} reglages={reglages} Lien={Link} hrefDOnglet={hrefDOnglet} />
}
