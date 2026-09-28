import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { describe, it, expect, afterEach, vi } from "vitest"
import pkg from "@otomata_tech/oto_platform/package.json"
import { PlateformeHome } from "@otomata_tech/oto_platform/ui"

afterEach(() => {
  cleanup()
  // Retire le presse-papiers posé par un test : jsdom n'en a pas, les autres tests non plus.
  Reflect.deleteProperty(navigator, "clipboard")
})

describe("PlateformeHome", () => {
  it("should render the Plateforme level-1 heading, the version from the package manifest and the copy button", () => {
    render(<PlateformeHome />)
    expect(screen.getByRole("heading", { level: 1, name: "Plateforme" })).toBeInTheDocument()
    expect(screen.getByText(pkg.version)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copier la version" })).toBeInTheDocument()
  })

  it("should announce the failure when the clipboard is unavailable", async () => {
    // jsdom n'expose pas navigator.clipboard : writeText lève, le composant doit l'annoncer.
    render(<PlateformeHome />)
    fireEvent.click(screen.getByRole("button", { name: "Copier la version" }))
    expect(await screen.findByText("Copie impossible")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Copie impossible")
  })

  it("should copy the version and announce it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<PlateformeHome />)
    fireEvent.click(screen.getByRole("button", { name: "Copier la version" }))
    expect(await screen.findByText("Copié")).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(pkg.version)
  })
})
