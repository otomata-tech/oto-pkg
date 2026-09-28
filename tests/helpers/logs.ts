// Ce que la console du serveur aurait écrit, pour les tests qui affirment qu'un texte n'y est pas
// (message levé, jeton, adresse) : `format` d'`util`, celui de `console.error`, développe une `Error`
// (message et pile), que `JSON.stringify` rend en `{}` (revue d'E09-S02, cycle 1 ;
// `testing-strategy.md § Anti-patterns`).
import { format } from "util"

/** Le texte qu'auraient écrit ces appels espionnés (`vi.spyOn(console, "error")`), un appel par bloc. */
export function loggedText(spy: { mock: { calls: readonly unknown[][] } }): string {
  return spy.mock.calls.map((args) => format(...args)).join("\n")
}
