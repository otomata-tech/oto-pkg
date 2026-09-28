// État de la cellule (E08-S04, H106) : version du paquet, migrations appliquées, santé (base
// joignable, variables présentes). Une cellule est une application déployée, pas une organisation :
// l'état se lit par le rôle plateforme, sans appartenance (NH4). Sans ce module, `admin_cell`
// (E08-S06) n'aurait rien à rendre, et personne ne verrait si une cellule a appliqué ses migrations
// ni si une variable manque.
//
// Repris d'Oto (`docs/version-servie.md` l. 24, 41) : la version servie se lit. Retiré : l'en-tête
// de version posé sur chaque réponse (une ressource réservée à l'équipe plateforme suffit).
import pkg from "../package.json"
import type { PlatformDb } from "./db"
import { databaseFailure, PlatformError } from "./errors"
import { oidcMode } from "./issuer"

/** Version du paquet qui tourne (`packages/plateforme/package.json`). */
export const packageVersion: string = pkg.version

/**
 * Sans elles, l'application ne sert pas (`.env.example`), selon le mode de l'hôte (`oidcMode`, M50) : on dit
 * leur présence, jamais leur valeur (NH5). En mode OIDC, l'émetteur et l'audience vérifient chaque jeton
 * (`issuerConfig`), le relais SMTP et l'expéditeur portent l'email d'invitation que la plateforme envoie
 * elle-même (`mail.ts`) ; les variables de Supabase n'y servent pas.
 */
const REQUIRED_ENV = {
  supabase: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SITE_URL"],
  oidc: ["PLATFORM_OIDC_ISSUER", "PLATFORM_OIDC_AUDIENCE", "PLATFORM_SMTP_URL", "PLATFORM_MAIL_FROM", "NEXT_PUBLIC_SITE_URL"],
} as const

type EnvPresence = { name: string; present: boolean }

export type CellStatus = {
  packageVersion: string
  /**
   * Migrations appliquées, triées par version ; celles du paquet se nomment `platform_<sujet>`.
   * `name` est nul quand la CLI qui a appliqué la migration ne l'écrivait pas : `applied_migrations`
   * (E01-S04) le prévoit, son type généré ne le dit pas.
   */
  migrations: { version: string; name: string | null }[]
  health: {
    database: { ok: boolean; latencyMs: number }
    env: EnvPresence[]
    /** La base répond et chaque variable requise est présente. */
    ok: boolean
  }
  checkedAt: string
}

/**
 * Toute panne de la base, réseau ou PostgREST, devient la même erreur, son code au log serveur
 * seulement ; un jeton que la base refuse reste `unauthorized` (`databaseFailure`, M10).
 */
const DATABASE_UNREACHABLE = "Database unreachable."

/** Présence de chaque variable requise dans le mode de `env` ; vide ou blanche, elle est absente. Aucune valeur n'en sort. */
export function envReport(env: Record<string, string | undefined>): EnvPresence[] {
  return REQUIRED_ENV[oidcMode(env) ? "oidc" : "supabase"].map((name) => ({ name, present: Boolean(env[name]?.trim()) }))
}

/**
 * L'état de la cellule, pour l'équipe plateforme seulement (`is_staff()` sous la session de
 * l'appelant) ; aucune organisation n'est lue. La durée de `applied_migrations()` dit que la base
 * répond. Les deux lectures dans une transaction ; le refus, décidé dans elle, en sort inchangé
 * (`databaseFailure`). `env` sert les tests.
 */
export async function cellStatus(db: PlatformDb, env: Record<string, string | undefined> = process.env): Promise<CellStatus> {
  const { migrations, latencyMs } = await db
    .tx(async (sql) => {
      const [staff] = await sql<{ is_staff: boolean }[]>`select platform.is_staff() as is_staff`
      if (staff?.is_staff !== true) throw new PlatformError("forbidden", "The cell status is reserved to the platform team.")
      const started = Date.now()
      const applied = await sql<{ version: string; name: string | null }[]>`select m.version, m.name from platform.applied_migrations() m`
      return { migrations: applied.map((row) => ({ version: row.version, name: row.name })), latencyMs: Date.now() - started }
    })
    .catch((error) => {
      throw databaseFailure(error, "cellStatus", DATABASE_UNREACHABLE)
    })

  const presence = envReport(env)
  return {
    packageVersion,
    migrations,
    health: {
      database: { ok: true, latencyMs },
      env: presence,
      ok: presence.every((variable) => variable.present),
    },
    checkedAt: new Date().toISOString(),
  }
}
