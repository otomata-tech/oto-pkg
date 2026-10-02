// Les vues de l'ERP, module virtuel que `widgets/build.mjs` compose à partir du dossier `--views` de l'hôte : un
// objet nom de la vue → composant. Vide dans le bundle du paquet.
declare module "virtual:oto-erp-views" {
  const vues: Readonly<Record<string, import("./index").ErpView>>
  export default vues
}
