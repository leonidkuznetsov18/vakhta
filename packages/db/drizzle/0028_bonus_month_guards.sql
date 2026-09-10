-- A shared actual write serializes compatibility scoring and fences repeatable-read closure.
CREATE TABLE public.bonus_month_guards (
  month text PRIMARY KEY CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)
);
