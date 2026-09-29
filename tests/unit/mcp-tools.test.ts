// @vitest-environment node
// Contrat MCP des six outils (E03-S01, AC6 à AC9) : noms, titres, annotations, `_meta`, descriptions
// et schémas, calculés sans base pour deux organisations. Les textes attendus sont ceux de la
// section « Contrat MCP » de la story, mot pour mot : c'est ce que lisent les hosts (H04, P14).
import { describe, expect, it } from "vitest"
import pkg from "../../packages/plateforme/package.json"
import { serverOptions } from "../../packages/plateforme/mcp/server"
import { buildTools, displayOrg, prerequisite, serverInstructions, toolKey } from "../../packages/plateforme/mcp/tools"

const ACME = { prefix: "acme", name: "Acme Énergies", domains: "sales, customer support, energy consulting" }
const DELTA = { prefix: "delta", name: "Delta Logistique", domains: null }
const KEYS = ["context", "find", "read", "call", "write", "feedback"]
const REQ = "Requires the ctx code from acme_context; call it first."

const ACME_DESCRIPTIONS: Record<string, string> = {
  context: `Loads your work context at Acme Énergies (sales, customer support, energy consulting) and routes the user's request to the right procedure; call it first in every conversation, before any other acme_ tool. Pass phrase = the user's request, verbatim. Returns the ctx code that every other acme_ tool requires, the steps of the matching procedure when the match is clear, who you work for, the rules of Acme Énergies, what's new, and the useful procedures and documents. When it returns candidates instead of steps, follow the instruction that comes with them. If a tool later answers "context has changed", call acme_context again with the same request, then retry that call. Call it only when the request concerns Acme Énergies's work. Otherwise do not call it.`,
  find: `${REQ} Searches the procedures, pages, tables and functions of Acme Énergies by their words and returns up to three nodes and three functions, each with a score. Use this when acme_context matched no procedure, or to locate a page, a table or a function. Do not use to read content (use acme_read) or to run a function (use acme_call).`,
  read: `${REQ} Reads a page, a procedure or a table by its path (e.g. ventes/relance_devis), your journal (path journal), or the contract of a function (e.g. table.rows). A long page comes as an outline: then read one section by its title. since_revision returns only what changed; a result cut at 45,000 characters says how to read the rest. Do not use to run a function (use acme_call).`,
  call: `${REQ} Runs a function of Acme Énergies's catalog (e.g. mail.create_draft, table.rows) with arguments checked against its contract; read the contract with acme_read, path = the function name, if unsure. A sensitive function (sending, deleting, paying) first returns a summary and does nothing: show it to the user, get their explicit approval, then call again with confirm: true. Never set confirm without that approval. Pass team or account only when a result asks for it or the user names one.`,
  // E03-S03 (AC1) : l'ancien texte d'E03-S01 en tête, mot pour mot, puis la phrase des opérations par bloc.
  write: `${REQ} Creates or edits a page, a procedure or a table by operations on sections addressed by their title, published at once (publish: false keeps an unpublished draft). Creating needs title and summary; editing needs base_revision = the revision you read (a stale one is refused with the current state). ops items: {op: replace_section | append | add_section | delete_section | replace_text, section: "<title>", text, find (replace_text only), after (add_section only)}. A procedure writes each call in a call block and a table takes a header: read their contracts with acme_read, path write.procedure or write.table. Send a long text in parts of about 20,000 characters with append. To change one block, read with refs: true, then use ops {op: replace_block | insert_after | delete_block | move_block, block: "<ref>", text, after_block or section (move_block: after that block, or at the end of that section)}.`,
  feedback: `${REQ} Reports a friction, a missing capability or a tool error to the Acme Énergies platform team and returns a ticket number. Use this when a tool, a procedure or an instruction was unclear, missing or wrong; set target to the tool, function or path involved. Do not use to send a message to anyone.`,
}

const TITLES: Record<string, string> = {
  context: "Acme Énergies: Load work context",
  find: "Acme Énergies: Find",
  read: "Acme Énergies: Read",
  call: "Acme Énergies: Run a function",
  write: "Acme Énergies: Write a page",
  feedback: "Acme Énergies: Report a problem",
}

