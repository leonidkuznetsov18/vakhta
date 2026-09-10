-- Serialize the preflight with old application writers throughout the migration transaction.
LOCK TABLE bonus_point_awards, notification_outbox IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
-- Do not invent final winners from historical awards or localized notification text.
-- Production preflight must be repeated immediately before applying this migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bonus_point_awards WHERE kind IN ('UNIT_OF_MONTH', 'MASTER_OF_MONTH'))
    OR EXISTS (SELECT 1 FROM public.notification_outbox WHERE template IN ('BONUS_MONTH_CARD', 'BONUS_MONTH_MASTER')) THEN
    RAISE EXCEPTION 'Legacy monthly awards or cards require explicit reconciliation before snapshot migration';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TABLE "bonus_month_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"month" text NOT NULL,
	"employee_id" uuid,
	"employee_name" text,
	"employee_points" integer,
	"org_unit_id" uuid,
	"org_unit_name" text,
	"org_unit_points" integer,
	"masters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rule_version" integer DEFAULT 1 NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bonus_month_closures_month_valid" CHECK ("bonus_month_closures"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "bonus_month_closures_employee_consistent" CHECK (("bonus_month_closures"."employee_id" is null and "bonus_month_closures"."employee_name" is null and "bonus_month_closures"."employee_points" is null) or ("bonus_month_closures"."employee_id" is not null and "bonus_month_closures"."employee_name" is not null and "bonus_month_closures"."employee_points" is not null and "bonus_month_closures"."employee_points" > 0)),
	CONSTRAINT "bonus_month_closures_unit_consistent" CHECK (("bonus_month_closures"."org_unit_id" is null and "bonus_month_closures"."org_unit_name" is null and "bonus_month_closures"."org_unit_points" is null) or ("bonus_month_closures"."org_unit_id" is not null and "bonus_month_closures"."org_unit_name" is not null and "bonus_month_closures"."org_unit_points" is not null and "bonus_month_closures"."org_unit_points" > 0)),
	CONSTRAINT "bonus_month_closures_masters_array" CHECK (jsonb_typeof("bonus_month_closures"."masters") = 'array' and ("bonus_month_closures"."org_unit_id" is not null or "bonus_month_closures"."masters" = '[]'::jsonb)),
	CONSTRAINT "bonus_month_closures_rule_version" CHECK ("bonus_month_closures"."rule_version" = 1)
);
--> statement-breakpoint
ALTER TABLE "bonus_month_closures" ADD CONSTRAINT "bonus_month_closures_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_month_closures" ADD CONSTRAINT "bonus_month_closures_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_month_closures" ADD CONSTRAINT "bonus_month_closures_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_month_closures_site_month_uq" ON "bonus_month_closures" USING btree ("site_id","month");
--> statement-breakpoint
-- Empty-table TRUNCATE is harmless; an existing final decision must never be erased.
CREATE FUNCTION vakhta_guard_month_closures() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND NOT EXISTS (SELECT 1 FROM public.bonus_month_closures LIMIT 1) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Final monthly nominations are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bonus_month_closures_immutable
  BEFORE UPDATE OR DELETE ON bonus_month_closures
  FOR EACH ROW EXECUTE FUNCTION vakhta_guard_month_closures();
--> statement-breakpoint
CREATE TRIGGER bonus_month_closures_no_truncate
  BEFORE TRUNCATE ON bonus_month_closures
  FOR EACH STATEMENT EXECUTE FUNCTION vakhta_guard_month_closures();
--> statement-breakpoint
-- Deferred checks let the new closer post awards before inserting its immutable snapshot.
-- A closure must belong to this transaction: an older closure cannot authorize a legacy re-close.
CREATE FUNCTION vakhta_require_month_award_closure() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bonus_month_closures c
    WHERE c.month = NEW.month AND c.org_unit_id = NEW.org_unit_id
      AND c.xmin = pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'Monthly awards require a final closure in the same transaction' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER bonus_month_award_requires_closure
  AFTER INSERT ON bonus_point_awards DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.kind IN ('UNIT_OF_MONTH', 'MASTER_OF_MONTH'))
  EXECUTE FUNCTION vakhta_require_month_award_closure();
--> statement-breakpoint
CREATE FUNCTION vakhta_require_month_card_closure() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.recipient_type <> 'EMPLOYEE' OR NOT EXISTS (
    SELECT 1 FROM public.bonus_month_closures c
    WHERE c.xmin = pg_current_xact_id()::xid
      AND NEW.dedupe_key = 'bonus-month-card:' || c.month || ':' || NEW.recipient_id
      AND EXISTS (
        SELECT 1 FROM public.bonus_point_awards a JOIN public.org_units u ON u.id = a.org_unit_id
        WHERE a.employee_id = NEW.recipient_id AND a.month = c.month AND u.site_id = c.site_id
      )
  ) THEN
    RAISE EXCEPTION 'Monthly cards require a final closure in the same transaction' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER bonus_month_card_requires_closure
  AFTER INSERT ON notification_outbox DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.template IN ('BONUS_MONTH_CARD', 'BONUS_MONTH_MASTER'))
  EXECUTE FUNCTION vakhta_require_month_card_closure();
