CREATE TABLE "telegram_contacts" (
	"telegram_user_id" bigint PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"language_code" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "telegram_contacts_username_idx" ON "telegram_contacts" USING btree ("username");