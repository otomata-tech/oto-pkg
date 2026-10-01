-- Avant la ligne de base V1 (version 1.3.0 du paquet) : la bibliothèque de `pg_trgm` chargée dans la session qui
-- applique les migrations.
--
-- La ligne de base (20260928100000) et la 1.1.0 (20260930100000) créent des fonctions dont l'en-tête pose
-- `set "pg_trgm.similarity_threshold"`. Un rôle non superutilisateur ne pose le paramètre d'une bibliothèque que si
-- la session l'a chargée, et `create extension if not exists` ne la charge pas : sur un projet Supabase,
-- `supabase db push` s'arrêtait à la ligne de base sur « permission denied to set parameter » (42501). La CLI
-- applique tous les fichiers en attente sur une seule session : ce fichier, joué le premier, la charge pour eux.
--
-- Datée avant la ligne de base, seule exception à « toute migration nouvelle vient après elle » : ces deux fichiers
-- sont publiés, donc figés. Un hôte déjà installé la reçoit par `supabase db push --include-all`, une fois ; elle n'y
-- change rien. Aucune table, colonne, fonction ni index.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$ begin perform extensions.similarity('a', 'a'); end $$;

-- ROLLBACK: (jamais exécuté depuis le paquet) — rien à défaire : l'extension est celle de la ligne de base.
