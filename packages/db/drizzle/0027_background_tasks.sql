-- Additive foundation only: existing BullMQ producers and workers remain unchanged.
CREATE TABLE "background_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_event_id" uuid,
	"target_session_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"last_error_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "background_tasks_kind_valid" CHECK ("background_tasks"."kind" IN ('MEDIA_PROCESS', 'SHIFT_REMINDER', 'ACK_REMINDER', 'RETURN_REMINDER', 'DOWNTIME_ESCALATION', 'INCIDENT_SLA', 'HANDOVER_TIMEOUT', 'CLEANING_REMINDER', 'BONUS_RECALCULATE')),
	CONSTRAINT "background_tasks_payload_version_valid" CHECK ("background_tasks"."payload_version" > 0),
	CONSTRAINT "background_tasks_payload_object" CHECK (jsonb_typeof("background_tasks"."payload") = 'object'),
	CONSTRAINT "background_tasks_dedupe_valid" CHECK (length("background_tasks"."dedupe_key") BETWEEN 1 AND 250),
	CONSTRAINT "background_tasks_attempts_valid" CHECK ("background_tasks"."attempts" >= 0),
	CONSTRAINT "background_tasks_available_valid" CHECK ("background_tasks"."available_at" >= "background_tasks"."due_at"),
	CONSTRAINT "background_tasks_bonus_target_valid" CHECK ((
      "background_tasks"."kind" = 'BONUS_RECALCULATE' AND "background_tasks"."source_event_id" IS NOT NULL AND "background_tasks"."target_session_id" IS NOT NULL
    ) OR (
      "background_tasks"."kind" <> 'BONUS_RECALCULATE' AND "background_tasks"."source_event_id" IS NULL AND "background_tasks"."target_session_id" IS NULL
    )),
	CONSTRAINT "background_tasks_state_valid" CHECK ((
      "background_tasks"."status" = 'PENDING' AND "background_tasks"."lease_token" IS NULL AND "background_tasks"."lease_until" IS NULL AND "background_tasks"."completed_at" IS NULL
    ) OR (
      "background_tasks"."status" = 'RUNNING' AND "background_tasks"."lease_token" IS NOT NULL AND "background_tasks"."lease_until" IS NOT NULL AND "background_tasks"."completed_at" IS NULL AND "background_tasks"."attempts" > 0
    ) OR (
      "background_tasks"."status" = 'COMPLETED' AND "background_tasks"."lease_token" IS NULL AND "background_tasks"."lease_until" IS NULL AND "background_tasks"."completed_at" IS NOT NULL AND "background_tasks"."attempts" > 0
    )),
	CONSTRAINT "background_tasks_error_valid" CHECK ("background_tasks"."last_error_code" IS NULL OR "background_tasks"."last_error_code" IN ('EXECUTION_FAILED', 'DEPENDENCY_UNAVAILABLE', 'INVALID_PAYLOAD', 'UNSUPPORTED_VERSION'))
);
--> statement-breakpoint
ALTER TABLE "background_tasks" ADD CONSTRAINT "background_tasks_source_event_id_domain_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."domain_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_tasks" ADD CONSTRAINT "background_tasks_target_session_id_shift_sessions_id_fk" FOREIGN KEY ("target_session_id") REFERENCES "public"."shift_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "background_tasks_dedupe_uq" ON "background_tasks" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "background_tasks_bonus_source_target_uq" ON "background_tasks" USING btree ("source_event_id","target_session_id") WHERE "background_tasks"."kind" = 'BONUS_RECALCULATE';--> statement-breakpoint
CREATE INDEX "background_tasks_pending_idx" ON "background_tasks" USING btree ("kind","available_at","id") WHERE "background_tasks"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "background_tasks_expired_idx" ON "background_tasks" USING btree ("kind","lease_until","id") WHERE "background_tasks"."status" = 'RUNNING';
--> statement-breakpoint
-- Retry metadata may change; a deduplicated business intent must never be replaced.
CREATE FUNCTION public.vakhta_guard_background_task_intent() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF ROW(NEW.id, NEW.kind, NEW.payload_version, NEW.dedupe_key, NEW.payload,
         NEW.source_event_id, NEW.target_session_id, NEW.due_at, NEW.created_at)
    IS DISTINCT FROM
     ROW(OLD.id, OLD.kind, OLD.payload_version, OLD.dedupe_key, OLD.payload,
         OLD.source_event_id, OLD.target_session_id, OLD.due_at, OLD.created_at) THEN
    RAISE EXCEPTION 'Background task intent is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'Background task attempts cannot decrease' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'COMPLETED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Completed background tasks are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER background_tasks_intent_immutable
BEFORE UPDATE ON public.background_tasks
FOR EACH ROW EXECUTE FUNCTION public.vakhta_guard_background_task_intent();
