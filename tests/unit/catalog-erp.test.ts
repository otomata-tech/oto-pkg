// @vitest-environment node
// Source ERP du catalogue (E08-S05, AC1 à AC3) : inscription par `registerFunctions`, remplacement de
// toute la source, refus à l'inscription. Le registre est le vrai : les espaces réservés viennent des
// autres sources (`table`, `mail`) et des contrats non appelables (`write`), jamais d'une liste recopiée.
import * as z from "zod/v4"
import { afterEach, describe, expect, it } from "vitest"
import { CatalogRegistrationError, defineErpFunction, registerFunctions, type ErpFunction } from "../../packages/plateforme/server/catalog/erp"
import { catalogFunctions, describeFunction, findFunction, isActive } from "../../packages/plateforme/server/catalog/registry"

const ok = async () => ({ text: "ok" })

/** Une fonction de l'ERP valide ; `fields` en change le contrat pour un cas de refus. */
function erp(fields: { name?: string; description?: string; examples?: { code: string }[]; next?: string[] } = {}): ErpFunction {
  return defineErpFunction({
    name: fields.name ?? "erp.lookup_customer",
    class: "read",
    description: fields.description ?? "Reads a customer of the ERP by its code.",
    schema: z.strictObject({ code: z.string().min(1) }),
    examples: fields.examples ?? [{ code: "C-001" }],
    next: fields.next,
    run: ok,
  })
}

const LIST_NOTES = erp({ name: "erp.list_notes" })

/** Les fonctions `erp.*` que le registre rend. */
const erpNames = () => catalogFunctions().flatMap((fn) => (fn.name.startsWith("erp.") ? [fn.name] : []))

/** L'erreur levée par l'inscription de `functions`, `null` si elle passe. */
function registrationError(functions: ErpFunction[]): unknown {
  try {
    registerFunctions(functions)
    return null
  } catch (error) {
    return error
  }
}

afterEach(() => {
  registerFunctions([])
})

describe("registerFunctions (E08-S05)", () => {
  it("should serve an ERP function from the registry, origin and connector erp, active for every organisation (AC1)", () => {
    registerFunctions([erp()])
    const fn = findFunction(catalogFunctions(), "erp.lookup_customer")
    expect([fn?.origin, fn?.connector, fn?.class]).toEqual(["erp", "erp", "read"])
    expect(fn && isActive(fn, new Set())).toBe(true)
  })

  it("should replace the whole ERP source at each registration, without error nor duplicate (AC2)", () => {
    registerFunctions([erp()])
    registerFunctions([])
    expect(erpNames()).toEqual([])
    registerFunctions([erp(), LIST_NOTES])
    registerFunctions([erp(), LIST_NOTES])
    expect(erpNames()).toEqual(["erp.lookup_customer", "erp.list_notes"])
  })

  it("should refuse each badly declared list with its message and register nothing of it (AC3)", () => {
    // Un hôte JavaScript passe ce que TypeScript refuse : un schéma `z.object`, qui ignore les clés inconnues.
    const loose = { ...erp(), schema: z.object({ code: z.string() }) as unknown as ErpFunction["schema"] }
    const unsummarized = defineErpFunction({
      name: "erp.send_invoice",
      class: "sensitive",
      description: "Sends an invoice of the ERP to its customer.",
      schema: z.strictObject({ invoice: z.string() }),
      examples: [{ invoice: "F-0001" }],
      run: ok,
    })
    // Un objet imbriqué `z.object` ôterait sans refus une clé mal écrite (NH17) ; `z.date()` n'a pas de JSON Schema (NH16).
    const nested = defineErpFunction({
      name: "erp.lookup_customer",
      class: "read",
      description: "Reads a customer of the ERP by its code.",
      schema: z.strictObject({ code: z.string(), options: z.object({ archived: z.boolean().optional() }) }),
      examples: [{ code: "C-001", options: {} }],
      run: ok,
    })
    const dated = defineErpFunction({
      name: "erp.lookup_customer",
      class: "read",
      description: "Reads a customer of the ERP by its code.",
      schema: z.strictObject({ code: z.string(), since: z.date() }),
      examples: [{ code: "C-001", since: new Date(0) }],
      run: ok,
    })
    const long = `erp.${"a".repeat(61)}`
    const cases: [ErpFunction[], string][] = [
      [[erp({ name: "erp.lookup customer" })], 'Invalid function name "erp.lookup customer": expected <namespace>.<name> in lowercase ASCII letters, digits and _, 64 characters at most.'],
      [[erp({ name: long })], `Invalid function name "${long}": expected <namespace>.<name> in lowercase ASCII letters, digits and _, 64 characters at most.`],
      [[erp({ name: "table.export" })], 'Namespace "table" of table.export is already served by another source.'],
      [[erp({ name: "mail.archive" })], 'Namespace "mail" of mail.archive is already served by another source.'],
      [[erp({ name: "write.anything" })], 'Namespace "write" of write.anything is already served by another source.'],
      [[erp(), erp()], "Duplicate function erp.lookup_customer in registerFunctions."],
      [[loose], "erp.lookup_customer: schema must be a z.strictObject (unknown keys are refused, not ignored)."],
      [[nested], "erp.lookup_customer: nested objects must be z.strictObject too (unknown keys are refused, not ignored)."],
      [[dated], "erp.lookup_customer: schema must be representable in JSON Schema (Date cannot be represented in JSON Schema)."],
      [[erp({ examples: [] })], "erp.lookup_customer: needs at least one example."],
      [[erp({ examples: [{ code: "" }] })], "erp.lookup_customer: examples[0] does not match the schema (code: Too small: expected string to have >=1 characters)."],
      [[erp({ description: " " })], "erp.lookup_customer: description must be 1 to 1000 characters."],
      [[erp({ description: "x".repeat(1001) })], "erp.lookup_customer: description must be 1 to 1000 characters."],
      [[unsummarized], "erp.send_invoice: a sensitive function needs summarize (two-step confirmation)."],
      [[erp({ name: "erp.create_invoice", next: ["erp.list_notes", "erp.missing"] })], "erp.create_invoice: next cites unknown function erp.missing."],
    ]
    registerFunctions([erp({ name: "erp.before" })])
    for (const [functions, message] of cases) {
      // Une fonction valide en tête de chaque liste : tout ou rien, elle n'est pas inscrite non plus.
      expect(registrationError([LIST_NOTES, ...functions]), message).toEqual(new CatalogRegistrationError(message))
      expect(erpNames(), message).toEqual(["erp.before"])
    }
  })

  it("should serve the arguments as the model writes them: a transform served, a field with a default optional (NH8, NH16)", () => {
    registerFunctions([
      defineErpFunction({
        name: "erp.list_invoices",
        class: "read",
        description: "Lists the invoices of a customer of the ERP, newest first.",
        schema: z.strictObject({ customer: z.string().transform((code) => code.toUpperCase()), limit: z.number().default(20) }),
        examples: [{ customer: "c-001" }],
        run: ok,
      }),
    ])
    const fn = findFunction(catalogFunctions(), "erp.list_invoices")
    expect(fn && describeFunction(fn, "acme").data.arguments_schema).toEqual({
      type: "object",
      properties: { customer: { type: "string" }, limit: { default: 20, type: "number" } },
      required: ["customer"],
      additionalProperties: false,
    })
  })
})
