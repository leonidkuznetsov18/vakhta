CREATE TABLE "communication_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"communication_id" uuid,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'UPLOADING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "communication_attachment_size" CHECK ("communication_attachments"."size_bytes" > 0 AND "communication_attachments"."size_bytes" <= 10485760),
	CONSTRAINT "communication_attachment_status" CHECK ("communication_attachments"."status" IN ('UPLOADING','READY','DELETING'))
);
--> statement-breakpoint
CREATE TABLE "communication_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claim_id" uuid,
	"lease_until" timestamp with time zone,
	"telegram_message_id" bigint,
	"last_error" text,
	"sent_at" timestamp with time zone,
	CONSTRAINT "communication_part_order" CHECK ("communication_parts"."ordinal" >= 0),
	CONSTRAINT "communication_part_status" CHECK ("communication_parts"."status" IN ('PENDING','SENDING','SENT','FAILED','SKIPPED','UNKNOWN')),
	CONSTRAINT "communication_part_kind" CHECK ("communication_parts"."kind" IN ('TEXT','ATTACHMENT','QUESTIONNAIRE'))
);
--> statement-breakpoint
CREATE TABLE "communication_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"communication_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"telegram_account_id" uuid NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"question_index" integer DEFAULT 0 NOT NULL,
	"response_version" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "communication_question_index" CHECK ("communication_recipients"."question_index" >= 0),
	CONSTRAINT "communication_response_version" CHECK ("communication_recipients"."response_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"body" text NOT NULL,
	"questionnaire" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_owner_id_auth_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_parts" ADD CONSTRAINT "communication_parts_recipient_id_communication_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."communication_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_telegram_account_id_telegram_accounts_id_fk" FOREIGN KEY ("telegram_account_id") REFERENCES "public"."telegram_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_sender_id_auth_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_attachment_expiry_idx" ON "communication_attachments" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_part_order_uq" ON "communication_parts" USING btree ("recipient_id","ordinal");--> statement-breakpoint
CREATE INDEX "communication_part_pending_idx" ON "communication_parts" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_recipient_uq" ON "communication_recipients" USING btree ("communication_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "communications_request_uq" ON "communications" USING btree ("sender_id","request_id");--> statement-breakpoint
CREATE INDEX "communications_sender_idx" ON "communications" USING btree ("sender_id","created_at");