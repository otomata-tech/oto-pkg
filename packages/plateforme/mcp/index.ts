// Face mcp : ce dont les routes `/api/mcp` (E03-S01) et `/.well-known/oauth-protected-resource`
// (E02-S02) de l'hôte ont besoin, rien de plus.
export { handleMcpPost, mcpMethodNotAllowed } from "./handler"
export { makeVerifyToken } from "./auth"
export { handleResourceMetadata, metadataOptions } from "./metadata"
export { handleAdminMcp } from "./admin/handler"
