import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { UsefulProcedure } from "@otomata_tech/oto_platform/schemas"
import { connectAddress, lastConnections, usefulProcedures, type LastConnection } from "@otomata_tech/oto_platform/server"
import { EcranConnexion, resultatDe, type DerniereConnexion, type ExempleDePrompt } from "@otomata_tech/oto_platform/ui"
import { adresseDe } from "@/lib/plateforme/connexion"
import { getPlatformIdentity, getRequestOrigin } from "@/lib/plateforme/session"
import { loginPath } from "@/lib/schemas/auth"

// « Brancher mon Claude, ChatGPT ou Mistral » (E02-S04, E11-S09) : le guide par assistant, pour
// l'organisation de l'adresse, ses demandes à essayer (les procédures utiles, comme à l'accueil) et les
// dernières connexions de la personne. La page lit les services du paquet avec le jeton de la session ;
// `resource_documentation` des métadonnées OAuth y mène (E02-S02).
export const metadata: Metadata = {
  title: "Brancher mon Claude, ChatGPT ou Mistral",
  robots: { index: false },
}

const ICI = "/connect"

/** Les demandes à essayer du guide : trois au plus, complétées par les exemples génériques (AC-7). */
const DEMANDES = 3

/** Le titre de chaque procédure utile, dans l'ordre du bloc servi par `context` (HN-E11S09-5). */
function exemplesDe(procedures: UsefulProcedure[]): ExempleDePrompt[] {
  return procedures.map(({ title }) => ({ titre: title }))
}

function connexionsDe(connexions: LastConnection[]): DerniereConnexion[] {
  return connexions.map(({ family, signature, at }) => ({ famille: family, signature, date: at }))
}

export default async function ConnectPage() {
  // La session et l'appartenance se revérifient ici, hors de tout `try` : le layout n'est pas une
  // frontière (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`).
  const identite = await getPlatformIdentity()
  if (identite.error?.code === "unauthenticated") redirect(loginPath(ICI))
  if (identite.error) redirect("/no-organization")
  // L'identité vient de l'hôte de la requête : sans hôte, elle n'aurait pas été résolue.
  const origine = await getRequestOrigin()
  if (!origine) redirect("/no-organization")

  const { identity, session } = identite.data
  // Deux lectures indépendantes, en parallèle ; chacune se dit seule quand elle échoue (AC-13).
  const [prompts, connexions] = await Promise.all([
    resultatDe(usefulProcedures(session.db, identity, DEMANDES).then(exemplesDe)),
    resultatDe(lastConnections(session.db, identity).then(connexionsDe)),
  ])
  return (
    <EcranConnexion
      adresse={adresseDe(connectAddress(identity, origine))}
      prompts={prompts}
      connexions={connexions}
      Lien={Link}
      ici={ICI}
    />
  )
}
