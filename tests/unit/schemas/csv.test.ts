// @vitest-environment node
// Lecture, déduction, contrôle et écriture d'un CSV (E10-S01, AC-b1, AC-b2, AC-b4, AC-b6) : les fonctions pures de
// `schemas/csv.ts` et `schemas/csv-cells.ts`, que partagent le dialogue de l'écran, `table.import` et le service.
// Les textes hostiles de 1 000 000 caractères (`MAX_ARGS_CHARS`) se lisent en temps linéaire
// (`security-patterns.md § Validation des inputs`).
import { describe, expect, it } from "vitest"
import {
  checkImport,
  columnNameOf,
  columnNames,
  detectSeparator,
  importProblemsText,
  inferTable,
  parseCsv,
  readCell,
  segmentOf,
  toCsv,
  withLineKey,
  type CellValue,
  type ImportColumn,
} from "../../../packages/plateforme/schemas"
import { TEMPS_LINEAIRE_MS } from "../../helpers/temps-lineaire"

const BOM = String.fromCodePoint(0xfeff)
const NBSP = String.fromCodePoint(0xa0)
const NARROW_NBSP = String.fromCodePoint(0x202f)

function table(text: string) {
  const read = parseCsv(text, detectSeparator(text))
  if ("unclosedQuote" in read) throw new Error(`quote at ${read.unclosedQuote}`)
  return read
}

function within(what: string, run: () => unknown): void {
  const start = performance.now()
  run()
  expect(performance.now() - start, what).toBeLessThan(TEMPS_LINEAIRE_MS)
}

describe("parseCsv and detectSeparator (AC-b1, AC-b2)", () => {
  it("should pick the most frequent separator outside quotes on the first line, ; then tab then , on a tie", () => {
    expect(["a;b;c\n1,2,3,4", "a,b,c", "a\tb", '"a;b;c",d', "a;b,c", "a\tb,c"].map(detectSeparator)).toEqual([";", ",", "\t", ",", ";", "\t"])
  })

  it("should read quotes, doubled quotes, line breaks in a cell, CRLF and a BOM, skip empty lines and number each line", () => {
    const text = `${BOM}nom;note\r\n"Dupont; Jean";"dit ""oui""\r\nsur deux lignes"\r\n\r\nMartin;ok\r\n`
    expect(parseCsv(text, ";")).toEqual({ rows: [["nom", "note"], ["Dupont; Jean", 'dit "oui"\r\nsur deux lignes'], ["Martin", "ok"]], lines: [1, 2, 5] })
    expect(parseCsv("a,b\n1,2", ",")).toEqual({ rows: [["a", "b"], ["1", "2"]], lines: [1, 2] })
  })

  it("should remove the apostrophe an export puts before =, +, - or @, and keep any other", () => {
    expect(table("a\n'=1+1\n'-3\n'@x\n'bonjour").rows.slice(1)).toEqual([["=1+1"], ["-3"], ["@x"], ["'bonjour"]])
  })

  it("should report a quote never closed with the line where it opens", () => {
    expect(parseCsv('a;b\n1;"ouvert\n2;3', ";")).toEqual({ unclosedQuote: 2 })
  })
})

describe("column names and segments (AC-a3, AC-b2)", () => {
  it("should lower-case, strip accents, turn other characters into _, prefix a digit with c_ and cut at 60", () => {
    expect([columnNameOf("Chiffre d'affaires (€)", 1), columnNameOf("  Émission ", 2), columnNameOf("2026", 3), columnNameOf("", 4), columnNameOf("!!!", 5)]).toEqual([
      "chiffre_d_affaires",
      "emission",
      "c_2026",
      "colonne_4",
      "colonne_5",
    ])
    expect(columnNameOf("a".repeat(80), 1)).toHaveLength(60)
  })

  it("should suffix a collision with _2, _3, and derive the segment of a file from its name", () => {
    expect(columnNames(["Nom", "nom", "NOM", ""])).toEqual(["nom", "nom_2", "nom_3", "colonne_4"])
    expect([segmentOf("Compte rendu — réunion.md"), segmentOf("clients.2026.csv"), segmentOf("###.csv")]).toEqual(["compte_rendu_reunion", "clients_2026", "import"])
  })
})

const column = (type: ImportColumn["type"], extra: Partial<ImportColumn> = {}): ImportColumn => ({ name: "c", type, ...extra })
const value = (type: ImportColumn["type"], raw: string, extra: Partial<ImportColumn> = {}) => {
  const read = readCell(column(type, extra), raw)
  return "value" in read ? read.value : "empty" in read ? "(empty)" : "(refused)"
}