const ANNOTATIONS: Record<string, Record<string, boolean>> = {
  context: { readOnlyHint: true, openWorldHint: false },
  find: { readOnlyHint: true, openWorldHint: false },
  read: { readOnlyHint: true, openWorldHint: false },
  call: { readOnlyHint: false, openWorldHint: true },
  write: { readOnlyHint: false, openWorldHint: false },
  feedback: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}

type Property = { type?: string; description?: string }

describe("six tools per organisation (AC6)", () => {
  for (const org of [ACME, DELTA]) {
    const tools = buildTools(org, [])

    it(`${org.prefix}: should list exactly six prefixed tools, in order, with ASCII names`, () => {
      expect(tools.map((tool) => tool.name)).toEqual(KEYS.map((key) => `${org.prefix}_${key}`))
      for (const tool of tools) expect(tool.name).toMatch(/^[a-z0-9_]{1,64}$/)
    })

    it(`${org.prefix}: should keep every description under 1,000 characters`, () => {
      for (const tool of tools) expect(tool.description.length, tool.name).toBeLessThan(1000)
    })

    it(`${org.prefix}: should open the five tools other than context with the ctx prerequisite`, () => {
      for (const tool of tools.slice(1)) expect(tool.description.startsWith(`${prerequisite(org.prefix)} `), tool.name).toBe(true)
    })

    it(`${org.prefix}: should declare oauth2 on every tool`, () => {
      for (const tool of tools) expect(tool._meta).toEqual({ securitySchemes: [{ type: "oauth2" }] })
    })
  }

  it("should serve the exact titles, annotations and descriptions of the contract", () => {
    const tools = buildTools(ACME, ["mail.create_draft", "table.rows"])
    for (const [index, key] of KEYS.entries()) {
      expect(tools[index].title, key).toBe(TITLES[key])
      expect(tools[index].annotations, key).toEqual(ANNOTATIONS[key])
      expect(tools[index].description, key).toBe(ACME_DESCRIPTIONS[key])
    }
  })

  it("should lengthen write by the block operations only, from 733 to 961 characters, 977 with a 12-character prefix (E03-S03 AC1 ; E11-S03, AC-c6 ; E11-S02, AC-b4)", () => {
    const write = buildTools(ACME, [])[4].description
    const added = ' To change one block, read with refs: true, then use ops {op: replace_block | insert_after | delete_block | move_block, block: "<ref>", text, after_block or section (move_block: after that block, or at the end of that section)}.'
    expect(write.endsWith(added)).toBe(true)
    expect([write.length - added.length, write.length]).toEqual([733, 961])
    expect(buildTools({ ...DELTA, prefix: "abcdefghijkl" }, [])[4].description).toHaveLength(977)
  })

  it("should bound context with the work domains and the closing line", () => {
    const context = buildTools(ACME, [])[0].description
    expect(context.startsWith("Loads your work context at Acme Énergies (sales, customer support, energy consulting)")).toBe(true)
    expect(context.endsWith("Call it only when the request concerns Acme Énergies's work. Otherwise do not call it.")).toBe(true)
  })

  it("should write call without an examples parenthesis when the catalog is empty", () => {
    const call = buildTools(ACME, [])[3].description
    expect(call).toContain("Runs a function of Acme Énergies's catalog with arguments")
    expect(call).not.toContain("(e.g. )")
  })

  it("should share no tool name between two organisations", () => {
    const acme = new Set(buildTools(ACME, []).map((tool) => tool.name))
    expect(buildTools(DELTA, []).filter((tool) => acme.has(tool.name))).toEqual([])
  })

  it("should recognise only the tools of the prefix", () => {
    expect(toolKey("acme", "acme_find")).toBe("find")
    expect(toolKey("acme", "delta_find")).toBeNull()
    expect(toolKey("acme", "acme_delete")).toBeNull()
  })
})

