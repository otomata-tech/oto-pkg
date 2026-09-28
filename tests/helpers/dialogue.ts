// jsdom n'implémente ni `showModal()` ni `close()` de `<dialog>` (26.1) : les dialogues et la palette du
// design system porté (E05-S09) s'y ouvrent par leur attribut `open`, ce que fait le navigateur, sans la
// couche du dessus ni l'inertie du fond, que seuls les contrôles visuels voient.
export function simulerLesDialogues(): void {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open")
  }
}
