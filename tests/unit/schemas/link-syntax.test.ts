// @vitest-environment node
// Syntaxe des liens `[[…]]` et du code en ligne (M15), seul lecteur de la publication
// (`server/nodes/links.ts`) et de l'écran (`ui/noeud/en-ligne.ts`) : en temps linéaire sur ce qu'un
// rédacteur écrit (`security-patterns.md § Validation des inputs`). Ses règles se prouvent par ses deux
// lecteurs (`nodes-links.test.ts`, `ui-en-ligne.test.ts`).
import { describe, expect, it } from "vitest"
import { codeSpans, linksIn } from "../../../packages/plateforme/schemas/link-syntax"

describe("link syntax (M15)", () => {
  it("should read hostile texts in linear time, 100 ms each at most (security)", () => {
    // 4 000 accents graves et 20 000 « [ » : les tailles où les expressions d'avant N70 prenaient des
    // secondes (revue d'E05-S02) ; puis, à la taille d'un bloc (100 000 caractères), les formes qui font
    // revenir en arrière une expression de ces syntaxes : des suites d'accents graves de toutes les
    // longueurs, des crochets ouvrants, des liens partout.
    const texts: [string, string][] = [
      ["4,000 backticks", "`".repeat(4_000)],
      ["20,000 opening brackets", "[".repeat(20_000)],
      ["backtick runs of every length", Array.from({ length: 445 }, (_, index) => "`".repeat(index + 1)).join("a")],
      ["100,000 opening brackets", "[".repeat(100_000)],
      ["a link everywhere", "[[a]]".repeat(20_000)],
    ]
    for (const [what, text] of texts) {
      const started = performance.now()
      codeSpans(text)
      linksIn(text)
      expect(performance.now() - started, what).toBeLessThan(100)
    }
  })
})