describe("size bounds (AC7)", () => {
  const NAME_START = "Société coopérative d'intérêt collectif des énergies "
  const LONG = {
    prefix: "abcdefghijkl",
    name: `${NAME_START}${"x".repeat(80 - NAME_START.length)}`,
    // Huit domaines de 17 caractères séparés par « , » : 150 caractères.
    domains: Array.from({ length: 8 }, (_, i) => `energy domain ${String(i).padStart(3, "0")}`).join(", "),
  }
  const EXAMPLES = ["connector1.function_ab", "connector2.function_cd", "connector3.function_ef"]

  it("should build a worst case of 80, 12 and 150 characters", () => {
    expect(LONG.name).toHaveLength(80)
    expect(LONG.prefix).toHaveLength(12)
    expect(LONG.domains).toHaveLength(150)
    for (const example of EXAMPLES) expect(example).toHaveLength(22)
  })

  it("should keep every description under 1,000 characters", () => {
    for (const tool of buildTools(LONG, EXAMPLES)) expect(tool.description.length, tool.name).toBeLessThan(1000)
  })

  it("should cut the name at 60 characters with a final ellipsis", () => {
    const { name } = displayOrg(LONG)
    expect(name).toHaveLength(60)
    expect(name.endsWith("…")).toBe(true)
    expect(buildTools(LONG, [])[0].title.startsWith(`${name}: `)).toBe(true)
  })

  it("should cut the name before an emoji that straddles the cut, never inside it (N31)", () => {
    expect(displayOrg({ ...LONG, name: `${"x".repeat(58)}🚀 énergies` }).name).toBe(`${"x".repeat(58)}…`)
  })

  it("should cut the domains at the last separator that fits in 100 characters", () => {
    const { domains } = displayOrg(LONG)
    expect(domains).toBe(LONG.domains.slice(0, LONG.domains.lastIndexOf(", ", 100)))
    expect(domains!.length).toBeLessThanOrEqual(100)
  })

  it("should cut domains without a separator at 99 characters plus an ellipsis", () => {
    const { domains } = displayOrg({ ...LONG, domains: "d".repeat(150) })
    expect(domains).toBe(`${"d".repeat(99)}…`)
  })

  it("should join a list of domains and drop empty domains", () => {
    expect(displayOrg({ ...ACME, domains: JSON.stringify(["sales", "support"]) }).domains).toBe("sales, support")
    expect(displayOrg({ ...ACME, domains: "  " }).domains).toBeNull()
  })

  it("should open context without domains on « Loads your work context at <name> and routes »", () => {
    expect(buildTools(DELTA, [])[0].description.startsWith("Loads your work context at Delta Logistique and routes")).toBe(true)
  })
})

describe("input schemas (AC8)", () => {
  const tools = buildTools(ACME, [])

  it("should require ctx on the five tools other than context, never on context", () => {
    for (const tool of tools.slice(1)) expect(tool.inputSchema.required, tool.name).toContain("ctx")
    expect(tools[0].inputSchema.required ?? []).not.toContain("ctx")
  })

  it("should describe every top-level property and keep the schemas flat", () => {
    const nested = new Set(["acme_write.ops", "acme_write.header", "acme_call.arguments"])
    for (const tool of tools) {
      // `inputSchema` est typé `Record<string, unknown>` : sa forme vient de `z.toJSONSchema`.
      const properties = tool.inputSchema.properties as Record<string, Property>
      for (const [field, schema] of Object.entries(properties)) {
        const where = `${tool.name}.${field}`
        expect(schema.description, where).toBeTruthy()
        const scalar = schema.type !== "object" && schema.type !== "array"
        expect(scalar || nested.has(where), where).toBe(true)
      }
    }
  })

  it("should serve no $schema key", () => {
    for (const tool of tools) expect(tool.inputSchema).not.toHaveProperty("$schema")
  })

  it("should keep the JSON Schemas frozen (ADR-002: add, never modify)", () => {
    expect(tools.map(({ name, inputSchema }) => ({ name, inputSchema }))).toMatchSnapshot()
  })
})

describe("server identity and instructions (AC9)", () => {
  it("should name the server oto-platform, titled by the organisation, at the package version", () => {
    const options = serverOptions(ACME)
    expect(options.serverInfo).toEqual({ name: "oto-platform", title: "Acme Énergies", version: pkg.version })
    expect(options.capabilities).toEqual({ tools: {}, prompts: {} })
  })

  it("should give one sentence of instructions, exactly the contract's", () => {
    const text = serverInstructions(ACME)
    expect(text).toBe(
      "Acme Énergies workspace: for any request about Acme Énergies's work, call acme_context first, with the user's request as phrase, because every other acme_ tool requires the ctx code it returns.",
    )
    expect(text.split(/\.\s/)).toHaveLength(1)
    expect(serverOptions(ACME).instructions).toBe(text)
  })
})
