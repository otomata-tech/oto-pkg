// @vitest-environment node
import fs from "fs"
import os from "os"
import path from "path"
import { gzipSync } from "zlib"
import { afterAll, describe, expect, it } from "vitest"
import { assertSharedJsBudget, sharedFirstLoadJs } from "../../scripts/ci/shared-first-load-js.mjs"

// Le budget du JS chargé par toutes les pages (`performance-patterns.md § Bundle Size`), lu par le job
// `packed-host-build` : un test de fumée sur un `.next` réduit à son manifeste.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-js-"))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe("shared-first-load-js", () => {
  it("should sum the gzipped files present in every app entry and throw above the budget", () => {
    const commun = "x".repeat(5_000) + Math.random().toString(36).repeat(2_000)
    fs.mkdirSync(path.join(dir, "static"))
    fs.writeFileSync(path.join(dir, "static/commun.js"), commun)
    fs.writeFileSync(path.join(dir, "static/seul.js"), "y".repeat(50_000))
    const pages = { "/layout": ["static/commun.js", "static/seul.js"], "/admin/page": ["static/commun.js"] }
    fs.writeFileSync(path.join(dir, "app-build-manifest.json"), JSON.stringify({ pages }))

    const octets = gzipSync(commun, { level: 9 }).length
    expect(sharedFirstLoadJs(dir)).toEqual({ files: ["static/commun.js"], bytes: octets })
    expect(assertSharedJsBudget(dir, 1_000)).toBe(octets / 1000)
    expect(() => assertSharedJsBudget(dir, (octets - 1) / 1000)).toThrow(/static\/commun\.js.*performance-patterns\.md § Bundle Size/)
  })
})
