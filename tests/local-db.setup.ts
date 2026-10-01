// Mise en place globale de Vitest en mode `PLATFORM_TEST_DB=local` (M62, `vitest.config.ts`) : la base du
// checkout porte toutes les migrations du dépôt avant la première suite, sinon elle se prépare.
import path from "path"
import { ensureLocalDatabase } from "../scripts/lib/test-db-local.mjs"

export default async function setup(): Promise<void> {
  await ensureLocalDatabase(path.resolve(__dirname, ".."), (line: string) => console.log(`db:local : ${line}`))
}
