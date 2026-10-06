// Types de `vault.mjs`, que le serveur du paquet importe : un hôte compile le paquet sans `allowJs`, et sans ce
// fichier l'import y prend le type `any` implicite, refusé par `next build` (job `packed-host-build`).
export declare const VAULT_KEY_VARIABLE: "PLATFORM_VAULT_KEY"

export declare class VaultError extends Error {
  readonly reason: "missing" | "invalid" | "unreadable"
  constructor(reason: "missing" | "invalid" | "unreadable", message: string)
}

export declare function parseVaultKey(value: string | undefined): Buffer
export declare function sealSecret(key: Buffer, accountId: string, secret: string): string
export declare function openSecret(key: Buffer, accountId: string, ciphertext: string): string
