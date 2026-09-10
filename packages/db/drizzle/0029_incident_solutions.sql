ALTER TABLE "downtime_incidents" ADD COLUMN "root_cause" text;--> statement-breakpoint
ALTER TABLE "downtime_incidents" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "incident_status_history" ADD COLUMN "root_cause" text;--> statement-breakpoint
ALTER TABLE "incident_status_history" ADD COLUMN "resolution" text;