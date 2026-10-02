// Le widget routeur (story widgets-dans-la-conversation) : chaque vue du paquet et une vue de l'ERP rendues sur le
// `structuredContent` réel de leur outil (`formatResult` de la porte, `mcp-patterns.md § 5.3 bis`), rien sans vue
// connue, le chargement borné à 12 s, la nuit de l'host ; les actions (page suivante, suites, appels d'une vue de
// l'ERP), jamais avec `confirm`. Le pont vers l'host est doublé par une source de test.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { formatResult } from "../../../packages/plateforme/mcp/result"
import type { ServedView } from "../../../packages/plateforme/schemas/views"
import type { ToolOutput } from "../../../packages/plateforme/server/tool-output"
import type { Ecouteurs, ReponseDOutil, SourceDuResultat } from "../../../packages/plateforme/widgets/bridge"
import type { ErpViewProps } from "../../../packages/plateforme/widgets/index"
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
    const { container } = render(<VueDuResultat resultat={served(callOf(ROWS), { kind: "table", theme: "lagune", call: "acme_call" })} />)
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
    render(<VueDuResultat resultat={served(callOf([]), { kind: "table", theme: "lagune", call: "acme_call" })} />)
    expect(screen.getByText("Aucune ligne.")).toBeTruthy()
  })

  it("should render one row as a record of its columns", () => {
    render(<VueDuResultat resultat={served(callOf([ROWS[0]]), { kind: "record", theme: "cobalt", call: "acme_call" })} />)
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
    const { container } = render(<VueDuResultat resultat={served(output, { kind: "page", theme: "manuscrit", call: "acme_call" })} />)
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
      served({ text: "big", data: { rows: "z".repeat(25_000) } }, { kind: "table", theme: "lagune", call: "acme_call" }),
      null,
    ]) {
      const { container, unmount } = render(<VueDuResultat resultat={resultat} />)
      expect(container.innerHTML, JSON.stringify(resultat?.view ?? null)).toBe("")
      unmount()
    }
  })
})

/** Une vue de l'ERP de test : le numéro du devis, et un bouton qui appelle `erp.relancer` avec ses arguments. */
function Devis({ result, call }: ErpViewProps) {
  return (
    <section>
      <p>Devis {String(result.numero)}</p>
      {call && <button onClick={() => void call("erp.relancer", { numero: result.numero })}>Relancer</button>}
    </section>
  )
}

const DEVIS: ToolOutput = { text: "Devis D-041.", data: { function: "erp.lire_devis", team: null, result: { numero: "D-041" } } }

