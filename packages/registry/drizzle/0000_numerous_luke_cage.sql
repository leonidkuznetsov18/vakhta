CREATE TYPE "public"."domain_status" AS ENUM('PENDING', 'VERIFIED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."module_status" AS ENUM('ENABLED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."registry_locale" AS ENUM('uk', 'en', 'ru');--> statement-breakpoint
CREATE TYPE "public"."secret_kind" AS ENUM('DATABASE_URL', 'BOT_TOKEN', 'BOT_WEBHOOK_SECRET');--> statement-breakpoint
CREATE TYPE "public"."tenant_module" AS ENUM('ADMIN_PANEL', 'WORKER_BOT', 'QR_KIOSK', 'SUPPORT_BOT', 'PHOTO_INSPECTION');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('DRAFT', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."tenant_surface" AS ENUM('PANEL', 'KIOSK', 'API');--> statement-breakpoint
CREATE TABLE "control_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"tenant_id" uuid,
	"object_type" text NOT NULL,
	"object_id" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "tenant_branding" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"logo_key" text,
	"accent_color" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_branding_accent_format" CHECK ("tenant_branding"."accent_color" IS NULL OR "tenant_branding"."accent_color" ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"host" text NOT NULL,
	"surface" "tenant_surface" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_managed" boolean DEFAULT true NOT NULL,
	"status" "domain_status" DEFAULT 'PENDING' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_domains_host_unique" UNIQUE("host"),
	CONSTRAINT "tenant_domains_host_lowercase" CHECK ("tenant_domains"."host" = lower("tenant_domains"."host"))
);
--> statement-breakpoint
CREATE TABLE "tenant_modules" (
	"tenant_id" uuid NOT NULL,
	"module" "tenant_module" NOT NULL,
	"status" "module_status" DEFAULT 'ENABLED' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "tenant_modules_tenant_id_module_pk" PRIMARY KEY("tenant_id","module")
);
--> statement-breakpoint
CREATE TABLE "tenant_secrets" (
	"tenant_id" uuid NOT NULL,
	"kind" "secret_kind" NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"key_version" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_secrets_tenant_id_kind_pk" PRIMARY KEY("tenant_id","kind")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "tenant_status" DEFAULT 'DRAFT' NOT NULL,
	"default_locale" "registry_locale" DEFAULT 'ru' NOT NULL,
	"timezone" text NOT NULL,
	"storage_prefix" text NOT NULL,
	"database_name" text NOT NULL,
	"schema_version" text,
	"migrated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_storage_prefix_unique" UNIQUE("storage_prefix"),
	CONSTRAINT "tenants_database_name_unique" UNIQUE("database_name"),
	CONSTRAINT "tenants_slug_format" CHECK ("tenants"."slug" ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
	CONSTRAINT "tenants_suspended_consistent" CHECK (("tenants"."status" = 'SUSPENDED') = ("tenants"."suspended_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_secrets" ADD CONSTRAINT "tenant_secrets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "control_audit_tenant_idx" ON "control_audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_primary_uq" ON "tenant_domains" USING btree ("tenant_id","surface") WHERE "tenant_domains"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_secrets_fingerprint_uq" ON "tenant_secrets" USING btree ("kind","fingerprint");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");