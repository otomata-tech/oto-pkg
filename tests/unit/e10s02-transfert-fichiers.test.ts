// @vitest-environment node
// Le transfert des fichiers joints d'une organisation (E10-S02, AC-e4 ; ADR-016 § 8) : ce que le parcours réel
// (`tests/integration/org-transfer.test.ts`, contre un faux S3 local) n'exerce pas — la garde sans stockage, le stockage lu dans les cinq
// variables, parlé en S3 signé (adresse en chemin, `fetch` simulé : aucun service extérieur), les octets écrits dans
// `<fichier>.files/<id>` à l'export et envoyés sous `<nouvel org_id>/<nouvel id>` à l'import, les objets absents ou en
// échec nommés ; le plan d'import qui relie l'ancien et le nouvel identifiant d'un fichier, cité par les blocs et les
// instantanés ; l'empreinte d'une copie. Fichier synthétique, noms fictifs.
import { randomUUID } from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { exportedObject, exportObjects, filesDir, importObjects, requireTransferStore, STORAGE_VARIABLES, transferStore, type TransferStore } from "../../scripts/lib/org-transfer-files.mjs"
import { fingerprint, planImport } from "../../scripts/lib/org-transfer-plan.mjs"
import { TABLES } from "../../scripts/lib/org-transfer.mjs"
import { STORAGE_VARIABLES as PACKAGE_STORAGE_VARIABLES } from "../../packages/plateforme/server/files/store"

const NOW = new Date("2026-09-30T12:00:00.000Z")
const AT = "2026-09-20T10:00:00.000000+00:00"
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e10s02-transfert-"))

/** Des variables de stockage factices, construites à l'exécution (`testing-strategy.md § Anti-patterns`). */
const VARIABLES = {
  PLATFORM_STORAGE_ENDPOINT: "https://s3.example.test/",
  PLATFORM_STORAGE_BUCKET: "plateforme",
  PLATFORM_STORAGE_REGION: "fr-par",
  PLATFORM_STORAGE_ACCESS_KEY_ID: `AK${randomUUID().slice(0, 8)}`,
  PLATFORM_STORAGE_SECRET_ACCESS_KEY: randomUUID(),
}

