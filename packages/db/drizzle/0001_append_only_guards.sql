-- domain_events і audit_log незмінні (ADR-1, ТЗ 4.5, 13). Виправлення робиться
-- компенсуючою подією, а не редагуванням. Тригер працює для будь-якої ролі,
-- включно з власником таблиці, тому помилка в коді застосунку не пройде повз базу.
CREATE OR REPLACE FUNCTION vakhta_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'таблиця % є append-only (ADR-1): операція % заборонена', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER domain_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "domain_events"
  FOR EACH STATEMENT EXECUTE FUNCTION vakhta_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION vakhta_forbid_mutation();
