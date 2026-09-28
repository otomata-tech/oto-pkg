// Le repli du focus quand la relecture emporte le contrôle qui l'a (E05-S03,
// `accessibility-patterns.md § Focus Management`) : il va au titre de la liste, en `tabIndex={-1}`
// (`ANCRE`), jamais à `<body>`. Porté d'oto-frontend (`member-actions.tsx` l. 74-81,
// `replierLeFocusSur`). Sans lui, les quatre îlots dont le contrôle part redisaient la même règle.

/**
 * Donne le focus à l'élément `ancre` quand il est dans `geste`, sur `<body>` ou sur un élément déjà
 * retiré ; déplacé ailleurs par la personne pendant l'envoi, il y reste.
 */
export function replierLeFocusSur(ancre: string, geste: Element | null): void {
  const actif = document.activeElement
  if (!actif || actif === document.body || !actif.isConnected || geste?.contains(actif)) {
    document.getElementById(ancre)?.focus()
  }
}
