# ADR-0005: Time in UTC, planned instants in the site's IANA time zone

- Status: proposed
- Date: 2026-09-05
- Spec sources: 6.1, NFR-11, AC-06, T-01

## Context

The night shift crosses midnight and, twice a year, a DST switch. Phone time cannot be trusted. The business date of a shift is its start date.

## Decision

Every instant in the database is `timestamptz`. A site stores its IANA time zone. When a schedule version is published, planned start and end are computed from the template's local time and the site time zone by `planInstants` in `packages/domain/time`; the business date equals the local start date. A night shift on the switch night lasts 11 or 13 hours, as in reality. `occurred_at` is always server time. Local time and the offset are shown only in the interface.

## Consequences

DST is handled in one place and covered by tests. Comparisons and sorting in the database are correct regardless of sites. Planned times cannot be stored as "08:00" without a date.

## Rejected alternatives

Local time without an offset in the database: ambiguous on the switch night. Computing plans on the fly per request: different results under different versions of the tz database.
