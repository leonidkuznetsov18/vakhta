-- A document may live only as a link to the web (spec 014, FR-008): the file columns become
-- optional and a row is either a stored PDF (all four filled) or a link (all four empty, source_url set).
ALTER TABLE "equipment_documents" DROP CONSTRAINT "equipment_documents_pdf";--> statement-breakpoint
ALTER TABLE "equipment_documents" DROP CONSTRAINT "equipment_documents_size";--> statement-breakpoint
ALTER TABLE "equipment_documents" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment_documents" ALTER COLUMN "content_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment_documents" ALTER COLUMN "size_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment_documents" ALTER COLUMN "sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment_documents" ADD CONSTRAINT "equipment_documents_pdf" CHECK ("equipment_documents"."content_type" IS NULL OR "equipment_documents"."content_type" = 'application/pdf');--> statement-breakpoint
ALTER TABLE "equipment_documents" ADD CONSTRAINT "equipment_documents_size" CHECK ("equipment_documents"."size_bytes" IS NULL OR ("equipment_documents"."size_bytes" > 0 AND "equipment_documents"."size_bytes" <= 52428800));--> statement-breakpoint
ALTER TABLE "equipment_documents" ADD CONSTRAINT "equipment_documents_file_or_link" CHECK ((("equipment_documents"."storage_key" IS NULL) = ("equipment_documents"."content_type" IS NULL)) AND (("equipment_documents"."storage_key" IS NULL) = ("equipment_documents"."size_bytes" IS NULL)) AND (("equipment_documents"."storage_key" IS NULL) = ("equipment_documents"."sha256" IS NULL)) AND ("equipment_documents"."storage_key" IS NOT NULL OR "equipment_documents"."source_url" IS NOT NULL));--> statement-breakpoint
-- A plan may carry its own reminder days; null keeps the client parameters (owner request 2026-09-25).
ALTER TABLE "maintenance_plans" ADD COLUMN "reminder_days" smallint[];--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_reminder_days" CHECK (cardinality("maintenance_plans"."reminder_days") <= 5);
