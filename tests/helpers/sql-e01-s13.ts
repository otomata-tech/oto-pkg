// Aide SQL propre à E01-S13, dans son module : `tests/helpers/sql.ts` est un fichier d'ajout que des
// lots parallèles complètent, et une aide propre à un lot y prendrait un nom qu'un autre lot peut
// déclarer aussi.
import { asClaims, type AdminTx } from "./admin-sql"
import type { TestSql } from "./sql"

/**
 * `run` sous l'appelant `userId`, dans une transaction annulée de la connexion d'administration :
 * `definitions` s'y exécutent d'abord sous le rôle de la connexion (une fonction d'avant recréée dans
 * `pg_temp`, qui n'existe que pour cette connexion ; ou des lignes, écrites en valeurs liées, annulées avec
 * la transaction), puis le rôle `authenticated` et ses claims, comme les pose `server/sql.ts` (E01-S13 :
 * l'ancienne et la nouvelle version d'une fonction, même appelant ; M29 : `identites.test.ts`).
 */
export function adminAsCaller<T>(
  admin: TestSql,
  userId: string,
  definitions: readonly (string | ((tx: AdminTx) => Promise<unknown>))[],
  run: (tx: AdminTx) => Promise<T>,
): Promise<T> {
  return asClaims(admin, { sub: userId }, async (tx) => {
    await tx.unsafe("reset role")
    for (const definition of definitions) await (typeof definition === "string" ? tx.unsafe(definition) : definition(tx))
    await tx.unsafe("set local role authenticated")
    return run(tx)
  })
}
