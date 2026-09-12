ALTER TABLE "schedule_versions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_revision_positive" CHECK ("schedule_versions"."revision" > 0);
--> statement-breakpoint
CREATE FUNCTION advance_schedule_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER schedule_versions_advance_revision
BEFORE UPDATE ON schedule_versions
FOR EACH ROW EXECUTE FUNCTION advance_schedule_revision();
