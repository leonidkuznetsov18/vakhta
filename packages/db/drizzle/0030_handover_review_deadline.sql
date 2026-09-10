-- One-time owner-authorized deadline correction. The migration transaction's table lock fences
-- workers before report locks. Restore the immutable-intent trigger before commit; normal writers
-- retain the guard, and a failure rolls back both data and trigger state.
ALTER TABLE background_tasks DISABLE TRIGGER background_tasks_intent_immutable;
--> statement-breakpoint
-- Apply the owner's two-hour master review window to pending reports only.
-- Completed decisions and immutable submission events keep their historical deadline.
WITH pending AS MATERIALIZED (
  SELECT h.id, h.status, h.escalated_to_master_at, h.accept_deadline_at AS old_deadline,
    COALESCE(s.plan_end_at, a.plan_end_at) + interval '120 minutes' AS new_deadline
  FROM handover_records h
  JOIN shift_sessions s ON s.id = h.shift_session_id
  LEFT JOIN shift_assignments a ON a.id = s.assignment_id
  WHERE h.status IN ('SUBMITTED', 'DISPUTED')
    AND COALESCE(s.plan_end_at, a.plan_end_at) IS NOT NULL
    AND h.accept_deadline_at IS DISTINCT FROM COALESCE(s.plan_end_at, a.plan_end_at) + interval '120 minutes'
  FOR UPDATE OF h
), updated AS (
  UPDATE handover_records h
  SET accept_deadline_at = p.new_deadline, updated_at = now()
  FROM pending p
  WHERE h.id = p.id
  RETURNING h.id, p.old_deadline, p.new_deadline, p.status, p.escalated_to_master_at
), timers AS (
  UPDATE background_tasks t
  SET payload = jsonb_set(t.payload, '{fireAt}', to_jsonb(to_char(u.new_deadline AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
      due_at = u.new_deadline, available_at = u.new_deadline,
      status = 'PENDING', lease_token = NULL, lease_until = NULL,
      completed_at = NULL, last_error_code = NULL, updated_at = now()
  FROM updated u
  WHERE t.kind = 'HANDOVER_TIMEOUT' AND t.dedupe_key = 'handover-timeout.' || u.id::text
    AND u.status = 'SUBMITTED' AND u.escalated_to_master_at IS NULL
)
INSERT INTO audit_log (actor_type, action, object_type, object_id, "before", "after", reason)
SELECT 'SYSTEM', 'handover.review_deadline_migrated', 'handover_record', id::text,
  jsonb_build_object('acceptDeadlineAt', old_deadline),
  jsonb_build_object('acceptDeadlineAt', new_deadline, 'reviewWindowMinutes', 120),
  'Owner decision: day review until 22:00, night review until 10:00; late submission does not extend the deadline'
FROM updated;

--> statement-breakpoint
ALTER TABLE background_tasks ENABLE TRIGGER background_tasks_intent_immutable;
