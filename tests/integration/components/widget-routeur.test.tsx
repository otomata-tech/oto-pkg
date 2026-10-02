// Le widget routeur (story widgets-dans-la-conversation, lot 1) : chaque vue du paquet rendue sur le
// `structuredContent` réel de son outil (`formatResult` de la porte, `mcp-patterns.md § 5.3 bis`), rien sans vue
// connue, le chargement borné à 12 s, la nuit de l'host. Le pont vers l'host est doublé par une source de test.
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { formatResult } from "../../../packages/plateforme/mcp/result"
import type { ServedView } from "../../../packages/plateforme/schemas/views"
import type { ToolOutput } from "../../../packages/plateforme/server/tool-output"
import type { SourceDuResultat } from "../../../packages/plateforme/widgets/bridge"
import { VueDuResultat } from "../../../packages/plateforme/widgets/vues"
import { DELAI_MS, Widget } from "../../../packages/plateforme/widgets/widget"

const ROWS = [
  { key: "Valbrune", revision: 1, set: { ville: "Valbrune", montant: 1200, signe: true } },
  { key: "Coudray", revision: 3, set: { ville: "Coudray", montant: 800 } },
]

/** Le `structuredContent` que la porte sert pour ce résultat et cette vue. */
function served(output: ToolOutput, view?: ServedView): Record<string, unknown> {
  return formatResult(output, () => false, view).structuredContent ?? {}
}

const callOf = (rows: unknown[]): ToolOutput => ({
  text: `ventes/prospects: ${rows.length} row(s) match.`,
  data: { function: "table.rows", team: null, result: { table: "ventes/prospects", total: rows.length, offset: 0, rows } },
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.documentElement.classList.remove("dark")
})

describe("VueDuResultat", () => {
  it("should render the rows of table.rows in a table under the theme served, columns in the order of the rows", () => {
    const { container } = render(<VueDuResultat resultat={served(callOf(ROWS), { kind: "table", theme: "lagune" })} />)
    expect(container.querySelector(".oto")?.getAttribute("data-oto-theme")).toBe("lagune")
    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["ville", "montant", "signe"])
    expect(within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["Valbrune", "1200", "Oui"],
      ["Coudray", "800", ""],
    ])
    expect(screen.getByText("ventes/prospects · 2 lignes")).toBeTruthy()
  })

  it("should say an empty table in a sentence", () => {
    render(<VueDuResultat resultat={served(callOf([]), { kind: "table", theme: "lagune" })} />)
    expect(screen.getByText("Aucune ligne.")).toBeTruthy()
  })

  it("should render one row as a record of its columns", () => {
    render(<VueDuResultat resultat={served(callOf([ROWS[0]]), { kind: "record", theme: "cobalt" })} />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Valbrune")
    const terms = screen.getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent])
    expect(terms).toEqual([
      ["ville", "Valbrune"],
      ["montant", "1200"],
      ["signe", "Oui"],
    ])
  })

  it("should render the blocks of a page read whole: a hostile text as text, an https link as the screens do, a path without address", () => {
    const blocks = [
      { type: "heading", text: "Objet", data: { level: 1 } },
      { type: "paragraph", text: "<img src=x onerror=alert(1)> voir [la grille](https://example.test/grille), [[ventes/grille|la page]] et [ceci](javascript:alert(1))", data: {} },
    ]
    const output: ToolOutput = { text: "# Modèle", data: { path: "ventes/modele", title: "Modèle de relance", blocks } }
    const { container } = render(<VueDuResultat resultat={served(output, { kind: "page", theme: "manuscrit" })} />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Modèle de relance")
    expect(screen.getByRole("heading", { name: "Objet" })).toBeTruthy()
    expect(container.querySelector("img")).toBeNull()
    // Le rendu des écrans : un lien `https:` s'ouvre à part (`noopener`), si le bac à sable de l'host le permet.
    expect([...container.querySelectorAll("a")].map((lien) => [lien.getAttribute("href"), lien.getAttribute("rel")])).toEqual([["https://example.test/grille", "noopener noreferrer nofollow"]])
    expect(container.textContent).toContain("<img src=x onerror=alert(1)> voir la grille")
    expect(screen.getByText("la page").closest("a")).toBeNull()
  })

  it("should render nothing without a view, with an unknown kind or theme, or with omitted data", () => {
    // Le formateur dit au log serveur les données omises : attendu ici, tu.
    vi.spyOn(console, "error").mockImplementation(() => {})
    for (const resultat of [
      served(callOf(ROWS)),
      { ...served(callOf(ROWS)), view: { kind: "list", theme: "lagune" } },
      { ...served(callOf(ROWS)), view: { kind: "table", theme: "rose" } },
      served({ text: "big", data: { rows: "z".repeat(25_000) } }, { kind: "table", theme: "lagune" }),
      null,
    ]) {
      const { container, unmount } = render(<VueDuResultat resultat={resultat} />)
      expect(container.innerHTML, JSON.stringify(resultat?.view ?? null)).toBe("")
      unmount()
    }
  })
})

describe("Widget", () => {
  /** Une source qui livre ce que le test lui donne, quand il le donne. */
  function source() {
    const ecouteurs: { resultat?: (resultat: Record<string, unknown>) => void; nuit?: (nuit: boolean) => void } = {}
    const doublure: SourceDuResultat = {
      ecouter(surResultat, surNuit) {
        ecouteurs.resultat = surResultat
        ecouteurs.nuit = surNuit
        return () => {}
      },
    }
    return { doublure, ecouteurs }
  }

  it("should wait in a status, then render the view delivered and follow the night of the host", () => {
    const { doublure, ecouteurs } = source()
    render(<Widget source={doublure} />)
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true")
    act(() => ecouteurs.nuit?.(true))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    act(() => ecouteurs.resultat?.(served(callOf(ROWS), { kind: "table", theme: "lagune" })))
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByRole("table")).toBeTruthy()
  })

  it("should never stay loading: after 12 s it says in an alert what to ask in the conversation", () => {
    vi.useFakeTimers()
    render(<Widget source={source().doublure} />)
    // La région est montée vide : son message est dit à son arrivée.
    act(() => vi.advanceTimersByTime(DELAI_MS - 1))
    expect(screen.getByRole("alert").textContent).toBe("")
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByRole("alert").textContent).toBe("Le rendu du résultat n'est pas arrivé.Demandez à l'assistant de vous montrer le résultat en texte, ou relancez la demande.")
  })
})
