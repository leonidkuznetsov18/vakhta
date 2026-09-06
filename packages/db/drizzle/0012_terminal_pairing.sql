CREATE TABLE "terminal_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"terminal_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terminal_pairing_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "qr_terminals" ALTER COLUMN "device_token_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "terminal_pairing_codes" ADD CONSTRAINT "terminal_pairing_codes_terminal_id_qr_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."qr_terminals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "terminal_pairing_codes_terminal_idx" ON "terminal_pairing_codes" USING btree ("terminal_id");