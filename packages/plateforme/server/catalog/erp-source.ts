// La source ERP du catalogue (E08-S05, H108) : la liste inscrite par `registerFunctions` (`erp.ts`), que
// le registre lit à chaque appel (`catalogFunctions`). Module à part, sans import à l'exécution. Logée
// dans `erp.ts`, qui lit le registre pour valider une liste, elle ferait s'importer registre et `erp.ts`,
// et un test qui simule le registre (`vi.mock` avec `importOriginal`) donnerait le vrai registre aux
// modules chargés par sa fabrique (`testing-strategy.md § Anti-patterns`). Logée dans le registre, sans
// cycle, elle y mettrait un état et son remplaçant exporté, dans un fichier de fonctions pures sur des
// listes que chaque source modifie (NH12).
import type { ErpFunction } from "./erp"

let erpSource: readonly ErpFunction[] = []

/** Les fonctions de l'ERP inscrites. */
export function erpFunctions(): readonly ErpFunction[] {
  return erpSource
}

/** Remplace toute la source (NH1) ; seul appelant : `registerFunctions`, la liste entière validée. */
export function replaceErpFunctions(functions: readonly ErpFunction[]): void {
  erpSource = [...functions]
}
