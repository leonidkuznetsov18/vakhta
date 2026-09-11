-- One catalog entry per spelling family: "Ганчірка" and "Ганчірки" are the same object type.
-- The singular-looking, shortest spelling of a family stays; rules and current reviews move to it; the rest are
-- deactivated (immutable runs and revisions keep their historical references).
CREATE TEMP TABLE photo_object_merge AS
SELECT o.id AS duplicate_id, k.keeper_id
FROM photo_objects o
JOIN (
  SELECT DISTINCT ON (regexp_replace(lower(trim(name)), '[аяиіыуюеє]$', ''))
    id AS keeper_id, regexp_replace(lower(trim(name)), '[аяиіыуюеє]$', '') AS key
  FROM photo_objects
  -- Prefer the spelling without a plural ending, then the shortest, then the oldest.
  ORDER BY regexp_replace(lower(trim(name)), '[аяиіыуюеє]$', ''), (right(trim(name), 1) IN ('и', 'і', 'ы')), length(trim(name)), created_at
) k ON k.key = regexp_replace(lower(trim(o.name)), '[аяиіыуюеє]$', '') AND k.keeper_id <> o.id;--> statement-breakpoint
UPDATE checklist_photo_rules r SET rules = (
  SELECT COALESCE(jsonb_agg(DISTINCT rule ORDER BY rule), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('objectId', COALESCE(m.keeper_id::text, e->>'objectId'), 'note', COALESCE(e->>'note', '')) AS rule
    FROM jsonb_array_elements(r.rules) e
    LEFT JOIN photo_object_merge m ON m.duplicate_id::text = e->>'objectId'
  ) mapped
) WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(r.rules) e JOIN photo_object_merge m ON m.duplicate_id::text = e->>'objectId'
);--> statement-breakpoint
UPDATE checklist_photo_rules r SET rules = (
  SELECT COALESCE(jsonb_agg(rule), '[]'::jsonb) FROM (
    SELECT DISTINCT ON (rule->>'objectId') rule FROM jsonb_array_elements(r.rules) rule ORDER BY rule->>'objectId', length(rule->>'note') DESC
  ) unique_rules
);--> statement-breakpoint
UPDATE photo_inspections i SET review = jsonb_set(i.review, '{annotations}', (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN m.keeper_id IS NULL THEN a ELSE jsonb_set(a, '{objectId}', to_jsonb(m.keeper_id::text)) END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(i.review->'annotations') a
  LEFT JOIN photo_object_merge m ON m.duplicate_id::text = a->>'objectId'
)) WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(i.review->'annotations') a JOIN photo_object_merge m ON m.duplicate_id::text = a->>'objectId'
);--> statement-breakpoint
UPDATE photo_objects SET active = false WHERE id IN (SELECT duplicate_id FROM photo_object_merge);--> statement-breakpoint
DROP INDEX "photo_objects_name_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "photo_objects_key_uq" ON "photo_objects" USING btree (regexp_replace(lower(trim("name")), '[аяиіыуюеє]$', '')) WHERE "photo_objects"."active";--> statement-breakpoint
DROP TABLE photo_object_merge;
