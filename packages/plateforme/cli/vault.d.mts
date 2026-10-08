// Types de `vault.mjs`, que le serveur du paquet importe : un hôte compile le paquet sans `allowJs`, et sans ce
// fichier l'import y prend le type `any` implicite, refusé par `next build` (job `packed-host-build`).
export declare const VAULT_KEY_VARIABLE: "PLATFORM_VAULT_KEY"
export declare const SECRET_COLUMN: "secret_ciphertext"
export declare const TOKEN_COLUMN: "token_ciphertext"

export declare class VaultError extends Error {
  readonly reason: "missing" | "invalid" | "unreadable"
  constructor(reason: "missing" | "invalid" | "unreadable", message: string)
}

export declare function parseVaultKey(value: string | undefined): Buffer
export declare function vaultKeyId(key: Buffer): string
export declare function seal(key: Buffer, accountId: string, column: string, text: string): string
export declare function open(key: Buffer, accountId: string, column: string, ciphertext: string): { version: "v1" | "v2"; text: string }
export declare function sealCredential(key: Buffer, accountId: string, fields: Readonly<Record<string, string>>): string
export declare function openCredential(key: Buffer, accountId: string, ciphertext: string): { fields: Record<string, string> } | { single: string }
export declare function mergeCredential(previous: Readonly<Record<string, string>>, changes: Readonly<Record<string, string | null>>): Record<string, string>
