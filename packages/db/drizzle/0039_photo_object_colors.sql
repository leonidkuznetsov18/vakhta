-- Every catalog object owns one color, shown identically on chips, boxes and badges everywhere.
-- Existing objects take the palette in creation order (the same order the panel used to derive
-- list colors), cycling when there are more objects than hues.
ALTER TABLE "photo_objects" ADD COLUMN "color" text;--> statement-breakpoint
WITH palette AS (
  SELECT ARRAY['#ff2d55', '#0a84ff', '#ffd60a', '#30d158', '#bf5af2', '#ff9f0a', '#64d2ff', '#ff375f', '#a3e635', '#f472b6', '#2dd4bf', '#fb923c'] AS hues
), ranked AS (
  SELECT id, row_number() OVER (ORDER BY active DESC, created_at, name) - 1 AS n FROM "photo_objects"
)
UPDATE "photo_objects" AS p
SET "color" = (SELECT hues[(ranked.n % array_length(hues, 1)) + 1] FROM palette)
FROM ranked
WHERE p.id = ranked.id;--> statement-breakpoint
ALTER TABLE "photo_objects" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_objects" ADD CONSTRAINT "photo_objects_color_hex" CHECK ("photo_objects"."color" ~ '^#[0-9a-f]{6}$');
