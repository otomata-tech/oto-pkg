// Sessions de test sans Supabase Auth (E11-S14, HN-E11S14-1) : les personnes de `createSqlFixtures`, un
// jeton de la forme « supabase » du port (`sub` = identifiant interne) signé par la clé d'un émetteur de
// test en mémoire (`testIssuer`), et le vérificateur à passer aux portes (`verifyToken` de
// `handlePlateforme` et `handleMcpPost`) ; la base traduit le sujet par `identity_for_caller`. Aucun
// service joint : une suite qui s'en sert se garde par `sqlConfigured` et tourne sur un Postgres nu.
import { createLocalJWKSet } from "jose"
import { makeVerifyToken, type VerifyToken } from "../../packages/plateforme/mcp/auth"
import { testIssuer, type TestIssuer } from "./oidc-issuer"
import { createSqlFixtures } from "./sql"

type LocalIssuer = { issuer: TestIssuer; verify: VerifyToken }

/**
 * `createSqlFixtures()`, plus `sessionFor(user)` (un jeton d'une heure, claims `sub`, `email` et
 * `user_metadata.full_name` comme ceux d'une session de Supabase Auth) et `verifyToken`, qui n'admet que
 * les jetons de cette fabrique. L'émetteur est créé au premier usage. `cleanup()` : celui de
 * `createSqlFixtures`, dont `forget_user` retire aussi les lignes `identities` que les portes ont posées.
 */
export function createLocalFixtures() {
  const fx = createSqlFixtures()
  let local: Promise<LocalIssuer> | undefined

  function localIssuer(): Promise<LocalIssuer> {
    local ??= testIssuer().then((issuer) => ({ issuer, verify: makeVerifyToken({ jwks: createLocalJWKSet(issuer.jwks), issuer: issuer.issuer }) }))
    return local
  }

  async function sessionFor(user: { id: string; email: string; name?: string | null }): Promise<{ accessToken: string }> {
    const { issuer } = await localIssuer()
    const accessToken = await issuer.sign({ sub: user.id, email: user.email, user_metadata: user.name ? { full_name: user.name } : {} })
    return { accessToken }
  }

  const verifyToken: VerifyToken = async (request, bearer) => (await localIssuer()).verify(request, bearer)

  return { ...fx, sessionFor, verifyToken }
}

export type LocalFixtures = ReturnType<typeof createLocalFixtures>
