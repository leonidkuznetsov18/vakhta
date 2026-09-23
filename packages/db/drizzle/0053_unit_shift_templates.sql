-- Unit shift templates (spec 013): an optional owning unit, an explicit period instead of is_night,
-- a revision for optimistic edits, and retirement with an optional replacement version.
CREATE TYPE "public"."shift_period" AS ENUM('DAY', 'NIGHT', 'FULL_DAY');--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_id_site_uq" UNIQUE("id","site_id");--> statement-breakpoint
ALTER TABLE "shift_templates" ADD COLUMN "org_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD COLUMN "period" "shift_period";--> statement-breakpoint
UPDATE "shift_templates" SET "period" = CASE WHEN "is_night" THEN 'NIGHT'::"shift_period" ELSE 'DAY'::"shift_period" END;--> statement-breakpoint
ALTER TABLE "shift_templates" ALTER COLUMN "period" SET NOT NULL;--> statement-breakpoint
-- is_night stays one release as a read-only mirror of period, for instances still on the old code.
ALTER TABLE "shift_templates" DROP COLUMN "is_night";--> statement-breakpoint
ALTER TABLE "shift_templates" ADD COLUMN "is_night" boolean GENERATED ALWAYS AS (period = 'NIGHT') STORED;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD COLUMN "replaced_by_id" uuid;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_replaced_by_id_shift_templates_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_unit_site_fk" FOREIGN KEY ("org_unit_id","site_id") REFERENCES "public"."org_units"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shift_templates_unit_name_uq" ON "shift_templates" USING btree ("org_unit_id",lower(coalesce(nullif(btrim("name"), ''), "local_start" || '–' || "local_end"))) WHERE "shift_templates"."org_unit_id" IS NOT NULL AND "shift_templates"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shift_templates_site_unit_idx" ON "shift_templates" USING btree ("site_id","org_unit_id");--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_local_times" CHECK ("shift_templates"."local_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "shift_templates"."local_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_full_day_hours" CHECK (("shift_templates"."period" = 'FULL_DAY') = ("shift_templates"."local_start" = "shift_templates"."local_end"));--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_revision_positive" CHECK ("shift_templates"."revision" > 0);--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_default_named" CHECK ("shift_templates"."org_unit_id" IS NOT NULL OR length(btrim("shift_templates"."name")) > 0);--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_unit_retirement" CHECK ("shift_templates"."org_unit_id" IS NOT NULL AND "shift_templates"."is_active" = ("shift_templates"."retired_at" IS NULL) OR "shift_templates"."org_unit_id" IS NULL AND "shift_templates"."retired_at" IS NULL);--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_replacement_retired" CHECK ("shift_templates"."replaced_by_id" IS NULL OR "shift_templates"."retired_at" IS NOT NULL);
