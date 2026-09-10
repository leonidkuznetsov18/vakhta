# Worker boundary

- This is a standalone BullMQ process, not a Nest application. Validate job payloads with shared
  contracts. Handlers re-read current state and must tolerate retries, delayed jobs and obsolete work.
- Preserve outbox deduplication, retry/backoff and delivery status. Telegram send and PostgreSQL commit
  are not atomic; never promise exactly-once delivery merely because rows use SKIP LOCKED.
- Keep bounded concurrency and graceful shutdown. Missing adapters or unknown jobs must remain visible;
  do not silently acknowledge required business work as completed.
