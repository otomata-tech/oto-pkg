import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LogoDOrganisation } from "@otomata_tech/oto_platform/ui"

afterEach(cleanup)

describe("LogoDOrganisation", () => {
  it("should render the logo as a decorative image of the given size, without referrer", () => {
    const { container } = render(<LogoDOrganisation nom="Démo" logo="https://example.com/logo.png" taille={32} />)

    const image = container.querySelector("img")
    expect(image).toHaveAttribute("src", "https://example.com/logo.png")
    expect(image).toHaveAttribute("alt", "")
    expect(image).toHaveAttribute("aria-hidden", "true")
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(image).toHaveAttribute("width", "32")
    expect(image).toHaveAttribute("height", "32")
    expect(image).toHaveStyle({ width: "32px", height: "32px" })
  })

  it("should render the first letter of the name in a bordered square without a logo", () => {
    const { container } = render(<LogoDOrganisation nom="  énergies du Sud" logo={null} taille={40} />)

    const lettre = container.firstElementChild
    expect(lettre?.tagName).toBe("SPAN")
    expect(lettre).toHaveTextContent(/^É$/)
    expect(lettre).toHaveAttribute("aria-hidden", "true")
    expect(lettre).toHaveClass("border")
    expect(lettre).toHaveStyle({ width: "40px", height: "40px" })
    expect(container.querySelector("img")).toBeNull()
  })
})
