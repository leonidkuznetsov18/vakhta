CREATE TYPE "public"."reason_kind" AS ENUM('DOWNTIME', 'CORRECTION', 'ABSENCE', 'HANDOVER', 'ADJUSTMENT', 'EMERGENCY');--> statement-breakpoint
CREATE TYPE "public"."reason_severity" AS ENUM('NORMAL', 'CRITICAL', 'SAFETY');--> statement-breakpoint
CREATE TYPE "public"."zone_type" AS ENUM('AREA', 'POST', 'PACKAGING', 'FILLING', 'CLEANING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('ACTIVE', 'BLOCKED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."telegram_account_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('EMPLOYEE', 'WEB_USER', 'SYSTEM', 'TERMINAL');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('TELEGRAM', 'WEB', 'TERMINAL', 'SYSTEM', 'INTEGRATION');--> statement-breakpoint
CREATE TABLE "org_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "positions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "reason_codes" (
	"kind" "reason_kind" NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"requires_comment" boolean DEFAULT false NOT NULL,
	"requires_photo" boolean DEFAULT false NOT NULL,
	"notify_master" boolean DEFAULT false NOT NULL,
	"severity" "reason_severity" DEFAULT 'NORMAL' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" text,
	CONSTRAINT "reason_codes_kind_code_pk" PRIMARY KEY("kind","code")
);
--> statement-breakpoint
CREATE TABLE "responsibility_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "zone_type" DEFAULT 'AREA' NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activation_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activation_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "employee_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"team_id" uuid,
	"position_id" uuid NOT NULL,
	"manager_employee_id" uuid,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personnel_number" text NOT NULL,
	"full_name" text NOT NULL,
	"status" "employee_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_personnel_number_unique" UNIQUE("personnel_number")
);
--> statement-breakpoint
CREATE TABLE "telegram_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"status" "telegram_account_status" DEFAULT 'ACTIVE' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"trace_id" text
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"employee_id" uuid,
	"shift_session_id" uuid,
	"zone_id" uuid,
	"incident_id" uuid,
	"source" "event_source" NOT NULL,
	"actor_id" uuid,
	"acting_role" text,
	"reason_code" text,
	"comment" text,
	"approval_id" uuid,
	"telegram_update_id" bigint,
	"idempotency_key" text,
	"corrects_event_id" uuid,
	"schedule_version_id" uuid,
	"checklist_version_id" uuid,
	"bonus_rule_version_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace_id" text
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "processed_telegram_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"scope" text DEFAULT 'global' NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_id_org_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsibility_zones" ADD CONSTRAINT "responsibility_zones_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsibility_zones" ADD CONSTRAINT "responsibility_zones_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_manager_employee_id_employees_id_fk" FOREIGN KEY ("manager_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_units_site_idx" ON "org_units" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "zones_site_idx" ON "responsibility_zones" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "zones_org_unit_idx" ON "responsibility_zones" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX "teams_org_unit_idx" ON "teams" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX "activation_codes_employee_idx" ON "activation_codes" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_positions_employee_idx" ON "employee_positions" USING btree ("employee_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_accounts_active_user_uq" ON "telegram_accounts" USING btree ("telegram_user_id") WHERE "telegram_accounts"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_accounts_active_employee_uq" ON "telegram_accounts" USING btree ("employee_id") WHERE "telegram_accounts"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "audit_log_actor_time_idx" ON "audit_log" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_object_idx" ON "audit_log" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE INDEX "domain_events_employee_time_idx" ON "domain_events" USING btree ("employee_id","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_shift_idx" ON "domain_events" USING btree ("shift_session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_type_time_idx" ON "domain_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_events_idempotency_uq" ON "domain_events" USING btree ("idempotency_key") WHERE "domain_events"."idempotency_key" IS NOT NULL;