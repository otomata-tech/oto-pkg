import pkg from "../../package.json"
import { PackageVersion } from "../components/package-version"

const version: string = pkg.version

export function PlateformeHome() {
  return (
    <section aria-labelledby="plateforme-title" className="space-y-4">
      <h1 id="plateforme-title" className="text-2xl font-semibold tracking-tight">
        Plateforme
      </h1>
      <p className="text-mute">
        Ce socle est servi par le paquet @otomata_tech/oto_platform.
      </p>
      <PackageVersion version={version} />
    </section>
  )
}
