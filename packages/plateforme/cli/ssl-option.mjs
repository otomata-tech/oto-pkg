/**
 * La règle TLS des connexions postgres.js de la commande et de l'outillage, dans un module qui ne lit
 * aucun fichier à son chargement (M47) : `db-prepare.mjs` lit `db-prepare.sql` par `import.meta.url`, ce
 * que Vite ne sert pas aux écrans testés sous jsdom ; la connexion d'administration des tests
 * (`tests/helpers/admin-sql.ts`), que ces écrans chargent par `tests/helpers/plateforme.ts`, lit la règle
 * ici, et n'en garde plus de copie.
 */

/**
 * TLS exigé, sauf quand l'URL dit le sien (`sslmode`, ou `ssl`, que postgres.js lit aussi) : sans eux,
 * postgres.js se connecte en clair, et l'URI directe que donne Supabase n'en porte aucun. Le mot de
 * passe de `platform_app` passerait alors en clair. Un Postgres local sans TLS se joint avec
 * `?sslmode=disable` (jobs de CI). Lu aussi par la connexion d'administration des tests.
 * @param {string} dbUrl
 * @returns {{ ssl?: 'require' }}
 */
export function sslOption(dbUrl) {
  try {
    const query = new URL(dbUrl).searchParams
    return query.has('sslmode') || query.has('ssl') ? {} : { ssl: 'require' }
  } catch {
    return { ssl: 'require' }
  }
}