describe("readCell (AC-b2)", () => {
  it("should read each form of each type, and refuse the others", () => {
    expect(["Oui", "FAUX", "yes", "true", "1"].map((raw) => value("bool", raw))).toEqual([true, false, true, true, "(refused)"])
    const numbers = ["1234", "-12.5", "12,5", `1 234,5`, `1${NBSP}234`, `12${NARROW_NBSP}345${NARROW_NBSP}678,25`, "01000", "1 23", "1.234,5", "0,5"]
    expect(numbers.map((raw) => value("number", raw))).toEqual([1234, -12.5, 12.5, 1234.5, 1234, 12345678.25, "(refused)", "(refused)", "(refused)", 0.5])
    expect(["2026-09-29", "29/09/2026", "31/02/2026", "09/29/2026", "2026-9-1"].map((raw) => value("date", raw))).toEqual(["2026-09-29", "2026-09-29", "(refused)", "(refused)", "(refused)"])
    expect(["2026-09-29T10:00:00Z", "2026-09-29T10:00+02:00", "2026-09-29T10:00:00"].map((raw) => value("datetime", raw))).toEqual([
      "2026-09-29T10:00:00Z",
      "2026-09-29T10:00+02:00",
      "(refused)",
    ])
    expect(["anne@exemple.test", "anne @exemple.test", "a@b@c"].map((raw) => value("email", raw))).toEqual(["anne@exemple.test", "(refused)", "(refused)"])
    expect(["https://exemple.test/a", "ftp://x", "http://a b"].map((raw) => value("url", raw))).toEqual(["https://exemple.test/a", "(refused)", "(refused)"])
    expect(["à faire", "fini"].map((raw) => value("enum", raw, { options: ["à faire"] }))).toEqual(["à faire", "(refused)"])
    expect([value("text", " tel quel "), value("text", "   "), value("text", "abc", { max_length: 2 })]).toEqual([" tel quel ", "(empty)", "(refused)"])
  })
})

describe("inferTable and the proposed key (AC-b2)", () => {
  it("should give each column the first type all its values fit, text for mixed decimals, an empty column, or a long text", () => {
    const names = ["code", "actif", "montant", "mixte", "jour", "vu", "email", "site", "vide", "note"]
    const rows = [
      ["A1", "oui", "12,5", "12.5", "29/09/2026", "2026-09-29T10:00:00Z", "a@x.test", "https://x.test", "", "x".repeat(2_500)],
      ["A2", "non", "3", "4,5", "2026-09-30", "2026-09-30T10:00:00+02:00", "b@x.test", "http://y.test", " ", "court"],
    ]
    expect(inferTable(rows, names)).toEqual({
      columns: [
        { name: "code", type: "text" },
        { name: "actif", type: "bool" },
        { name: "montant", type: "number" },
        { name: "mixte", type: "text" },
        { name: "jour", type: "date" },
        { name: "vu", type: "datetime" },
        { name: "email", type: "email" },
        { name: "site", type: "url" },
        { name: "vide", type: "text" },
        { name: "note", type: "text", max_length: 2_500 },
      ],
      key: "code",
    })
  })

  it("should propose the first text, number or email column whose values are all present and distinct, or none", () => {
    expect(inferTable([["oui", "", "1"], ["non", "b", "2"]], ["actif", "nom", "rang"]).key).toBe("rang")
    expect(inferTable([["a", "1"], ["a", "1"]], ["nom", "rang"]).key).toBeNull()
    expect(inferTable([["x".repeat(201)], ["b"]], ["nom"]).key).toBeNull()
  })

  it("should generate a ligne column, ligne_2 when the name is taken, numbered on four digits", () => {
    expect(withLineKey(["a"], [["x"], ["y"]])).toEqual({ key: "ligne", names: ["ligne", "a"], rows: [["0001", "x"], ["0002", "y"]] })
    expect(withLineKey(["ligne"], [["x"]]).key).toBe("ligne_2")
  })
})

const HEADER: ImportColumn[] = [
  { name: "nom", type: "text" },
  { name: "montant", type: "number" },
  { name: "jour", type: "date" },
]

