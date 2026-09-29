// Migrations du paquet que le projet n'a pas encore (E01-S11, partie a1-core) : une story porteuse de
// migration écrite en parallèle ne l'applique au projet partagé que juste avant sa fusion (décision de
// parallélisation du 2026-09-26). D'ici là, un test qui
// confronte le projet aux migrations du dépôt se saute, la version nommée, au lieu d'échouer sur un
// écart que la fusion comble. Lu par la connexion d'administration des suites portables
// (`tests/helpers/sql.ts`) ; aucune valeur n'est imprimée.
import fs from "fs"
import path from "path"
import { sqlConfigured, testAdminSql } from "./sql"

const MIGRATIONS = path.resolve(__dirname, "../../packages/plateforme/migrations")

/** Les versions des migrations du paquet (préfixe `AAAAMMJJHHMMSS` de leur fichier), dans l'ordre. */
function packageVersions(): string[] {
  return fs
    .readdirSync(MIGRATIONS)
    .flatMap((file) => /^(\d{14})_.*\.sql$/.exec(file)?.[1] ?? [])
    .sort()
}

/**
 * Les versions du paquet absentes de l'historique de la base (`supabase_migrations.schema_migrations`,
 * que tient la CLI Supabase, sur le projet comme sur le Postgres nu du job `bare-postgres`) ; vide sans
 * connexion d'administration, ou sur une base sans cet historique.
 */
export async function pendingMigrations(): Promise<string[]> {
  if (!sqlConfigured) return []
  const sql = testAdminSql()
  try {
    const [{ history }] = await sql`select pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null as history`
    if (!history) return []
    const applied = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((row) => String(row.version)))
    return packageVersions().filter((version) => !applied.has(version))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/** La migration du lot h d'E05-S11 (fiche D107 b) : le dossier des espaces personnels passe de `perso` à `private`. */
export const PRIVATE_FOLDER_VERSION = "20260928120000"

/**
 * Vrai tant que la base n'a pas `PRIVATE_FOLDER_VERSION` : une suite dont les graines ou les attentes
 * supposent `private` en base (déclencheurs, fonctions, `create_org`) se saute, la version nommée
 * (`pendingReason`), au lieu d'échouer sur un écart que l'application de la migration comble.
 */
export async function privateFolderPending(): Promise<boolean> {
  return (await pendingMigrations()).includes(PRIVATE_FOLDER_VERSION)
}

/** La migration d'E11-S02 (lot d) : `platform.discard_draft`, qu'appellent `node.discard_draft` et l'isolation. */
export const DISCARD_DRAFT_VERSION = "20260929190000"

/** Le nom d'une telle suite, qui dit pourquoi elle se saute tant que la migration manque. */
export const privateFolderSuite = (name: string, pending: boolean): string => (pending ? `${name} (${pendingReason([PRIVATE_FOLDER_VERSION])})` : name)

/** La raison du saut, les versions nommées. */
export const pendingReason = (versions: readonly string[]) =>
  `skipped: migration ${versions.join(", ")} of the package not applied to the project yet (applied just before its merge)`