/** Un stockage en mémoire, sous le contrat de `transferStore` : ses objets, ses envois, une panne à la demande. */
function fakeStore(objects: Record<string, string>, failing: string[] = []): TransferStore & { puts: [string, string, string][] } {
  const puts: [string, string, string][] = []
  return {
    puts,
    async get(key) {
      return key in objects ? new TextEncoder().encode(objects[key]) : null
    },
    async put(key, bytes, mime) {
      if (failing.includes(key)) throw new Error(`Stockage : l'envoi de ${key} a répondu HTTP 500.`)
      puts.push([key, new TextDecoder().decode(bytes), mime])
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("transferStore", () => {
  it("should need the five variables of the package, and speak signed S3 by path to the bucket", async () => {
    const seen: { method: string; url: string; signed: boolean; type: string | null }[] = []
    vi.stubGlobal("fetch", async (request: Request) => {
      seen.push({ method: request.method, url: request.url, signed: request.headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256") ?? false, type: request.headers.get("content-type") })
      if (request.method === "GET" && request.url.endsWith("/absent")) return new Response("not found", { status: 404 })
      return new Response(request.method === "GET" ? "octets" : null, { status: 200 })
    })
    const missing = STORAGE_VARIABLES.map((name) => transferStore({ ...VARIABLES, [name]: "" }))
    const store = transferStore(VARIABLES)
    if (!store) throw new Error("fixture: store expected")

    const read = new TextDecoder().decode((await store.get("org/fichier")) ?? undefined)
    const absent = await store.get("org/absent")
    await store.put("org/neuf", new TextEncoder().encode("pdf"), "application/pdf")
    expect({ variables: STORAGE_VARIABLES, missing, read, absent, seen }).toEqual({
      variables: [...PACKAGE_STORAGE_VARIABLES],
      missing: [null, null, null, null, null],
      read: "octets",
      absent: null,
      seen: [
        { method: "GET", url: "https://s3.example.test/plateforme/org/fichier", signed: true, type: null },
        { method: "GET", url: "https://s3.example.test/plateforme/org/absent", signed: true, type: null },
        { method: "PUT", url: "https://s3.example.test/plateforme/org/neuf", signed: true, type: "application/pdf" },
      ],
    })
  })
})

describe("requireTransferStore", () => {
  it("should refuse files to transfer without a storage, naming the five variables, and let a transfer without files pass", () => {
    const store = fakeStore({})
    const refused = (() => {
      try {
        requireTransferStore(null, 2, "exporter")
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })()
    expect({ refused, none: requireTransferStore(null, 0, "importer"), kept: requireTransferStore(store, 3, "importer") === store }).toEqual({
      refused: `Stockage non configuré : 2 fichiers joints à exporter. Posez ${STORAGE_VARIABLES.join(", ")}, puis relancez. Rien n'a été écrit.`,
      none: null,
      kept: true,
    })
  })
})

describe("exportObjects", () => {
  it("should write each object in <file>.files/<id>, name those absent from the storage, and refuse without a storage before any write", async () => {
    const file = path.join(dir, "export.org-export.json")
    const without = path.join(dir, "sans.org-export.json")
    const files = [{ id: "f-1" }, { id: "f-2" }]
    const lines = await exportObjects(fakeStore({ "org/f-1": "%PDF un" }), { orgId: "org", files, file })
    await expect(exportObjects(null, { orgId: "org", files, file: without })).rejects.toThrow(/Stockage non configuré/)
    expect({
      lines,
      written: fs.readFileSync(exportedObject(file, "f-1"), "utf8"),
      path: path.relative(dir, exportedObject(file, "f-1")),
      absent: fs.existsSync(exportedObject(file, "f-2")),
      noDir: fs.existsSync(filesDir(without)),
      none: await exportObjects(null, { orgId: "org", files: [], file: without }),
    }).toEqual({
      lines: [`Fichiers joints : 1 objets écrits dans ${filesDir(file)}.`, "Objets absents du stockage (1), fichiers exportés sans octets : f-2"],
      written: "%PDF un",
      path: path.join("export.org-export.json.files", "f-1"),
      absent: false,
      noDir: false,
      none: [],
    })
  })

  it("should keep a folder already there without force, and empty it first with force", async () => {
    const file = path.join(dir, "force.org-export.json")
    fs.mkdirSync(filesDir(file), { recursive: true })
    fs.writeFileSync(exportedObject(file, "ancien"), "export précédent")
    const store = fakeStore({ "org/f-1": "%PDF un" })
    await expect(exportObjects(store, { orgId: "org", files: [{ id: "f-1" }], file })).rejects.toThrow(/existe déjà : relancez avec --force/)
    const kept = fs.readdirSync(filesDir(file))
    await exportObjects(store, { orgId: "org", files: [{ id: "f-1" }], file, force: true })
    expect({ kept, forced: fs.readdirSync(filesDir(file)) }).toEqual({ kept: ["ancien"], forced: ["f-1"] })
  })
})

describe("importObjects", () => {
  it("should send each object under <new org>/<new id> at the type of its row, and name the objects absent, refused or failed", async () => {
    const file = path.join(dir, "import.org-export.json")
    const [old1, old2, old3] = [randomUUID(), randomUUID(), randomUUID()]
    fs.mkdirSync(filesDir(file), { recursive: true })
    fs.writeFileSync(exportedObject(file, old1), "%PDF un")
    fs.writeFileSync(exportedObject(file, old3), "png")
    fs.writeFileSync(path.join(dir, "secret.txt"), "hors du dossier")
    const store = fakeStore({}, ["neworg/new-3"])
    const files = [
      { from: old1, to: "new-1", mime: "application/pdf" },
      { from: old2, to: "new-2", mime: "application/pdf" },
      { from: old3, to: "new-3", mime: "image/png" },
      { from: "../secret.txt", to: "new-4", mime: "text/plain" },
    ]
    const imported = await importObjects(store, { orgId: "neworg", files, file })
    await expect(importObjects(null, { orgId: "neworg", files, file })).rejects.toThrow(/Stockage non configuré/)
    expect({ puts: store.puts, imported, none: await importObjects(null, { orgId: "neworg", files: [], file }) }).toEqual({
      puts: [["neworg/new-1", "%PDF un", "application/pdf"]],
      imported: {
        lines: [
          "Fichiers joints : 1 objets envoyés au stockage.",
          `Objets absents de ${filesDir(file)} (1), fichiers importés sans octets : ${old2}`,
          `Envois en échec (2), fichiers importés sans octets : ${old3} (Stockage : l'envoi de neworg/new-3 a répondu HTTP 500.), ../secret.txt (identifiant invalide : un uuid est attendu)`,
        ],
        failed: 2,
      },
      none: { lines: [], failed: 0 },
    })
  })
})

describe("planImport and fingerprint, with a file", () => {
  const ids = { org: randomUUID(), root: randomUUID(), page: randomUUID(), file: randomUUID(), block: randomUUID() }
  const fileData = { file_id: ids.file, name: "devis.pdf", size: 3, mime: "application/pdf" }
  const doc = {
    format: "oto-platform-org-export",
    version: 1,
    exported_at: AT,
    source: { host: "source.example.test", org: { id: ids.org } },
    people: [],
    tables: {
      orgs: [{ id: ids.org, slug: "acme", prefix: "acme", name: "Acme Test", rules_version: 1, updated_at: AT }],
      nodes: [
        { id: ids.root, org_id: ids.org, parent_id: null, path: "guide", kind: "page", title: "Guide", created_by: null, updated_by: null },
        { id: ids.page, org_id: ids.org, parent_id: ids.root, path: "devis", kind: "page", title: "Devis", created_by: null, updated_by: null },
      ],
      files: [{ id: ids.file, org_id: ids.org, node_id: ids.page, name: "devis.pdf", mime: "application/pdf", size: 3, status: "ready", created_by: null, created_at: AT }],
      blocks: [{ id: ids.block, state: "published", org_id: ids.org, node_id: ids.page, type: "file", data: fileData, created_by: null, updated_by: null }],
      node_versions: [{ node_id: ids.page, revision: 1, blocks: [{ id: ids.block, type: "file", data: fileData }], author: null }],
    },
  }

  it("should export the ready files only, and pair each file with its new id, cited by the blocks and the snapshots of the copy", () => {
    const plan = planImport(doc, { people: new Map(), org: { slug: "acme2", prefix: "acmedeux" }, now: NOW })
    const [row] = plan.rows.files
    expect({
      only: TABLES.find((spec) => spec.name === "files")?.only,
      pairs: plan.files,
      node: row.node_id === plan.rows.nodes.find((node) => node.path === "devis")?.id,
      block: plan.rows.blocks[0].data.file_id,
      snapshot: plan.rows.node_versions[0].blocks[0].data.file_id,
      copy: fingerprint({ ...doc, tables: plan.rows }, NOW),
    }).toEqual({
      only: { column: "status", value: "ready" },
      pairs: [{ from: ids.file, to: row.id, mime: "application/pdf" }],
      node: true,
      block: row.id,
      snapshot: row.id,
      copy: fingerprint(doc, NOW),
    })
    expect(row.id).not.toBe(ids.file)
  })
})
