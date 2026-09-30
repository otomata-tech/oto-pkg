// L'inscription libre (E12-S01, ADR-023) : une personne vérifiée, membre d'aucune organisation, crée la sienne et en
// devient l'administratrice, si l'hôte l'active (`signup` de `handlePlateforme`). Chaque refus se décide ici, avant
// l'écriture (ADR-012 § 3) ; `signup_org` en est la seconde barrière et tient la création en une transaction. Les
// adresses sont celles du point de création de l'hôte (`OrgCreationHook`, E09-S02), contrôlées comme pour une création
// par l'équipe plateforme : une organisation sans adresse n'existe pour personne (ADR-004). Sans ce module, seule
// l'équipe plateforme crée une organisation.
import { signupSchema } from "../../schemas"
import type { PlatformDb } from "../db"
import { fromDatabaseError, inTransaction, invalidInput, isPlatformError, PlatformError } from "../errors"
import { createConflict, type OrgDraft } from "./orgs"
import { applicationAddresses, setupAddresses, type AddressSetup, type CreationAddresses, type OrgCreationHook } from "./org-creation"

/**
 * Ce que l'hôte passe pour activer l'inscription : son point de création (les adresses de la nouvelle organisation), et
 * `admit`, son contrôle d'abus (captcha, débit, domaines jetables) : un texte refuse l'inscription avec ce texte, `null`
 * l'admet ; une exception devient une panne sans son message.
 */
export type SignupOptions = {
  orgCreation: OrgCreationHook
  admit?(input: { email: string; request: Request }): string | null | undefined | Promise<string | null | undefined>
}

export type SignupResult =
  | { created: false; org: OrgDraft; addresses: CreationAddresses }
  | { created: true; org: OrgDraft & { id: string }; hosts: string[]; setup: AddressSetup[] | null }

const ALREADY_MEMBER = "You already belong to an organisation. To create another one, ask the platform team."

function alreadyMember(): PlatformError {
  return new PlatformError("forbidden", ALREADY_MEMBER, { reason: "already_member" })
}

/** Le contrôle d'abus de l'hôte ; son exception, ni servie ni journalisée avec son message. */
async function admitted(signup: SignupOptions, email: string, request: Request): Promise<void> {
  if (!signup.admit) return
  let refused: string | null | undefined
  try {
    refused = await signup.admit({ email, request })
  } catch {
    console.error("[platform] signUp: the host's admit check failed")
    throw new PlatformError("internal", "Internal error.")
  }
  // `text` : l'écran le dit tel quel, dans la langue de l'hôte (le message d'une erreur ne passe pas à l'écran).
  if (typeof refused === "string" && refused.trim()) throw new PlatformError("forbidden", refused, { reason: "signup_refused", text: refused })
}

/**
 * Inscrit une organisation, en deux temps comme `createOrg` (AC-6, AC-7) : Zod ; email vérifié de l'appelant ; aucune
 * appartenance (une organisation par compte, HN-E12S01-2) ; `admit` de l'hôte ; adresses de l'hôte, prises refusées ;
 * sans `confirm`, rien n'est écrit. Confirmé, `signup_org` crée l'identité s'il le faut, l'organisation, son arbre, ses
 * adresses et son administrateur ; puis le point de l'hôte termine ses adresses (`created`).
 */
export async function signUp(
  db: PlatformDb,
  caller: { email: string },
  input: unknown,
  { signup, request }: { signup: SignupOptions; request: Request },
): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const email = caller.email.trim().toLowerCase()
  if (!email) throw new PlatformError("forbidden", "Sign up needs a verified email address.", { reason: "email_required" })
  // Le filtre est dans la requête : l'appelant lit ses propres lignes `members`, sans identifiant il n'en a aucune.
  const [member] = await inTransaction(db, "signUp: members", (sql) => sql`select 1 from platform.members m where m.user_id = (select auth.uid()) limit 1`)
  if (member) throw alreadyMember()
  await admitted(signup, email, request)

  const { org: slug, name, prefix, confirm } = parsed.data
  const draft: OrgDraft = { slug, name, prefix, host: null }
  const addresses = await applicationAddresses(db, signup.orgCreation, slug, [])
  if (addresses.hosts.length === 0) {
    console.error("[platform] signUp: the organisation creation hook gave no address")
    throw new PlatformError("internal", "Internal error.")
  }
  if (confirm !== true) return { created: false, org: draft, addresses }

  const { hosts } = addresses
  // Sa propre transaction : un refus de `signup_org` la perd, et `createConflict` relit dans une autre.
  const [row] = await db
    .tx((sql) => sql<{ id: string }[]>`
      select platform.signup_org(p_name => ${name}, p_slug => ${slug}, p_prefix => ${prefix}, p_hosts => ${hosts}::text[]) as id`)
    .catch(async (error: { code?: string; message?: string }) => {
      if (isPlatformError(error)) throw error
      if (error.code === "42501" && error.message?.includes("already_member")) throw alreadyMember()
      throw (await createConflict(db, error, draft, hosts)) ?? fromDatabaseError(error, "signUp: signup_org")
    })
  return { created: true, org: { ...draft, host: hosts[0] ?? null, id: row.id }, hosts, setup: await setupAddresses(signup.orgCreation, slug, hosts) }
}
