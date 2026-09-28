// Face api : handler de /api/plateforme/*, adaptateurs minces des services de server/.
export { handlePlateforme } from "./handler"
// La vue de l'écran « Organisation » (E08-S03), lue aussi par la page de l'hôte : ses six noms d'outils
// viennent de `mcp/`, que `server/` n'importe pas.
export { readOrgView } from "./admin/org"
