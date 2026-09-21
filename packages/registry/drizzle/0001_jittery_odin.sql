CREATE TYPE "public"."invitation_kind" AS ENUM('ONBOARDING', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."operator_role" AS ENUM('PLATFORM_ADMIN', 'PLATFORM_VIEWER');--> statement-breakpoint
CREATE TYPE "public"."operator_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."provisioning_kind" AS ENUM('PROVISION', 'ENABLE_MODULE', 'DISABLE_MODULE', 'SUSPEND', 'RESUME', 'ROTATE_BOT_TOKEN', 'VERIFY_DOMAIN', 'MIGRATE', 'BACKUP', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."provisioning_step" AS ENUM('CREATE_DATABASE', 'MIGRATE', 'SEED_DEFAULTS', 'STORAGE_PREFIX', 'REGISTER_DOMAINS', 'BOT_WEBHOOK', 'INVITE_ADMIN', 'REMOVE_WEBHOOK', 'EVICT_RUNTIME', 'FINAL_BACKUP', 'DROP_DATABASE', 'DROP_STORAGE');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED', 'MANUAL_REQUIRED');--> statement-breakpoint
CREATE TABLE "control_auth_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"issuer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_auth_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "control_auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "control_auth_two_factor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "control_auth_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"role" "operator_role" DEFAULT 'PLATFORM_VIEWER' NOT NULL,
	"status" "operator_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "control_auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "control_auth_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provisioning_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "provisioning_kind" NOT NULL,
	"status" "job_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provisioning_steps" (
	"job_id" uuid NOT NULL,
	"step" "provisioning_step" NOT NULL,
	"seq" integer NOT NULL,
	"status" "step_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"output" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "provisioning_steps_job_id_step_pk" PRIMARY KEY("job_id","step")
);
--> statement-breakpoint
CREATE TABLE "tenant_deletions" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"final_backup_key" text,
	"restored_at" timestamp with time zone,
	"dropped_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "invitation_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"admin_email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"issued_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "control_auth_account" ADD CONSTRAINT "control_auth_account_user_id_control_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."control_auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_auth_session" ADD CONSTRAINT "control_auth_session_user_id_control_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."control_auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_auth_two_factor" ADD CONSTRAINT "control_auth_two_factor_user_id_control_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."control_auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_steps" ADD CONSTRAINT "provisioning_steps_job_id_provisioning_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."provisioning_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_deletions" ADD CONSTRAINT "tenant_deletions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "control_auth_account_user_idx" ON "control_auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "control_auth_session_user_idx" ON "control_auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "control_auth_two_factor_user_idx" ON "control_auth_two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "control_auth_two_factor_secret_idx" ON "control_auth_two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "control_auth_verification_identifier_idx" ON "control_auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "provisioning_jobs_tenant_idx" ON "provisioning_jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provisioning_jobs_active_uq" ON "provisioning_jobs" USING btree ("tenant_id") WHERE "provisioning_jobs"."status" IN ('PENDING', 'RUNNING');--> statement-breakpoint
CREATE INDEX "tenant_invitations_tenant_idx" ON "tenant_invitations" USING btree ("tenant_id");