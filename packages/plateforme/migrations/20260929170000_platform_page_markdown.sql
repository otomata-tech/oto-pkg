-- E10-S04 (fiches D111 b, D114, D115 ; ADR-011 § 2) : le markdown qu'écrit un assistant se lit en blocs.
--
-- 1. Trois types de bloc : `simple_table` (tableau GFM : `columns`, `rows`, `align` facultatif), `divider`
--    (séparateur) et `toggle` (repli `<details>` : `data.summary`, le corps dans `text`).
-- 2. Listes imbriquées : un élément de `list` est une chaîne ou `{text, children: {items, ordered?, start?}}`,
--    trois niveaux au plus, 500 éléments en tout, sous-éléments compris.
-- 3. Titres sur cinq niveaux (`level` de 1 à 5).
--
-- Contraintes élargies, jamais resserrées : toute ligne existante reste valide ; `add constraint` la
-- revalide sous verrou. Les chemins JSON `strict` là où le mode `lax` déballerait un tableau et laisserait
-- passer un élément qui n'a pas la forme ; `lax` là où il ne sert qu'à tester une clé. Chaque garde de type
-- qui précède un chemin `strict` est un booléen (`coalesce`) : un `null` ne court-circuite pas le `and`, et
-- le chemin lèverait une erreur sur une clé absente. `blocks_data_check`
-- est inchangée. `block_search_text` re-versionnée à signature identique : elle lit les sous-éléments d'une
-- liste (`strict … .**`, que `lax` doublerait), les cellules d'un tableau simple et le résumé d'un repli ;
-- pour les formes existantes, son résultat est le même (`search_tsv`, colonne STORED, n'est pas recalculée).
-- Ses privilèges, gardés par `create or replace`, sont redits à l'identique de la ligne de base V1.

-- 1 à 3. Les types et les formes.
alter table platform.blocks
  drop constraint blocks_type_check,
  add constraint blocks_type_check check (type = any (array['heading', 'paragraph', 'list', 'checklist', 'code', 'call', 'mermaid', 'image', 'callout', 'reference', 'row', 'simple_table', 'divider', 'toggle'])),
  drop constraint blocks_shape_check,
  add constraint blocks_shape_check check (coalesce(
    case type
      when 'heading' then text is not null and char_length(btrim(text)) between 1 and 200 and text !~ '[\r\n]'
        and jsonb_path_exists(data, '$."level" ? (@ == 1 || @ == 2 || @ == 3 || @ == 4 || @ == 5)')
      when 'paragraph' then text is not null
      when 'list' then text is null
        and coalesce(jsonb_typeof(data -> 'items'), '') = 'array'
        and jsonb_array_length(data -> 'items') between 1 and 500
        -- premier niveau : des chaînes ou des objets
        and not jsonb_path_exists(data, 'strict $.items[*] ? (@.type() != "string" && @.type() != "object")')
        -- un élément objet : `text` et `children` seuls ; `children` : `items` non vide, `ordered` et `start` facultatifs
        and not jsonb_path_exists(data, 'lax $.items[*] ? (@.type() == "object" && !(@.text.type() == "string" && @.children.type() == "object" && !exists(@.keyvalue() ? (@.key != "text" && @.key != "children")) && @.children.items.type() == "array" && @.children.items.size() > 0 && !exists(@.children.keyvalue() ? (@.key != "items" && @.key != "ordered" && @.key != "start")) && (!exists(@.children.ordered) || @.children.ordered.type() == "boolean") && (!exists(@.children.start) || (@.children.start.type() == "number" && @.children.start >= 1))))')
        -- deuxième niveau : même forme ; une erreur de parcours (`null`) vaut un refus
        and not coalesce(jsonb_path_exists(data, 'strict $.items[*] ? (@.type() == "object").children.items[*] ? (@.type() != "string" && @.type() != "object")', '{}', true), true)
        and not jsonb_path_exists(data, 'lax $.items[*].children.items[*] ? (@.type() == "object" && !(@.text.type() == "string" && @.children.type() == "object" && !exists(@.keyvalue() ? (@.key != "text" && @.key != "children")) && @.children.items.type() == "array" && @.children.items.size() > 0 && !exists(@.children.keyvalue() ? (@.key != "items" && @.key != "ordered" && @.key != "start")) && (!exists(@.children.ordered) || @.children.ordered.type() == "boolean") && (!exists(@.children.start) || (@.children.start.type() == "number" && @.children.start >= 1))))')
        -- troisième niveau : des chaînes seules, aucun quatrième niveau
        and not coalesce(jsonb_path_exists(data, 'strict $.items[*] ? (@.type() == "object").children.items[*] ? (@.type() == "object").children.items[*] ? (@.type() != "string")', '{}', true), true)
        -- 500 éléments en tout : un élément porte une seule chaîne, son texte
        and jsonb_array_length(jsonb_path_query_array(data, 'strict $.items.** ? (@.type() == "string")')) <= 500
        and ((data -> 'ordered') is null or jsonb_typeof(data -> 'ordered') = 'boolean')
        and ((data -> 'start') is null or jsonb_path_exists(data, '$."start" ? (@.type() == "number" && @ >= 1)'))
      when 'checklist' then text is null
        and jsonb_typeof(data -> 'items') = 'array'
        and jsonb_array_length(data -> 'items') between 1 and 500
        and not jsonb_path_exists(data, '$."items"[*] ? (!(exists (@."text" ? (@.type() == "string"))) || !(exists (@."checked" ? (@.type() == "boolean"))))')
      when 'code' then text is not null and ((data -> 'language') is null or jsonb_typeof(data -> 'language') = 'string')
      when 'call' then text is null
        and jsonb_typeof(data -> 'function') = 'string'
        and char_length(data ->> 'function') between 1 and 100
        and jsonb_typeof(data -> 'args') = 'object'
      when 'mermaid' then text is not null and char_length(btrim(text)) >= 1
      when 'image' then jsonb_typeof(data -> 'src') = 'string'
        and char_length(data ->> 'src') between 1 and 2000
        and ((data -> 'alt') is null or jsonb_typeof(data -> 'alt') = 'string')
      when 'callout' then text is not null and ((data -> 'tone') is null or jsonb_typeof(data -> 'tone') = 'string')
      when 'reference' then text is null
        and jsonb_typeof(data -> 'path') = 'string'
        and (data ->> 'path') ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'
        and char_length(data ->> 'path') <= 1000
        and ((data -> 'view') is null or jsonb_typeof(data -> 'view') = 'object')
      when 'row' then text is null and key is not null
      -- une cellule : une ligne, sans blanc de bord, chaque `|` précédé d'un nombre impair de `\`
      when 'simple_table' then text is null
        and coalesce(jsonb_typeof(data -> 'columns'), '') = 'array'
        and jsonb_array_length(data -> 'columns') between 1 and 20
        and coalesce(jsonb_typeof(data -> 'rows'), '') = 'array'
        and jsonb_array_length(data -> 'rows') <= 200
        and not jsonb_path_exists(data, 'strict $.rows[*] ? (@.type() != "array" || @.size() != $n)', jsonb_build_object('n', jsonb_array_length(data -> 'columns')))
        and not jsonb_path_exists(data, 'strict $.columns[*] ? (@.type() != "string" || @ like_regex "[\r\n]" || @ like_regex "^[ \t]" || @ like_regex "[ \t]$" || @ like_regex "(^|[^\\\\])(\\\\\\\\)*[|]")')
        and not jsonb_path_exists(data, 'strict $.rows[*][*] ? (@.type() != "string" || @ like_regex "[\r\n]" || @ like_regex "^[ \t]" || @ like_regex "[ \t]$" || @ like_regex "(^|[^\\\\])(\\\\\\\\)*[|]")')
        and ((data -> 'align') is null or (jsonb_typeof(data -> 'align') = 'array'
          and jsonb_array_length(data -> 'align') = jsonb_array_length(data -> 'columns')
          and not jsonb_path_exists(data, 'strict $.align[*] ? (!(@.type() == "null" || (@.type() == "string" && (@ == "left" || @ == "center" || @ == "right"))))')))
      when 'divider' then text is null
      -- le corps : sans ligne blanche de bord, sans ligne `<details…` ni `</details>`
      when 'toggle' then text is not null
        and (text = '' or (text !~ '^[ \t]*(\n|$)' and text !~ '(^|\n)[ \t]*$'))
        and text !~ '(^|\n)[ \t]*<details'
        and text !~ '(^|\n)[ \t]*</details>[ \t]*(\n|$)'
        and coalesce(jsonb_typeof(data -> 'summary'), '') = 'string'
        and char_length(btrim(data ->> 'summary')) between 1 and 200
        and (data ->> 'summary') !~ '[\r\n]'
      else null
    end, false));

-- 4. Le texte cherchable d'un bloc.
CREATE OR REPLACE FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $_$
  select concat_ws(' ', p_key, p_text,
    case p_type
      when 'row' then (select string_agg(v #>> '{}', ' ')
                         from jsonb_path_query(p_data, 'lax $.* ? (@.type() == "string" || @.type() == "number")') v)
      when 'list' then (select string_agg(v #>> '{}', ' ')
                          from jsonb_path_query(p_data, 'strict $.items.** ? (@.type() == "string")', '{}', true) v)
      when 'checklist' then (select string_agg(v #>> '{}', ' ')
                               from jsonb_path_query(p_data, 'lax $.items[*].text ? (@.type() == "string")') v)
      when 'call' then concat_ws(' ', p_data ->> 'function',
                         (select string_agg(v #>> '{}', ' ')
                            from jsonb_path_query(p_data -> 'args', 'strict $.** ? (@.type() == "string")') v))
      when 'reference' then p_data ->> 'path'
      when 'image' then p_data ->> 'alt'
      when 'simple_table' then concat_ws(' ',
                                 (select string_agg(v #>> '{}', ' ')
                                    from jsonb_path_query(p_data, 'strict $.columns[*] ? (@.type() == "string")', '{}', true) v),
                                 (select string_agg(v #>> '{}', ' ')
                                    from jsonb_path_query(p_data, 'strict $.rows[*][*] ? (@.type() == "string")', '{}', true) v))
      when 'toggle' then p_data ->> 'summary'
    end)
$_$;

REVOKE ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) TO authenticated;