describe("checkImport (AC-b4)", () => {
  it("should name each refused cell, empty or duplicate key and uneven line, with its line, and keep the typed rows", () => {
    const rows = [["A", "12,5", "29/09/2026"], ["", "1", ""], ["A", "abc", "2026-02-30"], ["B", "2"], ["C", "3", ""]]
    const checked = checkImport({ columns: HEADER, key: "nom", names: ["nom", "montant", "jour"], rows })
    expect(checked.tooLarge).toBeNull()
    expect(checked.rows).toEqual([
      { line: 2, key: "A", values: { nom: "A", montant: 12.5, jour: "2026-09-29" } },
      { line: 6, key: "C", values: { nom: "C", montant: 3 } },
    ])
    expect(importProblemsText(checked.problems)).toBe(
      'line 3, column nom: "" is not a key: every line needs one; line 4, column montant: "abc" is not a number; line 4, column jour: "2026-02-30" is not a date (YYYY-MM-DD or DD/MM/YYYY); line 4, column nom: "A" is not a key: line 2 has it already; line 5: 2 cells; the header line has 3',
    )
  })

  it("should refuse a missing key column, and cut the list at ten problems", () => {
    expect(importProblemsText(checkImport({ columns: HEADER, key: "nom", names: ["montant"], rows: [["1"]] }).problems)).toBe(
      "column nom: missing from the header line; it is the key of the table",
    )
    const many = Array.from({ length: 12 }, (_, index) => [`K${index}`, "x"])
    expect(importProblemsText(checkImport({ columns: HEADER, key: "nom", names: ["nom", "montant"], rows: many }).problems)).toMatch(/; line 11, column montant: "x" is not a number and 2 more$/)
  })

  it("should say the bounds: 5,000 lines, 100 columns, a cell of 10,000 characters", () => {
    const check = (names: string[], rows: string[][]) => checkImport({ columns: [{ name: "nom", type: "text" }], key: "nom", names, rows }).tooLarge
    expect(check(["nom"], Array.from({ length: 5_001 }, (_, index) => [String(index)]))).toEqual({ bound: "lines", text: "5,001 lines; 5,000 at most per import" })
    expect(check(Array.from({ length: 101 }, () => "nom"), [])).toEqual({ bound: "columns", text: "101 columns; 100 at most" })
    expect(check(["nom"], [["a"], ["x".repeat(10_001)]])).toEqual({ bound: "cell", text: "line 3: a cell of more than 10,000 characters; 10,000 at most" })
  })
})

describe("toCsv (AC-b6)", () => {
  const columns = [{ name: "nom" }, { name: "montant" }, { name: "jour" }, { name: "actif" }, { name: "note" }]
  const rows: ReadonlyMap<string, CellValue>[] = [
    new Map<string, CellValue>([["nom", "=SOMME(A1)"], ["montant", -12.5], ["jour", "2026-09-29"], ["actif", true], ["note", 'dit "oui"; bien']]),
    new Map<string, CellValue>([["nom", "@x"], ["note", "\tpuis"]]),
  ]

  it("should write a BOM, the header, ; and the decimal comma in French, and guard formulas but never a number", () => {
    expect(toCsv(columns, rows, "fr")).toBe(`${BOM}nom;montant;jour;actif;note\r\n'=SOMME(A1);-12,5;2026-09-29;true;"dit ""oui""; bien"\r\n'@x;;;;'\tpuis\r\n`)
    expect(toCsv(columns, rows, "en").split("\r\n")[1]).toBe(`'=SOMME(A1),-12.5,2026-09-29,true,"dit ""oui""; bien"`)
  })

  it("should read back as the values written, apostrophes removed", () => {
    expect(table(toCsv(columns, rows, "fr")).rows).toEqual([
      ["nom", "montant", "jour", "actif", "note"],
      ["=SOMME(A1)", "-12,5", "2026-09-29", "true", 'dit "oui"; bien'],
      ["@x", "", "", "", "\tpuis"],
    ])
  })
})

describe("hostile texts of 1,000,000 characters (security-patterns.md § Validation des inputs)", () => {
  const size = 1_000_000
  it("should read each in linear time", () => {
    within("quotes", () => parseCsv('"'.repeat(size), ";"))
    within("separators", () => parseCsv(";".repeat(size), ";"))
    within("line breaks", () => table("a\n".repeat(size / 2)))
    within("first line", () => detectSeparator(`"${";".repeat(size)}`))
    within("one number column", () => inferTable(Array.from({ length: 5_000 }, () => [`1 ${"234 ".repeat(49)}5`]), ["n"]))
    within("a long number", () => readCell({ name: "n", type: "number" }, `1${" 234".repeat(size / 4)}x`))
    within("a long email", () => readCell({ name: "e", type: "email", max_length: 254 }, `${"a".repeat(size)}@`))
    within("names", () => columnNames(Array.from({ length: 100 }, () => "é-".repeat(size / 200))))
  })
})