describe("Widget", () => {
  /** Une source qui livre ce que le test lui donne, quand il le donne, et note les appels et les messages. */
  function source(reponse: ReponseDOutil = { resultat: {} }) {
    const ecouteurs: Partial<Ecouteurs> = {}
    const appels: [string, Record<string, unknown>][] = []
    const messages: string[] = []
    const doublure: SourceDuResultat = {
      ecouter(recus) {
        Object.assign(ecouteurs, recus)
        return () => {}
      },
      appeler: async (outil, args) => {
        appels.push([outil, args])
        return reponse
      },
      envoyerMessage: async (texte) => {
        messages.push(texte)
      },
    }
    return { doublure, ecouteurs, appels, messages }
  }

  it("should wait in a status, then render the view delivered and follow the night of the host", () => {
    const { doublure, ecouteurs } = source()
    render(<Widget source={doublure} />)
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true")
    act(() => ecouteurs.surNuit?.(true))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    act(() => ecouteurs.surResultat?.(served(callOf(ROWS), { kind: "table", theme: "lagune", call: "acme_call" })))
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

  it("should ask for the next rows with the same function and arguments, the cursor added, never confirm", async () => {
    const page = { ...callOf([ROWS[1]]), data: { function: "table.rows", team: null, result: { table: "ventes/prospects", total: 2, offset: 1, rows: [ROWS[1]] } } }
    const { doublure, ecouteurs, appels } = source({ resultat: served(page, { kind: "table", theme: "lagune", call: "acme_call" }) })
    render(<Widget source={doublure} />)
    const premiere = { ...callOf([ROWS[0]]), data: { function: "table.rows", team: null, result: { table: "ventes/prospects", total: 2, offset: 0, rows: [ROWS[0]], next_cursor: "c2" } } }
    act(() => {
      ecouteurs.surEntree?.({ ctx: "AAAA-BBBB", function: "table.rows", arguments: { table: "ventes/prospects", limit: 1 } })
      ecouteurs.surResultat?.(served(premiere, { kind: "table", theme: "lagune", call: "acme_call" }))
    })
    fireEvent.click(screen.getByRole("button", { name: "Lignes suivantes" }))
    await waitFor(() => expect(screen.getByRole("cell", { name: "Coudray" })).toBeTruthy())
    expect(appels).toEqual([["acme_call", { ctx: "AAAA-BBBB", function: "table.rows", arguments: { table: "ventes/prospects", limit: 1, cursor: "c2" } }]])
  })

  it("should send a suggested function to the assistant as a message, calling no tool", async () => {
    const { doublure, ecouteurs, appels, messages } = source()
    render(<Widget source={doublure} />)
    act(() => ecouteurs.surResultat?.(served({ ...callOf(ROWS), nextActions: ["table.write"] }, { kind: "table", theme: "lagune", call: "acme_call" })))
    fireEvent.click(within(screen.getByRole("navigation", { name: "Suites proposées à l'assistant" })).getByRole("button", { name: "table.write" }))
    await waitFor(() => expect(messages).toEqual(["Lance table.write sur ce résultat."]))
    expect(appels).toEqual([])
  })

  it("should say when the host refuses the message of a suggestion", async () => {
    const { doublure, ecouteurs } = source()
    doublure.envoyerMessage = () => Promise.reject(new Error("not connected"))
    render(<Widget source={doublure} />)
    act(() => ecouteurs.surResultat?.(served({ ...callOf(ROWS), nextActions: ["table.write"] }, { kind: "table", theme: "lagune", call: "acme_call" })))
    fireEvent.click(screen.getByRole("button", { name: "table.write" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Le message n'a pas pu être écrit dans la conversation.Demandez la suite à l'assistant vous-même."))
  })

  it("should render an ERP view, let it call a function under the ctx of the result without confirm, and say a refusal", async () => {
    const { doublure, ecouteurs, appels } = source({ refus: "Function erp.relancer is not enabled at Acme." })
    render(<Widget source={doublure} vuesErp={{ devis: Devis }} />)
    act(() => {
      ecouteurs.surEntree?.({ ctx: "AAAA-BBBB", function: "erp.lire_devis", arguments: { numero: "D-041" } })
      // Un Contexte changé : le résultat donne le code à passer désormais.
      ecouteurs.surResultat?.({ ...served(DEVIS, { kind: "erp:devis", theme: "violet", call: "acme_call" }), new_ctx: "CCCC-DDDD" })
    })
    fireEvent.click(screen.getByRole("button", { name: "Relancer" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("L'appel a été refusé.Function erp.relancer is not enabled at Acme."))
    expect(appels).toEqual([["acme_call", { ctx: "CCCC-DDDD", function: "erp.relancer", arguments: { numero: "D-041" } }]])
    expect(screen.getByText("Devis D-041")).toBeTruthy()
  })

  it("should offer no call without a known ctx, and render nothing for an ERP view absent from the bundle", () => {
    const { doublure, ecouteurs } = source()
    const { container } = render(<Widget source={doublure} vuesErp={{ devis: Devis }} />)
    act(() => ecouteurs.surResultat?.(served(DEVIS, { kind: "erp:devis", theme: "violet", call: "acme_call" })))
    expect(screen.getByText("Devis D-041")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Relancer" })).toBeNull()
    act(() => ecouteurs.surResultat?.(served(DEVIS, { kind: "erp:facture", theme: "violet", call: "acme_call" })))
    expect(container.querySelector(".oto")).toBeNull()
  })
})
