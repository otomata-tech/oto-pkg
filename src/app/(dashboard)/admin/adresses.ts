import type { AdressesDuRail } from "@otomata_tech/oto_platform/ui"

// Les écrans de l'hôte, que le fil des écrans d'administration range sous leur groupe (E05-S09 partie d2) :
// les adresses que le layout donne au rail, pour que le fil et le menu de l'entreprise mènent aux mêmes
// pages. Sans elles, l'en-tête d'un écran d'administration n'a pas de fil. E05-S13 : ni Usage, caché (AC-8), ni
// Retours, que le layout et la page des retours ajoutent pour l'équipe plateforme seule (AC-9).
export const ADRESSES: AdressesDuRail = {
  pages: "/n/",
  accueil: "/",
  journal: "/journal",
  equipes: "/teams",
  brancher: "/connect",
  organisation: "/admin/organization",
  connecteurs: "/admin/connectors",
}
