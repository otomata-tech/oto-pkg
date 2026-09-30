// Le préfixe de l'API des écrans, contrat de montage entre l'hôte et le paquet (E11-S07, HN-E11S07-10) : la porte
// (`api/handler.ts`), le client des écrans (`ui/api/client.ts`) et les adresses d'API que les services écrivent
// (fichiers, dépôt par lien) le lisent ici. Sans lui, chaque littéral se renommerait à la main.

/** L'hôte monte la porte du paquet sous ce préfixe : `src/app/api/platform/[...route]/route.ts`. */
export const PLATFORM_API_PREFIX = "/api/platform/"
