// `writeNode` lu à l'appel, par un import dynamique : `write` relit le registre du catalogue (contrôle d'une
// procédure, `procedures-check.ts`), qui importe `upload.link`, `table.import` et `node.write_many` ; ces services
// l'appellent donc par ce module, qui n'importe `write.ts` qu'à l'exécution. Une seule enveloppe
// (`coding-standards.md § DRY`) : sans elle, chaque service recopie l'import dynamique et son commentaire.
import type { PlatformDb } from "../db"
import type { Identity } from "../identity"
import type { ToolOutput } from "../tool-output"
import type { WriteOrigin } from "./write-result"

/** `writeNode` (`write.ts`), importé au premier appel. */
export async function writeNodeLazily(db: PlatformDb, identity: Identity, input: unknown, origin: WriteOrigin): Promise<ToolOutput> {
  const { writeNode } = await import("./write")
  return writeNode(db, identity, input, origin)
}
