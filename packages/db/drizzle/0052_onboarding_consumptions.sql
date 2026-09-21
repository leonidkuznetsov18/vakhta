CREATE TABLE "onboarding_consumptions" (
	"invitation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_consumptions" ADD CONSTRAINT "onboarding_consumptions_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;