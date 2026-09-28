/**
 * account-copy — l'email et le nom d'un compte Supabase Auth, tels que l'outillage les recopie dans
 * `members` et `platform_staff` (E01-S09, AC15) : aucune clé ni lecture ne lie plus `platform` à la
 * table des comptes de Supabase, la base garde des copies.
 *
 * Ce que ça empêche : trois calculs du même nom (`pnpm platform:staff add`, section `identite` de la
 * Démo, `createFixtures` des tests) qu'une règle nouvelle du nom laisserait diverger. La règle est
 * celle d'`accept_invitations` et de `members_identity_copy` : `user_metadata.full_name`, sinon
 * `user_metadata.name`, si c'est un texte non vide ; l'email en minuscules. Outillage et tests
 * seulement, jamais importé par le paquet ni par l'hôte.
 */

/**
 * @param {{ email?: string | null, user_metadata?: Record<string, unknown> | null }} user  compte lu
 *   par l'API d'administration de Supabase Auth
 * @returns {{ email: string | null, name: string | null }}
 */
export function accountCopy(user) {
  const named = user.user_metadata?.full_name ?? user.user_metadata?.name
  return { email: user.email?.toLowerCase() ?? null, name: typeof named === 'string' && named ? named : null }
}
