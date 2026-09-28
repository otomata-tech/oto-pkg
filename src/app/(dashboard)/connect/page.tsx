import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  connectAddress,
  lastConnections,
  listPrompts,
  type ConnectAddress,
  type LastConnection,
  type ProcedurePrompt,
} from "@otomata_tech/oto_platform/server"
import {
  EcranConnexion,
  resultatDe,
  type AdresseDeConnexion,
  type DerniereConnexion,
  type ExempleDePrompt,
} from "@otomata_tech/oto_platform/ui"
import { getPlatformIdentity, getRequestOrigin } from "@/lib/plateforme/session"
import { loginPath } from "@/lib/schemas/auth"

// « Brancher un assistant » (E02-S04) : l'adresse du serveur de l'organisation de l'adresse, les
// guides par assistant, des prompts à essayer et les dernières connexions de la personne. La page lit
// les services du paquet avec le jeton de la session ; `resource_documentation` des métadonnées OAuth
// y mène (E02-S02).
export const metadata: Metadata = {
  title: "Brancher un assistant",
  robots: { index: false },
}

const ICI = "/connect"

function adresseDe({ url, name, cliName, preferenceSentence }: ConnectAddress): AdresseDeConnexion {
  return { url, nom: name, nomCli: cliName, phrase: preferenceSentence }
}

/** Le titre de chaque procédure, le message que `prompts/get` envoie ; l'écran en montre cinq (AC6). */
function promptsDe(prompts: ProcedurePrompt[]): ExempleDePrompt[] {
  return prompts.map(({ title }) => ({ titre: title }))
}

function connexionsDe(connexions: LastConnection[]): DerniereConnexion[] {
  return connexions.map(({ family, signature, at }) => ({ famille: family, signature, date: at }))
}

export default async function ConnectPage() {
  // La session et l'appartenance se revérifient ici, hors de tout `try` : le layout n'est pas une
  // frontière (`nextjs-patterns.md § Un layout n'est JAMAIS une frontière d'autorisation`).
  const identite = await getPlatformIdentity()
  if (identite.error?.code === "unauthenticated") redirect(loginPath(ICI))
  if (identite.error) redirect("/aucune-organisation")
  // L'identité vient de l'hôte de la requête : sans hôte, elle n'aurait pas été résolue.
  const origine = await getRequestOrigin()
  if (!origine) redirect("/aucune-organisation")

  const { identity, session } = identite.data
  // Deux lectures indépendantes, en parallèle ; chacune se dit seule quand elle échoue (AC8).
  const [prompts, connexions] = await Promise.all([
    resultatDe(listPrompts(session.db, identity).then(promptsDe)),
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
