CREATE TYPE "public"."checkpoint_type" AS ENUM('ENTRY', 'EXIT', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."terminal_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TABLE "qr_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"terminal_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "qr_challenges_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "qr_terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"checkpoint" "checkpoint_type" DEFAULT 'BOTH' NOT NULL,
	"device_token_hash" text NOT NULL,
	"status" "terminal_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_terminals_device_token_hash_unique" UNIQUE("device_token_hash")
);
--> statement-breakpoint
ALTER TABLE "qr_challenges" ADD CONSTRAINT "qr_challenges_terminal_id_qr_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."qr_terminals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_terminals" ADD CONSTRAINT "qr_terminals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_challenges_terminal_issued_idx" ON "qr_challenges" USING btree ("terminal_id","issued_at");--> statement-breakpoint
CREATE INDEX "qr_challenges_expires_idx" ON "qr_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "qr_terminals_site_idx" ON "qr_terminals" USING btree ("site_id");