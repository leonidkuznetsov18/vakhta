-- A dismissed employee kept their Telegram link, and the link is unique per Telegram account, so
-- that phone could never activate another card — not even the same person's new card when they were
-- hired back. Dismissal releases the account from now on; these are the links already stuck.
UPDATE "telegram_accounts" t
SET "status" = 'REVOKED',
    "revoked_at" = now(),
    "revoke_reason" = 'employee terminated'
FROM "employees" e
WHERE e."id" = t."employee_id"
  AND t."status" = 'ACTIVE'
  AND e."status" = 'TERMINATED';
