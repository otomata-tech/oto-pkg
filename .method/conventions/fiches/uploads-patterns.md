# Fiche — uploads-patterns

Texte complet : `.method/conventions/uploads-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Jusqu'à 1 Mo : Server Action et `FormData` ; au-delà, l'action délivre une URL signée et le client envoie au storage ; relever `bodySizeLimit` n'est pas une solution. § La limite de 1 Mo décide de l'architecture
- Aucune Server Action ne reçoit un `File` sans schéma Zod qui valide taille et type ; `file.type` est falsifiable : magic bytes ou `Content-Disposition: attachment` pour un contenu sensible, jamais servi en `text/html`. § Validation — côté serveur, toujours
- Un chemin de storage s'écrit `<auth.uid()>/<uuid>.<extension nettoyée>`, jamais avec `file.name` ; le nom d'origine va dans une colonne `original_name`. § Nommage du chemin
- Au-delà de 1 Mo, une progression (`XMLHttpRequest`) ; aperçu révoqué au démontage ; zone de dépôt qui est aussi un `<input type="file">` ; annulation par `AbortController` ; limite et formats affichés avant la sélection. § Côté composant
- Aucun fichier orphelin : envoyer après la validation métier, ou nettoyer après un échec. § Règles
- Une image affichée passe par `next/image` avec ses dimensions ou `fill` et `sizes`. § Règles
