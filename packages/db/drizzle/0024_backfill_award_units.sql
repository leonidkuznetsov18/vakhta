-- Points earned on an unscheduled shift were written without a unit: the shift had no assignment to
-- read one from, so they counted for nobody in the unit-of-the-month rollup. The employee's current
-- position names the unit; fill it in for the rows already in the ledger.
UPDATE "bonus_point_awards" a
SET "org_unit_id" = p."org_unit_id"
FROM "employee_positions" p
WHERE a."org_unit_id" IS NULL
  AND p."employee_id" = a."employee_id"
  AND p."valid_to" IS NULL;
