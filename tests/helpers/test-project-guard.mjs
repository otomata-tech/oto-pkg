/**
 * Garde du projet de test : les tests ne visent jamais la production. Les suites qui visent le projet
 * Supabase distant y écrivent à la clé secrète (comptes, organisations jetables, `auth.users`) :
 * `PLATFORM_TEST_PROJECT_ID` déclare le projet de test, et toute variable qui en vise un autre arrête
 * la mise en place de Vitest (`vitest.config.ts`) et de Playwright (`playwright.config.ts`) avant la
 * première suite. Sans dépendance : les deux configurations la chargent (`testing-strategy.md § Base
 * de test locale`). Le message nomme les variables, jamais une valeur.
 */

/** Les URL qui portent l'identifiant du projet : l'API, et les trois connexions à sa base. */
const URL_VARIABLES = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_URL", "PLATFORM_DATABASE_URL", "PLATFORM_ADMIN_DATABASE_URL"]

/** Les variables que la garde lit ; `PLATFORM_TEST_DB` à part, que seul Vitest connaît. */
export const TEST_PROJECT_VARIABLES = ["PLATFORM_TEST_PROJECT_ID", "SUPABASE_PROJECT_ID", ...URL_VARIABLES]

// Une connexion à la base hors de Supabase (Postgres nu de la CI, base du poste) n'a pas de projet.
const SUPABASE_HOST = /\.supabase\.(?:co|com)\b/i

/**
 * Une adresse du poste (Supabase local, `npx supabase start`) n'a pas de projet distant : hôte
 * `localhost`, `*.localhost`, `127.0.0.1` ou `[::1]`, comparé en entier (`localhost.supabase.co` reste
 * contrôlée).
 * @param {string} value
 */
function isLocal(value) {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]"
  } catch {
    return false
  }
}

/**
 * L'identifiant du projet d'une URL de Supabase : l'hôte `<ref>.supabase.co` (API) ou
 * `db.<ref>.supabase.co` (connexion directe), sinon l'utilisateur `<rôle>.<ref>` du pooler
 * (`*.pooler.supabase.com`) ; `undefined` si l'URL ne le dit pas.
 * @param {string} value
 * @returns {string | undefined}
 */
function projectOf(value) {
  try {
    const url = new URL(value)
    const direct = /^(?:db\.)?([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)
    if (direct) return direct[1].toLowerCase()
    if (/\.pooler\.supabase\.com$/i.test(url.hostname)) return /\.([a-z0-9]+)$/i.exec(decodeURIComponent(url.username))?.[1].toLowerCase()
  } catch {
    // Illisible : aucun identifiant, donc refusée.
  }
  return undefined
}

/**
 * Le refus de la campagne, ou `null`. Les tests visent le projet distant dès que
 * `SUPABASE_PROJECT_ID`, `NEXT_PUBLIC_SUPABASE_URL` ou une connexion à une base de Supabase est posée,
 * hors adresse du poste ; alors `PLATFORM_TEST_PROJECT_ID` est exigée, et chacune doit viser ce projet.
 * `PLATFORM_TEST_DB=local` (le défaut de Vitest, que `vitest.config.ts` pose) : il a retiré les variables de
 * Supabase et pointé les connexions sur le poste.
 * @param {Record<string, string | undefined>} env  les variables que verront les tests (vide = absente)
 * @returns {string | null}
 */
export function testProjectRefusal(env) {
  if (env.PLATFORM_TEST_DB === "local") return null
  const urls = URL_VARIABLES.filter(
    (key) => env[key] && !isLocal(env[key] ?? "") && (key === "NEXT_PUBLIC_SUPABASE_URL" || SUPABASE_HOST.test(env[key] ?? "")),
  )
  if (!env.SUPABASE_PROJECT_ID && urls.length === 0) return null
  const expected = env.PLATFORM_TEST_PROJECT_ID
  const wrong = !expected
    ? ["PLATFORM_TEST_PROJECT_ID"]
    : [
        ...(env.SUPABASE_PROJECT_ID === expected ? [] : ["SUPABASE_PROJECT_ID"]),
        ...urls.filter((key) => projectOf(env[key] ?? "") !== expected),
      ]
  if (wrong.length === 0) return null
  return (
    `Tests arrêtés avant toute suite : ${wrong.join(", ")} ${!expected ? "manque" : `${wrong.length > 1 ? "ne visent" : "ne vise"} pas le projet de PLATFORM_TEST_PROJECT_ID`}. ` +
    "Les tests ne visent jamais la production : PLATFORM_TEST_PROJECT_ID déclare le projet de test, et " +
    `SUPABASE_PROJECT_ID comme ${URL_VARIABLES.join(", ")} doivent le viser ` +
    "(testing-strategy.md § Base de test locale)."
  )
}
